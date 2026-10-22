import { z } from "zod";
import type { WorkspaceStore } from "./store.ts";
import { WorkspaceError } from "./errors.ts";
import type { Assistant } from "./ai.ts";
import {
  AiReceipts,
  connectionScope,
  insightValue,
  synthesisScope,
} from "./ai-receipts.ts";
import { draftSchema, knowledgeSchema } from "../src/shared/ai.ts";
import { isSymmetric } from "../src/shared/connections.ts";

export const selectedSources = z
  .object({
    sourceIds: z
      .array(z.uuid().transform((id) => id.toLowerCase()))
      .min(2)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export class AiWorkflow {
  readonly receipts = new AiReceipts();
  constructor(
    private store: WorkspaceStore,
    private assistant: Assistant,
  ) {}
  async draft(ids: string[]) {
    if (!this.assistant.draft)
      throw new WorkspaceError(
        503,
        "AI synthesis drafting is unavailable. Keep writing manually; your sources and draft are unchanged.",
      );
    const sources = await Promise.all(
      ids.map((id) => this.store.library().get(id)),
    );
    const draft = draftSchema.parse(
      await this.assistant.draft({
        sources: sources.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          seeds: i.seeds,
        })),
      }),
    );
    if (
      new Set(draft.seedRationale.map((s) => s.seed)).size !==
        draft.seedRationale.length ||
      [...draft.seeds].sort().join() !==
        draft.seedRationale
          .map((s) => s.seed)
          .sort()
          .join()
    )
      throw Error("Invalid rationale");
    return {
      draft,
      aiReceipt: this.receipts.issue(synthesisScope(ids), insightValue(draft)),
    };
  }
  async knowledge(id: string) {
    if (!this.assistant.knowledge)
      throw new WorkspaceError(
        503,
        "AI suggestions are unavailable. Manual Connections and Themes remain available.",
      );
    const subject = await this.store.library().get(id);
    const all = await this.store.library().list({ q: "" });
    // Small-MVP lexical retrieval: bounded approved context, no embeddings or hidden knowledge.
    const words = new Set(
      (subject.title + " " + subject.summary)
        .toLowerCase()
        .match(/[\p{L}\p{N}]{4,}/gu) ?? [],
    );
    const relevance = (text: string) =>
      [...words].filter((word) => text.toLowerCase().includes(word)).length;
    const candidates = all
      .filter((i) => i.id !== id)
      .sort(
        (a, b) =>
          relevance(b.title + " " + b.summary) -
          relevance(a.title + " " + a.summary),
      )
      .slice(0, 20);
    const themes = (await this.store.themes().list())
      .sort(
        (a, b) =>
          relevance(b.name + " " + b.description) -
          relevance(a.name + " " + a.description),
      )
      .slice(0, 20);
    const details = await Promise.all(
      themes.map((t) => this.store.themes().get(t.id)),
    );
    const availableThemes = details.filter(
      (t) => !t.insights.some((i) => i.id === id),
    );
    const existing = await this.store.connections().list();
    const result = knowledgeSchema.parse(
      await this.assistant.knowledge({
        subject: {
          id: subject.id,
          title: subject.title,
          summary: subject.summary,
        },
        candidates: candidates.map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
        })),
        themes: availableThemes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          members: t.insights
            .slice(0, 5)
            .map((i) => ({ id: i.id, title: i.title, summary: i.summary })),
        })),
        existingConnections: existing.filter(
          (c) => c.insightA === id || c.insightB === id,
        ),
      }),
    );
    const keys = new Set<string>();
    const connections = result.connections
      .map((c) => {
        const candidate = candidates.find((i) => i.id === c.candidateId);
        if (!candidate) throw Error("Invalid candidate");
        const a = c.direction === "outgoing" ? id : c.candidateId,
          b = c.direction === "outgoing" ? c.candidateId : id;
        const pair = isSymmetric(c.relationship) ? [a, b].sort() : [a, b];
        const key = pair.join(":") + c.relationship;
        if (keys.has(key)) throw Error("Duplicate suggestion");
        keys.add(key);
        return {
          ...c,
          title: candidate.title,
          summary: candidate.summary,
          aiReceipt: this.receipts.issue(
            connectionScope(a, b, c.relationship),
            {},
          ),
        };
      })
      .filter(
        (c) =>
          !existing.some(
            (saved) =>
              saved.relationship === c.relationship &&
              (isSymmetric(c.relationship)
                ? [saved.insightA, saved.insightB].sort().join() ===
                  [id, c.candidateId].sort().join()
                : saved.insightA ===
                    (c.direction === "outgoing" ? id : c.candidateId) &&
                  saved.insightB ===
                    (c.direction === "outgoing" ? c.candidateId : id)),
          ),
      );
    const seen = new Set<string>();
    const suggestedThemes = result.themes.map((t) => {
      const theme = availableThemes.find((item) => item.id === t.themeId);
      if (!theme || seen.has(t.themeId)) throw Error("Invalid Theme");
      seen.add(t.themeId);
      return {
        ...t,
        name: theme.name,
        aiReceipt: this.receipts.issue(`theme:${t.themeId}:${id}`, {}),
      };
    });
    return {
      connections,
      themes: suggestedThemes,
      contextNote: `Compared up to 20 approved Insights and 20 existing Themes (up to 5 member Insights each). Suggestions are not exhaustive; zero is valid.`,
    };
  }
}
