import type { Theme, ThemeDetail, ThemeInput } from "../shared/themes";
import type { LibraryItem } from "../shared/library";
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "The local server is unavailable. Your draft and selections are still here.",
    );
  }
  if (!response.ok) {
    const result = await response.json();
    throw new Error(
      result.error ??
        "Unable to load or save Themes. Your draft is still here.",
    );
  }
  return response.json() as Promise<T>;
}
export const themesApi = {
  list: (signal?: AbortSignal) =>
    request<Theme[]>("/themes", "GET", undefined, signal),
  detail: (id: string, signal?: AbortSignal) =>
    request<ThemeDetail>(`/themes/${id}`, "GET", undefined, signal),
  insights: (signal?: AbortSignal) =>
    request<LibraryItem[]>("/insights", "GET", undefined, signal),
  create: (body: ThemeInput) =>
    request<{ id: string }>("/themes", "POST", body),
  add: (id: string, insightIds: string[]) =>
    request<{ id: string }>(`/themes/${id}/insights`, "POST", {
      insightIds,
      confirmed: true,
    }),
  remove: (id: string, insightId: string) =>
    request<{ id: string }>(`/themes/${id}/insights/${insightId}`, "DELETE"),
};
