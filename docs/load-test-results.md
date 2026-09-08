# Five-session load test

Tested September 8, 2026 on this Windows PC, using Node v24.19.0.

The requested workload passed: **5 simultaneous sessions, 5 independent players
per session, and 5 questions per player**. That is 25 players and 125 answers,
plus five simulated host dashboards and five leaderboard refresh streams.

## Method

`scripts/load-sessions.js` starts the actual Express application in a separate Node
process, using a temporary **disk-backed SQLite database** under the project's
ignored `data` directory. It never opens or changes the running app's `quiz.db`.

Each question includes the player's current question-loading API sequence,
including all 21 question-configuration reads used to build the round map.
Players submit in bursts of 25 concurrent submissions, and five hosts then save
scores concurrently. Player validity, host data, and leaderboard data refresh
every five seconds throughout the test. Identical player names across sessions
exercise ID-based isolation. Answers and bonus answers contain unique session,
team, and question markers so mixed records cannot pass verification.

The test verifies each answer, chosen points, awarded points, per-team totals,
session membership, question categories, and absence of duplicate answers.
Afterward it restarts the server against the same SQLite file and verifies all
records again. It also attempts 25 writes using teams from the wrong session;
all are rejected without changing the saved scores.

## Results

| Measurement | Result |
| --- | --- |
| Sessions / players / questions per player | 5 / 25 / 5 |
| Answers stored and checked | 125 of 125 |
| Scores and totals | All correct |
| Missing, duplicate, or mixed-session answers | 0 |
| Normal workload requests | 4,513 |
| Unexpected failed requests | 0 |
| Workload duration, including pacing | 29.88 seconds |
| Peak concurrent requests | 525 during question-configuration bursts |
| Background polling cycles | 6 |
| Median response time | 130.81 ms |
| 95th-percentile response time | 211.44 ms |
| 99th-percentile response time | 219.48 ms |
| Slowest response | 227.55 ms |
| Server memory at end of workload | 72.20 MiB RSS |
| Server CPU time during workload | 2.453 seconds |
| SQLite integrity check | `ok` |
| Persistence after server restart | All 125 answers and all totals preserved |
| Deliberate cross-session writes | 25 of 25 rejected with HTTP 404 |

The 4,513-request timing sample covers normal setup and gameplay through final
verification. The subsequent restart verification and intentional HTTP 404 tests
are excluded from that sample. Latency is measured by the separate local HTTP
client, including queueing, response transfer, and JSON parsing.

A second run also passed all checks: another 4,513 requests with no unexpected
failures, a 209.74 ms 95th percentile, and a 223.04 ms maximum. Its report is the
latest JSON output; the main table above records the first run.

| Session | Players | Answers | Totals for players 1–5 |
| --- | --- | --- | --- |
| Load session 1 | 5 | 25 | 8, 7, 11, 8, 7 |
| Load session 2 | 5 | 25 | 7, 11, 8, 7, 11 |
| Load session 3 | 5 | 25 | 11, 8, 7, 11, 8 |
| Load session 4 | 5 | 25 | 8, 7, 11, 8, 7 |
| Load session 5 | 5 | 25 | 7, 11, 8, 7, 11 |

## Interpretation and limits

These results support running the requested workload on this PC with **one
server process and one SQLite database**. No application fixes were needed.
The simulation exercises the real HTTP API and disk writes; it does not launch
25 rendered browsers or measure Wi-Fi, phone rendering, a full evening's uptime,
or Google Cloud Run performance.

Capacity and access control are separate concerns. The existing host API has no
authentication, so anyone who can reach it can issue host actions. This load test
does not make public hosting secure. Independent server instances also need a
shared database to coordinate games and PINs; this test covers one instance.

## Repeat

```powershell
npm run test:load
# Or, with Node available and dependencies already installed:
node scripts/load-sessions.js
```

The test takes roughly 30 seconds, cleans up its temporary database and server,
and writes fresh machine-readable results to ignored `data/load-test-report.json`.
The regular nine regression tests remain available through `npm test`.
