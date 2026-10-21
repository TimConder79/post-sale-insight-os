import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { LibraryItem } from "../shared/library";
import type { Connection } from "../shared/connections";

const LazyMap = lazy(() =>
  import("./ConnectionMap").then((module) => ({
    default: module.ConnectionMap,
  })),
);
class MapBoundary extends Component<
  { children: ReactNode; onList: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        <p>
          The Map is unavailable. Your saved connections are safe and the List
          view remains available.
        </p>
        <button onClick={this.props.onList}>Use List view</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function MapPanel({
  insights,
  connections,
  onList,
}: {
  insights: LibraryItem[];
  connections: Connection[];
  onList: () => void;
}) {
  return (
    <MapBoundary onList={onList}>
      <Suspense fallback={<p role="status">Loading Map…</p>}>
        <LazyMap insights={insights} connections={connections} />
      </Suspense>
    </MapBoundary>
  );
}
