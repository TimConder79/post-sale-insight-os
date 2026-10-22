import { z } from "zod";
import { insightFields, seeds } from "./workspace.ts";
import { relationshipTypes } from "./connections.ts";
export const draftSchema = insightFields
  .pick({ title: true, summary: true, takeaways: true, seeds: true })
  .extend({
    seedRationale: z
      .array(
        z
          .object({
            seed: z.enum(seeds),
            rationale: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export const knowledgeSchema = z
  .object({
    connections: z
      .array(
        z
          .object({
            candidateId: z.uuid(),
            relationship: z.enum(relationshipTypes),
            direction: z.enum(["outgoing", "incoming"]),
            rationale: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(3),
    themes: z
      .array(
        z
          .object({ themeId: z.uuid(), rationale: z.string().min(1).max(2000) })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type AiDraft = z.infer<typeof draftSchema>;
export type KnowledgeSuggestions = z.infer<typeof knowledgeSchema>;
export type DraftResult = { draft: AiDraft; aiReceipt: string };
export type KnowledgeResult = {
  connections: (KnowledgeSuggestions["connections"][number] & {
    title: string;
    summary: string;
    aiReceipt: string;
  })[];
  themes: (KnowledgeSuggestions["themes"][number] & {
    name: string;
    aiReceipt: string;
  })[];
  contextNote: string;
};
