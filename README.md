# Taut

A personal library that turns saved ideas into answers and small, resumable learning sessions.

Built for the Convex All Gas Hackathon. React + Vite + TypeScript on the frontend; Convex handles data, authentication, reactive updates, background work, AI conversation history, and static hosting.

## Public beta

Live application: https://keen-cassowary-904.convex.site

1. Create an email/password account and enter the emailed verification code. Sign in on another device to access the same collection; password recovery is available from the sign-in form.
2. Save a note or public HTTPS article, or choose **Explore sample library**. Samples are original example notes, clearly labeled.
3. **Ask my library**: select up to eight sources and ask a question. Open the evidence to see exact quotations and return to the source.
4. **Keep learning**: choose a goal and sources, try an explanation, receive feedback, and pause. Your question and history remain when you return.

5. Open **Space settings → Enable email capture**. Copy the shared address and your private subject code, or use **Open email app**. Forward mail with that code in its subject to save its text in your collection.

This is a public beta with usage limits, not a load-tested unlimited service. Previous guest spaces belong to the development deployment; they are not automatically copied into production accounts.

## Local development

Requires Node 22+ and a Convex account.

```sh
npm install
npx convex dev
npm run dev
```

The frontend runs on http://127.0.0.1:5173. The CLI writes public connection settings to `.env.local`.

Add private credentials to `.env.secrets.local` using the names in `.env.example`, then run `node scripts/configure.mjs`. Secrets and browser test sessions are excluded from Git. Configuration parses quoted values, restricts credentials to official AgentMail hosts, preserves cached auth keys, and reuses the deployment's exact webhook. Development and production have separate signing keys and webhooks.

AgentMail permissions: `inbox_create`, `inbox_read`, `webhook_create`, `webhook_read`, and `message_send`. Browser email tests also use `message_read`. Run `npm run mail:diagnose` to distinguish missing permissions from other provider errors without printing credentials. The original HTTP 403 was `missing_permission`; updating the key's permissions resolved it.

The current AgentMail plan allows three inboxes. Taut therefore reuses one project inbox for account emails and shared capture. An unguessable subject token routes each captured message to its owner. Verification messages and mail without a matching token are ignored by capture. The code is a private write capability: anyone who knows it can add text to that collection, but cannot read it.

The default OpenAI model is `gpt-4.1-mini`, configurable with server variable `OPENAI_MODEL`. OpenAI receives only the selected source excerpts and the current conversation. Keys never go to the browser.

## Integrations

- **OpenAI:** source-grounded answers and tutoring, with Convex Agent storing conversation history. Exact quoted text is checked server-side against supplied source excerpts. This verifies the quotation, not every inference in an AI answer.
- **Firecrawl:** readable article import through a durable Convex Workflow, with bounded retries and visible error states.
- **AgentMail:** verified signup, password recovery, and optional shared-address email capture. Signed webhooks route text by private subject code, with duplicate delivery protection. Incoming email never sends a reply or runs AI automatically.
- **Convex static hosting:** serves the frontend while preserving auth and webhook routes at their original paths.

## Verification

```sh
npm run build
npm test
npm run test:setup
npm run test:auth
npm run test:e2e
npm run test:mail
node scripts/release-check.mjs
node scripts/release-ui.mjs
```

Browser tests require Microsoft Edge and configured providers. Set `TAUT_TEST_URL` to the target deployment. The auth test uses a project-owned test inbox, creates a new account in that deployment, sends real verification/capture/reset messages, and stores private test state under ignored `.local/`. Run it once for a fresh deployment, followed by `test:e2e` for note persistence, favorites, grounded answers, learning replies, pause/resume, article import, and mobile layout. `test:mail` can reuse the account. Tests make real provider calls and consume the same quotas as users.

Publish a development preview with `npm run demo:publish`. For production, first run `node scripts/configure.mjs --prod --site-url https://keen-cassowary-904.convex.site`, then `npm run publish:production`. The latter deploys the backend and builds/uploads the frontend with the production URL. `--initialize-auth` is only for an inspected, empty deployment; never use it to overwrite another deployment's existing signing keys. Production key cache must be preserved or restored securely. No repository or hackathon entry has been submitted by these scripts.

## Deliberate MVP limits

- 200 sources and 50 learning sessions per space; up to eight sources per AI request, with 12,000 characters per source provided to the model.
- Imported text is limited to 50,000 characters and clearly marked when truncated.
- Lists contain metadata and excerpts; full text loads only when a source is opened or selected for AI. Legacy development notes remain readable. Search combines title/topic/excerpt matches with up to 40 indexed content matches belonging to the account.
- Daily per-account limits: 30 AI requests, 20 link imports, 50 captured emails. Global daily limits: 200 AI requests, 100 imports, 200 account emails, 1,000 captured emails, and 2,000 auth attempts. These conservative beta budgets are defined in `convex/lib.ts`; they may be reached before a user's individual limit. Provider plan limits also apply.
- Semantic retrieval, PDFs, videos, attachments, browser extensions, and native apps are not implemented. There is no automatic daily email or automatic AI call on imported material.
- Deleting a source does not erase earlier learning history or the quotes already saved in it.

See [hackathon.md](hackathon.md) for evidence-based build history.
