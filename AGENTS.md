# PomoTM Repository Agent Instructions

## Canonical document set

PomoTM maintains the following five files as its canonical documentation set:

- `SPECIFICATION.md`: current application, game, UI, persistence, Premium, and advertising behavior
- `SECURITY.md`: security boundaries, secret and PII handling, authentication and authorization, and Production safety
- `docs/PRODUCTION_INFRASTRUCTURE.md`: verified Cloudflare, Worker, D1, binding, domain, schema, and audit state
- `README.md`: repository entry point, developer workflow, technology stack, and links to detailed records
- `AGENTS.md`: mandatory rules for AI agents and repository contributors

Do not update only one file and stop without checking the other four. Update every affected canonical document in the same change set, while keeping the responsibilities above and avoiding unnecessary duplication.

## Required workflow

Before changing application code, configuration, infrastructure definitions, database schema, security policy, or documented behavior:

1. Read all five canonical documents.
2. Record `git status --short`, `git diff --stat`, `git diff --check`, and `git rev-parse HEAD`.
3. Inspect the current implementation, configuration, schema, and migrations that govern the requested behavior.
4. Preserve every pre-existing tracked or untracked change; never reset, restore, delete, or rewrite unrelated user work.
5. Identify the smallest required change and its affected canonical documents.
6. Implement only the requested change.
7. Update every affected canonical document in the same change set.
8. Check the other canonical documents for contradictions.
9. Run typecheck.
10. Run build and the existing test suite when applicable.
11. Run `git diff --check`.
12. Review the final diff and report pre-existing changes separately from task changes.

Documentation-only work does not require typecheck or build when no code or configuration changed, but it still requires the Git and consistency checks above.

## Implementation preservation

- Treat current code and configuration as the authority for repository behavior. Do not invent features or silently preserve stale documentation.
- Do not refactor or change behavior outside the requested scope.
- Preserve Matter.js engine stepping, bodies, forces, gravity, collision handling, burst and infection behavior, timers, score/progression behavior, Canvas rendering, and unrelated state transitions unless the user explicitly authorizes that exact change.
- Preserve existing localStorage keys, encodings, validation, defaults, removal behavior, and state synchronization unless explicitly changing the persistence contract.
- Never use omission placeholders such as `// ... existing code ...`, `// existing code`, `/* omitted */`, or an ellipsis in place of real file content.
- Follow repository tests and validation commands; do not claim a check passed unless it was run successfully.

## Production authorization boundary

Before any work related to Cloudflare, Production Workers, D1, Stripe, Firebase Production configuration, DNS, Custom Domains, or secrets, read `docs/PRODUCTION_INFRASTRUCTURE.md` and `SECURITY.md`.

Without explicit user authorization for the specific write, do not perform:

- D1 writes or Production migrations
- Worker deployments, rollbacks, version creation, or deletion
- Cloudflare resource, binding, route, Custom Domain, Zone, DNS, or DNSSEC changes
- Stripe Product, Price, Subscription, Webhook, or other account changes
- Firebase Production configuration changes
- Secret, token, credential, or environment-variable changes

Read-only audits are distinct from writes. Do not invoke application endpoints that can mutate D1 or external services as part of an infrastructure audit merely because they use HTTP `GET`; inspect endpoint behavior first.

For frontend Wrangler operations, Production and Test configuration are separate mandatory boundaries:

- Production frontend deploy and dry-run must explicitly use `wrangler.production.json`; never omit `--config`.
- Frontend Test preview, deploy, and dry-run must explicitly use `wrangler.test.json`. It is the only frontend config allowed to contain `pomo_db_test`.
- Never use `wrangler.test.json` for Production or add a Production D1 binding to `wrangler.production.json` without a separately authorized architecture change and live-state verification.
- Repository config validation or dry-run is not evidence that the config has been deployed. Preserve `CURRENT VERIFIED`, `HISTORICAL`, `NOT VERIFIED`, and `PERMISSION BLOCKED` distinctions.

Do not infer live Production state from `schema.sql`, migrations, Wrangler configuration, source code, or historical notes. Use these status labels:

- `CURRENT VERIFIED`: directly verified against the current Production environment, with evidence and date
- `HISTORICAL`: previously observed but not currently reverified
- `NOT VERIFIED`: insufficient current evidence
- `PERMISSION BLOCKED`: verification was attempted but denied by the available permission

Repository configuration expresses intended deploy input, not proof of the deployed state. Never promote a repository-only or unapplied change to `CURRENT VERIFIED`.

## Production infrastructure synchronization

Any change to a Production Worker, version or deployment, D1 database, table, column, schema, index, constraint, migration, binding, Production API hostname, Custom Domain, DNS, Stripe Webhook endpoint, Firebase Production configuration, or architecture must update `docs/PRODUCTION_INFRASTRUCTURE.md` in the same change set.

After an authorized Production change, reverify the affected live state read-only, update Last Verified and Audit History, and report any remaining gap. Applying a Production change without updating its canonical record is prohibited. Marking the canonical record `CURRENT VERIFIED` before the change is applied and reverified is also prohibited.

## Production D1 synchronization workflow

Production D1 and `docs/PRODUCTION_INFRASTRUCTURE.md` are a single synchronization responsibility. For any table, column, index, `UNIQUE`, `FOREIGN KEY`, `PRIMARY KEY`, migration, seed/data migration, row-structure, binding, database name, or database ID change:

1. Read all canonical documents, especially the Production D1 record.
2. Inspect the current repository schema and migrations.
3. State whether a Production change is required.
4. Encode the proposed database change in a migration.
5. Compare the migration with the canonical record and describe the intended delta.
6. Review impact, data compatibility, and rollback considerations.
7. Apply the Production change only with explicit authorization.
8. Reinspect Production with read-only queries after application.
9. Verify the affected live table inventory, columns, indexes, and constraints.
10. Update `docs/PRODUCTION_INFRASTRUCTURE.md` to `CURRENT VERIFIED` only for live-confirmed facts.
11. Record row counts only as timestamped observations, never permanent schema facts.
12. Check whether `SPECIFICATION.md`, `SECURITY.md`, `README.md`, and this file also need updates.
13. Run `git diff --check` and validation appropriate to the changed scope.
14. Report the migration's applied or unapplied state, Production verification, documentation changes, and validation results.

When a table is added or removed, update the table inventory. When a column changes, update its schema documentation. When an index or constraint changes, update that documentation. A migration file alone is evidence of repository intent, not Production application. Every migration must be identified as applied and read-only verified, or unapplied.

## Secret and PII handling

Never write secret values, tokens, credentials, private keys, passwords, password hashes, cookies, Firebase ID or App Check tokens, `.env.production` values, Worker Secret values, real user email addresses, real user IDs, or Production records to tracked files, logs, reports, or documentation.

Public client identifiers and Cloudflare resource IDs may be documented when operationally necessary, but must not be confused with secrets. Record secret and variable state only with safe presence indicators such as `configured=yes` or `secret exists=yes`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
