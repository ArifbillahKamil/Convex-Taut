# Hackathon log

- **Project:** Taut
- **Event:** Convex All Gas Hackathon
- **What it does:** A personal library for saved sources, source-grounded answers, and resumable learning sessions.
- **Live app:** https://friendly-heron-719.convex.site (development preview)
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** https://friendly-heron-719.convex.cloud
- **Components:** @convex-dev/agent, @convex-dev/workflow, @convex-dev/rate-limiter, @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, actions, realtime queries, scheduled functions, HTTP actions, agent threads, durable workflows, static hosting
- **Auth:** Convex Auth
- **AI models:** gpt-4.1-mini
- **Started:** 2026-09-19T03:03:36Z
- **Last updated:** 2026-09-19T09:01:03Z

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
