import type { Database, Query } from "./store.ts";
import { WorkspaceError } from "./errors.ts";
import { isSymmetric } from "../src/shared/connections.ts";
import type {
  Connection,
  ConnectionInput,
  SynthesisInput,
} from "../src/shared/connections.ts";

export class ConnectionsStore {
  constructor(
    private db: Database,
    private owner: string,
  ) {}
  private async approved(query: Query, ids: string[]) {
    const result = await query(
      "SELECT id FROM insights WHERE user_id=$1 AND id=ANY($2::uuid[]) AND user_confirmed=true ORDER BY id FOR SHARE",
      [this.owner, ids],
    );
    if (result.rows.length !== ids.length)
      throw new WorkspaceError(
        404,
        "A selected Insight is unavailable in this workspace.",
      );
  }
  async list(): Promise<Connection[]> {
    return (
      await this.db.query<Connection>(
        `SELECT c.creation_method AS "creationMethod", c.id, c.insight_a AS "insightA", c.insight_b AS "insightB", c.relationship_type AS relationship, c.created_at AS "createdAt"
      FROM insight_connections c JOIN insights a ON a.id=c.insight_a AND a.user_id=c.user_id JOIN insights b ON b.id=c.insight_b AND b.user_id=c.user_id
      WHERE c.user_id=$1 AND c.user_confirmed=true AND a.user_confirmed=true AND b.user_confirmed=true ORDER BY c.created_at,c.id`,
        [this.owner],
      )
    ).rows;
  }
  async create(
    input: ConnectionInput,
    method: "user" | "ai_suggested" | "ai_then_edited" = "user",
  ) {
    let { insightA, insightB } = input;
    if (isSymmetric(input.relationship) && insightA > insightB)
      [insightA, insightB] = [insightB, insightA];
    if (insightA === insightB)
      throw new WorkspaceError(400, "An Insight cannot connect to itself.");
    try {
      return await this.db.transaction(async (query) => {
        await this.approved(query, [insightA, insightB]);
        await query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.id]);
        const existing = (
          await query("SELECT * FROM insight_connections WHERE id=$1", [
            input.id,
          ])
        ).rows[0];
        if (existing) {
          if (
            existing.user_id !== this.owner ||
            existing.insight_a !== insightA ||
            existing.insight_b !== insightB ||
            existing.relationship_type !== input.relationship ||
            !existing.user_confirmed
          )
            throw new WorkspaceError(
              409,
              "This save identifier is already in use.",
            );
          return { id: input.id };
        }
        await query(
          `INSERT INTO insight_connections (id,user_id,insight_a,insight_b,relationship_type,direction,creation_method,user_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,true)`,
          [
            input.id,
            this.owner,
            insightA,
            insightB,
            input.relationship,
            isSymmetric(input.relationship) ? "undirected" : "a_to_b",
            method,
          ],
        );
        return { id: input.id };
      });
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if ((error as { code?: string }).code === "23505")
        throw new WorkspaceError(
          409,
          "An equivalent connection is already saved.",
        );
      throw error;
    }
  }
  async remove(id: string) {
    const result = await this.db.query(
      "DELETE FROM insight_connections WHERE id=$1 AND user_id=$2 AND user_confirmed=true RETURNING id",
      [id, this.owner],
    );
    if (!result.rows.length)
      throw new WorkspaceError(404, "Connection not found.");
    return { id };
  }
  async synthesize(
    input: SynthesisInput,
    method: "user" | "ai_suggested" | "ai_then_edited" = "user",
  ) {
    if (
      input.sourceIds.length < 2 ||
      new Set(input.sourceIds).size !== input.sourceIds.length
    )
      throw new WorkspaceError(
        400,
        "Select at least two distinct source Insights.",
      );
    const expected = JSON.stringify({
      title: input.title,
      summary: input.summary,
      takeaways: input.takeaways,
      seeds: [...input.seeds].sort(),
      sourceIds: [...input.sourceIds].sort(),
    });
    await this.db.transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.id]);
      const existing = (
        await query(
          `SELECT i.*, ARRAY(SELECT seed FROM insight_seeds WHERE insight_id=i.id ORDER BY seed) AS seeds, ARRAY(SELECT source_insight_id::text FROM insight_lineage WHERE insight_id=i.id ORDER BY source_insight_id) AS sources FROM insights i WHERE i.id=$1`,
          [input.id],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.user_id !== this.owner ||
          !existing.user_confirmed ||
          existing.creation_method !== method ||
          JSON.stringify({
            title: existing.title,
            summary: existing.summary,
            takeaways: existing.takeaways,
            seeds: existing.seeds,
            sourceIds: existing.sources,
          }) !== expected
        )
          throw new WorkspaceError(
            409,
            "This Insight was already saved with different fields or lineage. Your draft is unchanged.",
          );
        return;
      }
      // A fresh Insight cannot be its own ancestor; sources must already exist and be approved.
      await this.approved(query, [...input.sourceIds].sort());
      await query(
        `INSERT INTO insights(id,user_id,title,summary,takeaways,creation_method,user_confirmed) VALUES($1,$2,$3,$4,$5,$6,true)`,
        [
          input.id,
          this.owner,
          input.title,
          input.summary,
          input.takeaways,
          method,
        ],
      );
      for (const id of input.sourceIds)
        await query(
          "INSERT INTO insight_lineage(user_id,insight_id,source_insight_id) VALUES($1,$2,$3)",
          [this.owner, input.id, id],
        );
      for (const seed of input.seeds)
        await query(
          "INSERT INTO insight_seeds(user_id,insight_id,seed) VALUES($1,$2,$3)",
          [this.owner, input.id, seed],
        );
    });
    return { id: input.id };
  }
}
