# Post-Sale Insight OS

A single-user workspace for preserving manually supplied conversations and capturing approved learning. Read [AGENTS.md](AGENTS.md) and the canonical product documents before making changes. Phase 1 implements **Post Workspace**; Phase 2 adds the **Insights Library**; Phase 3 adds **Connections and manual Synthesis**; Phase 4 adds **Themes**; Phase 5A adds **real AI assistance with explicit approval**. Other workflows remain placeholders.

## Setup

Use Node.js 24 LTS (`nvm use`) and PostgreSQL 17+. Install locked dependencies:

```sh
npm ci
```

For a local PostgreSQL instance with Docker:

```sh
docker run --name post-sale-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=post_sale_insight_os \
  -p 127.0.0.1:5432:5432 \
  -v post-sale-postgres-data:/var/lib/postgresql/data \
  -d postgres:17
# Wait until ready:
docker exec post-sale-postgres pg_isready -U postgres -d post_sale_insight_os
cp .env.example .env
npm run db:migrate
npm run dev
```

If PostgreSQL is already installed, create an empty database and configure `DATABASE_URL` in `.env` instead. Do not overwrite an existing `.env`. The example password is for local development only; use your own credentials elsewhere and retain verified TLS for hosted PostgreSQL. The API automatically creates the configured owner's `users` row after migrations; it does not seed conversations, people, or Insights.

`npm run dev` starts the API on loopback port 3001 and Vite on loopback port 5173. Open the local Vite address and choose **Post Workspace**. Vite proxies `/api` to the Node server. Both processes stop together. Use the existing isolated checkout; no additional worktree is needed. In cloud environments with a read-only home directory, use `npm ci --cache /tmp/post-sale-npm-cache`.

## Configuration and local access boundary

All configuration is documented in `.env.example`:

| Variable            | Purpose                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Server-only PostgreSQL connection string; also used by migrations.                                                                                                                    |
| `WORKSPACE_USER_ID` | One stable UUID for your local workspace. The server sets ownership; never accepted from the browser. Changing this UUID selects a different owner, so retain it to reopen your data. |
| `AI_MODE`           | `unavailable` (default), `openai` (real server-side provider), or `stub` (explicit development preview).                                                                              |
| `PORT`              | API/production port, default 3001. Keep 3001 when using the supplied Vite dev proxy.                                                                                                  |
| `APP_ORIGIN`        | Exact allowed development origin; default `http://127.0.0.1:5173`. Production same-origin requests are allowed automatically.                                                         |

Never prefix credentials with `VITE_`; those values are public browser configuration. `.env` is ignored. No database or AI secrets are sent to the browser, and this phase requires no AI credentials.

This is a **local single-user API**, not a remotely authenticated service. The API and Vite bind only to loopback. The API checks Host/Origin, rejects cross-site requests, and requires JSON writes. Do not expose it through a public proxy or port forward. Authenticated remote deployment requires a separate access-policy decision; no authentication product UX or multi-user feature is introduced here.

## Post Workspace flow

1. Paste the Original Post. Optionally expand Relevant Comments and provenance/person details. A URL is metadata only; it is never fetched. A person name is needed only when linking person metadata.
2. **Save source** independently of any assistance or Insight. Post/comments are preserved as supplied, including whitespace and clipboard line endings; later edits before initial save preserve untouched line endings. Saved source fields are locked, and no source-update API exists.
3. Write your response manually, or explicitly enable `AI_MODE=stub` and restart to review deterministic development-preview suggestions. The stub is labeled as such, uses a source excerpt, and does not select seeds or claim model analysis. Its revision controls demonstrate the future interface; they are templates, not real AI. Edit and explicitly **Save response** to retain the latest text with the conversation. **Copy response** only copies; post manually on LinkedIn. Neither action posts or invents a posting outcome.
4. Write a manual Insight or explicitly select the development proposal. Edit its title/summary and optional takeaways/seeds/themes. Nothing becomes durable knowledge until **Approve & save Insight** is clicked. Approval saves a distinct Insight plus `insight_sources` provenance, in a separate transaction from source capture.
5. Refresh the conversation URL or use **Reopen saved conversations** to see the exact saved source, the latest explicitly saved response, optional person metadata and approved linked Insights. **New conversation** starts another source. No full Insights Library or Relationships workflow is implemented.

Manual and development-preview approvals use `creation_method=user` and `user_confirmed=true`; the stub is not real AI, so it must not be attributed as AI-generated. Real AI approvals use the existing `ai_suggested`/`ai_then_edited` values, derived by the server from signed proposal receipts. Client-supplied creation methods and ownership are rejected.

Source saves and Insight approvals use client-generated IDs for safe retries; matching retries do not create duplicate records. A changed retry returns a conflict rather than pretending edits were saved. Failed assistance or persistence requests keep your current edits in the workspace. Analysis and unapproved Insights remain session-local. Responses persist only through **Save response**, including an intentional empty response to clear the saved text. Unsaved response edits are marked, and reload/close or workspace conversation switching warns before discarding them; browser history navigation does not autosave drafts. The latest explicit response save wins across tabs; no revision history is introduced. Save failures retain current edits and the previous durable response. Source and approved Insights cannot be overwritten through this Phase 1 API.

## Insights Library (Phase 2)

Open **Insights Library** to browse this workspace owner's approved Insights. Title and Insight text are primary; lists also show Seeds (or **Unclassified**), available source people/companies, creation date and any existing favorite flag. Search matches title, Insight text, notes and source person/company case-insensitively as literal text. Combine search with a canonical Seed or Unclassified filter. Zero Seeds is valid and is not written back as a classification.

Select an Insight to see its text, optional collapsed Takeaways, notes and a separate source-provenance section. Original source text and relevant comments are read-only and unchanged; missing person/company/URL metadata is supported. **Open source in Post Workspace** follows `insight_sources`; **Back to selected Insight** restores the Library selection and filters. Search/filter/selection live in the Library URL. Selecting a detail moves keyboard focus to its heading so it is reachable when panels stack on mobile.

The Library is read-only: it uses existing records and schema with no migration or data re-entry. Connections opens the Phase 3 workspace; Themes opens the Phase 4 workspace. No general Insight editor or new favorite controls are implemented. The small-MVP list is not paginated; detailed source text is requested only when an Insight is selected. Automated baseline fixtures are synthetic and confined to test databases; no production-like user records are seeded or recreated.

## Connections and synthesis (Phase 3)

Run `npm run db:migrate` before using this branch. Open **Connections** under Insights, or **Connect this Insight** in Library detail. Search and choose two approved Insights, select a relationship and click **Save connection**. Supports, Extends, Example of and Leads to read **A → B**; Contradicts and Related to are symmetric. Same-type equivalent pairs are rejected (including reversed symmetric pairs); different types and reversed directional relationships remain distinct. Zero-Seed Insights can participate. Only explicit saves create confirmed relationships.

**List** shows endpoint titles, Insight text, Seeds and links, and offers **Disconnect** with confirmation. Disconnect removes only the relationship. **Map** automatically arranges approved Insights and saved relationships, with pan/zoom/fit and session-only dragging. The Insight search filters visible Map nodes/edges; List retains all saved relationships. Click a node to open its Insight. Parallel relationships have distinct labeled curves. The graph is lazy-loaded and an error boundary offers List if loading/rendering fails. There are no permanent canvas positions, connection drawing handles or whiteboard tools.

Select at least two candidate Insights and choose **Synthesize a larger insight**. The selected source titles/text remain visible while you write the new title and Insight text. Seeds and Takeaways are optional. **Approve & save synthesis** creates a normal approved user Insight and lineage to every source, without modifying any source Insight or source conversation. Failed saves retain the draft. No connection or shared Seed is required, and no AI provider or development suggestion is needed. The resulting Insight opens in Library and is labeled as synthesized, with **Synthesized from** links. Follow those links to the original source Insights and their exact conversation provenance; nested synthesis retains this chain. No deletion/editing of source Insights is introduced.

## Themes (Phase 4)

Open **Insights → Themes**. Create a named emerging subject with an optional working definition, then explicitly select and add existing approved Insights. Underlying Insight text, Seeds/Unclassified, synthesis status and available person/company metadata remain visible; links open Library provenance. Search Themes by name/definition, or search/filter member Insights and candidates by Seed. Remove an association with confirmation without altering the Insight. A Theme may start empty, cross Seeds, or share Insights with other Themes. No AI is required, including with `AI_MODE=unavailable`.

Overview is alphabetical and shows direct Insight count, represented Seeds, latest associated Insight date, and distinct original source-conversation count. The conversation count follows approved synthesis lineage recursively and deduplicates overlapping provenance. These counts describe recorded recurrence, not importance or external validation.

Apply migration `004_themes.sql` with `npm run db:migrate`. It adds Theme objects and owner-scoped membership tables only; existing records, including Phase 3 test syntheses and legacy text labels in `insight_themes`, remain untouched. Legacy labels are not silently converted. Names are compared case-insensitively ignoring surrounding ordinary spaces per owner, while authored text is preserved. No rename, merge, deletion, automatic tagging, clustering, or real AI suggestions are introduced.

API: `GET/POST /api/themes`, `GET /api/themes/:id`, `POST /api/themes/:id/insights` (explicit batch approval), and `DELETE /api/themes/:id/insights/:insightId`. Owner comes exclusively from server configuration; approval and ownership are checked server-side. No browser database credentials or new environment variables are needed.

## API and AI boundary

- `GET /api/insights?q=...&seed=...`: approved, owner-scoped Library list; optional canonical Seed or `Unclassified`.
- `GET /api/insights/:id`: approved, owner-scoped detail and exact source provenance; unavailable or foreign records return 404.
- `GET /api/connections`: confirmed owner-scoped relationships with approved endpoints.
- `POST /api/connections`: `{ id, insightA, insightB, relationship, confirmed: true }`; derives direction and rejects self/equivalent connections.
- `DELETE /api/connections/:id`: removes only this owner's relationship.
- `POST /api/syntheses`: `{ id, sourceIds, title, summary, takeaways, seeds, confirmed: true }`; at least two distinct approved owner-scoped source Insights. Saves atomically and supports matching retries.
- `GET /api/status`: development AI mode only, no secrets.
- `GET /api/conversations`: this owner's conversation previews for reopening.
- `POST /api/conversations`: `{ id, source: { originalText, relevantComments, sourceUrl, person? } }`.
- `GET /api/conversations/:id`: exact source, latest saved response, optional person, approved linked Insights.
- `PUT /api/conversations/:id/response`: `{ text }`, saving the latest response independently; empty text explicitly clears it. Ownership comes from the server, and source fields are not accepted.
- `POST /api/conversations/:id/insights`: `{ id, title, summary, takeaways, seeds, themes, confirmed: true }`.
- `POST /api/assist`: source, optional saved conversation ID, current comment and revision mode; returns validated, unconfirmed suggestion fields. Saved-source requests use server-read source and approved linked knowledge rather than trusting client replacements.

The provider-neutral Assistant boundary in `server/ai.ts` supports exact-source analysis, approved-knowledge suggestions and synthesis drafting. The OpenAI adapter stays server-side and validates structured outputs; unavailable and explicit development-stub modes preserve manual operation. See the Phase 5A configuration and approval flow below.

## Real AI assistance (Phase 5A)

AI proposes. You decide. All manual workflows remain available with `AI_MODE=unavailable` (the default). For real assistance set server-only `AI_MODE=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` (default `gpt-4.1-mini`) in your untracked `.env` or shell environment, then restart the Node server. Never use `VITE_` for these values. With no key, openai mode becomes unavailable. The existing stub is development-only and never substitutes for a failed real request.

The adapter calls the fixed OpenAI Responses endpoint using Node fetch and strict structured output, with no new SDK. The selected model must support Responses structured JSON schemas. It uses `store:false`, a 45-second timeout, a 120,000-character context ceiling and a bounded output. Configure provider access/billing locally; no credential is stored in the database or browser. Explicit AI requests send the current source or selected approved knowledge to the configured provider. Provider errors and invalid/refused output are sanitized; drafts and manual workflows remain available.

- **Post Workspace:** save the exact source, then Analyze. Review an editable Insight proposal with optional Seeds/rationale. Use the proposal, edit as needed, then explicitly approve. Real response drafts are shown separately; **Use response draft** applies one to the editor, and **Save response** is still explicit. Source analysis does not create/assign Themes.
- **Library detail:** expand **AI-assisted Connections & Themes** and request suggestions. Each candidate has rationale and direction (symmetric types remain undirected). Explicitly approve individual Connections or existing Theme associations. Zero proposals is valid. Approved owner-scoped context is limited to 20 candidate Insights and 20 Themes with up to five member Insights each; it is not exhaustive retrieval. Theme creation stays manual.
- **Synthesis:** select two or more Insights, then optionally request an AI draft (up to 20 selected Insights per AI request). Sources remain visible and fixed. Applying the editable draft requires confirmation before replacing existing writing/Seeds. Explicit approval alone writes the new approved Insight and all original selected lineage. Manual synthesis remains unchanged.

Server-issued approval receipts bind AI provenance to the original source or selected source set. The server derives AI-suggested/AI-then-edited attribution from the approved fields; it never trusts a browser creation method. Receipts expire after one hour or server restart. On expiry, edits remain: request a new proposal or explicitly **Continue as a manual draft**. Existing response/membership tables do not store AI attribution; transient proposal labels do not imply new durable metadata. No migration is needed and existing records are unchanged.

Automated provider tests use controlled HTTP responses; browser AI fixtures test presentation and explicit approval while API tests verify signed receipts and real database transactions. No live provider credential is required for checks. After review, local real-use acceptance remains: analyze one existing real conversation, inspect/edit/approve its learning, review Connections and existing Theme suggestions (including Forecast Evidence), draft synthesis from two existing Insights, and verify no durable relationship/membership/synthesis appears until explicitly approved. These real records are never recreated in cloud fixtures.

## Database migrations

`database/migrations/001_initial.sql` remains unchanged. The Phase 1 follow-up migration `002_conversation_responses.sql` adds a separate latest-response row per conversation with owner provenance and a save timestamp. Existing conversations without a response row reopen with empty response text. Migration `003_connection_uniqueness.sql` adds an equivalent-confirmed-connection unique index without changing existing rows. Conflicting legacy duplicates cause a migration failure and require explicit review; no automated destructive deduplication occurs. Migration `004_themes.sql` adds durable Theme objects and explicit memberships without converting legacy labels or altering existing records. The schema retains source/Insight separation, `insight_sources`, independent connections and synthesis lineage. Themes do not alter any of these records or Seed classification.

```sh
npm run db:migrate
```

Migrations run in filename order, under a PostgreSQL session advisory lock. Each migration and its SHA-256 journal entry commit atomically. Reruns skip matching applied migrations; checksum drift is rejected. Add new numbered SQL files for future changes instead of editing applied files. There is no automatic destructive reset. Back up data before migrations and use explicit forward corrections. Source/person creation and Insight/provenance creation each have their own database transaction. Ownership is included in every workflow query and relationship.

## Checks and tests

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
# All five:
npm run check
```

`npm run format` applies Prettier. Vitest includes shared-shell/navigation checks, PostgreSQL schema/migration tests, and actual HTTP API/domain tests backed by embedded PostgreSQL (PGlite, test-only). These tests require no Docker, production AI or credentials.

Browser acceptance tests exercise the built application and real PostgreSQL. Use a **disposable test database**, apply migrations to it and export its `DATABASE_URL` before running; the suite writes test data under fixed test-owner IDs. It does not reset or delete your data. Do not point it at a real personal or production database.

```sh
# DATABASE_URL must refer to your disposable, already migrated test database.
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts two local production servers on ports 3101/3102 for development-stub and unavailable modes. It covers exact source/comments/person preservation, response editing/revision/copy, proposal approval and provenance, refresh/reopen, manual fallback, failure retention and browser-secret exclusion. If using a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable (e.g. `/usr/bin/chromium`); otherwise Playwright uses its pinned browser. On Linux machines without browser libraries, `npx playwright install --with-deps chromium` installs supported dependencies. GitHub Actions runs lint, formatting, types, unit/API/schema tests, production build, migration/reapplication against PostgreSQL 17, and browser acceptance tests.

## Production bundle and local server

```sh
npm run build
npm start
```

The Node server serves `dist/` and the same local API, including direct route loads. `npm run preview` serves only the static bundle and is not the full persistence workflow; use `npm start` for application validation. Production hosting and remote authentication are not selected in this phase.

## Structure and scope

- `src/app/`: shared shell and unchanged placeholder routes.
- `src/workspace/`: Phase 1 workspace UI and API client.
- `src/library/`: Library, source provenance and synthesis lineage.
- `src/connections/`: connection List, lazy Map, and manual synthesis.
- `src/themes/`: manual Theme creation, overview/detail, and explicit membership.
- `src/shared/`: credential-free request/output schemas and types.
- `server/`: local API, PostgreSQL transactions and provider-neutral Assistant boundary and server-only real provider adapter.
- `database/`: additive SQL migrations and integrity tests.
- `scripts/`: server-only migration tooling.
- `e2e/`: real-browser acceptance checks against PostgreSQL.

See [DECISIONS.md](DECISIONS.md) for material choices. The mockup/Today redesign, Weekly Review, content generation and other later workflows remain deferred. The next slice requires review and explicit approval.
