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
