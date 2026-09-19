# Taut

A personal library that turns saved ideas into answers and small, resumable learning sessions.

Built for the Convex All Gas Hackathon. React + Vite + TypeScript on the frontend; Convex handles data, authentication, reactive updates, background work, AI conversation history, and static hosting.

## Try the early edition

Development demo: https://friendly-heron-719.convex.site

1. Open your personal space. Guest authentication keeps each browser's collection separate.
2. Save a note or public HTTPS article, or choose **Explore sample library**. Samples are original example notes, clearly labeled.
3. **Ask my library**: select up to eight sources and ask a question. Open the evidence to see exact quotations and return to the source.
4. **Keep learning**: choose a goal and sources, try an explanation, receive feedback, and pause. Your question and history remain when you return.

This is a development preview, not a submitted hackathon entry. Guest spaces persist in the same browser; clearing browser storage loses access. Cross-device sign-in is not implemented.

## Local development

Requires Node 22+ and a Convex account.

```sh
npm install
npx convex dev
npm run dev
```

The frontend runs on http://127.0.0.1:5173. The CLI writes public connection settings to `.env.local`.

Add private credentials to `.env.secrets.local` using the names in `.env.example`, then run `node scripts/configure.mjs`. This sets server environment variables and creates local authentication keys. It attempts to register the AgentMail webhook unless `AGENTMAIL_WEBHOOK_SECRET` is supplied. If the key lacks webhook permissions, create a webhook in AgentMail for `message.received` at the deployment's `/agentmail/webhook` URL and set that secret instead. Secrets and browser test sessions are excluded from Git.

The default OpenAI model is `gpt-4.1-mini`, configurable with server variable `OPENAI_MODEL`. OpenAI receives only the selected source excerpts and the current conversation. Keys never go to the browser.

## Integrations

- **OpenAI:** source-grounded answers and tutoring, with Convex Agent storing conversation history. Exact quoted text is checked server-side against supplied source excerpts. This verifies the quotation, not every inference in an AI answer.
- **Firecrawl:** readable article import through a durable Convex Workflow, with bounded retries and visible error states.
- **AgentMail:** an optional personal capture inbox. Signed webhooks route email text into the owner's library, with duplicate delivery protection. Incoming email never sends a reply or runs AI automatically. This requires working AgentMail permissions and a configured webhook.
- **Convex static hosting:** serves the frontend while preserving auth and webhook routes at their original paths.

## Verification

```sh
npm run build
npm test
npm run test:e2e
```

The end-to-end test requires the running frontend, a configured development backend, Microsoft Edge, and OpenAI/Firecrawl keys. It creates isolated guest test data and makes real provider calls. It tests note persistence, favorites, grounded answers, learning replies, pause/resume, article import, and mobile layout. Screenshots and test auth state stay under ignored `.local/`.

Publish a development preview with `npm run demo:publish`. This uploads the built frontend to the current development deployment. Production release and hackathon submission are separate steps.

## Deliberate MVP limits

- 200 sources and 50 learning sessions per space; up to eight sources per AI request, with 12,000 characters per source provided to the model.
- Imported text is limited to 50,000 characters and clearly marked when truncated.
- Keyword search works across the complete bounded collection. Semantic retrieval, PDFs, videos, attachments, browser extensions, and native apps are not implemented.
- Per-user and global AI request limits constrain usage. No automatic daily email or automatic AI calls on imported material.
- Deleting a source does not erase earlier learning history or the quotes already saved in it.

See [hackathon.md](hackathon.md) for evidence-based build history.
