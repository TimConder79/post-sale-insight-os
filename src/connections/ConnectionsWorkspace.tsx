import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { InsightsNavigation } from "../library/InsightsLibrary";
import type { LibraryItem } from "../shared/library";
import {
  connectionInput,
  isSymmetric,
  relationshipTypes,
} from "../shared/connections";
import type { Connection } from "../shared/connections";
import { connectionsApi } from "./api";
import { MapPanel } from "./MapPanel";
import { SynthesisForm } from "./SynthesisForm";

export function ConnectionsWorkspace() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<LibraryItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [a, setA] = useState(params.get("from") ?? "");
  const [b, setB] = useState("");
  const [relationship, setRelationship] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"List" | "Map">("List");
  const [selected, setSelected] = useState<string[]>([]);
  const [synthesisSources, setSynthesisSources] = useState<LibraryItem[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const id = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    void Promise.all([connectionsApi.insights(), connectionsApi.list()])
      .then(([items, links]) => {
        if (active) {
          setInsights(items);
          setConnections(links);
          setLoading(false);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          setLoading(false);
          setError(
            error instanceof Error
              ? error.message
              : "Connections could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The request failed. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    const parsed = connectionInput.safeParse({
      id: id.current,
      insightA: a,
      insightB: b,
      relationship,
      confirmed: true,
    });
    if (!parsed.success) {
      setError(
        "Select two different approved Insights and a relationship type.",
      );
      return;
    }
    await run(async () => {
      await connectionsApi.create(parsed.data);
      id.current = crypto.randomUUID();
      setConnections(await connectionsApi.list());
      setNotice("Connection saved with your approval.");
    });
  }
  const matches = insights.filter((item) =>
    `${item.title} ${item.summary}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const byId = new Map(insights.map((item) => [item.id, item]));
  return (
    <section aria-labelledby="connections-heading">
      <h1 id="connections-heading">Connections</h1>
      <InsightsNavigation />
      <p>What are these Insights telling you together?</p>
      {loading && (
        <p role="status">Loading approved Insights and connections…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry loading
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loading && insights.length < 2 && (
        <p>
          At least two approved Insights are needed to connect or synthesize.
          Capture and approve Insights in Post Workspace first.
        </p>
      )}
      <div className="connections-compose">
        <section className="workspace-panel" aria-label="Choose Insights">
          <h2>Choose approved Insights</h2>
          <label>
            Search approved Insights
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {!loading && !matches.length && (
            <p>No approved Insights match this search.</p>
          )}
          <ul className="candidate-list">
            {matches.map((item) => (
              <li key={item.id}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    disabled={busy || !!synthesisSources}
                    checked={selected.includes(item.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, item.id]
                          : selected.filter((value) => value !== item.id),
                      )
                    }
                  />
                  <span>{item.title}</span>
                </label>
                <p className="preserve-text">{item.summary}</p>
                <p>{item.seeds.join(" · ") || "Unclassified"}</p>
                <Link to={`/insights?insight=${item.id}`}>Open Insight</Link>
              </li>
            ))}
          </ul>
          <button
            disabled={busy || selected.length < 2 || !!synthesisSources}
            onClick={() =>
              setSynthesisSources(
                insights.filter((item) => selected.includes(item.id)),
              )
            }
          >
            Synthesize a larger insight
          </button>
          <p>
            Select at least two Insights for manual synthesis. They do not need
            to share a Seed or have a saved connection.
          </p>
        </section>
        <section className="workspace-panel" aria-label="Connect Insights">
          <h2>Connect two Insights</h2>
          <p>
            Choose a relationship deliberately. Saving explicitly approves this
            connection.
          </p>
          <fieldset disabled={busy || loading || insights.length < 2}>
            <label htmlFor="insight-a">Insight A</label>
            <select
              id="insight-a"
              value={a}
              onChange={(e) => setA(e.target.value)}
            >
              <option value="">Choose source Insight</option>
              {insights
                .filter((item) => matches.includes(item) || item.id === a)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            <label htmlFor="insight-b">Insight B</label>
            <select
              id="insight-b"
              value={b}
              onChange={(e) => setB(e.target.value)}
            >
              <option value="">Choose another Insight</option>
              {insights
                .filter(
                  (item) =>
                    (matches.includes(item) || item.id === b) && item.id !== a,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
            <label htmlFor="relationship">Relationship</label>
            <select
              id="relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            >
              <option value="">Choose relationship</option>
              {relationshipTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <p>
              {isSymmetric(relationship)
                ? "This relationship is symmetric; reversing A and B is the same connection."
                : "A → B: A supports, extends, is an example of, or leads to B. Reversing the direction is a different relationship."}
            </p>
            <button onClick={() => void create()}>Save connection</button>
          </fieldset>
        </section>
      </div>
      {synthesisSources && (
        <SynthesisForm
          sources={synthesisSources}
          onSaved={(saved) => navigate(`/insights?insight=${saved}`)}
          onCancel={() => setSynthesisSources(undefined)}
        />
      )}
      <section aria-label="Saved connections">
        <h2>Saved connections</h2>
        <div className="button-row" aria-label="Connection views">
          {(["List", "Map"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {!loading && !connections.length && (
          <p>No saved connections yet. Insights can remain unconnected.</p>
        )}
        {view === "Map" ? (
          <>
            <p>
              Pan, zoom, fit, or drag nodes for this session. Click a node to
              open its Insight. Positions are not saved. The Map follows the
              Insight search above and shows connections between visible nodes.
            </p>
            <MapPanel
              insights={matches}
              connections={connections}
              onList={() => setView("List")}
            />
          </>
        ) : (
          <ul className="connection-list">
            {connections.map((edge) => (
              <li className="workspace-panel" key={edge.id}>
                <p>
                  <Link to={`/insights?insight=${edge.insightA}`}>
                    {byId.get(edge.insightA)?.title ?? "Insight unavailable"}
                  </Link>{" "}
                  <strong>
                    {isSymmetric(edge.relationship) ? "↔" : "→"}{" "}
                    {edge.relationship}
                  </strong>{" "}
                  <Link to={`/insights?insight=${edge.insightB}`}>
                    {byId.get(edge.insightB)?.title ?? "Insight unavailable"}
                  </Link>
                </p>
                <p className="preserve-text">
                  A: {byId.get(edge.insightA)?.summary}
                </p>
                <p>
                  A Seeds:{" "}
                  {byId.get(edge.insightA)?.seeds.join(" · ") || "Unclassified"}
                </p>
                <p className="preserve-text">
                  B: {byId.get(edge.insightB)?.summary}
                </p>
                <p>
                  B Seeds:{" "}
                  {byId.get(edge.insightB)?.seeds.join(" · ") || "Unclassified"}
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Disconnect these Insights? Only the relationship will be removed.",
                      )
                    )
                      return;
                    void run(async () => {
                      await connectionsApi.remove(edge.id);
                      setConnections((current) =>
                        current.filter((item) => item.id !== edge.id),
                      );
                      setNotice(
                        "Disconnected. Both Insights and their sources are unchanged.",
                      );
                    });
                  }}
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
