import type {
  Connection,
  ConnectionInput,
  SynthesisInput,
} from "../shared/connections";
import type { LibraryItem } from "../shared/library";
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
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
      "The local server is unavailable. Your draft is still here.",
    );
  }
  if (!response.ok) {
    const result = await response.json();
    throw new Error(
      result.error ?? "The request failed. Your draft is still here.",
    );
  }
  return response.json() as Promise<T>;
}
export const connectionsApi = {
  insights: () => request<LibraryItem[]>("/insights"),
  list: () => request<Connection[]>("/connections"),
  create: (body: ConnectionInput) =>
    request<{ id: string }>("/connections", "POST", body),
  remove: (id: string) =>
    request<{ id: string }>(`/connections/${id}`, "DELETE"),
  synthesize: (body: SynthesisInput) =>
    request<{ id: string }>("/syntheses", "POST", body),
};
