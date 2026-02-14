# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and entries are grouped by day based on commit history.

## 2026-02-12

### Added
- Pulled max question count from the API config on the player page, join page, and control panel.
- Displayed question labels from the server config on the player page and control panel.
- Allowed half-point wager display as 1/2 while submitting 0.5 to the server.
- Added a post-submit verification step before advancing to the next question.

### Changed
- Disabled and greyed out all inputs after final question submission.
- Treated a question as answered only when an answer text exists to avoid premature redirects.
- Added a one-time guard to the reset alert so it only shows once.
- Updated the control panel points controls to step 0, 0.5, 1, 2, 3 and support decimal values.

### Fixed
- Allowed player submissions to update existing answer rows created by host-awarded points.

## 2026-02-10

### Added
- Added a brief flash animation when the submit button becomes enabled.

### Changed
- Persisted team session details in local storage for cross-tab access.
- Defaulted the submit button to disabled until an answer and points are selected.

### Fixed
- Added a compatibility read from session storage to prevent join failures on cached clients.
- Redirected players to their next unanswered question when they open a question they've already submitted.
- Redirected returning teams from the join page to their first unanswered question.
- Highlighted the top leaderboard row with a red-orange gradient bar, rounded edges, and a bolder white rank.
- Nudged the rank number upward for better vertical alignment.

## 2026-02-09

### Added
- Added a sparkly submit animation with a "Submitting..." label and brief delay before advancing questions.

### Changed
- Removed default point selection on the questions page so players must choose a wager.
- Moved control panel JavaScript into scripts/host.js.
- Moved join page JavaScript into scripts/play.js.
- Moved leaderboard JavaScript into scripts/leaderboard.js.
- Moved questions page JavaScript into scripts/questions.js.
- Added a control panel link to the leaderboard top bar.

### Fixed
- Blocked answer submissions until a points value is explicitly selected.
- Persisted the host control panel current question across refreshes.
- Disabled previous/next navigation at the first and last questions.
- Added live polling on the control panel with auto-submit of host point changes.

## 2026-02-07

### Added
- Added a leaderboard page and linked it from the control panel.
- Added a question progress bar to the questions page.
- Added documentation in the README on customizing the web app look.
- Added preview screenshots to the README with a tailored layout.

### Changed
- Refined overall UI styling, including footer updates and button polish.
- Updated typography to use the Nunito font family.
- Reworked points selection into button controls.
- Adjusted control panel layout, including previous/next button placement.
- Removed back/next navigation from the questions page.
- Updated the logo to a generic version.
- Realigned team row layout.
- Matched the Join page primary button styling to the Questions submit button.
- Updated the Control Panel to allow negative point adjustments.
- Updated the Control Panel totals to preview changes live before submission.

### Fixed
- Fixed session validation redirects when a user is out of session on the questions page.

## 2026-02-06

### Changed
- Updated CSS styling across the app.

## 2026-02-07

### Added
- Added a `start.sh` file as a starter script placeholder.

### Changed
- Updated README instructions to use the `pub-quiz` folder name, run HTTPS with `sudo`, and use `pub-quiz` PM2 process names.
- Renamed package metadata to align with the `pub-quiz` naming (package.json and package-lock).
- Moved the HTTPS server port from 3000 to 2099 and updated the startup log message.
- Enabled bonus answers across all questions and aligned question 10 points to 8 in config.

## 2026-02-10

### Fixed
- Rejected duplicate team answer submissions to prevent overwriting prior answers.

## 2026-02-06

### Added
- Added round numbers to every question configuration, enabling round-based logic and reporting.
- Established the initial round map: Q1–Q3 (Round 1), Q4–Q6 (Round 2), Q7–Q9 (Round 3), Q11–Q13 (Round 4), Q14–Q16 (Round 5), Q17–Q19 (Round 6), Q10 (Round 7), Q20 (Round 8).

### Fixed
- Removed the committed `quiz.db` file from version control to prevent shipping live game data.
