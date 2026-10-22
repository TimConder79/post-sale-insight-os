import { isSymmetric } from "../shared/connections";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { aiApi } from "./api";
import { api } from "../workspace/api";
import { connectionsApi } from "../connections/api";
import { themesApi } from "../themes/api";
import type { KnowledgeResult } from "../shared/ai";

export function KnowledgeSuggestions({ insightId }: { insightId: string }) {
  const [mode, setMode] = useState("unavailable");
  const [result, setResult] = useState<KnowledgeResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
  // IDs survive failed saves, including a lost successful response.
  const [saveIds] = useState(() => new Map<string, string>());
  useEffect(() => {
    let active = true;
    void api
      .status()
      .then((value) => {
        if (active) setMode(value.aiMode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI request failed. Manual workflows remain available.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="AI Connection and Theme suggestions">
      <h3>AI suggestions — unconfirmed</h3>
      <p>
        AI proposes. You decide. Connections and existing Theme associations are
        saved only by individual approval. Seeds remain unchanged.
      </p>
      {mode !== "openai" && (
        <p>
          Real AI is unavailable. Use manual Connections and Themes; no
          suggestions are simulated here.
        </p>
      )}
      <button
        disabled={busy || mode !== "openai"}
        onClick={() =>
          void run(async () => {
            const value = await aiApi.knowledge(insightId);
            setResult(value);
            setApproved([]);
          })
        }
      >
        Suggest Connections &amp; Themes
      </button>
      {busy && <p role="status">Requesting or saving suggestions…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>{result.contextNote}</p>
          {!result.connections.length && (
            <p>No Connection suggestions. An Insight can stand on its own.</p>
          )}
          {result.connections.map((c) => {
            const key = `${c.candidateId}:${c.relationship}:${c.direction}`;
            const a = c.direction === "outgoing" ? insightId : c.candidateId,
              b = c.direction === "outgoing" ? c.candidateId : insightId;
            return (
              <article key={key}>
                <h4>
                  <Link to={`/insights?insight=${c.candidateId}`}>
                    {c.title}
                  </Link>
                </h4>
                <p>{c.summary}</p>
                <p>
                  {isSymmetric(c.relationship)
                    ? "This Insight ↔ candidate"
                    : c.direction === "outgoing"
                      ? "This Insight → candidate"
                      : "Candidate → this Insight"}{" "}
                  · {c.relationship}
                </p>
                <p>{c.rationale}</p>
                <button
                  disabled={busy || approved.includes(key)}
                  onClick={() =>
                    void run(async () => {
                      if (!saveIds.has(key))
                        saveIds.set(key, crypto.randomUUID());
                      await connectionsApi.create({
                        id: saveIds.get(key)!,
                        insightA: a,
                        insightB: b,
                        relationship: c.relationship,
                        confirmed: true,
                        aiReceipt: c.aiReceipt,
                      });
                      setApproved((v) => [...v, key]);
                    })
                  }
                >
                  {approved.includes(key)
                    ? "Connection approved"
                    : "Approve Connection"}
                </button>
              </article>
            );
          })}
          {!result.themes.length && (
            <p>No Theme suggestions. Membership is optional.</p>
          )}
          {result.themes.map((t) => (
            <article key={t.themeId}>
              <h4>
                <Link to={`/insights/themes?theme=${t.themeId}`}>{t.name}</Link>
              </h4>
              <p>{t.rationale}</p>
              <button
                disabled={busy || approved.includes(t.themeId)}
                onClick={() =>
                  void run(async () => {
                    await themesApi.add(t.themeId, [insightId], t.aiReceipt);
                    setApproved((v) => [...v, t.themeId]);
                  })
                }
              >
                {approved.includes(t.themeId)
                  ? "Theme association approved"
                  : "Approve Theme association"}
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
