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
