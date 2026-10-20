# Phase 0 completion report — Issue #1

## 1. What was created

- React + strict TypeScript + Vite scaffold, six placeholder routes, shared responsive navigation, keyboard skip link, and unknown-route handling.
- PostgreSQL schema and append-only transactional migration runner, `.env.example`, ignored local configuration, and locked npm dependencies.
- ESLint, Prettier, TypeScript checking, route/database tests, production build, and GitHub Actions checks.
- README instructions for installation, development, database preparation, migrations, validation, and production builds.

No Phase 1 workflow, AI integration, scraping, CRM, graph editor, scores, quotas, or speculative product functionality was implemented.

## 2. Technical decisions and rationale

Use React Router for explicit browser routes and a small shared shell. Plain PostgreSQL migrations avoid an ORM or hosted-provider commitment. Only Node tooling reads database credentials; the browser has no database connection. No server framework or auth implementation is needed for placeholders. PGlite is test-only embedded PostgreSQL so schema behavior tests run without external services. These choices are recorded in `DECISIONS.md`.

## 3. Database/schema decisions

All entities in `DATA-MODEL.md` are represented. Conversation source text/comments remain separate from derived insights. `insight_sources` records conversation provenance; `insight_lineage` records the source insights of a synthesis; `insight_connections` represents the six canonical relationship types independently. Foreign keys preserve references and restrict deleting referenced evidence; composite owner references prevent cross-user links. Five Seeds are constrained, themes remain flexible, and suggestions default to unconfirmed with separate creation-method metadata. Undefined event/action/content vocabularies remain open rather than inventing lifecycle behavior. User provisioning, authorization, optional attachment storage, and workflow-specific validation remain deferred.

Migrations are serialized with a PostgreSQL advisory lock, applied atomically, and journaled with SHA-256 checksums. Existing migrations are not edited after application; reruns skip matching applied migrations and reject checksum drift. No destructive reset command is provided.

## 4. Checks run and results

- Clean `npm ci --cache /tmp/post-sale-npm-cache`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run typecheck`: passed.
- `npm test`: 14 tests passed in two files; no skipped tests. Eight route/navigation checks and six executable PostgreSQL schema/migration tests cover source preservation, synthesis lineage, connection independence, ownership, references, vocabularies, migration rollback and checksum drift.
- `npm run build`: passed; production bundle generated.
- `npm run check`: passed after reinstalling locked dependencies.
- Development and production-preview HTTP checks: all six application route URLs and production assets served successfully; development entry module transformed successfully. Actual rendered route/navigation behavior is covered by component tests.
- `npm run db:migrate` against a real PostgreSQL 17 container: first application and second application both passed; one migration journal row with a 64-character SHA-256 checksum verified.
- Missing `DATABASE_URL`: migration command correctly exits nonzero with configuration guidance.
- `git diff --check`: passed.

CI is configured for the same checks and a PostgreSQL 17 migration/reapplication smoke check. CI execution on GitHub is separate from these local results.

## 5. Unresolved questions

No product-owner decision is required for the Phase 0 placeholders/schema. Production hosting, authentication/access policies, exact workflow vocabularies and optional attachments must be decided in their relevant approved implementation slices, before exposing real data. Ownership foreign keys alone are not authorization. Cross-ancestor synthesis validation and one-primary-open-action behavior belong with their future workflows.

## 6. Deviations

No intentional scope or product deviations. Added `insight_lineage` as the join table required to represent the documented synthesis relationship. PostgreSQL is selected without committing to Supabase. Optional attachment storage and all product workflows are deferred, consistent with the issue.

## 7. Recommended next slice

After review and explicit approval, Phase 1 — Post Workspace: one real manually pasted conversation can become a preserved source and approved insight without data loss. Phase 1 has not been started. Do not merge this work or begin Phase 1 automatically.
