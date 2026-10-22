import { z } from "zod";
import type { LibraryItem } from "./library";
export const createTheme = z
  .object({
    id: z.uuid().transform((value) => value.toLowerCase()),
    name: z
      .string()
      .max(200)
      .refine((value) => value.trim().length > 0, "Enter a Theme name."),
    description: z.string().max(2000).default(""),
    confirmed: z.literal(true),
  })
  .strict();
export const themeAssociation = z
  .object({
    insightIds: z
      .array(z.uuid().transform((value) => value.toLowerCase()))
      .min(1)
      .max(500)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select distinct Insights.",
      ),
    confirmed: z.literal(true),
  })
  .strict();
export type ThemeInput = z.infer<typeof createTheme>;
export type Theme = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  insightCount: number;
  conversationCount: number;
  seeds: string[];
  latestInsightAt: string | null;
};
export type ThemeDetail = Theme & { insights: LibraryItem[] };
