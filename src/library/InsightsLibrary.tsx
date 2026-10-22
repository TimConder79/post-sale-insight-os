import { KnowledgeSuggestions } from "../ai/KnowledgeSuggestions";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { seeds } from "../shared/workspace";
import type { LibraryDetail, LibraryItem } from "../shared/library";

async function load<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Insight not found or unavailable in this workspace."
        : "Unable to load Insights. Check the local server/database and retry.",
    );
  return response.json() as Promise<T>;
}
export function InsightsNavigation() {
  return (
    <nav aria-label="Insights navigation">
      <NavLink to="/insights" end>
        Library
      </NavLink>
      <NavLink to="/connections">Connections</NavLink>
      <NavLink to="/insights/themes">Themes</NavLink>
    </nav>
  );
}
function SeedTags({ values }: { values: string[] }) {
  return (
    <p className="seed-tags">
      {(values.length ? values : ["Unclassified"]).map((seed) => (
        <span key={seed}>{seed}</span>
      ))}
    </p>
  );
}
function SourceUrl({ value }: { value: string }) {
  let safe = false;
  try {
    safe = ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    /* Legacy metadata is displayed as text if it is not a usable URL. */
  }
  return safe ? (
    <a href={value} target="_blank" rel="noreferrer">
      {value}
    </a>
  ) : (
    <span>{value}</span>
  );
}
export function InsightsLibrary() {
  const [params, setParams] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const q = params.get("q") ?? "";
  const seed = params.get("seed") ?? "";
  const selected = params.get("insight");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [detail, setDetail] = useState<LibraryDetail>();
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retry, setRetry] = useState(0);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key !== "insight" });
  }
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (seed) query.set("seed", seed);
    // Defer to an async boundary; cancellation prevents old filter results from replacing new ones.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setListError("");
      try {
        const result = await load<LibraryItem[]>(
          `/api/insights?${query}`,
          controller.signal,
        );
        if (!controller.signal.aborted) setItems(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setListError(
            error instanceof Error ? error.message : "Unable to load Insights.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [q, seed, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setDetail(undefined);
      setDetailError("");
      setLoadingDetail(Boolean(selected));
      if (!selected) return;
      try {
        const result = await load<LibraryDetail>(
          `/api/insights/${encodeURIComponent(selected)}`,
          controller.signal,
        );
        if (!controller.signal.aborted) setDetail(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setDetailError(
            error instanceof Error ? error.message : "Unable to load Insight.",
          );
      } finally {
        if (!controller.signal.aborted) setLoadingDetail(false);
      }
    });
    return () => controller.abort();
  }, [selected, retry]);
  useEffect(() => {
    if (detail?.id === selected) heading.current?.focus();
  }, [detail, selected]);
  return (
    <section aria-labelledby="library-heading">
      <h1 id="library-heading">Insights Library</h1>
      <InsightsNavigation />
      <p>What you learned, with the source kept close.</p>
      <div className="library-filters">
        <label>
          Search Insights
          <input
            type="search"
            maxLength={500}
            value={q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="Title, Insight text, notes or person/company"
          />
        </label>
        <div>
          <label htmlFor="library-seed">Seed</label>
          <select
            id="library-seed"
            value={seed}
            onChange={(e) => update("seed", e.target.value)}
          >
            <option value="">All Seeds</option>
            {[...seeds, "Unclassified"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="library-grid">
        <section aria-label="Insight results" aria-busy={loading}>
          {loading && <p role="status">Loading Insights…</p>}
          {listError && (
            <div role="alert">
              <p>{listError}</p>
              <button onClick={() => setRetry((value) => value + 1)}>
                Retry loading
              </button>
            </div>
          )}
          {!loading && !listError && !items.length && (
            <p>
              {q || seed
                ? "No Insights match these filters."
                : "No approved Insights yet. Capture and approve an Insight in Post Workspace to begin."}
            </p>
          )}
          {!loading && !listError && (
            <ul className="insight-list">
              {items.map((item) => (
                <li key={item.id} className="workspace-panel">
                  <h2>
                    <Link
                      to={{
                        pathname: "/insights",
                        search: (() => {
                          const next = new URLSearchParams(params);
                          next.set("insight", item.id);
                          return `?${next}`;
                        })(),
                      }}
                      aria-current={selected === item.id ? "true" : undefined}
                    >
                      {item.title}
                    </Link>
                  </h2>
                  {item.isSynthesis && <p>Synthesized Insight</p>}
                  <p className="preserve-text">{item.summary}</p>
                  <SeedTags values={item.seeds} />
                  {!!item.people.length && (
                    <p>
                      {item.people
                        .map((person) =>
                          [person.name, person.company]
                            .filter(Boolean)
                            .join(" · "),
                        )
                        .join("; ")}
                    </p>
                  )}
                  <p>
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                    {item.favorite ? " · Favorite" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className="workspace-panel insight-detail"
          aria-label="Selected Insight"
          aria-busy={loadingDetail}
        >
          {loadingDetail && <p role="status">Loading Insight…</p>}
          {detailError && (
            <div role="alert">
              <p>{detailError}</p>
              <button onClick={() => setRetry((value) => value + 1)}>
                Retry detail
              </button>
            </div>
          )}
          {!selected && (
            <p>
              Select an Insight to see what you learned and where it came from.
            </p>
          )}
          {selected &&
            detail?.id === selected &&
            !loadingDetail &&
            !detailError && (
              <>
                <p className="eyebrow">
                  {detail.isSynthesis
                    ? "Approved synthesized Insight"
                    : "Approved Insight"}
                </p>
                <h2 ref={heading} tabIndex={-1}>
                  {detail.title}
                </h2>
                <p className="preserve-text">{detail.summary}</p>
                <SeedTags values={detail.seeds} />
                <p>
                  Approved ·{" "}
                  {detail.creationMethod === "ai_then_edited"
                    ? "AI suggestion edited by user"
                    : detail.creationMethod === "ai_suggested"
                      ? "AI suggestion approved by user"
                      : "User-authored"}
                </p>
                <details>
                  <summary>AI-assisted Connections &amp; Themes</summary>
                  <KnowledgeSuggestions key={detail.id} insightId={detail.id} />
                </details>
                <Link to={`/connections?from=${detail.id}`}>
                  Connect this Insight
                </Link>
                {detail.isSynthesis && (
                  <section aria-label="Synthesis lineage">
                    <h3>Synthesized from</h3>
                    <ul>
                      {detail.synthesizedFrom.map((source) => (
                        <li key={source.id}>
                          <Link to={`/insights?insight=${source.id}`}>
                            {source.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Open a source Insight to follow its provenance to the
                      original conversations.
                    </p>
                  </section>
                )}
                {!!detail.takeaways.length && (
                  <details>
                    <summary>Takeaways (optional)</summary>
                    <ul>
                      {detail.takeaways.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {detail.notes && (
                  <section>
                    <h3>Notes</h3>
                    <p className="preserve-text">{detail.notes}</p>
                  </section>
                )}
                <section
                  className="insight-provenance"
                  aria-label="Source provenance"
                >
                  <h3>Source provenance</h3>
                  {!detail.sources.length && !detail.isSynthesis && (
                    <p>No source conversation is linked to this Insight.</p>
                  )}
                  {detail.sources.map((source) => (
                    <article key={source.id}>
                      <p>
                        {source.person
                          ? [source.person.name, source.person.company]
                              .filter(Boolean)
                              .join(" · ")
                          : "Person not recorded"}
                      </p>
                      <p>
                        {source.sourceUrl ? (
                          <SourceUrl value={source.sourceUrl} />
                        ) : (
                          "No source URL recorded."
                        )}
                      </p>
                      <Link
                        to={`/post-workspace?conversation=${encodeURIComponent(source.id)}`}
                        state={{ libraryReturn: `/insights?${params}` }}
                      >
                        Open source in Post Workspace
                      </Link>
                      <details open>
                        <summary>Original source text</summary>
                        <div className="preserve-text">
                          {source.originalText}
                        </div>
                      </details>
                      {source.relevantComments && (
                        <details>
                          <summary>Relevant comments</summary>
                          <div className="preserve-text">
                            {source.relevantComments}
                          </div>
                        </details>
                      )}
                    </article>
                  ))}
                </section>
              </>
            )}
        </section>
      </div>
    </section>
  );
}
