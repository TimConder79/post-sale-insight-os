# Product Decision Log

## 2026-10-20 — Repository is canonical product memory

GitHub is the durable source of truth for product decisions, architecture, and implementation. Chat histories are not assumed to be available to coding agents.

## 2026-10-20 — Separate product repository

The application lives separately from the CXology book/website codebase.

## 2026-10-20 — LinkedIn ingestion

v1 uses manual copy/paste of post text and optionally relevant comments. LinkedIn URL is provenance, not an ingestion mechanism. Screenshots/attachments are optional.

## 2026-10-20 — LinkedIn outcomes

Replies, connection requests/acceptance, meetings, and follow-ups are lightweight manual events in v1. The application must never invent them.

## 2026-10-20 — Profile images

Profile photos are optional and are not a dependency. Use initials by default.

## 2026-10-20 — Native insight connections replace Miro

Miro is no longer required for the core workflow. The application preserves Miro's valuable behavior by allowing insights to be connected and synthesized while retaining source lineage. It does not recreate a free-form whiteboard.

## 2026-10-20 — Connection vocabulary

Initial relationship types: Supports, Extends, Contradicts, Example of, Leads to, Related to.

## 2026-10-20 — AI approval model

AI may suggest analysis, comments, insights, connections, synthesis, content, and next actions. It does not silently confirm or save conclusions that require user judgment.

## 2026-10-20 — No activity gamification

No quotas, streaks, authority scores, engagement scores, or activity-volume pressure. The system optimizes for useful learning, relationships, content, and next moves.

## 2026-10-20 — Phase 0 technical foundation (Issue #1)

Use React, TypeScript, Vite, and React Router for one browser application with six placeholder routes and a shared shell. No product workflows, AI clients, backend API, or authentication UI are introduced in Phase 0.

Use standard PostgreSQL SQL migrations rather than an ORM or a provider-specific API. This keeps the schema usable with local PostgreSQL or a future Supabase deployment without choosing a hosted provider now. A Node-only migration runner reads `DATABASE_URL`; database credentials never enter the browser. The browser has no persistence connection in Phase 0. Production hosting and authentication remain future implementation decisions, not new product constraints.

Keep source conversations separate from derived insights. Explicit join tables retain conversation provenance and insight-to-insight synthesis lineage; deletion of referenced evidence is restricted. Creation method and explicit confirmation are separate fields on derived records. Do not invent event, action, or content lifecycle vocabularies before their workflows are designed. Ownership is represented with user foreign keys; authorization/RLS must be designed before any network-accessible data API is introduced.

Use Vitest/Testing Library for route and navigation checks, and embedded PostgreSQL (PGlite, test-only) to execute SQL migrations and relational integrity tests without requiring Docker. Use ESLint, Prettier, strict TypeScript, and a production Vite build. PGlite is not the application's persistence engine.

## 2026-10-20 — Phase 1 Post Workspace persistence and approval (Issue #3)

Use a small Express/TypeScript API with PostgreSQL, alongside the existing Vite client. In development Vite proxies `/api`; the Node server serves the production build. Both servers bind to loopback. This phase supports local single-user use with one server-configured owner ID; it does not introduce authentication UX. Reject unexpected Host/Origin headers and cross-site writes. Do not expose this local API publicly: authenticated deployment remains a separate decision before remote access. The owner is never accepted from request payloads.

Saved source conversations have no update endpoint. Capture exact post/comments, optional provenance and optional person linkage in one transaction. User-edited and explicitly approved Insights are saved in a separate transaction with `insight_sources`, seeds and themes. Browser-generated UUIDs make retried creates safe. No schema changes are needed; the original migration remains unchanged. Creation method is set server-side, never trusted from the client.

AI is isolated behind a typed service boundary. The product owner approved a clearly labeled deterministic development stub and manual fallback for Phase 1; no production provider, network adapter, API key, or paid service is integrated. Default mode is unavailable with full manual capture preserved; explicitly enable the stub to review the interface. Stub output is not real AI analysis and does not choose a seed. Analysis, comment drafts, and proposals are session-local and never automatically become Insights. On explicit approval, manual and development-preview drafts are stored as user-created Insights, not falsely attributed to AI. The existing AI creation-method values remain available for a future real provider, which must follow the canonical grounding hierarchy and preserve the same source/approval boundary. Provider selection remains a separate product-owner decision.

## 2026-10-21 — Explicit durable response save (Issue #5)

Our response is durable conversation history, separate from immutable source and approved Insights. Migration `002_conversation_responses.sql` adds one latest-response row per conversation with owner provenance and a save timestamp. Existing conversations without a row reopen with an empty response. **Save response** explicitly saves or clears the current text after source creation; editing, generating, copying, and approving an Insight do not save the response implicitly or imply posting. The latest explicit save replaces the prior saved response, including across tabs; no revision-history system or posting/event tracking is added. Save failures keep current edits. Unsaved response changes are indicated and warn before reload/close or switching conversations through workspace controls. As with existing drafts, browser history navigation discards uncommitted edits; it does not autosave. Saved responses survive reload/reopen. Source-update routes remain absent.
