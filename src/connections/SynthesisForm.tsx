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
      <fieldset disabled={busy}>
        <label htmlFor="synthesis-title">Synthesis title</label>
        <textarea
          id="synthesis-title"
          ref={titleEditor}
          rows={3}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="synthesis-summary">Synthesis Insight text</label>
        <textarea
          id="synthesis-summary"
          rows={8}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
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
                  onChange={(e) =>
                    setSeeds(
                      e.target.checked
                        ? [...selectedSeeds, seed]
                        : selectedSeeds.filter((value) => value !== seed),
                    )
                  }
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
            onChange={(e) => setTakeaways(e.target.value)}
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
