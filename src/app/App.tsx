import { NavLink, Route, Routes } from "react-router-dom";

const screens = [
  { path: "/", title: "Today" },
  { path: "/post-workspace", title: "Post Workspace" },
  { path: "/insights", title: "Insights Library" },
  { path: "/connections", title: "Connections" },
  { path: "/relationships", title: "Relationships" },
  { path: "/weekly-review", title: "Weekly Review" },
];

function Placeholder({ title }: { title: string }) {
  return (
    <section aria-labelledby="page-title">
      <p className="eyebrow">Application foundation</p>
      <h1 id="page-title">{title}</h1>
      <p>This workspace is reserved for a future implementation phase.</p>
    </section>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header>
        <p className="brand">Post-Sale Insight OS</p>
        <nav aria-label="Primary navigation">
          {screens.map(({ path, title }) => (
            <NavLink key={path} to={path} end>
              {title}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          {screens.map(({ path, title }) => (
            <Route
              key={path}
              path={path}
              element={<Placeholder title={title} />}
            />
          ))}
          <Route
            path="*"
            element={
              <section>
                <h1>Page not found</h1>
                <p>Choose a workspace from the navigation.</p>
              </section>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
