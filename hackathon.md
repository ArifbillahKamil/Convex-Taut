# Hackathon log

- **Project:** Taut
- **Event:** Convex All Gas Hackathon
- **What it does:** A personal library for saved sources, source-grounded answers, and resumable learning sessions.
- **Live app:** https://keen-cassowary-904.convex.site
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** https://keen-cassowary-904.convex.cloud
- **Components:** @convex-dev/agent, @convex-dev/workflow, @convex-dev/rate-limiter, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, realtime queries, scheduled functions, HTTP actions, agent threads, durable workflows, static hosting
- **Auth:** Convex Auth
- **AI models:** gpt-4.1-mini
- **Started:** 2026-09-19T03:03:36Z
- **Last updated:** 2026-09-19T23:35:34Z

## Log

### 2026-09-19
Started environment setup and installed the official build-log skill in
`.agents/skills/convex-hackathon-skill/`, including `references/log-format.md`.
Verified the global Convex plugin version 1.10.0 is installed and enabled; its MCP configuration is present, but activation in the current agent session remains unverified.
Selected Convex static hosting for the later frontend build; no hosting component is installed yet.
No application source or Git history exists. The project name uses the workspace folder name; the product concept is undecided.
Started records the observed setup-file timestamp, not an application start date. Local timestamps are weaker evidence than Git history. No app has been built or deployed.

### 2026-09-19 — application build and development preview
Built Taut's responsive library, note capture, favorites, source-grounded Q&A, and learning sessions with pause/resume (`src/`, `convex/library.ts`, `convex/learning.ts`).
OpenAI selects references to server-extracted source passages; original quotations are resolved by the server. Convex Agent stores learning conversation history. Firecrawl imports public articles through a durable Convex Workflow with bounded retries (`convex/ai.ts`, `convex/grounding.ts`, `convex/ingest.ts`).
Guest authentication scopes personal data to its owner. Registered rate limits, protected writes, and request deduplication. The AgentMail component and signed inbound-email route are implemented, but live email capture is not verified: webhook registration returned HTTP 403 and requires account-side configuration (`convex/mail.ts`, `convex/http.ts`). No outbound email is implemented or sent.
Published the development preview with Convex static hosting, preserving auth and webhook paths. Build and TypeScript checks passed; seven backend tests passed. A browser test against the hosted URL passed guest auth, note persistence, favorites, OpenAI answers with evidence, two learning turns with evidence, pause/resume after reload, Firecrawl import, and mobile overflow checks, with zero browser errors.
Visually checked desktop and mobile screenshots; corrected a narrow mobile learning banner. Example notes are labeled and original, not simulated provider output. Limits remain: browser-local guest access, eight selected sources per AI request, bounded collections, no PDFs or attachments, and no verified live email capture. No repository has been published and no hackathon entry has been submitted.
This entry is based on local source files and observed development commands, not Git commits.

### 2026-09-19 — public beta release (working tree, UTC)
Diagnosed AgentMail's HTTP 403 as missing key permissions. After the owner updated the key, inbox and webhook API checks returned 200; registration and live delivery succeeded. Improved environment parsing, sanitized diagnostics, exact webhook reuse, and separate development/production auth state (`scripts/configure.mjs`, `scripts/agentmail-config.mjs`).
Added verified email/password signup, cross-device sign-in, sign-out, and password recovery using Convex Auth and AgentMail. The owner selected a shared capture address with private subject tokens because the provider plan permits only three inboxes. Signed inbound messages are routed by token and deduplicated; incoming mail never triggers AI or replies (`convex/auth.ts`, `convex/accounts.ts`, `convex/mail.ts`, `src/AuthForm.tsx`).
Moved new source bodies out of reactive list documents, loading full text only for reading or selected AI context. Added indexed, owner-scoped content search; retained compatibility with older development notes. Enforced verified accounts for paid features, per-account and global usage budgets, and clearer quota messages (`convex/sourceStorage.ts`, `convex/library.ts`, `convex/lib.ts`).
Deployed backend and static frontend to production. Build passed, eleven backend tests and five configuration tests passed, and npm audit reported no known runtime dependency vulnerabilities. Real production browser tests passed signup verification, shared email capture, separate-browser login, password reset, note persistence, favorites, OpenAI evidence, two learning turns, pause/resume, Firecrawl import, and mobile overflow checks, with zero browser runtime errors.
Checked the live bundle uses the production backend and contains no configured API keys; unsigned webhooks and unauthenticated library reads are rejected. A production browser test also found a keyword beyond the saved excerpt through indexed search and loaded the full source text. Inspected signup and library mobile screenshots; synchronized the development preview with the release. This is a public beta with documented quotas, not a mass-load benchmark. No Git repository has been published or hackathon entry submitted. Evidence comes from source files and observed commands, not Git commits; test messages were sent only between project-owned inboxes, with addresses, tokens, and account details omitted.
