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
