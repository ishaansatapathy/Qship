# Qship — Documentation

This folder contains the technical reference documentation for Qship.

| Document | What's inside |
|----------|--------------|
| [agent-safety.md](./agent-safety.md) | **Agent guardrails** — prompt injection defence, rate limiting, retry mechanisms, fallback strategies, token budgets, output sanitisation, HMAC webhook verification, human-in-the-loop gates |
| [database-schema.md](./database-schema.md) | **Full schema reference** — all tables, columns, enums, relations, 14 performance indexes, migration notes, FSM status values |
| [ai-features.md](./ai-features.md) | **AI features deep-dive** — all 14 AI capabilities, prompt design, Zod validation, fallback strategies, OpenAI client details |
| [github-integration.md](./github-integration.md) | **GitHub App setup** — create app, permissions, webhook events, branch linking, PR review comments, inline annotations, issues intake, release creation |
| [inngest-workflows.md](./inngest-workflows.md) | **Async workflow reference** — all 6 Inngest functions, step memoisation, retry config, outbox drain, autonomous sweep, in-process fallback |

---

For the **full README** (project overview, setup, deployment, architecture), see the root [`README.md`](../README.md).

For the **judge walkthrough**, see [`JUDGE_WALKTHROUGH.md`](../JUDGE_WALKTHROUGH.md).
