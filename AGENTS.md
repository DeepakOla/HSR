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
