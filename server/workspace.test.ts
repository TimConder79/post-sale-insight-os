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
