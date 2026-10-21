import { libraryQuery } from "../src/shared/library.ts";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import {
  analysisRequest,
  approveInsight,
  createSource,
  saveResponse,
  insightFields,
  sourceFields,
  suggestionSchema,
} from "../src/shared/workspace.ts";
import { WorkspaceError, WorkspaceStore } from "./store.ts";
import type { ApprovedInsight } from "../src/shared/workspace.ts";
import type { Assistant } from "./ai.ts";

export function createApp(
  store: WorkspaceStore,
  assistant: Assistant,
  options: { port: number; devOrigin: string; serveDist?: string },
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const allowedHosts = [
      `127.0.0.1:${options.port}`,
      `localhost:${options.port}`,
    ];
    const ownOrigins = allowedHosts.map((host) => `http://${host}`);
    const origin = req.get("origin");
    if (
      !allowedHosts.includes(req.get("host") ?? "") ||
      (origin && ![...ownOrigins, options.devOrigin].includes(origin)) ||
      req.get("sec-fetch-site") === "cross-site"
    ) {
      res.status(403).json({
        error: "This local workspace does not accept remote origins.",
      });
      return;
    }
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    (req, res, next) => {
      if (
        ["POST", "PUT", "PATCH"].includes(req.method) &&
        !req.is("application/json")
      ) {
        res.status(415).json({ error: "Use JSON requests." });
        return;
      }
      next();
    },
    express.json({ limit: "1mb" }),
  );
  app.get("/api/insights", async (req, res) => {
    res.json(await store.library().list(libraryQuery.parse(req.query)));
  });
  app.get("/api/insights/:id", async (req, res) => {
    res.json(await store.library().get(z.uuid().parse(req.params.id)));
  });
  app.get("/api/status", (_req, res) => {
    res.json({ aiMode: assistant.mode });
  });
  app.get("/api/conversations", async (_req, res) => {
    res.json(await store.list());
  });
  app.post("/api/conversations", async (req, res) => {
    const input = createSource.parse(req.body);
    res.status(201).json(await store.create(input.id, input.source));
  });
  app.get("/api/conversations/:id", async (req, res) => {
    res.json(await store.get(z.uuid().parse(req.params.id)));
  });
  app.put("/api/conversations/:id/response", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const input = saveResponse.parse(req.body);
    res.json(await store.saveResponse(id, input.text));
  });
  app.post("/api/conversations/:id/insights", async (req, res) => {
    const conversationId = z.uuid().parse(req.params.id);
    const input = approveInsight.parse(req.body);
    res.status(201).json(
      await store.approve(
        conversationId,
        input.id,
        insightFields.parse({
          title: input.title,
          summary: input.summary,
          takeaways: input.takeaways,
          seeds: input.seeds,
          themes: input.themes,
        }),
      ),
    );
  });
  app.post("/api/assist", async (req, res) => {
    const input = analysisRequest.parse(req.body);
    let approvedKnowledge: ApprovedInsight[] = [];
    if (input.conversationId) {
      const saved = await store.get(input.conversationId);
      input.source = sourceFields.parse({
        originalText: saved.originalText,
        relevantComments: saved.relevantComments,
        sourceUrl: saved.sourceUrl,
        person: saved.person,
      });
      approvedKnowledge = saved.insights;
    }
    try {
      const suggestion = suggestionSchema.parse(
        await assistant.run(input, approvedKnowledge),
      );
      res.json({ ...suggestion, mode: assistant.mode });
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        503,
        "AI assistance is unavailable or returned an invalid suggestion. Your source and manual Insight remain available.",
      );
    }
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });
  if (options.serveDist) {
    app.use(express.static(options.serveDist));
    app.get("/{*path}", (_req, res) => {
      res.sendFile("index.html", { root: options.serveDist });
    });
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    void _next;
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: error.issues.map((issue) => issue.message).join(" ") });
      return;
    }
    if (error instanceof WorkspaceError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON request." });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    // Never serialize raw driver/provider errors, connection strings or tokens.
    res.status(500).json({
      error:
        "Unable to save or load workspace data. Your edits are still available; check the local server/database and retry.",
    });
  };
  app.use(errors);
  return app;
}
