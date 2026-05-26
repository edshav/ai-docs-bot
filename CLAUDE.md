# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — `tsc` to `dist/`, copy `appsscript.json` into `dist/`, then lint `src/**/*.ts`.
- `npm run push` — build then `clasp push` (deploys `dist/` to the Apps Script project).
- `npm run watch` — `tsc -w` alongside `clasp push --watch`.
- `npm run format` — Prettier over `src/**/*.ts`.

There is no test runner. The bot is exercised by deploying and triggering it from Telegram. The codebase exposes a few stub functions for manual invocation from the Apps Script editor: `testGemini`, `testGitHubRead`, `manualAuthTest` (referenced by the ESLint `varsIgnorePattern`).

`clasp login` and a populated `.clasp.json` (gitignored) are prerequisites for `push`. Apps Script credentials live in **Script Properties**, not `.env`. The runtime expects: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO` (`owner/repo`), `TARGET_FILE_PATH`, `PERMITTED_GROUP_ID`, `DATABASE_SHEET_ID`.

## Architecture

This is a Google Apps Script (GAS) bot written in TypeScript and deployed via clasp. End-to-end flow: a Telegram webhook hits `doPost` in `src/Code.ts`, which orchestrates calls to four namespaced services — `GitHubService`, `GeminiService`, `TelegramService`, `DatabaseService` — to turn chat messages into Pull Requests on a fixed file.

### Apps Script globals, not ES modules

`tsconfig.json` sets `"module": "None"`. **Do not add `import`/`export`.** Apps Script concatenates all files into one global scope; cross-file references work because each service is a top-level `namespace` (see `src/*Service.ts`). Adding ES module syntax will break the deploy. Shared types in `src/Types.ts` are declared as bare `interface`s for the same reason. The ESLint config (`eslint.config.mjs`) explicitly disables `@typescript-eslint/no-namespace` to permit this pattern, and whitelists entry-point names (`doPost`, `runScheduledMaintenance`, anything matching `(Service|Options|Record)$`, `test*`, `manual*`) so they aren't flagged as unused.

### Request dispatch in `doPost`

`doPost` distinguishes three shapes of Telegram update:
1. **`callback_query`** (button press) → `handleApproval` or `handleCancellation` keyed by the inline-button `callback_data` prefix (`approve_<msgId>` / `cancel_<msgId>`).
2. **`message.reply_to_message`** whose parent ID matches a `PENDING` draft → `handleRefinement` (re-runs Gemini with prior draft as context and edits the original bot message in place).
3. **New mention** of `TELEGRAM_BOT_USERNAME` from `PERMITTED_GROUP_ID` → fresh draft.

Access control is enforced by checking `chatId === PERMITTED_GROUP_ID` and that the text contains the bot username. Any error inside `doPost` is caught, surfaced to the chat, and triggers `DatabaseService.clearLock(TARGET_FILE)` so the bot doesn't stay wedged.

### State machine in Google Sheets

`DatabaseService` treats the first sheet of `DATABASE_SHEET_ID` as a row-per-draft table. **Column order is positional** (no headers consulted): `tg_msg_id, branch_name, file_path, draft_content, status, last_updated`. The `status` enum (`Types.ts`) drives concurrency:

- `PENDING` → draft awaiting Approve/Cancel.
- `PROCESSING` → approval in flight (set as a flag before the slow GitHub commit; see below).
- `COMMITTED` / `CANCELED` / `EXPIRED` → terminal.

`getActiveLock()` returns true if **any** row is `PENDING` or `PROCESSING` — this enforces the MVP single-file constraint by blocking new requests anywhere in the sheet.

### Two-phase lock on approval

`handleApproval` in `src/Code.ts` uses a deliberate pattern that's easy to break:

1. Acquire `LockService.getScriptLock()` (10s wait).
2. Re-read the draft; bail unless `status === "PENDING"` (defends against a duplicate webhook already in flight).
3. **Immediately flip `status` to `PROCESSING` and persist** via `saveDraft` (which itself takes the lock + `SpreadsheetApp.flush()`).
4. **Release the script lock before calling GitHub.** The persisted `PROCESSING` flag is what now blocks re-entry — holding the lock across a multi-second HTTP call would serialize all bot activity.
5. Call `GitHubService.createFullPR`, then write `COMMITTED`.

Preserve this ordering when editing approval logic. `DatabaseService.saveDraft` always wraps its own write in a script lock + `SpreadsheetApp.flush()` — do not bypass it.

### GitHub commit logic: SHA must come from the target branch

`GitHubService.createFullPR` supports iterative commits to the same PR:

- If the branch doesn't exist, branch off `main` and (after the commit) open a PR.
- **Always fetch the file's SHA from the target branch**, not `main`, before `PUT /contents`. Pulling the SHA from `main` causes `409 Conflict` on the second commit to an existing branch. This is the bug the design doc calls out explicitly.
- If the branch already existed, the function skips PR creation and returns a generic `/pulls` URL — the new commit lands on the open PR automatically.

### Gemini contract

`GeminiService.generateDiff` calls Gemini 2.5 Flash with `response_mime_type: "application/json"` and a system instruction that pins the response to `{summary, diff, new_full_content}`. The caller `JSON.parse`s the model's text twice (once for the API envelope, once for the model output). Refinement reuses the same call but prepends the prior `draft_content` into the user prompt.

### Scheduled maintenance

`runScheduledMaintenance` is intended to be wired to a 30-minute time-driven trigger in the Apps Script UI (not auto-installed by code). It calls `DatabaseService.maintenanceCleanup`, which marks any `PENDING`/`PROCESSING` row older than 30 minutes as `EXPIRED` and posts a report back to `PERMITTED_GROUP_ID`. This is the self-healing recovery for deadlocks caused by external API failures mid-flow.

## Reference docs

`thoughts/shared/specs/` and `thoughts/shared/plans/` contain the original product spec, design doc, and TypeScript/clasp migration notes. They explain the *why* behind the SHA-from-branch rule, the lock pattern, and the single-file MVP constraint.
