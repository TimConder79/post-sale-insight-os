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

## 2026-10-21 — Explicit connections and manual synthesis (Issue #9)

Supports, Extends, Example of, and Leads to are directional: A supports/extends/is an example of/leads to B; reversing endpoints is a distinct relationship. Contradicts and Related to are symmetric; reversing their endpoints is equivalent. Different relationship types may coexist for a pair. Migration `003_connection_uniqueness.sql` adds a partial unique index for confirmed connections using ordered endpoints for directional types and unordered endpoints for symmetric types. No existing record is rewritten or removed. If conflicting legacy confirmed connections exist, migration fails safely for explicit review rather than silently deleting user data. Existing owner foreign keys and self-connection checks remain intact. The API requires explicit approval, verifies both endpoints are approved and owner-scoped under transaction locks, and derives direction server-side. Removing a connection removes only that relationship.

React Flow (`@xyflow/react`) supplies maintained Map interaction/accessibility, pan/zoom/fit, and session-only node dragging; Dagre (`@dagrejs/dagre`) supplies automatic directed multigraph layout. These dependencies avoid building a custom canvas/interaction system. Graph assets are lazy-loaded behind an error boundary so List remains independent of graph loading/rendering. Parallel relationships use separate labeled curves. No graph edits through handles, shapes, persistent positions, free-form canvas tools or scoring are introduced. Search filters candidate Insights and Map visibility; List retains all saved relationships for inspection.

Manual synthesis creates a new normal approved Insight (`creation_method=user`) and one `insight_lineage` row per selected approved owner-scoped source Insight, in a single transaction with optional Seeds/Takeaways. A new synthesis ID can only reference existing sources, so this API cannot introduce lineage cycles. Source Insights and their source-conversation links are not copied, changed, replaced or deleted. Synthesis of a synthesis is permitted; Library detail follows direct “Synthesized from” links recursively back to original source Insights and conversations. Seeds are never inferred or inherited automatically, and zero Seeds is valid. Saves support matching-ID retries without duplicate Insights; changed fields/lineage return a conflict. Synthesis works entirely without AI. Real AI and AI-suggested connections/drafts are deferred; the Phase 1 source-based assistant boundary is not expanded here.

## 2026-10-21 — User-authored Themes and descriptive recurrence (Issue #11)

Insight = what you learned. Seed = which part of your point of view it strengthens. Theme = what subject keeps appearing across conversations. Themes are emerging subjects, never another set of strategic Seeds. Creation and membership require explicit user action and work entirely without AI. No automatic naming, assignment, merging, inheritance, ranking, or suggestion is added.

Migration `004_themes.sql` adds `themes` (stable UUID, owner, exact authored name, optional working definition, creation timestamp and user creation method) and `theme_memberships` (owner, Theme, Insight, association timestamp). The existing `insight_themes` table only stores text labels; it cannot represent a durable Theme identity, empty Theme, or Theme-level metadata. It remains untouched for Phase 1 compatibility. Legacy labels are not silently promoted to Theme objects or associations. No existing user data is migrated, rewritten, cleaned up or deleted. New explicit membership uses the relational tables; no parallel string tags are written by the Themes workspace.

Names preserve authored spelling/spacing. Duplicate comparison is case-insensitive with surrounding ordinary spaces ignored, per owner, enforced by a database unique index; internal spacing and punctuation remain meaningful. Empty/whitespace-only names are rejected; names are limited to 200 characters and working definitions to 2,000. A matching create-ID retry is safe; changed fields under a saved ID return a conflict without discarding edits. Rename, merge and Theme deletion are deferred.

Only approved owner-scoped Insights may be explicitly associated, including syntheses and Unclassified Insights. Batch additions are atomic and idempotent; repeat removal is harmless. Removing membership requires UI confirmation and removes only the association. An Insight may belong to any number of Themes. Neither operation edits Insights, Seeds, lineage, connections, conversations or responses. Composite foreign keys enforce same-owner membership; server approval checks run under transaction locks. Seeds are not inherited or changed by membership, including across synthesis lineage.

Overview is alphabetical, not ordered by counts. Insight count means direct approved members. Distinct source-conversation count traverses approved owner-scoped synthesis ancestors using a recursive SQL `UNION`, then counts distinct owner-scoped original conversation IDs. Overlapping/nested paths and several Insights from one conversation count once; cycle-safe set traversal also terminates on legacy cycles. Insights without linked conversations contribute no invented provenance. Counts describe recorded recurrence, not independent validation, authority or importance. Seed tags and latest associated Insight date describe direct members only. Detail reuses Library content/person metadata and links to full provenance; synthesized context remains traceable through Library lineage links. No Weekly Review or Content Ideas behavior is introduced.
