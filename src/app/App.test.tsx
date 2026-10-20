import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { App } from "./App";

const routes = [
  ["/", "Today"],
  ["/post-workspace", "Post Workspace"],
  ["/insights", "Insights Library"],
  ["/connections", "Connections"],
  ["/relationships", "Relationships"],
  ["/weekly-review", "Weekly Review"],
];
describe("Application routes", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]))),
    );
  });
  it.each(routes)("renders %s in the shared shell", (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: title })).toHaveAttribute(
      "aria-current",
      "page",
    );
    if (path !== "/post-workspace")
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("navigates between workspaces", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Insights Library" }));
    expect(
      screen.getByRole("heading", { name: "Insights Library" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    );
  });
  it("handles an unknown URL without losing navigation", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Today" })).toBeVisible();
  });
});
