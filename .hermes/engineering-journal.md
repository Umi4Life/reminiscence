# Queue Reminiscence Engineering Journal

Append-only project journal for the free queue-board system.

## Project metrics

Primary metric: **time taken**.

Track time by phase:

- `planning` — product scope, requirements, architecture, UX flows, tradeoff decisions.
- `implementation` — writing application code, infrastructure code, and migrations.
- `testing` — unit/integration/e2e/manual verification.
- `debugging` — investigating failures, defects, flaky behavior, or unexpected runtime behavior.
- `documentation` — README, setup notes, API docs, user/admin guides, project writeups.
- `review-deploy` — code review, PR prep, CI work, release/deployment steps.
- `admin` — repo setup and project-management overhead.

Time ledger lives in `.hermes/time-log.csv`.

## 2026-06-13 — Project log initialized

- **Context:** New empty GitHub repo `Umi4Life/queue-reminiscence` for a free queue-board system.
- **Goal:** Start an engineering log focused on measuring time taken across planning, implementation, and related project phases.
- **Problem:** The repository had no commits or project-local measurement structure yet.
- **Symptoms / errors:** `git clone` reported `warning: You appear to have cloned an empty repository.`
- **Investigation steps:** Verified local clone state and remote URL before adding project-local log files.
- **Root cause:** New empty repository.
- **Resolution:** Added README plus `.hermes/engineering-journal.md`, `.hermes/time-log.csv`, and `.hermes/time-metrics.md` to establish the measurement system.
- **Source artifacts:** `README.md`, `.hermes/engineering-journal.md`, `.hermes/time-log.csv`, `.hermes/time-metrics.md`.
