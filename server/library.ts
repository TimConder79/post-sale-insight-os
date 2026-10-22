import type { Database } from "./store.ts";
import { WorkspaceError } from "./errors.ts";
import type {
  LibraryDetail,
  LibraryItem,
  LibraryQuery,
} from "../src/shared/library.ts";

const columns = `i.creation_method AS "creationMethod", i.id, i.title, i.summary, i.created_at AS "createdAt", i.favorite, EXISTS(SELECT 1 FROM insight_lineage l WHERE l.insight_id=i.id AND l.user_id=i.user_id) AS "isSynthesis",
 ARRAY(SELECT seed FROM insight_seeds WHERE insight_id=i.id AND user_id=i.user_id ORDER BY seed) AS seeds,
 COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('name',p.name,'company',p.company))
   FROM insight_sources x JOIN source_conversations s ON s.id=x.conversation_id AND s.user_id=x.user_id
   JOIN people p ON p.id=s.author_id AND p.user_id=s.user_id
   WHERE x.insight_id=i.id AND x.user_id=i.user_id), '[]'::jsonb) AS people`;

export class LibraryStore {
  constructor(
    private db: Database,
    private owner: string,
  ) {}
  async list({ q, seed }: LibraryQuery): Promise<LibraryItem[]> {
    return (
      await this.db.query<LibraryItem>(
        `SELECT ${columns} FROM insights i
      WHERE i.user_id=$1 AND i.user_confirmed=true
      AND ($3::text IS NULL OR ($3='Unclassified' AND NOT EXISTS (SELECT 1 FROM insight_seeds WHERE insight_id=i.id AND user_id=i.user_id))
        OR EXISTS (SELECT 1 FROM insight_seeds WHERE insight_id=i.id AND user_id=i.user_id AND seed=$3))
      AND ($2='' OR strpos(lower(i.title || ' ' || i.summary || ' ' || COALESCE(i.notes,'')),lower($2))>0
        OR EXISTS (SELECT 1 FROM insight_sources x JOIN source_conversations s ON s.id=x.conversation_id AND s.user_id=x.user_id
          JOIN people p ON p.id=s.author_id AND p.user_id=s.user_id
          WHERE x.insight_id=i.id AND x.user_id=i.user_id AND strpos(lower(p.name || ' ' || COALESCE(p.company,'')),lower($2))>0))
      ORDER BY i.created_at DESC, i.id`,
        [this.owner, q, seed ?? null],
      )
    ).rows;
  }
  async get(id: string): Promise<LibraryDetail> {
    const row = (
      await this.db.query<LibraryDetail>(
        `SELECT ${columns}, i.takeaways, i.notes FROM insights i WHERE i.id=$1 AND i.user_id=$2 AND i.user_confirmed=true`,
        [id, this.owner],
      )
    ).rows[0];
    if (!row) throw new WorkspaceError(404, "Insight not found.");
    const sources = (
      await this.db.query<LibraryDetail["sources"][number]>(
        `SELECT s.id, s.original_text AS "originalText", s.relevant_comments AS "relevantComments", s.source_url AS "sourceUrl",
      CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'company',p.company) END AS person
      FROM insight_sources x JOIN source_conversations s ON s.id=x.conversation_id AND s.user_id=x.user_id
      LEFT JOIN people p ON p.id=s.author_id AND p.user_id=s.user_id
      WHERE x.insight_id=$1 AND x.user_id=$2 ORDER BY s.created_at,s.id`,
        [id, this.owner],
      )
    ).rows;
    const synthesizedFrom = (
      await this.db.query<{ id: string; title: string }>(
        `SELECT s.id,s.title FROM insight_lineage l JOIN insights s ON s.id=l.source_insight_id AND s.user_id=l.user_id WHERE l.insight_id=$1 AND l.user_id=$2 AND s.user_confirmed=true ORDER BY s.created_at,s.id`,
        [id, this.owner],
      )
    ).rows;
    return { ...row, sources, synthesizedFrom };
  }
}
