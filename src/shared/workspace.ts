import { z } from "zod";

export const seeds = [
  "Visibility",
  "Progression",
  "Predictability",
  "Execution",
  "Economics",
] as const;
const text = z.string().max(100_000);
const required = text.refine(
  (value) => value.trim().length > 0,
  "This field is required.",
);
const optionalUrl = z.union([
  z.literal(""),
  z
    .url()
    .refine((url) => /^https?:\/\//.test(url), "Use an http or https URL."),
]);
export const sourceFields = z
  .object({
    originalText: required,
    relevantComments: text.default(""),
    sourceUrl: optionalUrl.default(""),
    person: z
      .object({
        name: z.string().max(500),
        role: z.string().max(500),
        company: z.string().max(500),
        linkedinUrl: optionalUrl,
      })
      .optional(),
  })
  .strict()
  .refine(({ person }) => !person || person.name.trim().length > 0, {
    message: "Add a person name to link person metadata.",
    path: ["person", "name"],
  });
export const createSource = z
  .object({ id: z.uuid(), source: sourceFields })
  .strict();
export const insightFields = z
  .object({
    title: z
      .string()
      .max(1000)
      .refine((value) => value.trim().length > 0, "Title is required."),
    summary: required,
    takeaways: z.array(z.string().max(5000)).max(50),
    seeds: z
      .array(z.enum(seeds))
      .max(5)
      .refine((values) => new Set(values).size === values.length),
    themes: z
      .array(z.string().min(1).max(500))
      .max(50)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const approveInsight = insightFields
  .extend({
    id: z.uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export const suggestionSchema = z
  .object({
    seeds: z
      .array(
        z.object({
          seed: z.enum(seeds),
          rationale: z.string().min(1).max(5000),
        }),
      )
      .max(5),
    themes: z
      .array(
        z.object({
          theme: z.string().min(1).max(500),
          rationale: z.string().min(1).max(5000),
        }),
      )
      .max(50),
    distinctions: z.array(z.string().max(5000)).max(20),
    questions: z.array(z.string().max(5000)).max(20),
    comment: z.string().min(1).max(20_000),
    insight: insightFields,
  })
  .strict();
export const revisionModes = [
  "regenerate",
  "concise",
  "direct",
  "question",
  "different angle",
] as const;
export const analysisRequest = z
  .object({
    source: sourceFields,
    conversationId: z.uuid().optional(),
    mode: z.enum(revisionModes).default("regenerate"),
    comment: z.string().max(20_000).default(""),
  })
  .strict();
export type SourceInput = z.infer<typeof sourceFields>;
export type InsightInput = z.infer<typeof insightFields>;
export type AnalysisRequest = z.infer<typeof analysisRequest>;
export type Suggestion = z.infer<typeof suggestionSchema>;
export type ApprovedInsight = InsightInput & {
  id: string;
  creationMethod: "user" | "ai_suggested" | "ai_then_edited";
  userConfirmed: true;
  createdAt: string;
};
export type Conversation = SourceInput & {
  id: string;
  createdAt: string;
  insights: ApprovedInsight[];
};
export type Analysis = Suggestion & {
  mode: "stub";
};
