import { aiApi } from "../ai/api";
import { api } from "../workspace/api";
import type { DraftResult } from "../shared/ai";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LibraryItem } from "../shared/library";
import { seeds } from "../shared/workspace";
import { synthesisInput } from "../shared/connections";
import { connectionsApi } from "./api";

export function SynthesisForm({
  sources,
  onSaved,
  onCancel,
}: {
  sources: LibraryItem[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const id = useRef(crypto.randomUUID());
  const titleEditor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    titleEditor.current?.focus();
  }, []);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [selectedSeeds, setSeeds] = useState<string[]>([]);
  const [takeaways, setTakeaways] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMode, setAiMode] = useState("unavailable");
  const [proposal, setProposal] = useState<DraftResult>();
  const [aiReceipt, setAiReceipt] = useState<string>();
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .status()
      .then((s) => {
        if (active) setAiMode(s.aiMode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [error, setError] = useState("");
  async function save() {
    const parsed = synthesisInput.safeParse({
      id: id.current,
      title,
      summary,
      seeds: selectedSeeds,
      takeaways: takeaways.split("\n").filter((value) => value.trim()),
      sourceIds: sources.map((item) => item.id),
      confirmed: true,
      aiReceipt,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await connectionsApi.synthesize(parsed.data);
      onSaved(saved.id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Synthesis could not be saved. Your draft is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="workspace-panel synthesis-form"
      aria-label="Manual synthesis"
    >
      <h2>Synthesize a larger insight</h2>
      <p>
        Manual synthesis works without AI. Nothing is saved until you explicitly
        approve it. The source Insights remain unchanged.
      </p>
      <h3>Source Insights being combined</h3>
      <ul>
        {sources.map((item) => (
          <li key={item.id}>
            <Link
              to={`/insights?insight=${item.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {item.title}
            </Link>
            <p className="preserve-text">{item.summary}</p>
            <p>{item.seeds.join(" · ") || "Unclassified"}</p>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      <p>
        {aiReceipt
          ? edited
            ? "AI draft edited by you · unconfirmed."
            : "AI-suggested draft · unconfirmed."
          : "User-authored draft · unconfirmed."}
      </p>
      {aiMode !== "openai" && (
        <p>
          Real AI drafting is unavailable. Manual synthesis remains fully
          available.
        </p>
      )}
      <button
        disabled={busy || aiBusy || aiMode !== "openai"}
        onClick={() => {
          setAiBusy(true);
          setError("");
          void aiApi
            .draft(sources.map((i) => i.id))
            .then(setProposal)
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "AI failed. Your draft and selection are unchanged.",
              ),
            )
            .finally(() => setAiBusy(false));
        }}
      >
        Draft synthesis with AI
      </button>
      {aiBusy && <p role="status">Requesting synthesis draft…</p>}
      {proposal && (
        <div className="suggestion">
          <h3>AI synthesis proposal — unconfirmed</h3>
          <h4>{proposal.draft.title}</h4>
          <p className="preserve-text">{proposal.draft.summary}</p>
          {!proposal.draft.seedRationale.length && (
            <p>No Seed suggested. Unclassified is valid.</p>
          )}
          <ul>
            {proposal.draft.seedRationale.map((s) => (
              <li key={s.seed}>
                {s.seed} — {s.rationale}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || aiBusy}
            onClick={() => {
              if (
                (title || summary || takeaways || selectedSeeds.length) &&
                !window.confirm(
                  "Replace the current synthesis draft and Seeds with this AI proposal?",
                )
              )
                return;
              setTitle(proposal.draft.title);
              setSummary(proposal.draft.summary);
              setTakeaways(proposal.draft.takeaways.join("\n"));
              setSeeds(proposal.draft.seeds);
              setAiReceipt(proposal.aiReceipt);
              setEdited(false);
            }}
          >
            Use AI synthesis draft
          </button>
        </div>
      )}
      {aiReceipt && (
        <button
          disabled={busy || aiBusy}
          onClick={() => setAiReceipt(undefined)}
        >
          Continue as a manual draft
        </button>
      )}
      <fieldset disabled={busy || aiBusy}>
        <label htmlFor="synthesis-title">Synthesis title</label>
        <textarea
          id="synthesis-title"
          ref={titleEditor}
          rows={3}
          value={title}
          onChange={(e) => {
            setEdited(true);
            setTitle(e.target.value);
          }}
        />
        <label htmlFor="synthesis-summary">Synthesis Insight text</label>
        <textarea
          id="synthesis-summary"
          rows={8}
          value={summary}
          onChange={(e) => {
            setEdited(true);
            setSummary(e.target.value);
          }}
        />
        <details>
          <summary>Seeds &amp; Takeaways (optional)</summary>
          <fieldset>
            <legend>Seeds — optional</legend>
            {seeds.map((seed) => (
              <label className="checkbox" key={seed}>
                <input
                  type="checkbox"
                  checked={selectedSeeds.includes(seed)}
                  onChange={(e) => {
                    setEdited(true);
                    setSeeds(
                      e.target.checked
                        ? [...selectedSeeds, seed]
                        : selectedSeeds.filter((value) => value !== seed),
                    );
                  }}
                />
                {seed}
              </label>
            ))}
          </fieldset>
          <label htmlFor="synthesis-takeaways">
            Takeaways (one per line, optional)
          </label>
          <textarea
            id="synthesis-takeaways"
            value={takeaways}
            onChange={(e) => {
              setEdited(true);
              setTakeaways(e.target.value);
            }}
          />
        </details>
        <button onClick={() => void save()}>
          Approve &amp; save synthesis
        </button>
        <button
          onClick={() => {
            if (
              (title || summary || takeaways) &&
              !window.confirm("Discard this unsaved synthesis draft?")
            )
              return;
            onCancel();
          }}
        >
          Cancel synthesis
        </button>
      </fieldset>
      {busy && <p role="status">Saving synthesis…</p>}
    </section>
  );
}
