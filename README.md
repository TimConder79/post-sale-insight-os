# Post-Sale Insight OS

Phase 0 foundation for the single-user MVP. Read [AGENTS.md](AGENTS.md) and the canonical product documents before making changes. This phase contains navigation placeholders and a relational schema, **not product workflows**.

## Requirements and installation

Use Node.js 24 LTS (`nvm use` with the included `.nvmrc`) and npm. Install locked dependencies:

```sh
npm ci
```

In cloud environments where the home directory is read-only, use `npm ci --cache /tmp/post-sale-npm-cache`. Use the existing isolated checkout; no additional worktree is needed.

## Local development

```sh
npm run dev
```

Vite prints the local address. The browser app runs without credentials or a database connection. The six placeholder routes are `/` (Today), `/post-workspace`, `/insights`, `/connections`, `/relationships`, and `/weekly-review`. Each renders within the shared navigation shell. Unknown URLs render a not-found screen. For remote development, add `-- --host 0.0.0.0` only in an appropriately restricted environment.

## Database and migrations

Use PostgreSQL 17 or later, locally or through a provider supporting standard PostgreSQL. For example, with Docker installed:

```sh
docker run --name post-sale-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=post_sale_insight_os \
  -p 127.0.0.1:5432:5432 \
  -v post-sale-postgres-data:/var/lib/postgresql/data \
  -d postgres:17
# Wait until this succeeds:
docker exec post-sale-postgres pg_isready -U postgres -d post_sale_insight_os
cp .env.example .env
npm run db:migrate
```

The example password is for local development only. If using an existing PostgreSQL installation, create an empty database and set `DATABASE_URL` in ignored `.env` or your process environment instead. `DATABASE_URL` is used only by Node migration tooling. Never prefix credentials with `VITE_`: Vite-prefixed values are public browser configuration. Do not commit `.env` or real credentials. Hosted database connections must use the provider's verified TLS configuration; do not disable certificate validation.

Migrations live in `database/migrations`, run in filename order, and are recorded with SHA-256 checksums in `schema_migrations`. Rerunning `npm run db:migrate` is safe: applied migrations are skipped, changed applied files are rejected, and each new migration and journal entry commit atomically. The PostgreSQL runner holds a session advisory lock to serialize concurrent runs. Add a new zero-padded numbered SQL file for each schema change; never edit an applied migration. There is no automatic destructive down/reset command. Back up data before migration and use an explicit forward correction when needed.

The schema covers all entities in [DATA-MODEL.md](DATA-MODEL.md), plus `insight_lineage` for synthesis sources. `insight_sources` links insights to original conversations; lineage links synthesized insights to source insights; `insight_connections` represents the canonical relationship vocabulary independently. Foreign keys restrict deletion of referenced evidence, and composite foreign keys prevent cross-owner links. Original post/comments remain text in source records; no derived edits update them. Seed values use the Five Seeds; themes are flexible text. Derived records carry creation method and confirmation separately; AI suggestions default to unconfirmed. Event/action/content vocabularies remain open until their workflow is specified. Optional attachment storage is deferred; no external service is required for core text records.

Phase 0 provides no database API, auth UI, AI calls, or user provisioning workflow. Create no real user data through an exposed database/browser connection. Ownership foreign keys are not authorization: auth and access policies must be implemented before exposing persistence. The application does not yet enforce workflow rules such as one open relationship action or valid multi-level synthesis ancestry; those belong with their approved future workflows.

## Validation

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
# All of the above:
npm run check
```

`npm run format` applies Prettier. Tests exercise all six routes, navigation and unknown URLs, and run the actual SQL migrations using test-only embedded PostgreSQL (PGlite). Database tests cover reapplication, rollback, checksum drift, exact source preservation, provenance, synthesis lineage, connection independence, and relational constraints. They require no Docker or external secrets. PGlite is not a substitute for testing provider authentication, TLS or network connectivity; `npm run db:migrate` validates that connection when configured. GitHub Actions runs the same checks on pushes and pull requests, and applies/reapplies the migration runner against a PostgreSQL 17 service.

## Production build

```sh
npm run build
npm run preview
```

Build output is `dist/`. Preview serves the production bundle for local smoke checks; it is not a production hosting service. A deployed static host must serve `index.html` for application paths so direct route loads work. Hosting and production authentication are not selected in Phase 0.

## Structure and scope

- `src/app/`: shared shell, routes, styles, route tests.
- `src/test/`: shared test setup.
- `database/migrations/`: append-only PostgreSQL schema migrations.
- `database/schema.test.js`: executable migration/integrity tests.
- `scripts/`: server-only migration tooling.

See [DECISIONS.md](DECISIONS.md) for technical choices. Phase 1 — Post Workspace is the recommended next slice **after Phase 0 review and explicit approval**; it has not been started.
