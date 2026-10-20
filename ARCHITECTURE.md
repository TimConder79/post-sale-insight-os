# Architecture — v1 Direction

This file records the intended technical shape, not an irreversible stack decision.

## Recommended shape
- Frontend: React + Vite + TypeScript.
- Backend/data: PostgreSQL-oriented relational store; Supabase is a strong v1 option for database/auth/storage.
- Search: database full-text search first; semantic/vector retrieval only when connection suggestions require it.
- AI: server-side service layer with structured outputs for analysis, comment drafting, insight extraction, connection suggestions, synthesis, and weekly review.
- Graph UI: a maintained React graph library with auto-layout. Persist node positions only after explicit user movement.
- Attachments: optional object storage; core text workflow must not depend on files.

## Architectural principles
- Provenance is first-class.
- Source and derived data are separate.
- AI calls fail gracefully without losing entered data.
- Product rules belong in services/domain logic, not only prompts.
- Keep v1 deployable as one web application; avoid microservices.
