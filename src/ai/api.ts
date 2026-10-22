import type { DraftResult, KnowledgeResult } from "../shared/ai";
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/assist/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "AI is unavailable. Your draft is unchanged.",
    );
  return result;
}
export const aiApi = {
  draft: (sourceIds: string[]) =>
    request<DraftResult>("synthesis", { sourceIds }),
  knowledge: (insightId: string) =>
    request<KnowledgeResult>("knowledge", { insightId }),
};
