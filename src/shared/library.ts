import { z } from "zod";
import { seeds } from "./workspace.ts";

export const libraryQuery = z
  .object({
    q: z.string().max(500).default(""),
    seed: z.enum([...seeds, "Unclassified"]).optional(),
  })
  .strict();
export type LibraryQuery = z.infer<typeof libraryQuery>;
export type LibraryItem = {
  id: string;
  title: string;
  summary: string;
  seeds: string[];
  people: { name: string; company: string | null }[];
  createdAt: string;
  favorite: boolean;
};
export type LibraryDetail = LibraryItem & {
  takeaways: string[];
  notes: string | null;
  sources: {
    id: string;
    originalText: string;
    relevantComments: string | null;
    sourceUrl: string | null;
    person: { name: string; company: string | null } | null;
  }[];
};
