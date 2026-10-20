import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  seeds,
  sourceFields,
  insightFields,
  revisionModes,
} from "../shared/workspace";
import type {
  Analysis,
  Conversation,
  InsightInput,
  SourceInput,
} from "../shared/workspace";
import { api } from "./api";

const emptySource: SourceInput = {
  originalText: "",
  relevantComments: "",
  sourceUrl: "",
};
const emptyInsight: InsightInput = {
  title: "",
  summary: "",
  takeaways: [],
  seeds: [],
  themes: [],
};

// Textarea DOM values normalize line endings. Map visible edit offsets back to raw source.
function rawOffset(value: string, position: number) {
  let raw = 0;
  for (
    let visible = 0;
    visible < position && raw < value.length;
    visible++, raw++
  )
    if (value[raw] === "\r" && value[raw + 1] === "\n") raw++;
  return raw;
}
function editExact(previous: string, next: string) {
  const visible = previous.replace(/\r\n?/g, "\n");
  let start = 0;
  while (
    start < visible.length &&
    start < next.length &&
    visible[start] === next[start]
  )
    start++;
  let end = visible.length,
    nextEnd = next.length;
  while (
    end > start &&
    nextEnd > start &&
    visible[end - 1] === next[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  return (
    previous.slice(0, rawOffset(previous, start)) +
    next.slice(start, nextEnd) +
    previous.slice(rawOffset(previous, end))
  );
}
function pasteExact(
  event: ClipboardEvent<HTMLTextAreaElement>,
  value: string,
  change: (text: string) => void,
) {
  event.preventDefault();
  const start = rawOffset(value, event.currentTarget.selectionStart);
  const end = rawOffset(value, event.currentTarget.selectionEnd);
  const insertion = event.clipboardData.getData("text/plain");
  const element = event.currentTarget;
  change(value.slice(0, start) + insertion + value.slice(end));
  requestAnimationFrame(() => {
    element.setSelectionRange(
      (value.slice(0, start) + insertion).replace(/\r\n?/g, "\n").length,
      (value.slice(0, start) + insertion).replace(/\r\n?/g, "\n").length,
    );
  });
}

export function PostWorkspace() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("conversation");
  const [source, setSource] = useState<SourceInput>(emptySource);
  const [saved, setSaved] = useState<Conversation>();
  const [recent, setRecent] = useState<
    { id: string; preview: string; createdAt: string }[]
  >([]);
  const [aiMode, setAiMode] = useState("unavailable");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [comment, setComment] = useState("");
  const [insight, setInsight] = useState<InsightInput>(emptyInsight);
  const [takeawaysText, setTakeawaysText] = useState("");
  const [themesText, setThemesText] = useState("");
  const [draftOrigin, setDraftOrigin] = useState<"manual" | "stub">("manual");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(Boolean(selectedId));
  const sourceId = useRef<string>(crypto.randomUUID());
  const insightId = useRef<string>(crypto.randomUUID());
  const loadedId = useRef<string | undefined>(undefined);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([api.status(), api.list()])
      .then(([status, list]) => {
        if (active) {
          setAiMode(status.aiMode);
          setRecent(list);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!selectedId || selectedId === loadedId.current) return;
    let active = true;
    void api
      .get(selectedId)
      .then((conversation) => {
        if (active) {
          loadedId.current = conversation.id;
          sourceId.current = conversation.id;
          setSaved(conversation);
          setSource({
            originalText: conversation.originalText,
            relevantComments: conversation.relevantComments,
            sourceUrl: conversation.sourceUrl,
            person: conversation.person,
          });
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function run(name: string, work: () => Promise<void>) {
    const current = generation.current;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      if (current === generation.current)
        setError(
          err instanceof Error
            ? err.message
            : "The request failed. Your edits have been kept.",
        );
    } finally {
      if (current === generation.current) setBusy("");
    }
  }
  const resetDraft = useCallback(() => {
    setInsight(emptyInsight);
    setTakeawaysText("");
    setThemesText("");
    setDraftOrigin("manual");
    insightId.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    function onHistoryNavigation() {
      const id = new URL(window.location.href).searchParams.get("conversation");
      if (id === loadedId.current) return;
      generation.current++;
      loadedId.current = undefined;
      sourceId.current = crypto.randomUUID();
      setSource(emptySource);
      setSaved(undefined);
      setAnalysis(undefined);
      setComment("");
      resetDraft();
      setError("");
      setNotice("");
      setBusy("");
      setLoading(Boolean(id));
    }
    window.addEventListener("popstate", onHistoryNavigation);
    return () => window.removeEventListener("popstate", onHistoryNavigation);
  }, [resetDraft]);
  function leave() {
    if (
      (!saved && source.originalText) ||
      insight.title ||
      insight.summary ||
      comment
    )
      return window.confirm(
        "Leave this workspace? Unsaved source, response and Insight edits will be discarded.",
      );
    return true;
  }
  function open(id?: string) {
    if (busy || (id && id === loadedId.current) || !leave()) return;
    generation.current++;
    loadedId.current = undefined;
    sourceId.current = crypto.randomUUID();
    setSource(emptySource);
    setSaved(undefined);
    setAnalysis(undefined);
    setComment("");
    resetDraft();
    setError("");
    setNotice("");
    setLoading(Boolean(id));
    setParams(id ? { conversation: id } : {});
  }
  function updateSource<K extends keyof SourceInput>(
    key: K,
    value: SourceInput[K],
  ) {
    setSource((previous) => ({ ...previous, [key]: value }));
  }
  async function saveSource() {
    const current = generation.current;
    await run("Saving source", async () => {
      const parsed = sourceFields.safeParse(source);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join(" "),
        );
      const conversation = await api.saveSource(sourceId.current, parsed.data);
      if (current !== generation.current) return;
      loadedId.current = conversation.id;
      setSaved(conversation);
      setSource({
        originalText: conversation.originalText,
        relevantComments: conversation.relevantComments,
        sourceUrl: conversation.sourceUrl,
        person: conversation.person,
      });
      setParams({ conversation: conversation.id });
      setNotice("Source saved exactly as supplied.");
      setRecent(await api.list());
    });
  }
  async function assist(
    mode: (typeof revisionModes)[number] = "regenerate",
    onlyComment = false,
  ) {
    if (!saved) return;
    const current = generation.current;
    await run("Requesting suggestions", async () => {
      const result = await api.assist({
        source: sourceFields.parse(source),
        conversationId: saved.id,
        mode,
        comment,
      });
      if (current !== generation.current) return;
      setAnalysis(result);
      if (!comment || onlyComment) setComment(result.comment);
      if (!onlyComment)
        setNotice(
          "Preview only — these are deterministic stub suggestions, not AI output.",
        );
    });
  }
  function useProposal() {
    if (!analysis) return;
    if (
      (insight.title || insight.summary) &&
      !window.confirm("Replace the current Insight draft with this proposal?")
    )
      return;
    setInsight(analysis.insight);
    setTakeawaysText(analysis.insight.takeaways.join("\n"));
    setThemesText(analysis.insight.themes.join("\n"));
    setDraftOrigin(analysis.mode);
    insightId.current = crypto.randomUUID();
  }
  async function approve() {
    if (!saved) return;
    const current = generation.current;
    await run("Saving approved Insight", async () => {
      const fields = insightFields.safeParse({
        ...insight,
        takeaways: takeawaysText.split("\n").filter((value) => value.trim()),
        themes: [
          ...new Set(
            themesText
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ],
      });
      if (!fields.success)
        throw new Error(
          fields.error.issues.map((issue) => issue.message).join(" "),
        );
      const updated = await api.approve(
        saved.id,
        insightId.current,
        fields.data,
      );
      if (current !== generation.current) return;
      setSaved(updated);
      resetDraft();
      setNotice("Approved Insight saved with provenance to this source.");
    });
  }

  return (
    <section aria-labelledby="workspace-title">
      <h1 id="workspace-title">Post Workspace</h1>
      <p>
        Paste what they said. Shape your response. Capture what you learned.
      </p>
      <details className="saved-conversations">
        <summary>Reopen saved conversations ({recent.length})</summary>
        <button type="button" disabled={!!busy} onClick={() => open()}>
          New conversation
        </button>
        <ul>
          {recent.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => open(item.id)}
              >
                {item.preview || "Saved conversation"} · {item.id.slice(0, 8)}
              </button>
            </li>
          ))}
        </ul>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(notice || busy || loading) && (
        <p role="status">
          {busy ? `${busy}…` : loading ? "Loading saved conversation…" : notice}
        </p>
      )}
      <div className="workspace-grid" aria-busy={!!busy || loading}>
        <section className="workspace-panel" aria-labelledby="source-title">
          <h2 id="source-title">Source</h2>
          <p>
            {saved
              ? "Saved source · preserved exactly. Derived edits never change it."
              : "Copy/paste the original. No URL fetching or LinkedIn automation."}
          </p>
          <fieldset disabled={!!saved || !!busy || loading}>
            <label>
              Original Post <span>(required)</span>
              <textarea
                rows={10}
                value={source.originalText}
                onChange={(e) =>
                  updateSource(
                    "originalText",
                    editExact(source.originalText, e.target.value),
                  )
                }
                onPaste={(e) =>
                  pasteExact(e, source.originalText, (text) =>
                    updateSource("originalText", text),
                  )
                }
              />
            </label>
            <details open={saved && !!source.relevantComments}>
              <summary>Relevant Comments (optional)</summary>
              <label>
                Relevant Comments
                <textarea
                  rows={5}
                  value={source.relevantComments}
                  onChange={(e) =>
                    updateSource(
                      "relevantComments",
                      editExact(source.relevantComments, e.target.value),
                    )
                  }
                  onPaste={(e) =>
                    pasteExact(e, source.relevantComments, (text) =>
                      updateSource("relevantComments", text),
                    )
                  }
                />
              </label>
            </details>
            <details open={saved && !!(source.sourceUrl || source.person)}>
              <summary>Provenance &amp; person (optional)</summary>
              <label>
                LinkedIn URL <span>Provenance only</span>
                <input
                  type="url"
                  value={source.sourceUrl}
                  onChange={(e) => updateSource("sourceUrl", e.target.value)}
                />
              </label>
              {(["name", "role", "company", "linkedinUrl"] as const).map(
                (key, index) => (
                  <label key={key}>
                    {
                      [
                        "Person name",
                        "Person role",
                        "Company",
                        "Person LinkedIn URL",
                      ][index]
                    }
                    <input
                      type={key === "linkedinUrl" ? "url" : "text"}
                      value={source.person?.[key] ?? ""}
                      onChange={(e) => {
                        const person = {
                          name: "",
                          role: "",
                          company: "",
                          linkedinUrl: "",
                          ...source.person,
                          [key]: e.target.value,
                        };
                        updateSource(
                          "person",
                          Object.values(person).some(Boolean)
                            ? person
                            : undefined,
                        );
                      }}
                    />
                  </label>
                ),
              )}
            </details>
          </fieldset>
          {!saved && (
            <button
              type="button"
              disabled={!!busy || loading}
              onClick={() => void saveSource()}
            >
              Save source
            </button>
          )}
          {saved && (
            <p>
              Saved source ID: <code>{saved.id}</code>
            </p>
          )}
          <button
            type="button"
            disabled={!saved || !!busy || loading || aiMode === "unavailable"}
            onClick={() => void assist()}
          >
            Analyze source
          </button>
          {!saved && (
            <p>Save source first so proposals can retain provenance.</p>
          )}
        </section>
        <section className="workspace-panel" aria-labelledby="response-title">
          <h2 id="response-title">Analysis &amp; Response</h2>
          <p>
            {aiMode === "stub"
              ? "Preview mode — deterministic stub, not real AI. Review every word."
              : "AI is not configured. Save source and capture a manual Insight at any time."}
          </p>
          {analysis && (
            <div className="suggestion">
              <h3>Suggested lenses &amp; themes</h3>
              {!analysis.seeds.length && (
                <p>No seed suggested. A lens is optional.</p>
              )}
              <ul>
                {analysis.seeds.map((item, index) => (
                  <li key={index}>
                    <strong>{item.seed}</strong> — {item.rationale}
                  </li>
                ))}
                {analysis.themes.map((item, index) => (
                  <li key={index}>
                    <strong>{item.theme}</strong> — {item.rationale}
                  </li>
                ))}
              </ul>
              <h3>Distinctions &amp; questions</h3>
              <ul>
                {[...analysis.distinctions, ...analysis.questions].map(
                  (text, index) => (
                    <li key={index}>{text}</li>
                  ),
                )}
              </ul>
            </div>
          )}
          <label htmlFor="comment-draft">Our response</label>
          <textarea
            id="comment-draft"
            rows={8}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={!!busy || loading}
          />
          <p>
            Edit, then copy and post manually on LinkedIn. This application
            never posts for you.
          </p>
          <div className="button-row">
            {revisionModes.map((mode) => (
              <button
                type="button"
                key={mode}
                disabled={
                  !saved || !!busy || loading || aiMode === "unavailable"
                }
                onClick={() => void assist(mode, true)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!comment || !!busy || loading}
            onClick={() =>
              void run("Copying response", async () => {
                await navigator.clipboard.writeText(comment);
                setNotice("Response copied. Post it manually on LinkedIn.");
              })
            }
          >
            Copy response
          </button>
        </section>
        <section className="workspace-panel" aria-labelledby="insight-title">
          <h2 id="insight-title">Capture Insight</h2>
          <p>
            {draftOrigin === "stub"
              ? "Preview draft · not AI output. Replace with your learning before approval."
              : "Manual draft · unconfirmed until you approve and save."}
          </p>
          {analysis && (
            <details className="suggestion">
              <summary>Suggested Insight (unconfirmed)</summary>
              <h3>{analysis.insight.title}</h3>
              <p className="preserve-text">{analysis.insight.summary}</p>
              <button type="button" disabled={!!busy} onClick={useProposal}>
                Use suggested Insight
              </button>
            </details>
          )}
          <fieldset disabled={!!busy || loading}>
            <label>
              Insight title
              <input
                value={insight.title}
                onChange={(e) =>
                  setInsight({ ...insight, title: e.target.value })
                }
              />
            </label>
            <label htmlFor="insight-summary">Insight summary</label>
            <textarea
              id="insight-summary"
              rows={7}
              value={insight.summary}
              onChange={(e) =>
                setInsight({ ...insight, summary: e.target.value })
              }
            />
            <details>
              <summary>Takeaways, seeds &amp; themes (optional)</summary>
              <label>
                Takeaways (one per line)
                <textarea
                  value={takeawaysText}
                  onChange={(e) => setTakeawaysText(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Five Seeds — choose only when supported</legend>
                {seeds.map((seed) => (
                  <label className="checkbox" key={seed}>
                    <input
                      type="checkbox"
                      checked={insight.seeds.includes(seed)}
                      onChange={(e) =>
                        setInsight({
                          ...insight,
                          seeds: e.target.checked
                            ? [...insight.seeds, seed]
                            : insight.seeds.filter((value) => value !== seed),
                        })
                      }
                    />
                    {seed}
                  </label>
                ))}
              </fieldset>
              <label>
                Themes (one per line)
                <textarea
                  value={themesText}
                  onChange={(e) => setThemesText(e.target.value)}
                />
              </label>
            </details>
          </fieldset>
          <button
            type="button"
            disabled={!saved || !!busy || loading}
            onClick={() => void approve()}
          >
            Approve &amp; save Insight
          </button>
          {!saved && (
            <p>Save the source first; manual Insight edits remain here.</p>
          )}
          {!!saved?.insights.length && (
            <section aria-label="Approved Insights">
              <h3>Approved Insights linked to this source</h3>
              {saved.insights.map((item) => (
                <article key={item.id}>
                  <h4>{item.title}</h4>
                  <p className="preserve-text">{item.summary}</p>
                  {!!item.takeaways.length && (
                    <ul>
                      {item.takeaways.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  )}
                  <p>{[...item.seeds, ...item.themes].join(" · ")}</p>
                  <p>
                    Approved ·{" "}
                    {item.creationMethod === "user"
                      ? "User-created"
                      : item.creationMethod === "ai_then_edited"
                        ? "AI suggestion edited by user"
                        : "AI suggestion approved by user"}
                  </p>
                  <small>Source: {saved.id}</small>
                </article>
              ))}
            </section>
          )}
        </section>
      </div>
    </section>
  );
}
