// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate } from "../scripts/migrations.js";

const directory = new URL("./migrations/", import.meta.url);
let db;
let userId;
const sourceText = "  Original post\nExact wording — keep it.  ";
async function insight(title = "Insight") {
  const { rows } = await db.query(
    `INSERT INTO insights (user_id, title, summary, creation_method) VALUES ($1, $2, 'Derived summary', 'ai_suggested') RETURNING id`,
    [userId, title],
  );
  return rows[0].id;
}
async function source() {
  const { rows } = await db.query(
    `INSERT INTO source_conversations (user_id, source_type, original_text, relevant_comments) VALUES ($1, 'manual', $2, '  Exact comment\n') RETURNING id`,
    [userId, sourceText],
  );
  return rows[0].id;
}
beforeEach(async () => {
  db = new PGlite();
  await migrate(db, directory);
  userId = (await db.query("INSERT INTO users DEFAULT VALUES RETURNING id"))
    .rows[0].id;
}, 20000);
afterEach(async () => {
  await db?.close();
});

describe("PostgreSQL foundation", () => {
  it("creates every approved entity and reapplies without data loss", async () => {
    const id = await source();
    await migrate(db, directory);
    const { rows } = await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining([
        "users",
        "people",
        "source_conversations",
        "interaction_events",
        "insights",
        "insight_sources",
        "insight_lineage",
        "insight_connections",
        "insight_seeds",
        "insight_themes",
        "next_actions",
        "content_ideas",
        "content_idea_insights",
        "saved_searches",
        "weekly_reviews",
      ]),
    );
    expect(
      (
        await db.query(
          "SELECT original_text FROM source_conversations WHERE id = $1",
          [id],
        )
      ).rows[0].original_text,
    ).toBe(sourceText);
    expect(
      (await db.query("SELECT * FROM schema_migrations")).rows,
    ).toHaveLength(2);
  });
  it("upgrades a pre-response conversation without changing its exact source", async () => {
    const legacy = new PGlite();
    const temp = await mkdtemp(join(tmpdir(), "post-sale-upgrade-"));
    try {
      await writeFile(
        join(temp, "001_initial.sql"),
        await readFile(
          new URL("./migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      await migrate(legacy, pathToFileURL(`${temp}/`));
      await legacy.exec(
        "INSERT INTO users (id) VALUES ('33333333-3333-4333-8333-333333333333')",
      );
      await legacy.query(
        "INSERT INTO source_conversations (user_id,source_type,original_text) VALUES ('33333333-3333-4333-8333-333333333333','linkedin',$1)",
        [sourceText],
      );
      await migrate(legacy, directory);
      await migrate(legacy, directory);
      expect(
        (await legacy.query("SELECT original_text FROM source_conversations"))
          .rows[0].original_text,
      ).toBe(sourceText);
      expect(
        (await legacy.query("SELECT * FROM conversation_responses")).rows,
      ).toHaveLength(0);
    } finally {
      await legacy.close();
      await rm(temp, { recursive: true, force: true });
    }
  });
  it("retains source text and comments when derived conclusions change", async () => {
    const conversation = await source();
    const derived = await insight();
    await db.query("INSERT INTO insight_sources VALUES ($1, $2, $3)", [
      userId,
      derived,
      conversation,
    ]);
    await db.query(
      "UPDATE insights SET summary = 'Edited', creation_method = 'ai_then_edited', user_confirmed = true WHERE id = $1",
      [derived],
    );
    const { rows } = await db.query(
      "SELECT original_text, relevant_comments FROM source_conversations",
    );
    expect(rows[0]).toEqual({
      original_text: sourceText,
      relevant_comments: "  Exact comment\n",
    });
    await expect(
      db.query("DELETE FROM source_conversations WHERE id = $1", [
        conversation,
      ]),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("represents synthesis lineage and independent connections without replacing insights", async () => {
    const a = await insight("A");
    const b = await insight("B");
    const synthesis = await insight("Synthesis");
    await db.query(
      "INSERT INTO insight_lineage VALUES ($1, $2, $3), ($1, $2, $4)",
      [userId, synthesis, a, b],
    );
    await db.query(
      "INSERT INTO insight_connections (user_id, insight_a, insight_b, relationship_type, creation_method) VALUES ($1, $2, $3, 'Extends', 'ai_suggested')",
      [userId, a, b],
    );
    expect(
      (await db.query("SELECT user_confirmed FROM insight_connections")).rows[0]
        .user_confirmed,
    ).toBe(false);
    await db.exec("DELETE FROM insight_connections");
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(3);
    expect((await db.query("SELECT * FROM insight_lineage")).rows).toHaveLength(
      2,
    );
    await expect(
      db.query("DELETE FROM insights WHERE id = $1", [a]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db.query("INSERT INTO insight_lineage VALUES ($1, $2, $2)", [
        userId,
        synthesis,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects dangling provenance, cross-owner links, and noncanonical seeds or relationships", async () => {
    const id = await insight();
    const otherUser = (
      await db.query("INSERT INTO users DEFAULT VALUES RETURNING id")
    ).rows[0].id;
    await expect(
      db.query(
        "INSERT INTO insight_sources VALUES ($1, $2, gen_random_uuid())",
        [userId, id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db.query("INSERT INTO insight_seeds VALUES ($1, $2, $3)", [
        otherUser,
        id,
        "Visibility",
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db.query("INSERT INTO insight_seeds VALUES ($1, $2, $3)", [
        userId,
        id,
        "Score",
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    const b = await insight();
    await expect(
      db.query(
        "INSERT INTO insight_connections (user_id, insight_a, insight_b, relationship_type, creation_method) VALUES ($1, $2, $3, 'Ranks', 'user')",
        [userId, id, b],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("supports person/events, actions, content, searches and weekly review records", async () => {
    const person = (
      await db.query(
        "INSERT INTO people (user_id, name) VALUES ($1, 'Person') RETURNING id",
        [userId],
      )
    ).rows[0].id;
    const conversation = await source();
    const derived = await insight();
    await db.query(
      "INSERT INTO interaction_events (user_id, person_id, conversation_id, event_type, event_date) VALUES ($1, $2, $3, 'manually recorded event', now())",
      [userId, person, conversation],
    );
    await db.query(
      "INSERT INTO next_actions (user_id, action_type, status, person_id, insight_id, conversation_id, creation_method) VALUES ($1, 'user-defined action', 'user-defined status', $2, $3, $4, 'user')",
      [userId, person, derived, conversation],
    );
    const content = (
      await db.query(
        "INSERT INTO content_ideas (user_id, title, content_type, status, creation_method) VALUES ($1, 'Idea', 'user-defined type', 'user-defined status', 'user') RETURNING id",
        [userId],
      )
    ).rows[0].id;
    await db.query("INSERT INTO content_idea_insights VALUES ($1, $2, $3)", [
      userId,
      content,
      derived,
    ]);
    await db.query(
      "INSERT INTO saved_searches (user_id, seed, query) VALUES ($1, 'Visibility', 'query')",
      [userId],
    );
    await db.query(
      "INSERT INTO weekly_reviews (user_id, week_start, week_end, creation_method) VALUES ($1, '2026-10-19', '2026-10-25', 'user')",
      [userId],
    );
    expect(
      (await db.query("SELECT * FROM content_idea_insights")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "INSERT INTO weekly_reviews (user_id, week_start, week_end, creation_method) VALUES ($1, '2026-10-25', '2026-10-19', 'user')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rolls back a failed migration and refuses changes to applied SQL", async () => {
    const temp = await mkdtemp(join(tmpdir(), "post-sale-migrations-"));
    const url = pathToFileURL(`${temp}/`);
    try {
      await writeFile(
        join(temp, "002_failure.sql"),
        "CREATE TABLE must_rollback (id int); SELECT * FROM missing_table;",
      );
      await expect(migrate(db, url)).rejects.toMatchObject({ code: "42P01" });
      expect(
        (await db.query("SELECT to_regclass('must_rollback') AS name")).rows[0]
          .name,
      ).toBeNull();
      expect(
        (await db.query("SELECT * FROM schema_migrations")).rows,
      ).toHaveLength(2);
      await rm(join(temp, "002_failure.sql"));
      await writeFile(join(temp, "001_initial.sql"), "SELECT 1;");
      await expect(migrate(db, url)).rejects.toThrow(
        "Applied migration changed: 001_initial.sql",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
