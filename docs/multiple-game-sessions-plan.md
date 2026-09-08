# Multiple game sessions: review and implementation plan

Branch: `codex/multiple-game-sessions`  
Baseline reviewed and tested: September 8, 2026.

## Intended behavior

Run several named sessions at once, each with its own unique four-digit PIN. A new bar at the top of `host.html`, above the existing question controls, has a session dropdown on the left. Its menu lists sessions by name and PIN and provides Create session, Rename session, and Delete session actions. The selected session's PIN remains clearly visible.

- Create opens a small form for a name and PIN (pre-filled with an available random PIN). Validate names and exactly four digits; retain leading zeros and reject duplicate PINs.
- Selecting a session changes only that host tab. Other host tabs and players continue their own sessions.
- Rename changes the display name without changing the session ID, PIN, or team membership.
- Delete confirms the session name and explains that its teams, answers, and category choices will be removed. Select another session afterward; deleting the last session shows an empty state with Create session available and game controls disabled.
- Reset remains a separate action: clear only the selected session's teams, answers, and category choices, return to question 1, and optionally change its PIN. Keep the session ID/name stable; removed teams must rejoin.
- Use keyboard-accessible menu controls, labeled dialogs, sensible focus restoration, and a layout that fits narrow screens.

## Current architecture and findings

The app is one Express server serving static HTML/JavaScript plus a SQLite API. Polling drives host refresh and player validation; no WebSocket service is needed for this change.

| Area | Current behavior | Required change |
| --- | --- | --- |
| `api/https-server.js`, `getCurrentGame()` | Selects the newest game globally. Join, host reads, existence checks, reset, and deletion depend on it. | Resolve an explicit session for every game operation. |
| `games` / `teams` / `answers` | Teams already have `game_id`; answers link through teams. Old reset-created games remain in the database. | Reuse these relationships; add names, lifecycle state, constraints and indexes. |
| `question_categories` | Keyed only by question number; reset deletes all categories. | Composite key `(game_id, question_number)` and session-specific reset. |
| `frontend/scripts/play.js` | Joins, then separately fetches the current game ID. | Return the authoritative session ID with the join response, removing the race. |
| `frontend/scripts/questions.js` | Compares the player's saved game to the global current game every five seconds. | Validate the player's own session and team. |
| `frontend/scripts/host.js` | Global question storage key, answer maps, category caches, dirty scores, and polling. | Scope state by session and guard asynchronous switching. |
| Leaderboard page/script | Loads global teams/answers; return link loses context. | Carry the session ID into the leaderboard and back to host. |

Additional issues relevant to the change:

- `/answer` does not verify team existence or session ownership. Scoped requests must reject teams belonging to another session, including on scoring writes.
- Host score and category saves do not check HTTP status. A failed save can appear successful; session switching must not proceed after such failures.
- Player storage uses global `teamId`, `teamName`, and `gameId` keys, so another game in the same browser can overwrite it.
- PIN validation currently checks length rather than digits; no database uniqueness constraint exists.
- Host actions currently have no authentication and public endpoints expose answers. Session scoping is necessary for this feature but is not host/player authorization. A host login or capability design would be a separate scope decision.
- `npm test` is a failing placeholder. CI uses Node 18 while locked `better-sqlite3@12.6.2` declares Node 20/22/23/24/25 support.

## Implementation sequence

### 1. Database migration and testable server startup

- Separate application/database construction from listening so tests can use temporary databases and ports. Preserve `npm start`.
- Introduce versioned transactional migrations and take a backup before migrating existing data.
- Add a session name and lifecycle state to `games`. Preserve the legacy current game as the active named session; mark older reset history inactive rather than unexpectedly making its old PINs joinable. Preserve all existing rows and report any ambiguous legacy data.
- Add a unique PIN index for active games. Resolve the legacy current game using `created_at DESC, id DESC` for deterministic timestamp ties. Do not silently rewrite conflicting active PINs.
- Rebuild category storage with `(game_id, question_number)` as its primary key, assigning legacy categories to the migrated current game.
- Index team membership and answer lookup. Validate existing data before adding answer uniqueness or foreign keys; do not silently discard duplicates/orphans.
- Use transactions for create/reset/delete. Delete answers, teams, and category overrides only for the requested session.

### 2. Session API and isolation

- Add `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/:sessionId`, and `POST /api/sessions/:sessionId/reset`.
- Scope team lists, answer reads/writes, scoring, category overrides, and existence/deletion checks beneath `/api/sessions/:sessionId/...`.
- Keep shared branding, the category catalog, and base question rules global for the first version. Only host-selected category overrides vary per session.
- Keep `POST /api/join` PIN-based, resolve exactly one active session, and return `{ teamId, gameId, gameName }` in one response.
- Validate IDs, question numbers, names, PINs, numeric points, and team membership. Missing/deleted/inactive sessions return a clear error; never fall back to another session.
- After updating all clients, retire global current-game routes. Cached old clients should receive an explicit reload/upgrade error rather than silently accessing another game.

### 3. Host session bar and safe switching

- Add the session bar in `frontend/host.html` with matching responsive styles in `frontend/styles.css`.
- Introduce a small shared session-context helper for URL parsing and scoped API calls; keep the existing plain JavaScript approach.
- Carry `sessionId` in the URL and keep the host's selection per tab. Persist question position under a session-specific key.
- Before switching, stop refresh work, capture the old session/question, and await pending score/category writes. Retain dirty state and stay in the current session if a write fails.
- Clear or partition teams, totals, answer maps, dirty points, and category metadata caches. Ignore stale responses using a request generation counter or cancellation.
- Bind writes to the captured session ID, not a mutable global selection. Serialize saves so periodic refresh and navigation cannot race.
- Refresh the menu after create/rename/delete and handle deletion from another host tab explicitly.

### 4. Player and leaderboard context

- Store player credentials by session, use the URL/tab context to select them, and preserve that context through question navigation and reloads. Migrate legacy saved membership once when it is valid.
- Join different PINs in different tabs without overwriting membership. Validate session and team together; resetting or deleting A returns only A's players to join.
- Bind all question configuration, answer history, point-use checks, and submissions to the joined session.
- Carry session context to the leaderboard and its host return link. Show the session name to make the selected game clear.

### 5. Verification and documentation

- Add meaningful Node integration tests using disposable SQLite databases and wire them to `npm test`.
- Update CI and runtime documentation to a consistent supported Node version (the baseline on this PC is Node 24).
- Test fresh database startup and migration of legacy games/categories/history; rerun migrations to check idempotence.
- Test two active sessions with different PINs, including identical team names and question numbers. Ensure answers, totals, category changes, reset, and deletion remain isolated.
- Test duplicate/invalid PINs, leading zeros, invalid IDs, cross-session writes, deleted teams, and inactive legacy games.
- Test switching with pending scores, HTTP failures, delayed responses, and two host tabs on different sessions.
- Browser acceptance: create A/B, join both, submit and score independently, switch back and forth, rename, reload, open both leaderboards, reset A, delete A, and confirm B continues unchanged. Include keyboard and narrow-screen checks.

## Local baseline verification

The existing application was run without changing application code:

- Node `v24.19.0`; lockfile-based dependency installation completed, including the native SQLite rebuild.
- SQLite in-memory smoke test and syntax checks for the server and every frontend script passed.
- HTTP checks passed for `/`, host, play, questions, leaderboard, and CSS; health endpoint returned OK.
- API smoke flow passed: join using the current PIN, submit an answer, award 2.5 points, verify the totals payload and team existence, delete the test team, and verify it no longer exists. Test records were cleaned up.
- Host page rendered in the browser with question navigation, category options, PIN `0000`, and the empty team table.
- Full interactive player gameplay and HTML lint were not run in this baseline check. The existing `npm test` placeholder is not a passing test suite.
- Installation reported three dependency audit findings (one each low, moderate, and high); they were not remediated in this planning task.

### Running on this PC

Dependencies are installed in the ignored `node_modules` folder. Local SQLite data is in ignored `data/quiz.db`.

From PowerShell in the project, run `node .\api\https-server.js`. If Node is not on that terminal's PATH, this PC also has it at:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\api\https-server.js
```

Open `http://localhost:8080/host.html` and `http://localhost:8080/play.html`. The fresh database PIN is `0000`. Use separate browser profiles or a private window for independent teams in the current version, since it shares team storage across normal tabs.

A background server was left running for this review (PID `41360`; PID applies only to this run). Stop that process before starting another server on port 8080. Logs are in `%TEMP%\open-trivia-night-server.log` and `%TEMP%\open-trivia-night-server-error.log`.

The Codex terminal had Node but no npm command. For this verification, npm 11.6.2 was downloaded from the npm registry into `%TEMP%\open-trivia-night-npm-11.6.2`, with a local command shim. No system PATH changes were made. To repeat installation while that temporary tool exists:

```powershell
$env:PATH = (Join-Path $env:TEMP 'open-trivia-night-npm-11.6.2') + ';' + (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin') + ';' + $env:PATH
npm.cmd ci
```

For a durable standalone setup, install Node 24 with npm, then use `npm ci` and `npm start`. A custom port in PowerShell is `$env:PORT = '8081'` followed by the start command.
