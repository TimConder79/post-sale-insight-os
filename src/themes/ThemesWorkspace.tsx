import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { InsightsNavigation } from "../library/InsightsLibrary";
import { seeds } from "../shared/workspace";
import { createTheme } from "../shared/themes";
import type { Theme, ThemeDetail } from "../shared/themes";
import type { LibraryItem } from "../shared/library";
import { themesApi } from "./api";

function InsightContent({ item }: { item: LibraryItem }) {
  return (
    <>
      <p className="eyebrow">
        {item.isSynthesis ? "Synthesized Insight" : "Source-derived Insight"}
      </p>
      <h3>
        <Link to={`/insights?insight=${item.id}`}>{item.title}</Link>
      </h3>
      <p className="preserve-text">{item.summary}</p>
      <p className="seed-tags">
        {item.seeds.length ? item.seeds.join(" · ") : "Unclassified"}
      </p>
      {item.people.length > 0 && (
        <p>
          {item.people
            .map((p) => [p.name, p.company].filter(Boolean).join(" · "))
            .join("; ")}
        </p>
      )}
      <small>{new Date(item.createdAt).toLocaleDateString()}</small>
    </>
  );
}
export function ThemesWorkspace() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("theme") ?? "";
  const [themes, setThemes] = useState<Theme[]>([]);
  const [insights, setInsights] = useState<LibraryItem[]>([]);
  const [detail, setDetail] = useState<ThemeDetail>();
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createId, setCreateId] = useState(() => crypto.randomUUID());
  const [themeSearch, setThemeSearch] = useState("");
  const [insightSearch, setInsightSearch] = useState("");
  const [seed, setSeed] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setLoadError("");
      try {
        const [items, candidates] = await Promise.all([
          themesApi.list(controller.signal),
          themesApi.insights(controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setThemes(items);
          setInsights(candidates);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setLoadError(
            e instanceof Error ? e.message : "Unable to load Themes.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setDetail(undefined);
      setDetailError("");
      setLoadingDetail(Boolean(selected));
      setChosen([]);
      if (!selected) return;
      try {
        const value = await themesApi.detail(selected, controller.signal);
        if (!controller.signal.aborted) setDetail(value);
      } catch (e) {
        if (!controller.signal.aborted)
          setDetailError(
            e instanceof Error ? e.message : "Unable to load Theme.",
          );
      } finally {
        if (!controller.signal.aborted) setLoadingDetail(false);
      }
    });
    return () => controller.abort();
  }, [selected, retry]);
  async function mutate(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      setRetry((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const matches = (item: LibraryItem) =>
    (!seed ||
      (seed === "Unclassified"
        ? !item.seeds.length
        : item.seeds.includes(seed))) &&
    [
      item.title,
      item.summary,
      ...item.people.flatMap((p) => [p.name, p.company ?? ""]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(insightSearch.toLowerCase());
  const visibleThemes = themes.filter((t) =>
    `${t.name} ${t.description}`
      .toLowerCase()
      .includes(themeSearch.toLowerCase()),
  );
  const members = detail?.insights.filter(matches) ?? [];
  const candidates = insights.filter(
    (i) => !detail?.insights.some((m) => m.id === i.id) && matches(i),
  );
  return (
    <section aria-labelledby="themes-heading">
      <h1 id="themes-heading">Themes</h1>
      <InsightsNavigation />
      <p>
        Insight = what you learned. Seed = which part of your point of view it
        strengthens. Theme = what subject keeps appearing across conversations.
      </p>
      <p>
        Themes are yours to create and associate. Counts describe recurrence,
        not importance. No AI is required.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section aria-labelledby="create-theme-heading" className="theme-create">
        <h2 id="create-theme-heading">Create a Theme</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = createTheme.safeParse({
              id: createId,
              name,
              description,
              confirmed: true,
            });
            if (!parsed.success) {
              setError(parsed.error.issues.map((i) => i.message).join(" "));
              return;
            }
            void mutate(async () => {
              const value = await themesApi.create(parsed.data);
              setName("");
              setDescription("");
              setCreateId(crypto.randomUUID());
              setParams({ theme: value.id });
            }, "Theme created. Add Insights when you choose.");
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Theme name
              <input
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Working definition (optional)
              <textarea
                rows={2}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button type="submit">Save Theme</button>
          </fieldset>
        </form>
      </section>
      <label>
        Search Themes
        <input
          type="search"
          value={themeSearch}
          onChange={(e) => setThemeSearch(e.target.value)}
        />
      </label>
      {loading && <p role="status">Loading Themes…</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Retry loading</button>
        </div>
      )}
      <div className="themes-grid">
        <section aria-label="Themes overview">
          {!loading && !loadError && !visibleThemes.length && (
            <p>
              {themeSearch
                ? "No Themes match your search."
                : "No Themes yet. Create one when a subject is worth following."}
            </p>
          )}
          <ul className="theme-list">
            {visibleThemes.map((t) => (
              <li key={t.id}>
                <button
                  className="theme-select"
                  disabled={busy}
                  aria-current={selected === t.id ? "true" : undefined}
                  onClick={() => {
                    setParams({ theme: t.id });
                    setError("");
                    setNotice("");
                  }}
                >
                  {t.name}
                </button>
                {t.description && (
                  <p className="preserve-text">{t.description}</p>
                )}
                <p>
                  {t.insightCount} Insights · from {t.conversationCount}{" "}
                  distinct source conversations
                </p>
                <p className="seed-tags">
                  {t.seeds.join(" · ") ||
                    (t.insightCount
                      ? "Unclassified"
                      : "No associated Insights")}
                </p>
                {t.latestInsightAt && (
                  <small>
                    Latest associated Insight:{" "}
                    {new Date(t.latestInsightAt).toLocaleDateString()}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Theme detail" aria-busy={loadingDetail}>
          {!selected && (
            <p>Select a Theme to inspect the underlying Insights.</p>
          )}
          {loadingDetail && <p role="status">Loading Theme…</p>}
          {detailError && (
            <div role="alert">
              <p>{detailError}</p>
              <button onClick={() => setRetry((n) => n + 1)}>
                Retry Theme
              </button>
            </div>
          )}
          {detail && detail.id === selected && (
            <>
              <h2>{detail.name}</h2>
              {detail.description && (
                <p className="preserve-text">{detail.description}</p>
              )}
              <p>
                {detail.insightCount} Insights · from {detail.conversationCount}{" "}
                distinct source conversations
              </p>
              <p>
                Source conversations are deduplicated through synthesis lineage.
                Multiple Insights from one conversation count once; frequency
                does not establish importance.
              </p>
              <div className="library-filters">
                <label>
                  Search Theme Insights and candidates
                  <input
                    type="search"
                    value={insightSearch}
                    onChange={(e) => setInsightSearch(e.target.value)}
                  />
                </label>
                <label>
                  Filter Insights by Seed
                  <select
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  >
                    <option value="">All Seeds</option>
                    {[...seeds, "Unclassified"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <section aria-label="Associated Insights">
                <h2>Underlying Insights</h2>
                {!members.length && (
                  <p>
                    {detail.insights.length
                      ? "No associated Insights match your filters."
                      : "No Insights associated yet. Membership is optional."}
                  </p>
                )}
                <ul className="theme-list">
                  {members.map((item) => (
                    <li key={item.id}>
                      <InsightContent item={item} />
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove “${item.title}” from this Theme? The Insight remains unchanged.`,
                            )
                          )
                            void mutate(
                              () => themesApi.remove(detail.id, item.id),
                              "Association removed. The Insight is unchanged.",
                            );
                        }}
                      >
                        Remove from Theme
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label="Add Insights">
                <h2>Add existing approved Insights</h2>
                <p>
                  Association does not change Seeds or other Theme memberships.
                </p>
                {!candidates.length && (
                  <p>
                    {insights.length
                      ? "No available Insights match these filters. Already associated Insights appear above."
                      : "No approved Insights yet. Capture one in Post Workspace first."}
                  </p>
                )}
                <fieldset disabled={busy || loading || Boolean(loadError)}>
                  <legend>Select Insights to associate</legend>
                  <ul className="theme-list theme-candidates">
                    {candidates.map((item) => (
                      <li key={item.id}>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={chosen.includes(item.id)}
                            onChange={(e) =>
                              setChosen((v) =>
                                e.target.checked
                                  ? [...v, item.id]
                                  : v.filter((id) => id !== item.id),
                              )
                            }
                          />
                          Select {item.title}
                        </label>
                        <InsightContent item={item} />
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={!chosen.length}
                    onClick={() =>
                      void mutate(
                        () => themesApi.add(detail.id, chosen),
                        "Selected Insights associated. Seeds are unchanged.",
                      )
                    }
                  >
                    Add selected Insights ({chosen.length})
                  </button>
                </fieldset>
              </section>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
