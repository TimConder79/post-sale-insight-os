import { z } from "zod";
import { insightFields } from "./workspace.ts";

const uuid = z.uuid().transform((value) => value.toLowerCase());

export const relationshipTypes = [
  "Supports",
  "Extends",
  "Contradicts",
  "Example of",
  "Leads to",
  "Related to",
] as const;
export const isSymmetric = (type: string) =>
  type === "Contradicts" || type === "Related to";
export const connectionInput = z
  .object({
    id: uuid,
    insightA: uuid,
    insightB: uuid,
    relationship: z.enum(relationshipTypes),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) => value.insightA !== value.insightB,
    "An Insight cannot connect to itself.",
  );
export const synthesisInput = insightFields
  .pick({ title: true, summary: true, takeaways: true, seeds: true })
  .extend({
    id: uuid,
    sourceIds: z
      .array(uuid)
      .min(2, "Select at least two source Insights.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select distinct source Insights.",
      ),
    confirmed: z.literal(true),
  })
  .strict();
export type ConnectionInput = z.infer<typeof connectionInput>;
export type SynthesisInput = z.infer<typeof synthesisInput>;
export type Connection = {
  id: string;
  insightA: string;
  insightB: string;
  relationship: (typeof relationshipTypes)[number];
  createdAt: string;
};
