# Agent Invariants

## Booking and capacity

- Active capacity states are `HELD`, `PENDING_VERIFICATION`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.
- Hold expiry only auto-expires `HELD` + `ADVANCE_PENDING` bookings.
- Do not auto-release bookings after evidence submission.
- Use atomic DB-guarded writes for hold creation.
- Preserve snapshot pricing, slot labels, capacity and config version on each booking.

## Payment and evidence

- UPI link/QR does not verify payment.
- Evidence and UTR set booking to `PENDING_VERIFICATION`/`EVIDENCE_SUBMITTED`.
- R2 is private and optional; when unavailable, website screenshot upload must be disabled.

## Security

- Protect admin pages and APIs server-side.
- Never trust role or pricing from browser.
- Public APIs must not leak customer PII.

## Testing commands

- `npm run test`
- `npm run typecheck`
- `npm run build`

## Repository and agent workflow

- Read `ANTIGRAVITY_START_HERE.md` before making project changes. It records the current branch, local/Preview/Production separation, and deployment safety gates.
- Work in the user's existing repository checkout and existing development branch. Never reinitialize Git, clone a second nested copy, or recreate the project.
- Before changing files, inspect `git status --short --branch`, `git branch --show-current`, `git remote -v`, and `git log -1 --oneline`.
- Preserve all pre-existing local modifications. Never use `git reset --hard`, `git clean -fd`, force-push, or overwrite a modified file without inspecting its diff and obtaining the user's approval.
- Keep work on `copilot/build-cng-cylinder-hydro-testing-website`. Do not change `main`, merge PR #1, or deploy Production unless the user explicitly approves that exact action.
- Never commit `.env`, `.dev.vars*`, credentials, Access tokens/AUD values, customer data, `.wrangler/`, or `node_modules/`.
- Run lint, type-check, unit tests and build after code changes. Run browser tests for customer and staff workflows before requesting merge.
- Distinguish local D1 migrations (`--local`) from Cloudflare Preview remote migrations and Production remote migrations. Follow the exact commands and stop conditions in `ANTIGRAVITY_START_HERE.md`.

## Cloudflare and Antigravity access

- The workspace MCP config at `.agents/mcp_config.json` connects to the official Cloudflare API MCP server. The user must complete Cloudflare OAuth authentication in Antigravity; Wrangler CLI login and MCP OAuth are separate credentials.
- Use the MCP server and Wrangler CLI for account/resource inspection. Start with read-only inspection of the Worker, Builds integration, Preview settings, D1 migration state, D1 bindings, R2 bindings and Access applications.
- Do not execute Cloudflare writes, remote D1 migrations, resource deletion/creation, Production deploys, or Access policy changes without the user's explicit approval for that operation.
- Treat `npx wrangler deploy`, `npm run db:migrate:remote`, and Cloudflare Workers Builds production branch deploys as Production operations.
- For the first stable main-branch baseline, keep the Workers Builds production command at `npx wrangler versions upload` (save a version without activating it). Only change to `npx wrangler deploy` after explicit Production release approval.
- Keep the Preview D1 binding separate from Production D1. Never bind the Production R2 bucket to Preview.
- Keep the Cloudflare API MCP connection in Ask/approval mode. Never paste API tokens, Access AUD values, JWTs, or secrets into chat or Git.
