import pg from "pg";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createApp } from "./app.ts";
import { createAssistant } from "./ai.ts";
import { postgresDatabase, WorkspaceStore } from "./store.ts";

const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    WORKSPACE_USER_ID: z.uuid(),
    PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
    APP_ORIGIN: z.url().default("http://127.0.0.1:5173"),
  })
  .parse(process.env);
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const store = new WorkspaceStore(
  postgresDatabase(pool),
  config.WORKSPACE_USER_ID,
);
await store.initialize();
const assistant = createAssistant(process.env.AI_MODE);
const app = createApp(store, assistant, {
  port: config.PORT,
  devOrigin: config.APP_ORIGIN,
  serveDist: fileURLToPath(new URL("../dist", import.meta.url)),
});
const server = app.listen(config.PORT, "127.0.0.1", () => {
  console.log(
    `Local workspace API ready on port ${config.PORT}; AI mode: ${assistant.mode}.`,
  );
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
