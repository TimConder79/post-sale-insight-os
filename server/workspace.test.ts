import { openAiAssistant } from "./openai.ts";
// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { WorkspaceStore } from "./store.ts";
import type { Database } from "./store.ts";
import { createApp } from "./app.ts";
import { createAssistant } from "./ai.ts";
import type { Assistant } from "./ai.ts";

let db: PGlite;
let store: WorkspaceStore;
let server: Server;
let base: string;
let owner: string;
const exact = "  Exact LinkedIn post\r\n\nActivity ≠ progression.  \t";
const source = {
  originalText: exact,
  relevantComments: "  Exact comment\r\n  ",
  sourceUrl: "https://www.linkedin.com/posts/example",
};
const fields = {
  title: "Evidence of progress",
  summary: "A user-approved learning",
  takeaways: ["Activity needs evidence."],
  seeds: ["Progression"],
  themes: ["evidence"],
};
async function start(assistant: Assistant = createAssistant("stub")) {
  const options = { port: 0, devOrigin: "http://127.0.0.1:5173" };
  const app = createApp(store, assistant, options);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not start.");
  base = `http://127.0.0.1:${address.port}`;
  options.port = address.port;
}
async function request(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  headers: Record<string, string> = {},
) {
  return new Promise<{ status: number; body: Record<string, any> }>(
    (resolve, reject) => {
      const req = httpRequest(
        base + path,
        {
          method,
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
        },
        (res) => {
          let result = "";
          res.on("data", (chunk) => {
            result += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(result) }),
          );
        },
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    },
  );
}
async function save(extra = {}) {
  const id = randomUUID();
  const result = await request("/api/conversations", {
    id,
    source: { ...source, ...extra },
  });
  expect(result.status).toBe(201);
  return result.body;
}
beforeEach(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("../database/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../database/migrations/002_conversation_responses.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../database/migrations/003_connection_uniqueness.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../database/migrations/004_themes.sql", import.meta.url),
      "utf8",
    ),
  );
  const database: Database = {
    query: (sql, params) => db.query(sql, params),
    transaction: (work) =>
      db.transaction((tx) => work((sql, params) => tx.query(sql, params))),
  };
  owner = randomUUID();
  store = new WorkspaceStore(database, owner);
  await store.initialize();
}, 20000);
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await db.close();
  vi.restoreAllMocks();
});

async function libraryFixtures() {
  const ids: string[] = [];
  const conversations: string[] = [];
  const distribution = [
    "Progression",
    "Progression",
    "Economics",
    "Predictability",
    null,
  ] as const;
  for (const [index, seed] of distribution.entries()) {
    const conversation = await save(
      index === 0
        ? {
            person: {
              name: "Sangram (fixture)",
              role: "",
              company: "Fixture company",
              linkedinUrl: "",
            },
          }
        : index === 4
          ? {
              person: {
                name: "Tony Muise (fixture)",
                role: "",
                company: "",
                linkedinUrl: "",
              },
              sourceUrl: "",
              relevantComments: "",
            }
          : { sourceUrl: "" },
    );
    const id = randomUUID();
    ids.push(id);
    conversations.push(conversation.id);
    await store.approve(conversation.id, id, {
      title: `Library fixture ${index}`,
      summary: `Interpretation ${index}, not a source summary.`,
      takeaways: index === 0 ? ["Optional secondary takeaway"] : [],
      seeds: seed ? [seed] : [],
      themes: [],
    });
  }
  return { ids, conversations };
}
describe("Phase 3 connections and synthesis", () => {
  it("supports all relationship types, directional reversals and symmetric duplicate prevention", async () => {
    await start();
    const { ids } = await libraryFixtures();
    for (const type of [
      "Supports",
      "Extends",
      "Contradicts",
      "Example of",
      "Leads to",
      "Related to",
    ]) {
      const input = {
        id: randomUUID(),
        insightA: ids[0],
        insightB: ids[4],
        relationship: type,
        confirmed: true,
      };
      expect((await request("/api/connections", input)).status).toBe(201);
      expect((await request("/api/connections", input)).status).toBe(201);
      expect(
        (await request("/api/connections", { ...input, id: randomUUID() }))
          .status,
      ).toBe(409);
      expect(
        (
          await request("/api/connections", {
            ...input,
            id: randomUUID(),
            insightA: ids[4],
            insightB: ids[0],
          })
        ).status,
      ).toBe(["Contradicts", "Related to"].includes(type) ? 409 : 201);
    }
    expect((await request("/api/connections")).body).toHaveLength(10);
    expect(
      (
        await request("/api/connections", {
          id: randomUUID(),
          insightA: ids[0],
          insightB: ids[0],
          relationship: "Supports",
          confirmed: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/connections", {
          id: randomUUID(),
          insightA: ids[0],
          insightB: ids[1],
          relationship: "Ranks",
          confirmed: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/connections", {
          id: randomUUID(),
          insightA: ids[0],
          insightB: ids[1],
          relationship: "Supports",
          confirmed: false,
        })
      ).status,
    ).toBe(400);
  });
  it("enforces equivalent uniqueness and self/owner integrity in PostgreSQL", async () => {
    await start();
    const { ids } = await libraryFixtures();
    await db.query(
      "INSERT INTO insight_connections(user_id,insight_a,insight_b,relationship_type,creation_method,user_confirmed) VALUES($1,$2,$3,'Related to','user',true)",
      [owner, ids[0], ids[1]],
    );
    await expect(
      db.query(
        "INSERT INTO insight_connections(user_id,insight_a,insight_b,relationship_type,creation_method,user_confirmed) VALUES($1,$2,$3,'Related to','user',true)",
        [owner, ids[1], ids[0]],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.query(
        "INSERT INTO insight_connections(user_id,insight_a,insight_b,relationship_type,creation_method,user_confirmed) VALUES($1,$2,$2,'Supports','user',true)",
        [owner, ids[0]],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        "INSERT INTO insight_lineage(user_id,insight_id,source_insight_id) VALUES($1,$2,$3)",
        [randomUUID(), ids[0], ids[1]],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("disconnects only a relationship, leaving Insights and source provenance unchanged", async () => {
    await start();
    const { ids, conversations } = await libraryFixtures();
    const before = (await db.query("SELECT * FROM insights ORDER BY id")).rows;
    const id = randomUUID();
    await request("/api/connections", {
      id,
      insightA: ids[0],
      insightB: ids[1],
      relationship: "Extends",
      confirmed: true,
    });
    expect(
      (await request(`/api/connections/${id}`, undefined, "DELETE")).status,
    ).toBe(200);
    expect((await request("/api/connections")).body).toEqual([]);
    expect((await db.query("SELECT * FROM insights ORDER BY id")).rows).toEqual(
      before,
    );
    expect((await store.get(conversations[0])).originalText).toBe(exact);
    expect((await db.query("SELECT * FROM insight_sources")).rows).toHaveLength(
      5,
    );
    expect(
      (await request(`/api/connections/${id}`, undefined, "DELETE")).status,
    ).toBe(404);
  });
  it("creates and retries an approved, unclassified synthesis with complete lineage without AI or source mutation", async () => {
    await start(createAssistant());
    const { ids, conversations } = await libraryFixtures();
    const before = (await db.query("SELECT * FROM insights ORDER BY id")).rows;
    const input = {
      id: randomUUID(),
      title: "Larger manual Insight",
      summary: "User interpretation across distinct observations",
      takeaways: [],
      seeds: [],
      sourceIds: [ids[0], ids[3], ids[4]],
      confirmed: true,
    };
    expect((await request("/api/syntheses", input)).status).toBe(201);
    expect((await request("/api/syntheses", input)).status).toBe(201);
    expect(
      (await request("/api/syntheses", { ...input, summary: "Changed retry" }))
        .status,
    ).toBe(409);
    const detail = (await request(`/api/insights/${input.id}`)).body;
    expect(detail).toMatchObject({
      title: input.title,
      summary: input.summary,
      seeds: [],
      takeaways: [],
      isSynthesis: true,
      sources: [],
    });
    expect(detail.synthesizedFrom.map((item: any) => item.id).sort()).toEqual(
      [...input.sourceIds].sort(),
    );
    expect(
      (await request("/api/insights?seed=Unclassified")).body.map(
        (item: any) => item.id,
      ),
    ).toContain(input.id);
    expect(
      (
        await db.query(
          "SELECT * FROM insights WHERE id=ANY($1::uuid[]) ORDER BY id",
          [ids],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await db.query(
          "SELECT creation_method,user_confirmed FROM insights WHERE id=$1",
          [input.id],
        )
      ).rows[0],
    ).toEqual({ creation_method: "user", user_confirmed: true });
    expect((await store.get(conversations[0])).originalText).toBe(exact);
    const nested = {
      ...input,
      id: randomUUID(),
      sourceIds: [input.id, ids[1]],
      title: "Nested synthesis",
    };
    expect((await request("/api/syntheses", nested)).status).toBe(201);
    expect(
      (await request(`/api/insights/${nested.id}`)).body.synthesizedFrom.map(
        (item: any) => item.id,
      ),
    ).toContain(input.id);
  });
  it("rejects insufficient, duplicate, foreign and unconfirmed sources; rolls back failed synthesis", async () => {
    await start();
    const { ids } = await libraryFixtures();
    const input = {
      id: randomUUID(),
      title: "Manual synthesis",
      summary: "Learning",
      seeds: [],
      takeaways: [],
      sourceIds: [ids[0], ids[1]],
      confirmed: true,
    };
    for (const sources of [[], [ids[0]], [ids[0], ids[0]]])
      expect(
        (await request("/api/syntheses", { ...input, sourceIds: sources }))
          .status,
      ).toBe(400);
    expect(
      (await request("/api/syntheses", { ...input, confirmed: false })).status,
    ).toBe(400);
    await db.query("UPDATE insights SET user_confirmed=false WHERE id=$1", [
      ids[1],
    ]);
    expect((await request("/api/syntheses", input)).status).toBe(404);
    expect(
      (
        await request("/api/connections", {
          id: randomUUID(),
          insightA: ids[0],
          insightB: ids[1],
          relationship: "Supports",
          confirmed: true,
        })
      ).status,
    ).toBe(404);
    await expect(
      store.connections().synthesize({
        ...input,
        sourceIds: [ids[0], ids[2]],
        seeds: ["Invalid"] as never,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await db.query("SELECT * FROM insights WHERE id=$1", [input.id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("SELECT * FROM insight_lineage WHERE insight_id=$1", [
          input.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("preserves owner isolation for connections, candidate selection, deletion, synthesis and lineage", async () => {
    await start();
    const { ids } = await libraryFixtures();
    const foreignOwner = randomUUID(),
      foreignId = randomUUID(),
      foreignConnection = randomUUID();
    await db.query("INSERT INTO users(id) VALUES($1)", [foreignOwner]);
    await db.query(
      "INSERT INTO insights(id,user_id,title,summary,creation_method,user_confirmed) VALUES($1,$2,'Private','Private','user',true)",
      [foreignId, foreignOwner],
    );
    expect(
      (await request("/api/insights")).body.map((item: any) => item.id),
    ).not.toContain(foreignId);
    const input = {
      id: randomUUID(),
      insightA: ids[0],
      insightB: foreignId,
      relationship: "Supports",
      confirmed: true,
    };
    expect((await request("/api/connections", input)).status).toBe(404);
    expect(
      (
        await request("/api/syntheses", {
          id: randomUUID(),
          title: "Invalid",
          summary: "Invalid",
          seeds: [],
          takeaways: [],
          sourceIds: [ids[0], foreignId],
          confirmed: true,
        })
      ).status,
    ).toBe(404);
    const other = new WorkspaceStore(
      {
        query: (sql, args) => db.query(sql, args),
        transaction: (work) =>
          db.transaction((tx) => work((sql, args) => tx.query(sql, args))),
      },
      foreignOwner,
    );
    await request("/api/connections", {
      ...input,
      insightB: ids[1],
      id: foreignConnection,
    });
    expect(await other.connections().list()).toEqual([]);
    await expect(
      other.connections().remove(foreignConnection),
    ).rejects.toMatchObject({ status: 404 });
    expect((await request("/api/connections")).body).toHaveLength(1);
  });
});

describe("Insights Library API", () => {
  it("retrieves five existing approved records and filters the documented seed distribution", async () => {
    await start();
    const { ids } = await libraryFixtures();
    const list = await request("/api/insights");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(5);
    expect(list.body.map((item: any) => item.id).sort()).toEqual(
      [...ids].sort(),
    );
    for (const [seed, count] of [
      ["Progression", 2],
      ["Economics", 1],
      ["Predictability", 1],
      ["Unclassified", 1],
    ] as const)
      expect((await request(`/api/insights?seed=${seed}`)).body).toHaveLength(
        count,
      );
    const unclassified = (await request("/api/insights?seed=Unclassified"))
      .body[0];
    expect(unclassified.id).toBe(ids[4]);
    expect(unclassified.seeds).toEqual([]);
    expect(unclassified.people[0].name).toBe("Tony Muise (fixture)");
    expect(
      (await request("/api/insights?q=SANGRAM&seed=Progression")).body[0].id,
    ).toBe(ids[0]);
    expect(
      (await request("/api/insights?q=Interpretation%203")).body[0].id,
    ).toBe(ids[3]);
    expect((await request("/api/insights?q=no-match")).body).toEqual([]);
    expect((await request("/api/insights?seed=Invalid")).status).toBe(400);
  });
  it("returns exact provenance, secondary optional fields, and partial metadata without changing data", async () => {
    await start();
    const { ids, conversations } = await libraryFixtures();
    await db.query(
      "UPDATE insights SET notes='A personal note',favorite=true WHERE id=$1",
      [ids[0]],
    );
    const first = (await request(`/api/insights/${ids[0]}`)).body;
    expect(first.notes).toBe("A personal note");
    expect(first.favorite).toBe(true);
    expect(first.takeaways).toEqual(["Optional secondary takeaway"]);
    expect(first.sources[0]).toMatchObject({
      id: conversations[0],
      originalText: exact,
      relevantComments: source.relevantComments,
      sourceUrl: source.sourceUrl,
      person: { name: "Sangram (fixture)", company: "Fixture company" },
    });
    const partial = (await request(`/api/insights/${ids[4]}`)).body;
    expect(partial.takeaways).toEqual([]);
    expect(partial.sources[0].sourceUrl).toBe("");
    const noPerson = (await request(`/api/insights/${ids[1]}`)).body;
    expect(noPerson.sources[0].person).toBeNull();
    expect((await store.get(conversations[0])).originalText).toBe(exact);
    expect((await request(`/api/insights/${randomUUID()}`)).status).toBe(404);
  });
  it("isolates owners and excludes unconfirmed suggestions from both list and detail", async () => {
    await start();
    const { ids } = await libraryFixtures();
    const otherOwner = randomUUID();
    await db.query("INSERT INTO users(id) VALUES($1)", [otherOwner]);
    const foreignId = randomUUID();
    await db.query(
      "INSERT INTO insights(id,user_id,title,summary,creation_method,user_confirmed) VALUES($1,$2,'Private title','Private learning','user',true)",
      [foreignId, otherOwner],
    );
    await db.query("UPDATE insights SET user_confirmed=false WHERE id=$1", [
      ids[0],
    ]);
    expect((await request("/api/insights")).body).toHaveLength(4);
    expect((await request(`/api/insights/${foreignId}`)).status).toBe(404);
    expect((await request(`/api/insights/${ids[0]}`)).status).toBe(404);
    expect((await request("/api/insights?q=Private")).body).toEqual([]);
  });
  it("handles multiple seeds, multiple sources, literal text search and approved Insights without provenance", async () => {
    await start();
    const { ids, conversations } = await libraryFixtures();
    await db.query("INSERT INTO insight_seeds VALUES($1,$2,'Execution')", [
      owner,
      ids[0],
    ]);
    await db.query("INSERT INTO insight_sources VALUES($1,$2,$3)", [
      owner,
      ids[0],
      conversations[1],
    ]);
    await db.query(
      "UPDATE insights SET summary='Literal 100%_ marker' WHERE id=$1",
      [ids[0]],
    );
    expect((await request("/api/insights?seed=Execution")).body).toHaveLength(
      1,
    );
    expect((await request("/api/insights?q=%25_")).body).toHaveLength(1);
    expect(
      (await request(`/api/insights/${ids[0]}`)).body.sources,
    ).toHaveLength(2);
    await db.query("DELETE FROM insight_sources WHERE insight_id=$1", [ids[4]]);
    expect((await request(`/api/insights/${ids[4]}`)).body.sources).toEqual([]);
  });
});

describe("Post Workspace API and PostgreSQL invariants", () => {
  it("saves exact source and comments independently of people, Insights, and AI", async () => {
    await start(createAssistant());
    const saved = await save();
    expect(saved).toMatchObject({ ...source, insights: [] });
    expect(saved.person).toBeUndefined();
    expect(
      (await request(`/api/conversations/${saved.id}`)).body.originalText,
    ).toBe(exact);
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM people")).rows).toHaveLength(0);
    expect((await request("/api/conversations")).body[0].id).toBe(saved.id);
  });
  it("saves, replaces, clears and reopens responses without changing source or creating events", async () => {
    await start();
    const saved = await save();
    expect(saved.response).toBe("");
    expect(saved.responseSavedAt).toBeNull();
    const text = "  My response\r\nwith exact whitespace.  ";
    const result = await request(
      `/api/conversations/${saved.id}/response`,
      { text },
      "PUT",
    );
    expect(result.status).toBe(200);
    expect(result.body.response).toBe(text);
    const reopened = await request(`/api/conversations/${saved.id}`);
    expect(reopened.body).toMatchObject({ ...source, response: text });
    expect(reopened.body.responseSavedAt).toBeTruthy();
    expect((await store.get(saved.id)).response).toBe(text);
    expect(
      (await db.query("SELECT * FROM conversation_responses")).rows[0],
    ).toMatchObject({ conversation_id: saved.id, user_id: owner });
    await request(
      `/api/conversations/${saved.id}/response`,
      { text: "Revised response" },
      "PUT",
    );
    expect((await store.get(saved.id)).response).toBe("Revised response");
    await request(
      `/api/conversations/${saved.id}/response`,
      { text: "" },
      "PUT",
    );
    expect((await store.get(saved.id)).response).toBe("");
    expect((await store.get(saved.id)).originalText).toBe(exact);
    expect(
      (await db.query("SELECT * FROM interaction_events")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("SELECT * FROM conversation_responses")).rows,
    ).toHaveLength(1);
  });
  it("protects response ownership and rejects invalid writes without losing the saved response", async () => {
    await start();
    const saved = await save();
    await store.saveResponse(saved.id, "Keep this");
    expect(
      (
        await request(
          `/api/conversations/${saved.id}/response`,
          { text: "x".repeat(20001) },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/api/conversations/${saved.id}/response`,
          { text: "changed", originalText: "changed" },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/api/conversations/${randomUUID()}/response`,
          { text: "changed" },
          "PUT",
        )
      ).status,
    ).toBe(404);
    const other = new WorkspaceStore(
      {
        query: (sql, args) => db.query(sql, args),
        transaction: (work) =>
          db.transaction((tx) => work((sql, args) => tx.query(sql, args))),
      },
      randomUUID(),
    );
    await other.initialize();
    await expect(
      other.saveResponse(saved.id, "Wrong owner"),
    ).rejects.toMatchObject({ status: 404 });
    expect((await store.get(saved.id)).response).toBe("Keep this");
    expect((await store.get(saved.id)).originalText).toBe(exact);
  });
  it("atomically links optional person metadata, and retries without duplicate people", async () => {
    await start();
    const person = {
      name: " Alex ",
      role: "Customer leader",
      company: "Example",
      linkedinUrl: "https://www.linkedin.com/in/example",
    };
    const saved = await save({ person, relevantComments: "", sourceUrl: "" });
    expect(saved.person).toEqual(person);
    expect(
      (
        await request("/api/conversations", {
          id: saved.id,
          source: { ...source, person, relevantComments: "", sourceUrl: "" },
        })
      ).status,
    ).toBe(201);
    expect((await db.query("SELECT * FROM people")).rows).toHaveLength(1);
    expect(
      (
        await request("/api/conversations", {
          id: saved.id,
          source: { ...source, person, originalText: "changed" },
        })
      ).status,
    ).toBe(409);
    expect((await store.get(saved.id)).originalText).toBe(exact);
  });
  it("does not fetch provenance URLs, and rolls back person creation if source insertion fails", async () => {
    await start();
    const fetcher = vi.spyOn(globalThis, "fetch");
    await save();
    expect(fetcher).not.toHaveBeenCalled();
    await db.exec(
      "CREATE FUNCTION reject_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_source BEFORE INSERT ON source_conversations FOR EACH ROW EXECUTE FUNCTION reject_source();",
    );
    const result = await request("/api/conversations", {
      id: randomUUID(),
      source: {
        ...source,
        person: { name: "Alex", role: "", company: "", linkedinUrl: "" },
      },
    });
    expect(result.status).toBe(500);
    expect((await db.query("SELECT * FROM people")).rows).toHaveLength(0);
  });
  it("keeps stub output unconfirmed and ephemeral, then explicitly approves distinct knowledge with provenance", async () => {
    await start();
    const saved = await save();
    const suggestion = await request("/api/assist", {
      source,
      conversationId: saved.id,
    });
    expect(suggestion.status).toBe(200);
    expect(suggestion.body.mode).toBe("stub");
    expect(suggestion.body.seeds).toEqual([]);
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(0);
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...fields,
          id: randomUUID(),
          confirmed: false,
        })
      ).status,
    ).toBe(400);
    const id = randomUUID();
    const approved = await request(`/api/conversations/${saved.id}/insights`, {
      ...fields,
      id,
      confirmed: true,
    });
    expect(approved.status).toBe(201);
    expect(approved.body.insights[0]).toMatchObject({
      ...fields,
      id,
      creationMethod: "user",
      userConfirmed: true,
    });
    expect(approved.body.originalText).toBe(exact);
    expect(approved.body.relevantComments).toBe(source.relevantComments);
    expect(
      (await db.query("SELECT * FROM insight_sources")).rows[0],
    ).toMatchObject({
      insight_id: id,
      conversation_id: saved.id,
      user_id: owner,
    });
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...fields,
          id,
          confirmed: true,
        })
      ).status,
    ).toBe(201);
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(1);
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...fields,
          id,
          confirmed: true,
          summary: "Changed retry",
        })
      ).status,
    ).toBe(409);
  });
  it("does not accept client-controlled ownership or creation methods, or rewrite endpoints", async () => {
    await start();
    const saved = await save();
    expect(
      (
        await request(
          `/api/conversations/${saved.id}`,
          { originalText: "changed" },
          "PATCH",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...fields,
          id: randomUUID(),
          confirmed: true,
          creationMethod: "ai_suggested",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/conversations", {
          id: randomUUID(),
          source,
          user_id: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const other = new WorkspaceStore(
      {
        query: (sql, args) => db.query(sql, args),
        transaction: (work) =>
          db.transaction((tx) => work((sql, args) => tx.query(sql, args))),
      },
      randomUUID(),
    );
    await other.initialize();
    await expect(other.get(saved.id)).rejects.toMatchObject({ status: 404 });
    expect(await other.list()).toEqual([]);
    await expect(
      other.approve(saved.id, randomUUID(), {
        ...fields,
        seeds: ["Progression"],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("uses persisted exact source rather than client replacements when requesting suggestions", async () => {
    const run = vi.fn(createAssistant("stub").run);
    await start({ mode: "stub", run });
    const saved = await save();
    await request(`/api/conversations/${saved.id}/insights`, {
      ...fields,
      id: randomUUID(),
      confirmed: true,
    });
    const result = await request("/api/assist", {
      source: { ...source, originalText: "untrusted replacement" },
      conversationId: saved.id,
    });
    expect(result.status).toBe(200);
    expect(run.mock.calls[0][0].source.originalText).toBe(exact);
    expect(run.mock.calls[0][1][0].userConfirmed).toBe(true);
  });
  it("allows manual approval after unavailable, failed, or invalid AI responses", async () => {
    await start({
      mode: "stub",
      run: async () => {
        throw new Error("private internal token must not be disclosed");
      },
    });
    const saved = await save();
    const failure = await request("/api/assist", {
      source,
      conversationId: saved.id,
    });
    expect(failure.status).toBe(503);
    expect(JSON.stringify(failure.body)).not.toContain("private internal");
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...fields,
          id: randomUUID(),
          confirmed: true,
        })
      ).status,
    ).toBe(201);
    expect((await store.get(saved.id)).originalText).toBe(exact);
    await expect(
      createAssistant().run({ source, mode: "regenerate", comment: "" }, []),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rolls back approved Insight data and provenance together on metadata failure", async () => {
    await start();
    const saved = await save();
    await expect(
      store.approve(saved.id, randomUUID(), {
        ...fields,
        seeds: ["Not a seed"] as never,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM insight_sources")).rows).toHaveLength(
      0,
    );
    expect((await store.get(saved.id)).originalText).toBe(exact);
  });
  it("rejects invalid assistant responses without persisting them", async () => {
    await start({
      mode: "stub",
      run: async () => ({ bad: "invalid" }) as never,
    });
    const saved = await save();
    expect(
      (await request("/api/assist", { source, conversationId: saved.id }))
        .status,
    ).toBe(503);
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(0);
  });
  it("rejects invalid metadata, cross-origin requests and unexpected hosts without exposing secrets", async () => {
    await start();
    expect(
      (
        await request("/api/status", undefined, "GET", {
          Host: "untrusted.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/conversations",
          { id: randomUUID(), source },
          "POST",
          { "Content-Type": "text/plain" },
        )
      ).status,
    ).toBe(415);
    expect((await request("/api/status")).body).toEqual({ aiMode: "stub" });
    expect(
      (
        await request("/api/conversations", {
          id: randomUUID(),
          source: { ...source, originalText: "   " },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/conversations", {
          id: randomUUID(),
          source: {
            ...source,
            person: { name: "", role: "Role", company: "", linkedinUrl: "" },
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/api/conversations",
          { id: randomUUID(), source },
          "POST",
          { Origin: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
  });
});

describe("Phase 4 Themes", () => {
  async function theme(name = "Forecast evidence") {
    const input = {
      id: randomUUID(),
      name,
      description: "A working subject, not a Seed.",
      confirmed: true,
    };
    expect((await request("/api/themes", input)).status).toBe(201);
    return input;
  }
  async function approved(conversationId: string, extra = {}) {
    const id = randomUUID();
    expect(
      (
        await request(`/api/conversations/${conversationId}/insights`, {
          id,
          ...fields,
          takeaways: [],
          themes: [],
          confirmed: true,
          ...extra,
        })
      ).status,
    ).toBe(201);
    return id;
  }
  it("creates empty Themes with metadata, preserves authored language, and handles names and matching retries deliberately", async () => {
    await start(createAssistant("unavailable"));
    expect((await request("/api/themes")).body).toEqual([]);
    const input = await theme("  Forecast Evidence  ");
    expect((await request("/api/themes", input)).status).toBe(201);
    expect(
      (await request("/api/themes", { ...input, name: "Different meaning" }))
        .status,
    ).toBe(409);
    expect(
      (
        await request("/api/themes", {
          ...input,
          id: randomUUID(),
          name: "forecast evidence",
        })
      ).status,
    ).toBe(409);
    const detail = (await request(`/api/themes/${input.id}`)).body;
    expect(detail).toMatchObject({
      name: input.name,
      description: input.description,
      insightCount: 0,
      conversationCount: 0,
      seeds: [],
      latestInsightAt: null,
      insights: [],
    });
    expect(detail.createdAt).toBeTruthy();
    expect(
      (await request(`/api/themes/${input.id.toUpperCase()}`)).status,
    ).toBe(200);
    for (const name of ["", " \t\n ", "x".repeat(201)])
      expect(
        (await request("/api/themes", { ...input, id: randomUUID(), name }))
          .status,
      ).toBe(400);
    expect(
      (
        await request("/api/themes", {
          ...input,
          id: randomUUID(),
          confirmed: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/themes", {
          ...input,
          id: randomUUID(),
          user_id: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/themes", {
          id: randomUUID(),
          name: "No definition",
          confirmed: true,
        })
      ).status,
    ).toBe(201);
    expect((await request(`/api/themes/${randomUUID()}`)).status).toBe(404);
  });
  it("supports explicit cross-Seed, Unclassified, synthesized, and multi-Theme membership without altering existing evidence", async () => {
    await start(createAssistant("unavailable"));
    const a = await save();
    const b = await save({ originalText: "Another source" });
    const first = await approved(a.id);
    const second = await approved(b.id, { seeds: ["Economics"] });
    const synthesis = randomUUID();
    expect(
      (
        await request("/api/syntheses", {
          id: synthesis,
          title: "Larger learning",
          summary: "User interpretation",
          takeaways: [],
          seeds: [],
          sourceIds: [first, second],
          confirmed: true,
        })
      ).status,
    ).toBe(201);
    await request("/api/connections", {
      id: randomUUID(),
      insightA: first,
      insightB: second,
      relationship: "Related to",
      confirmed: true,
    });
    await request(
      `/api/conversations/${a.id}/response`,
      { text: "Our durable response" },
      "PUT",
    );
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of [
        "insights",
        "insight_sources",
        "insight_seeds",
        "insight_lineage",
        "insight_connections",
        "source_conversations",
        "conversation_responses",
        "insight_themes",
      ])
        result[table] = (
          await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)
        ).rows;
      return result;
    };
    const before = await snapshot();
    const t = await theme();
    const other = await theme("Cross-subject learning");
    const path = `/api/themes/${t.id}/insights`;
    const association = {
      insightIds: [first, second, synthesis],
      confirmed: true,
    };
    expect((await request(path, association)).status).toBe(200);
    expect((await request(path, association)).status).toBe(200);
    expect(
      (
        await request(`/api/themes/${other.id}/insights`, {
          insightIds: [synthesis],
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    const detail = (await request(`/api/themes/${t.id}`)).body;
    expect(detail).toMatchObject({
      insightCount: 3,
      conversationCount: 2,
      seeds: ["Economics", "Progression"],
    });
    expect(detail.latestInsightAt).toBeTruthy();
    expect(detail.insights.find((i: any) => i.id === synthesis)).toMatchObject({
      isSynthesis: true,
      seeds: [],
      people: [],
    });
    expect((await request(`/api/themes/${other.id}`)).body.insightCount).toBe(
      1,
    );
    expect(
      (await request(`${path}/${synthesis}`, undefined, "DELETE")).status,
    ).toBe(200);
    expect(
      (await request(`${path}/${synthesis}`, undefined, "DELETE")).status,
    ).toBe(200);
    expect((await request(`/api/themes/${t.id}`)).body.insightCount).toBe(2);
    expect((await request(`/api/themes/${other.id}`)).body.insightCount).toBe(
      1,
    );
    expect(await snapshot()).toEqual(before);
  });
  it("deduplicates original conversations through nested/overlapping synthesis lineage rather than counting Insights", async () => {
    await start();
    const sourceA = await save();
    const sourceB = await save({ originalText: "Independent evidence" });
    const a = await approved(sourceA.id);
    const b = await approved(sourceA.id, {
      title: "Second learning from same conversation",
      seeds: [],
    });
    const c = await approved(sourceB.id, { seeds: ["Predictability"] });
    const synth = async (sourceIds: string[]) => {
      const id = randomUUID();
      expect(
        (
          await request("/api/syntheses", {
            id,
            title: "Synthesis",
            summary: "Larger observation",
            takeaways: [],
            seeds: [],
            sourceIds,
            confirmed: true,
          })
        ).status,
      ).toBe(201);
      return id;
    };
    const s = await synth([a, b]);
    const nested = await synth([s, c]);
    const t = await theme();
    await request(`/api/themes/${t.id}/insights`, {
      insightIds: [a, b, s, nested],
      confirmed: true,
    });
    const result = (await request(`/api/themes/${t.id}`)).body;
    expect(result.insightCount).toBe(4);
    expect(result.conversationCount).toBe(2);
    // Existing malformed legacy cycles must terminate, not inflate descriptive recurrence.
    await db.query("INSERT INTO insight_lineage VALUES($1,$2,$3)", [
      owner,
      a,
      nested,
    ]);
    expect((await request(`/api/themes/${t.id}`)).body.conversationCount).toBe(
      2,
    );
  });
  it("enforces owner isolation for Themes, association, removal, candidates and recursive provenance", async () => {
    await start();
    const ownSource = await save();
    const own = await approved(ownSource.id);
    const t = await theme();
    const other = randomUUID();
    await db.query("INSERT INTO users(id) VALUES($1)", [other]);
    const foreignStore = new WorkspaceStore(
      {
        query: (s, v) => db.query(s, v),
        transaction: (work) =>
          db.transaction((tx) => work((s, v) => tx.query(s, v))),
      },
      other,
    );
    const foreignTheme = {
      id: randomUUID(),
      name: t.name,
      description: "",
      confirmed: true as const,
    };
    await foreignStore.themes().create(foreignTheme);
    const foreignSource = randomUUID();
    await foreignStore.create(foreignSource, source);
    const foreign = randomUUID();
    await foreignStore.approve(foreignSource, foreign, {
      ...fields,
      seeds: [],
      themes: [],
    });
    expect((await request("/api/themes")).body).toHaveLength(1);
    expect((await request(`/api/themes/${foreignTheme.id}`)).status).toBe(404);
    expect((await request("/api/themes", foreignTheme)).status).toBe(409);
    expect(
      (
        await request(`/api/themes/${foreignTheme.id}/insights`, {
          insightIds: [own],
          confirmed: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/themes/${t.id}/insights`, {
          insightIds: [own, foreign],
          confirmed: true,
        })
      ).status,
    ).toBe(404);
    expect((await request(`/api/themes/${t.id}`)).body.insightCount).toBe(0);
    expect(
      (
        await request(
          `/api/themes/${foreignTheme.id}/insights/${foreign}`,
          undefined,
          "DELETE",
        )
      ).status,
    ).toBe(404);
    await request(`/api/themes/${t.id}/insights`, {
      insightIds: [own],
      confirmed: true,
    });
    expect((await request(`/api/themes/${t.id}`)).body.conversationCount).toBe(
      1,
    );
    expect(
      (await request("/api/insights")).body.map((i: any) => i.id),
    ).not.toContain(foreign);
    expect(
      (
        await request(
          `/api/themes/${t.id}/insights/${foreign}`,
          undefined,
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      (await foreignStore.themes().get(foreignTheme.id)).insightCount,
    ).toBe(0);
  });
  it("rejects unapproved/missing Insights, malformed membership and non-explicit association without partial writes", async () => {
    await start();
    const saved = await save();
    const own = await approved(saved.id);
    const draft = randomUUID();
    await db.query(
      "INSERT INTO insights(id,user_id,title,summary,creation_method) VALUES($1,$2,'Draft','Unapproved','ai_suggested')",
      [draft, owner],
    );
    const t = await theme();
    const path = `/api/themes/${t.id}/insights`;
    for (const ids of [
      [own, draft],
      [own, randomUUID()],
    ])
      expect(
        (await request(path, { insightIds: ids, confirmed: true })).status,
      ).toBe(404);
    for (const body of [
      { insightIds: [], confirmed: true },
      { insightIds: [own, own], confirmed: true },
      { insightIds: [own], confirmed: false },
    ])
      expect((await request(path, body)).status).toBe(400);
    expect((await request(`/api/themes/${t.id}`)).body.insightCount).toBe(0);
    expect(
      (
        await request(
          `/api/themes/${randomUUID()}/insights/${own}`,
          undefined,
          "DELETE",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request("/api/themes", {
          id: randomUUID(),
          name: "Valid",
          description: "x".repeat(2001),
          confirmed: true,
        })
      ).status,
    ).toBe(400);
  });
  it("enforces database uniqueness, nonempty names, same-owner links and relationship-only removal", async () => {
    await start();
    const t = await theme();
    const s = await save();
    const own = await approved(s.id);
    await expect(
      db.query("INSERT INTO themes(user_id,name) VALUES($1,$2)", [
        owner,
        "forecast EVIDENCE",
      ]),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.query("INSERT INTO themes(user_id,name) VALUES($1,$2)", [
        owner,
        " \n\t ",
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    const other = (
      await db.query<{ id: string }>(
        "INSERT INTO users DEFAULT VALUES RETURNING id",
      )
    ).rows[0].id;
    await expect(
      db.query("INSERT INTO theme_memberships VALUES($1,$2,$3)", [
        other,
        t.id,
        own,
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      db.query("INSERT INTO theme_memberships VALUES($1,$2,$3)", [
        owner,
        t.id,
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    await db.query("INSERT INTO theme_memberships VALUES($1,$2,$3)", [
      owner,
      t.id,
      own,
    ]);
    await expect(
      db.query("INSERT INTO theme_memberships VALUES($1,$2,$3)", [
        owner,
        t.id,
        own,
      ]),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.query("DELETE FROM insights WHERE id=$1", [own]),
    ).rejects.toMatchObject({ code: "23503" });
    await store.themes().remove(t.id, own);
    expect(
      (await db.query("SELECT id FROM insights WHERE id=$1", [own])).rows,
    ).toHaveLength(1);
  });
});

describe("Phase 5A approval boundaries", () => {
  const proposed = {
    title: "AI-proposed learning",
    summary: "Evidence makes progression inspectable.",
    takeaways: [],
    seeds: [],
    themes: [],
  };
  const analysis = {
    seeds: [],
    themes: [],
    distinctions: [],
    questions: [],
    comment: "AI response draft",
    insight: proposed,
  };
  function real(extra: Partial<Assistant> = {}): Assistant {
    return {
      mode: "openai",
      run: async () => analysis,
      knowledge: async () => ({ connections: [], themes: [] }),
      draft: async () => ({
        title: proposed.title,
        summary: proposed.summary,
        takeaways: [],
        seeds: [],
        seedRationale: [],
      }),
      ...extra,
    };
  }
  async function approvedFixture() {
    const saved = await save();
    const id = randomUUID();
    await store.approve(saved.id, id, { ...fields, seeds: [], themes: [] });
    return { saved, id };
  }
  it("analysis never saves; explicit edited/unchanged approvals retain server-verified attribution and source provenance", async () => {
    await start(real());
    const saved = await save();
    const suggestion = await request("/api/assist", {
      conversationId: saved.id,
      source: { ...source, originalText: "Browser-tampered copy" },
      mode: "regenerate",
    });
    expect(suggestion.status).toBe(200);
    expect(suggestion.body.aiReceipt).toBeTruthy();
    expect((await db.query("SELECT * FROM insights")).rows).toHaveLength(0);
    const id = randomUUID();
    const input = {
      ...proposed,
      id,
      confirmed: true,
      aiReceipt: suggestion.body.aiReceipt,
    };
    expect(
      (await request(`/api/conversations/${saved.id}/insights`, input)).status,
    ).toBe(201);
    expect(
      (
        await db.query(
          "SELECT creation_method,user_confirmed FROM insights WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({ creation_method: "ai_suggested", user_confirmed: true });
    const edited = randomUUID();
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...input,
          id: edited,
          summary: "User edited the learning",
        })
      ).status,
    ).toBe(201);
    expect((await store.library().get(edited)).creationMethod).toBe(
      "ai_then_edited",
    );
    expect(
      (
        await request(`/api/conversations/${saved.id}/insights`, {
          ...input,
          id: randomUUID(),
          creationMethod: "user",
        })
      ).status,
    ).toBe(400);
    const other = await save();
    expect(
      (
        await request(`/api/conversations/${other.id}/insights`, {
          ...input,
          id: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect((await store.get(saved.id)).originalText).toBe(exact);
  });
  it("validates approved bounded context, meaningful suggestion targets and individual explicit saves with duplicate protection", async () => {
    let candidateId = "",
      themeId = "";
    const knowledge = vi.fn(async () => ({
      connections: [
        {
          candidateId,
          relationship: "Supports" as const,
          direction: "incoming" as const,
          rationale: "The two approved observations share evidence.",
        },
      ],
      themes: [{ themeId, rationale: "An existing recurring subject." }],
    }));
    await start(real({ knowledge }));
    const a = await approvedFixture(),
      b = await approvedFixture();
    const subjectId = a.id;
    candidateId = b.id;
    themeId = randomUUID();
    await store.themes().create({
      id: themeId,
      name: "Existing subject",
      description: "Working definition",
      confirmed: true,
    });
    await store.themes().associate(themeId, [b.id]);
    const suggestions = await request("/api/assist/knowledge", {
      insightId: subjectId,
    });
    expect(suggestions.status).toBe(200);
    expect(await store.connections().list()).toHaveLength(0);
    expect((await store.themes().get(themeId)).insightCount).toBe(1);
    expect(JSON.stringify(knowledge.mock.calls)).not.toContain(exact);
    const c = suggestions.body.connections[0];
    const connection = {
      id: randomUUID(),
      insightA: candidateId,
      insightB: subjectId,
      relationship: c.relationship,
      aiReceipt: c.aiReceipt,
      confirmed: true,
    };
    expect(
      (await request("/api/connections", { ...connection, confirmed: false }))
        .status,
    ).toBe(400);
    expect((await request("/api/connections", connection)).status).toBe(201);
    expect((await store.connections().list())[0].creationMethod).toBe(
      "ai_suggested",
    );
    expect(
      (await request("/api/connections", { ...connection, id: randomUUID() }))
        .status,
    ).toBe(409);
    expect(
      (
        await request("/api/connections", {
          ...connection,
          id: randomUUID(),
          insightA: subjectId,
          insightB: candidateId,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/api/themes/${themeId}/insights`, {
          insightIds: [subjectId],
          aiReceipt: suggestions.body.themes[0].aiReceipt,
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    expect((await store.themes().get(themeId)).insightCount).toBe(2);
    expect((await store.library().get(subjectId)).seeds).toEqual([]);
    // A concurrent/existing equivalent relationship is not proposed again.
    knowledge.mockResolvedValueOnce({
      connections: [
        {
          candidateId,
          relationship: "Supports",
          direction: "incoming",
          rationale: "Still equivalent",
        },
      ],
      themes: [],
    });
    const filtered = await request("/api/assist/knowledge", {
      insightId: subjectId,
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.connections).toEqual([]);
    const next = await request("/api/assist/knowledge", {
      insightId: subjectId,
    });
    expect(next.status).toBe(503); // already-member Theme is no longer a valid target
  });
  it("synthesis drafting never changes selection or writes before explicit approval; all selected lineage survives edits", async () => {
    const provider = vi.fn(async () => ({
      title: proposed.title,
      summary: proposed.summary,
      takeaways: [],
      seeds: [],
      seedRationale: [],
    }));
    await start(real({ draft: provider }));
    const a = await approvedFixture(),
      b = await approvedFixture(),
      c = await approvedFixture();
    const ids = [a.id, b.id];
    const draft = await request("/api/assist/synthesis", { sourceIds: ids });
    expect(draft.status).toBe(200);
    expect((await db.query("SELECT * FROM insight_lineage")).rows).toHaveLength(
      0,
    );
    expect(JSON.stringify(provider.mock.calls)).not.toContain(c.id);
    const id = randomUUID(),
      input = {
        id,
        ...proposed,
        sourceIds: ids,
        confirmed: true,
        aiReceipt: draft.body.aiReceipt,
      };
    delete (input as Partial<typeof proposed>).themes;
    expect(
      (await request("/api/syntheses", { ...input, sourceIds: [a.id, c.id] }))
        .status,
    ).toBe(409);
    expect((await request("/api/syntheses", input)).status).toBe(201);
    expect((await request("/api/syntheses", input)).status).toBe(201);
    expect(await store.library().get(id)).toMatchObject({
      creationMethod: "ai_suggested",
      seeds: [],
    });
    expect(
      (await store.library().get(id)).synthesizedFrom.map((s) => s.id).sort(),
    ).toEqual(ids.sort());
    expect((await store.get(a.saved.id)).originalText).toBe(exact);
    expect(
      (await request("/api/assist/synthesis", { sourceIds: [a.id] })).status,
    ).toBe(400);
  });
  it("accepts zero suggestions, rejects unknown/unapproved/foreign targets and invalid output, and writes nothing on provider failure", async () => {
    let output: unknown = { connections: [], themes: [] };
    await start(
      real({
        knowledge: async () => output as never,
        draft: async () => {
          throw Error("provider secret detail");
        },
      }),
    );
    const a = await approvedFixture();
    expect(
      (await request("/api/assist/knowledge", { insightId: a.id })).body,
    ).toMatchObject({ connections: [], themes: [] });
    output = {
      connections: [
        {
          candidateId: randomUUID(),
          relationship: "Related to",
          direction: "outgoing",
          rationale: "Unknown",
        },
      ],
      themes: [],
    };
    expect(
      (await request("/api/assist/knowledge", { insightId: a.id })).status,
    ).toBe(503);
    output = {
      connections: [],
      themes: [{ themeId: randomUUID(), rationale: "Invented" }],
    };
    expect(
      (await request("/api/assist/knowledge", { insightId: a.id })).status,
    ).toBe(503);
    expect(
      (await request("/api/assist/knowledge", { insightId: randomUUID() }))
        .status,
    ).toBe(404);
    const b = await approvedFixture();
    const failed = await request("/api/assist/synthesis", {
      sourceIds: [a.id, b.id],
    });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain("provider secret detail");
    expect((await db.query("SELECT * FROM insight_lineage")).rows).toHaveLength(
      0,
    );
    expect(await store.connections().list()).toHaveLength(0);
  });
  it("unavailable AI preserves all manual paths and returns no fabricated suggestions", async () => {
    await start(createAssistant("unavailable"));
    const a = await approvedFixture(),
      b = await approvedFixture();
    expect(
      (await request("/api/assist/knowledge", { insightId: a.id })).status,
    ).toBe(503);
    expect(
      (await request("/api/assist/synthesis", { sourceIds: [a.id, b.id] }))
        .status,
    ).toBe(503);
    expect(await store.connections().list()).toHaveLength(0);
    expect(
      (
        await request("/api/connections", {
          id: randomUUID(),
          insightA: a.id,
          insightB: b.id,
          relationship: "Related to",
          confirmed: true,
        })
      ).status,
    ).toBe(201);
  });
  it("uses the real adapter through HTTP with exact saved source and rejects foreign/unapproved context before calling AI", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(analysis) },
              ],
            },
          ],
        }),
      ),
    );
    await start(
      openAiAssistant({ key: "test-server-only-secret", fetch: transport }),
    );
    const saved = await save();
    const result = await request("/api/assist", {
      conversationId: saved.id,
      source: { ...source, originalText: "Untrusted browser copy" },
      comment: "User response is not external evidence",
    });
    expect(result.status).toBe(200);
    const sent = JSON.parse(transport.mock.calls[0][1]?.body as string);
    expect(JSON.parse(sent.input[0].content).source.originalText).toBe(exact);
    expect(JSON.stringify(result.body)).not.toContain(
      "test-server-only-secret",
    );
    const foreign = (
      await db.query<{ id: string }>(
        "INSERT INTO users DEFAULT VALUES RETURNING id",
      )
    ).rows[0].id;
    const ids = (
      await db.query<{ id: string }>(
        "INSERT INTO insights(user_id,title,summary,creation_method,user_confirmed) VALUES($1,'Foreign approved','Do not send','user',true),($2,'Unapproved','Do not send','ai_suggested',false) RETURNING id",
        [foreign, owner],
      )
    ).rows.map((i) => i.id);
    for (const insightId of ids)
      expect(
        (await request("/api/assist/knowledge", { insightId })).status,
      ).toBe(404);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (await db.query("SELECT * FROM insight_connections")).rows,
    ).toHaveLength(0);
  });
});
