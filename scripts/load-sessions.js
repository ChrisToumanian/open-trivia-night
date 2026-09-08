// Repeatable 5-session / 25-player / 5-question HTTP test. Never uses the live quiz.db.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { setTimeout: pause } = require('node:timers/promises');

async function serve() {
  const { createApp } = require('../api/app');
  const { app, db } = createApp({ dbPath: process.env.TRIVIA_LOAD_DB });
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const server = app.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
  process.on('message', message => {
    if (message.type === 'metrics') process.send({ type: 'metrics', data: {
      elapsedSeconds: (performance.now() - started) / 1000,
      cpuMilliseconds: Object.values(process.cpuUsage(cpuStart)).reduce((a, b) => a + b, 0) / 1000,
      rssMegabytes: process.memoryUsage().rss / 1024 / 1024,
      eventLoopP99Milliseconds: delay.percentile(99) / 1e6,
      eventLoopMaxMilliseconds: delay.max / 1e6,
      integrity: db.pragma('integrity_check', { simple: true })
    } });
    if (message.type === 'stop') {
      delay.disable();
      server.close(() => { db.close(); process.exit(0); });
    }
  });
}

async function startServer(filename) {
  const child = fork(__filename, ['--server'], { env: { ...process.env, TRIVIA_LOAD_DB: filename }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 15000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited before ready: ${code}`)); });
    child.once('message', message => { clearTimeout(timer); resolve(message); });
  });
  assert.equal(ready.type, 'ready');
  return { child, base: `http://127.0.0.1:${ready.port}/api` };
}
async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.send({ type: 'stop' });
  const timeout = setTimeout(() => child.kill(), 5000);
  try { await exited; } finally { clearTimeout(timeout); }
}

async function run() {
  const testRoot = path.resolve(__dirname, '..', 'data');
  fs.mkdirSync(testRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(testRoot, 'load-test-'));
  const filename = path.join(directory, 'quiz.db');
  let child, base;
  let pollStop = false;
  let pollPromise;
  const samples = [];
  const failures = [];
  let inFlight = 0, peakInFlight = 0, pollCycles = 0;
  let measured = true;
  const started = performance.now();
  const round = number => Math.round(number * 100) / 100;
  async function request(route, method = 'GET', body, expectedStatus = 200) {
    const start = performance.now();
    inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      assert.equal(response.status, expectedStatus, `${method} ${route}: ${JSON.stringify(result)}`);
      if (measured) samples.push({ method, milliseconds: performance.now() - start, bytes: Buffer.byteLength(JSON.stringify(result)) });
      return result;
    } catch (error) {
      failures.push({ method, route, error: error.message });
      throw error;
    } finally { inFlight--; }
  }
  // Drain every request before cleanup even if an assertion fails in a batch.
  async function together(tasks) {
    const results = await Promise.allSettled(tasks);
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    return results.map(result => result.value);
  }
  try {
    ({ child, base } = await startServer(filename));
    const [initial] = await request('/sessions');
    await request('/sessions/' + initial.id, 'DELETE');
    const sessions = await together(Array.from({ length: 5 }, (_, index) => request('/sessions', 'POST', { name: `Load session ${index + 1}`, passcode: String(7000 + index) }, 201)));
    assert.equal(new Set(sessions.map(session => session.passcode)).size, 5);
    const players = (await together(sessions.map(async (session, sessionIndex) => together(Array.from({ length: 5 }, async (_, playerIndex) => {
      // Identical names across games intentionally test routing by ID, not name.
      const team = await request('/join', 'POST', { name: `Player ${playerIndex + 1}`, code: session.passcode });
      assert.equal(team.gameId, session.id);
      return { ...team, sessionIndex, playerIndex, base: '/sessions/' + session.id, expected: [] };
    }))))).flat();
    assert.equal(new Set(players.map(player => player.teamId)).size, 25);
    const config = await request('/config');
    assert.ok(config.maxQuestions >= 5);
    console.log('Created 5 sessions and joined 25 independent players. Starting question traffic and five-second polling.');
    let activeQuestion = 1;
    function verifyMembership(data, session) {
      const ids = new Set(players.filter(player => player.gameId === session.id).map(player => player.teamId));
      assert.equal(data.teams.length, 5);
      assert.ok(data.teams.every(team => ids.has(team.id)), 'Foreign team in session');
      assert.ok(data.answers.every(answer => ids.has(answer.team_id)), 'Foreign answer in session');
    }
    async function poll() {
      while (!pollStop) {
        await together([
          ...players.map(async player => assert.equal((await request(player.base + '/team/' + player.teamId + '/exists')).exists, true)),
          ...sessions.map(async session => {
            // One host and one leaderboard per session, following their routes.
            await request('/sessions');
            const data = await request('/sessions/' + session.id + '/all-answers');
            verifyMembership(data, session);
            await request('/sessions/' + session.id + '/question-config/' + activeQuestion);
            await request('/sessions/' + session.id);
            verifyMembership(await request('/sessions/' + session.id + '/all-answers'), session);
          })
        ]);
        pollCycles++;
        for (let step = 0; step < 50 && !pollStop; step++) await pause(100);
      }
    }
    pollPromise = poll().catch(error => { failures.push({ phase: 'polling', error: error.message }); pollStop = true; });
    for (let question = 1; question <= 5; question++) {
      activeQuestion = question;
      await together(sessions.map(session => request('/sessions/' + session.id + '/question-category', 'POST', { questionNumber: question, category: `${session.name}, question ${question}`, icon: 'Q' })));
      // Each navigation rebuilds the client's full round map (currently 21 GETs).
      await together(players.map(async player => {
        await together([request('/config'), request(player.base), request(player.base + '/team/' + player.teamId + '/exists')]);
        await request(player.base + '/all-answers');
        await request(player.base + '/team/' + player.teamId + '/exists');
        const questionConfig = await request(player.base + '/question-config/' + question);
        assert.equal(questionConfig.category, `${sessions[player.sessionIndex].name}, question ${question}`);
        const roundMap = await together(Array.from({ length: config.maxQuestions }, (_, index) => request(player.base + '/question-config/' + (index + 1))));
        const used = new Set(player.expected.filter(answer => answer.round === questionConfig.round).map(answer => answer.chosenPoints));
        const chosenPoints = questionConfig.allowedPoints.find(points => !used.has(points));
        assert.notEqual(chosenPoints, undefined, 'No legal unused point value');
        assert.equal(roundMap[question - 1].round, questionConfig.round);
        await request(player.base + '/all-answers');
        await request(player.base + '/answers/' + question);
        player.expected.push({ question, round: questionConfig.round, chosenPoints, awardedPoints: (player.sessionIndex + player.playerIndex + question) % 3 === 0 ? 0 : chosenPoints, answer: `Session ${player.gameId}; team ${player.teamId}; question ${question}`, bonusAnswer: `Bonus ${player.gameId}/${player.teamId}/${question}` });
      }));
      // All 25 players submit at once, then all five hosts score simultaneously.
      await together(players.map(async player => {
        const answer = player.expected[question - 1];
        assert.equal((await request(player.base + '/team/' + player.teamId + '/exists')).exists, true);
        await request(player.base + '/answer', 'POST', { teamId: player.teamId, question, answer: answer.answer, bonusAnswer: answer.bonusAnswer, chosenPoints: answer.chosenPoints });
        const saved = (await request(player.base + '/answers/' + question)).find(row => row.team_id === player.teamId);
        assert.equal(saved.answer, answer.answer);
      }));
      await together(sessions.map(async session => {
        for (const player of players.filter(player => player.gameId === session.id)) {
          await request(player.base + '/answer', 'POST', { teamId: player.teamId, question, awardedPoints: player.expected[question - 1].awardedPoints });
        }
      }));
      await verifyAll(question);
      console.log(`Question ${question}/5: all 25 answers and scores verified across all five sessions.`);
      // Allow the real five-second player/host polling cadence between questions.
      await pause(5200);
    }
    pollStop = true;
    await pollPromise;
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.ok(pollCycles >= 5, 'Expected sustained polling during questions');

    async function verifyAll(questionCount) {
      return together(sessions.map(async session => {
        const data = await request('/sessions/' + session.id + '/all-answers');
        verifyMembership(data, session);
        assert.equal(data.answers.length, 5 * questionCount);
        assert.equal(new Set(data.answers.map(answer => `${answer.team_id}/${answer.question_number}`)).size, 5 * questionCount);
        const totals = [];
        for (const player of players.filter(player => player.gameId === session.id)) {
          const saved = data.answers.filter(answer => answer.team_id === player.teamId);
          assert.equal(saved.length, questionCount);
          for (const expected of player.expected.slice(0, questionCount)) {
            const actual = saved.find(answer => answer.question_number === expected.question);
            assert.equal(actual.answer, expected.answer);
            assert.equal(actual.bonus_answer, expected.bonusAnswer);
            assert.equal(actual.chosen_points, expected.chosenPoints);
            assert.equal(actual.awarded_points, expected.awardedPoints);
          }
          const total = saved.reduce((sum, answer) => sum + answer.awarded_points, 0);
          assert.equal(total, player.expected.slice(0, questionCount).reduce((sum, answer) => sum + answer.awardedPoints, 0));
          totals.push({ teamId: player.teamId, total });
        }
        return { sessionId: session.id, name: session.name, players: 5, answers: data.answers.length, totals };
      }));
    }
    const sessionResults = await verifyAll(5);
    const metricsPromise = once(child, 'message');
    child.send({ type: 'metrics' });
    const [metrics] = await metricsPromise;
    assert.equal(metrics.data.integrity, 'ok');
    const workloadSeconds = (performance.now() - started) / 1000;
    measured = false;
    // Validate persistence by restarting the real API against the same file.
    await stopServer(child);
    ({ child, base } = await startServer(filename));
    assert.deepEqual(await verifyAll(5), sessionResults);
    // Cross-session writes must be rejected and leave all 125 answers unchanged.
    await together(players.map(player => request('/sessions/' + sessions[(player.sessionIndex + 1) % 5].id + '/answer', 'POST', { teamId: player.teamId, question: 1, awardedPoints: 999 }, 404)));
    assert.deepEqual(await verifyAll(5), sessionResults);
    const sorted = samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    const report = {
      testedAt: new Date().toISOString(), node: process.version, platform: process.platform,
      sessions: 5, playersPerSession: 5, questionsPerPlayer: 5, totalAnswers: 125,
      workloadSeconds: round(workloadSeconds), measuredRequests: samples.length,
      unexpectedFailures: failures.length, peakConcurrentRequests: peakInFlight, pollingCycles: pollCycles,
      latencyMilliseconds: { median: round(percentile(.5)), p95: round(percentile(.95)), p99: round(percentile(.99)), max: round(sorted.at(-1)) },
      server: Object.fromEntries(Object.entries(metrics.data).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value])),
      databaseBytes: fs.statSync(filename).size, restartPersistence: 'passed', rejectedCrossSessionWrites: 25,
      sessionResults, limitations: 'HTTP API simulation on one local server with disk SQLite; not 25 rendered browsers, a Cloud Run benchmark, or an authentication/security audit.'
    };
    fs.writeFileSync(path.join(testRoot, 'load-test-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    pollStop = true;
    if (pollPromise) await pollPromise;
    await stopServer(child);
    const target = fs.realpathSync(directory);
    const within = path.relative(fs.realpathSync(testRoot), target);
    if (!within || within.startsWith('..') || path.isAbsolute(within) || !within.startsWith('load-test-')) throw new Error('Refusing to delete an unexpected test directory');
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv.includes('--server')) serve().catch(error => { console.error(error); process.exitCode = 1; });
else run().catch(error => { console.error(error); process.exitCode = 1; });
