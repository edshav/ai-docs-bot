# ai-docs-bot

A serverless Telegram bot that turns group-chat discussions into GitHub Pull Requests against a fixed documentation file. Mentions and reply-threads in Telegram drive an AI-generated Markdown diff that can be previewed, refined, approved, and committed without leaving the chat.

## How it works

1. A user mentions the bot in a permitted Telegram group: `@your_bot Document the new /v1/pay endpoint.`
2. The bot fetches the target file from GitHub, sends it (with the request) to Gemini 2.5 Flash, and replies with a `diff` preview plus `Approve` / `Cancel` buttons.
3. Replying to the bot's preview message refines the proposal — the bot re-runs Gemini and edits its original message in place.
4. `Approve` creates a `docs-patch-<msgId>` branch, commits the new file, and opens a Pull Request. Subsequent refine-and-approve cycles push additional commits to the same PR.
5. A 30-minute maintenance trigger sweeps stale drafts so a mid-flight failure can't wedge the bot.

See `thoughts/shared/specs/2026-03-28-ai-docs-bot-design.md` for the full design.

## Stack

- **Runtime:** Google Apps Script (V8), deployed as a web app webhook.
- **Language:** TypeScript, pushed via [`clasp`](https://github.com/google/clasp).
- **AI:** Gemini 2.5 Flash (`generativelanguage.googleapis.com`).
- **State:** Google Sheets (one row per draft) + GAS `LockService` for concurrency.
- **Code storage:** GitHub REST API.
- **Interface:** Telegram Bot API (webhook + inline keyboards).

Zero hosting cost — everything runs on free tiers.

## Setup

### Prerequisites

- Node.js and `npm`
- A Google account with Apps Script enabled
- A Telegram bot (token from [@BotFather](https://t.me/BotFather))
- A GitHub personal access token with `repo` scope
- A Gemini API key

### 1. Install and authenticate

```bash
npm install
npx clasp login
```

### 2. Create the Apps Script project and link it

Create a new standalone Apps Script project at <https://script.google.com>, then in this repo:

```bash
echo '{ "scriptId": "<YOUR_SCRIPT_ID>", "rootDir": "dist/" }' > .clasp.json
```

`.clasp.json` is gitignored.

### 3. Create the state spreadsheet

Create a new Google Sheet. The first sheet's columns are positional (no headers required), in this order:

| col | field |
|-----|-------|
| A   | `tg_msg_id` |
| B   | `branch_name` |
| C   | `file_path` |
| D   | `draft_content` |
| E   | `status` |
| F   | `last_updated` |

Copy the sheet ID from the URL for the `DATABASE_SHEET_ID` property below.

### 4. Configure Script Properties

In the Apps Script editor under **Project Settings → Script Properties**, set:

| key | value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_BOT_USERNAME` | e.g. `@your_doc_bot` (used to detect mentions) |
| `PERMITTED_GROUP_ID` | Telegram chat ID of the allowed group |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GITHUB_TOKEN` | PAT with `repo` scope |
| `GITHUB_REPO` | `owner/repo` |
| `TARGET_FILE_PATH` | path inside the repo to the doc file, e.g. `docs/api.md` |
| `DATABASE_SHEET_ID` | from step 3 |

### 5. Deploy

```bash
npm run push
```

In the Apps Script editor:

- **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*. Copy the deployment URL.
- Register that URL as your Telegram webhook:
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<DEPLOYMENT_URL>"
  ```
- **Triggers → Add trigger:** function `runScheduledMaintenance`, time-driven, every 30 minutes.

## Development

```bash
npm run build      # tsc -> dist/, copy appsscript.json, lint
npm run push       # build, then clasp push
npm run watch      # tsc -w alongside clasp push --watch
npm run format     # prettier over src/
```

There is no automated test suite. The bot is exercised by deploying and triggering it from Telegram. `src/` exposes a few helpers for manual invocation from the Apps Script editor: `testGemini`, `testGitHubRead`, `manualAuthTest`.

A few constraints worth knowing before editing — see `CLAUDE.md` for the full list:

- `tsconfig.json` sets `"module": "None"`. **Do not add `import`/`export`** — Apps Script concatenates files into one global scope, and cross-file references work via top-level `namespace`s.
- When committing to GitHub, the file SHA must be fetched from the *target branch*, not `main`, to allow iterative commits on the same PR.
- Approval intentionally releases the GAS `LockService` lock before calling GitHub; the persisted `status = "PROCESSING"` flag is what blocks re-entry.

## Limitations

- Single target file per deployment (MVP constraint).
- No automatic cleanup when a PR is closed/merged on GitHub.
- No auto-merge — every change goes through the maintainer.
