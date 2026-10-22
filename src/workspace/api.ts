import type {
  Analysis,
  AnalysisRequest,
  Conversation,
  InsightInput,
  SourceInput,
} from "../shared/workspace";

async function request<T>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "The local server is unavailable. Your edits are still here; retry when it is running.",
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "The request failed. Your edits have been kept.",
    );
  return result as T;
}
export const api = {
  status: () =>
    request<{ aiMode: "unavailable" | "stub" | "openai" }>("/status"),
  list: () =>
    request<{ id: string; preview: string; createdAt: string }[]>(
      "/conversations",
    ),
  get: (id: string) => request<Conversation>(`/conversations/${id}`),
  saveSource: (id: string, source: SourceInput) =>
    request<Conversation>("/conversations", { id, source }),
  saveResponse: (id: string, text: string) =>
    request<{ response: string; responseSavedAt: string }>(
      `/conversations/${id}/response`,
      { text },
      "PUT",
    ),
  approve: (
    conversationId: string,
    id: string,
    fields: InsightInput,
    aiReceipt?: string,
  ) =>
    request<Conversation>(`/conversations/${conversationId}/insights`, {
      ...fields,
      id,
      confirmed: true,
      aiReceipt,
    }),
  assist: (body: AnalysisRequest) => request<Analysis>("/assist", body),
};
