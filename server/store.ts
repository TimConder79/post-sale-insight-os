import { WorkspaceError } from "./errors.ts";
export { WorkspaceError } from "./errors.ts";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { ConnectionsStore } from "./connections.ts";
import { LibraryStore } from "./library.ts";
import { randomUUID } from "node:crypto";
import { insightFields } from "../src/shared/workspace.ts";
import type {
  ApprovedInsight,
  Conversation,
  InsightInput,
  SourceInput,
} from "../src/shared/workspace.ts";

export type Query = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>;
export interface Database {
  query: Query;
  transaction<T>(work: (query: Query) => Promise<T>): Promise<T>;
}
export function postgresDatabase(pool: Pool): Database {
  return {
    query: (sql, values) => pool.query(sql, values),
    transaction: async (work) => {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work((sql, values) => client.query(sql, values));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export class WorkspaceStore {
  constructor(
    private db: Database,
    private owner: string,
  ) {}
  connections() {
    return new ConnectionsStore(this.db, this.owner);
  }
  library() {
    return new LibraryStore(this.db, this.owner);
  }
  async initialize() {
    await this.db.query(
      "INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [this.owner],
    );
  }
  async list() {
    return (
      await this.db.query<{
        id: string;
        original_text: string;
        created_at: string;
      }>(
        "SELECT id, left(original_text, 120) AS original_text, created_at FROM source_conversations WHERE user_id = $1 ORDER BY created_at DESC, id",
        [this.owner],
      )
    ).rows.map((row) => ({
      id: row.id,
      preview: row.original_text,
      createdAt: row.created_at,
    }));
  }
  async get(id: string): Promise<Conversation> {
    const { rows } = await this.db.query(
      `SELECT s.*, p.name, p.role, p.company, p.linkedin_url, r.response_text, r.saved_at AS response_saved_at FROM source_conversations s LEFT JOIN people p ON p.id = s.author_id AND p.user_id = s.user_id LEFT JOIN conversation_responses r ON r.conversation_id = s.id AND r.user_id = s.user_id WHERE s.id = $1 AND s.user_id = $2`,
      [id, this.owner],
    );
    const row = rows[0];
    if (!row) throw new WorkspaceError(404, "Conversation not found.");
    const insights = (
      await this.db.query(
        `SELECT i.*, ARRAY(SELECT seed FROM insight_seeds WHERE insight_id = i.id ORDER BY seed) AS seeds, ARRAY(SELECT theme FROM insight_themes WHERE insight_id = i.id ORDER BY theme) AS themes FROM insights i JOIN insight_sources s ON s.insight_id = i.id AND s.user_id = i.user_id WHERE s.conversation_id = $1 AND i.user_id = $2 AND i.user_confirmed = true ORDER BY i.created_at, i.id`,
        [id, this.owner],
      )
    ).rows.map(
      (i) =>
        ({
          ...insightFields.parse({
            title: i.title,
            summary: i.summary,
            takeaways: i.takeaways,
            seeds: i.seeds,
            themes: i.themes,
          }),
          id: i.id as string,
          creationMethod: i.creation_method,
          userConfirmed: true,
          createdAt: i.created_at,
        }) as ApprovedInsight,
    );
    return {
      id: row.id,
      originalText: row.original_text,
      relevantComments: row.relevant_comments ?? "",
      sourceUrl: row.source_url ?? "",
      createdAt: row.created_at,
      response: row.response_text ?? "",
      responseSavedAt: row.response_saved_at ?? null,
      person: row.name
        ? {
            name: row.name,
            role: row.role ?? "",
            company: row.company ?? "",
            linkedinUrl: row.linkedin_url ?? "",
          }
        : undefined,
      insights,
    };
  }
  async create(id: string, source: SourceInput) {
    await this.db.transaction(async (query) => {
      // Serialize retries of this create, without creating duplicate people.
      await query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
      const existing = await query(
        "SELECT user_id FROM source_conversations WHERE id = $1",
        [id],
      );
      if (existing.rows.length) {
        if (existing.rows[0].user_id !== this.owner)
          throw new WorkspaceError(409, "This save identifier is unavailable.");
        return;
      }
      let personId: string | null = null;
      if (source.person) {
        personId = randomUUID();
        await query(
          "INSERT INTO people (id, user_id, name, role, company, linkedin_url) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            personId,
            this.owner,
            source.person.name,
            source.person.role,
            source.person.company,
            source.person.linkedinUrl,
          ],
        );
      }
      await query(
        `INSERT INTO source_conversations (id,user_id,source_type,original_text,relevant_comments,source_url,author_id) VALUES ($1,$2,'linkedin',$3,$4,$5,$6)`,
        [
          id,
          this.owner,
          source.originalText,
          source.relevantComments,
          source.sourceUrl,
          personId,
        ],
      );
    });
    const saved = await this.get(id);
    if (
      JSON.stringify([
        saved.originalText,
        saved.relevantComments,
        saved.sourceUrl,
        saved.person,
      ]) !==
      JSON.stringify([
        source.originalText,
        source.relevantComments,
        source.sourceUrl,
        source.person,
      ])
    )
      throw new WorkspaceError(
        409,
        "A different source was already saved with this identifier. Reopen it before saving again.",
      );
    return saved;
  }
  async saveResponse(conversationId: string, text: string) {
    const { rows } = await this.db.query<{
      response: string;
      responseSavedAt: string;
    }>(
      `INSERT INTO conversation_responses (conversation_id, user_id, response_text)
       SELECT id, user_id, $3 FROM source_conversations WHERE id = $1 AND user_id = $2
       ON CONFLICT (conversation_id) DO UPDATE SET response_text = EXCLUDED.response_text, saved_at = now()
       WHERE conversation_responses.user_id = EXCLUDED.user_id
       RETURNING response_text AS response, saved_at AS "responseSavedAt"`,
      [conversationId, this.owner, text],
    );
    if (!rows[0]) throw new WorkspaceError(404, "Conversation not found.");
    return rows[0];
  }
  async approve(conversationId: string, id: string, fields: InsightInput) {
    await this.get(conversationId);
    await this.db.transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
      const existing = (
        await query(
          "SELECT i.user_id, s.conversation_id FROM insights i LEFT JOIN insight_sources s ON s.insight_id = i.id WHERE i.id = $1",
          [id],
        )
      ).rows;
      if (existing.length) {
        if (
          existing[0].user_id !== this.owner ||
          existing[0].conversation_id !== conversationId
        )
          throw new WorkspaceError(409, "This save identifier is unavailable.");
        return;
      }
      await query(
        `INSERT INTO insights (id,user_id,title,summary,takeaways,creation_method,user_confirmed) VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [
          id,
          this.owner,
          fields.title,
          fields.summary,
          fields.takeaways,
          "user",
        ],
      );
      await query(
        "INSERT INTO insight_sources (user_id,insight_id,conversation_id) VALUES ($1,$2,$3)",
        [this.owner, id, conversationId],
      );
      for (const seed of fields.seeds)
        await query("INSERT INTO insight_seeds VALUES ($1,$2,$3)", [
          this.owner,
          id,
          seed,
        ]);
      for (const theme of fields.themes)
        await query("INSERT INTO insight_themes VALUES ($1,$2,$3)", [
          this.owner,
          id,
          theme,
        ]);
    });
    const saved = await this.get(conversationId);
    const approved = saved.insights.find((item) => item.id === id);
    const comparable = (value: InsightInput) =>
      JSON.stringify({
        ...value,
        seeds: [...value.seeds].sort(),
        themes: [...value.themes].sort(),
      });
    if (
      !approved ||
      comparable(
        insightFields.parse({
          title: approved.title,
          summary: approved.summary,
          takeaways: approved.takeaways,
          seeds: approved.seeds,
          themes: approved.themes,
        }),
      ) !== comparable(fields)
    )
      throw new WorkspaceError(
        409,
        "This Insight was already saved with different fields. Reopen the conversation; your current edits have been kept.",
      );
    return saved;
  }
}
