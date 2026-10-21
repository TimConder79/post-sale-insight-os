import type { Database, Query } from "./store.ts";
import { WorkspaceError } from "./errors.ts";
import { LibraryStore } from "./library.ts";
import type { Theme, ThemeDetail, ThemeInput } from "../src/shared/themes.ts";

export class ThemesStore {
  constructor(
    private db: Database,
    private owner: string,
  ) {}
  async list(): Promise<Theme[]> {
    return (
      await this.db.query<Theme>(
        `WITH RECURSIVE members AS (
      SELECT m.theme_id,i.id,i.created_at FROM theme_memberships m JOIN insights i ON i.id=m.insight_id AND i.user_id=m.user_id
      WHERE m.user_id=$1 AND i.user_confirmed=true
    ), ancestors(theme_id,id) AS (
      SELECT theme_id,id FROM members
      UNION
      SELECT a.theme_id,i.id FROM ancestors a JOIN insight_lineage l ON l.insight_id=a.id AND l.user_id=$1
        JOIN insights i ON i.id=l.source_insight_id AND i.user_id=l.user_id AND i.user_confirmed=true
    )
    SELECT t.id,t.name,t.description,t.created_at AS "createdAt",
      (SELECT count(*)::int FROM members WHERE theme_id=t.id) AS "insightCount",
      (SELECT count(DISTINCT s.id)::int FROM ancestors a JOIN insight_sources x ON x.insight_id=a.id AND x.user_id=$1
        JOIN source_conversations s ON s.id=x.conversation_id AND s.user_id=x.user_id WHERE a.theme_id=t.id) AS "conversationCount",
      ARRAY(SELECT DISTINCT s.seed FROM members m JOIN insight_seeds s ON s.insight_id=m.id AND s.user_id=$1 WHERE m.theme_id=t.id ORDER BY s.seed) AS seeds,
      (SELECT max(created_at) FROM members WHERE theme_id=t.id) AS "latestInsightAt"
    FROM themes t WHERE t.user_id=$1 ORDER BY lower(t.name),t.id`,
        [this.owner],
      )
    ).rows;
  }
  private async requireTheme(query: Query, id: string) {
    if (
      !(
        await query(
          "SELECT id FROM themes WHERE id=$1 AND user_id=$2 FOR SHARE",
          [id, this.owner],
        )
      ).rows.length
    )
      throw new WorkspaceError(404, "Theme not found.");
  }
  async get(id: string): Promise<ThemeDetail> {
    const theme = (await this.list()).find((t) => t.id === id.toLowerCase());
    if (!theme) throw new WorkspaceError(404, "Theme not found.");
    const ids = new Set(
      (
        await this.db.query<{ insight_id: string }>(
          "SELECT insight_id FROM theme_memberships WHERE theme_id=$1 AND user_id=$2",
          [id, this.owner],
        )
      ).rows.map((r) => r.insight_id),
    );
    const insights = (
      await new LibraryStore(this.db, this.owner).list({ q: "" })
    ).filter((i) => ids.has(i.id));
    return { ...theme, insights };
  }
  async create(input: ThemeInput) {
    try {
      await this.db.transaction(async (query) => {
        await query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.id]);
        const row = (
          await query("SELECT * FROM themes WHERE id=$1", [input.id])
        ).rows[0];
        if (row) {
          if (
            row.user_id !== this.owner ||
            row.name !== input.name ||
            row.description !== input.description
          )
            throw new WorkspaceError(
              409,
              "This Theme was already saved with different fields. Your draft is unchanged.",
            );
          return;
        }
        await query(
          "INSERT INTO themes(id,user_id,name,description) VALUES($1,$2,$3,$4)",
          [input.id, this.owner, input.name, input.description],
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new WorkspaceError(
          409,
          "A Theme with this name already exists. Choose it or use a different name.",
        );
      throw error;
    }
    return { id: input.id };
  }
  async associate(id: string, ids: string[]) {
    await this.db.transaction(async (query) => {
      await this.requireTheme(query, id);
      const rows = (
        await query(
          "SELECT id FROM insights WHERE user_id=$1 AND id=ANY($2::uuid[]) AND user_confirmed=true ORDER BY id FOR SHARE",
          [this.owner, ids],
        )
      ).rows;
      if (rows.length !== ids.length)
        throw new WorkspaceError(
          404,
          "A selected Insight is unavailable in this workspace.",
        );
      for (const insightId of ids)
        await query(
          "INSERT INTO theme_memberships(user_id,theme_id,insight_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [this.owner, id, insightId],
        );
    });
    return { id };
  }
  async remove(id: string, insightId: string) {
    await this.db.transaction(async (query) => {
      await this.requireTheme(query, id);
      await query(
        "DELETE FROM theme_memberships WHERE user_id=$1 AND theme_id=$2 AND insight_id=$3",
        [this.owner, id, insightId],
      );
    });
    return { id };
  }
}
