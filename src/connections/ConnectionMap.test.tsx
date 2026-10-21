import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { MapPanel } from "./MapPanel";

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  ReactFlow: () => {
    throw new Error("Simulated graph renderer failure");
  },
}));
it("keeps a usable route to List when the graph renderer fails", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const onList = vi.fn();
  try {
    render(
      <MemoryRouter>
        <MapPanel
          insights={[
            {
              id: "fixture",
              title: "Fixture Insight",
              summary: "Learning",
              seeds: [],
              people: [],
              favorite: false,
              isSynthesis: false,
              createdAt: "2026-10-21T00:00:00Z",
            },
          ]}
          connections={[]}
          onList={onList}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your saved connections are safe",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Use List view" }));
    expect(onList).toHaveBeenCalledOnce();
  } finally {
    consoleError.mockRestore();
  }
});
