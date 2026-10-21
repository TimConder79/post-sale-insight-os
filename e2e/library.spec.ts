import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("five synthetic baseline Insights filter, preserve provenance and return from Post Workspace", async ({
  page,
  request,
}) => {
  const prefix = `Library fixture ${randomUUID()}`;
  const ids: string[] = [];
  const sources: string[] = [];
  const exact =
    "  Synthetic Sangram source — not a real LinkedIn post.\r\nKeep this exact wording.  ";
  for (const [index, seed] of [
    "Progression",
    "Progression",
    "Economics",
    "Predictability",
    null,
  ].entries()) {
    const sourceId = randomUUID();
    sources.push(sourceId);
    const source = await request.post("/api/conversations", {
      data: {
        id: sourceId,
        source: {
          originalText: index === 0 ? exact : `Synthetic source ${index}`,
          relevantComments: index === 0 ? "  Fixture comment\r\n  " : "",
          sourceUrl:
            index === 0 ? "https://www.linkedin.com/posts/fixture" : "",
          person:
            index === 0
              ? {
                  name: "Sangram (fixture)",
                  role: "",
                  company: "Fixture company",
                  linkedinUrl: "",
                }
              : index === 4
                ? {
                    name: "Tony Muise (fixture)",
                    role: "",
                    company: "",
                    linkedinUrl: "",
                  }
                : undefined,
        },
      },
    });
    expect(source.status()).toBe(201);
    const id = randomUUID();
    ids.push(id);
    const insight = await request.post(
      `/api/conversations/${sourceId}/insights`,
      {
        data: {
          id,
          title: `${prefix} ${index}`,
          summary: `A synthetic interpretation ${index}, separate from source text.`,
          takeaways: index === 0 ? ["An optional secondary takeaway"] : [],
          seeds: seed ? [seed] : [],
          themes: [],
          confirmed: true,
        },
      },
    );
    expect(insight.status()).toBe(201);
  }
  await page.goto(`/insights?q=${encodeURIComponent(prefix)}`);
  const results = page.getByRole("region", { name: "Insight results" });
  await expect(results.getByRole("heading")).toHaveCount(5);
  for (const [seed, count] of [
    ["Progression", 2],
    ["Economics", 1],
    ["Predictability", 1],
    ["Unclassified", 1],
  ] as const) {
    await page.getByLabel("Seed", { exact: true }).selectOption(seed);
    await expect(results.getByRole("heading")).toHaveCount(count);
  }
  await expect(
    results.getByText("Tony Muise (fixture)", { exact: true }),
  ).toBeVisible();
  await results.getByRole("link", { name: `${prefix} 4`, exact: true }).click();
  const detail = page.getByRole("region", { name: "Selected Insight" });
  await expect(detail.getByText("Unclassified", { exact: true })).toBeVisible();
  await expect(
    detail.getByText("No source URL recorded.", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("Takeaways (optional)", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Seed", { exact: true }).selectOption("Progression");
  await results.getByRole("link", { name: `${prefix} 0`, exact: true }).click();
  await expect(
    detail.getByRole("heading", { name: `${prefix} 0`, exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("An optional secondary takeaway", { exact: true }),
  ).not.toBeVisible();
  const provenance = page.getByRole("region", { name: "Source provenance" });
  expect(
    await provenance.locator("details[open] .preserve-text").textContent(),
  ).toBe(exact);
  await provenance
    .getByRole("link", { name: "Open source in Post Workspace" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/post-workspace\\?conversation=${sources[0]}`),
  );
  await expect(page.getByLabel("Original Post", { exact: false })).toHaveValue(
    exact.replace(/\r\n/g, "\n"),
  );
  await page.reload();
  await page.getByRole("link", { name: "Back to selected Insight" }).click();
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue(
    "Progression",
  );
  await expect(
    page
      .getByRole("region", { name: "Selected Insight" })
      .getByRole("heading", { name: `${prefix} 0`, exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/conversations/${sources[0]}`)).json())
      .originalText,
  ).toBe(exact);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Search Insights", { exact: true })
    .fill("Nothing matches this fixture");
  await expect(
    page.getByText("No Insights match these filters.", { exact: true }),
  ).toBeVisible();
});

test("empty, partial metadata and database failure states are clear and retryable", async ({
  page,
}) => {
  await page.route("**/api/insights?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/insights");
  await expect(page.getByText(/No approved Insights yet/)).toBeVisible();
  await page.route("**/api/insights?*", (route) =>
    route.fulfill({ status: 500, json: { error: "Database unavailable" } }),
  );
  await page.getByLabel("Search Insights", { exact: true }).fill("retry");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to load Insights",
  );
  await page.unroute("**/api/insights?*");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByText("No Insights match these filters.", { exact: true }),
  ).toBeVisible();
  const id = randomUUID();
  await page.route(`**/api/insights/${id}`, (route) =>
    route.fulfill({
      json: {
        id,
        title: "Partial metadata fixture",
        summary: "A valid approved interpretation.",
        seeds: [],
        takeaways: [],
        notes: "A user note",
        createdAt: "2026-10-21T12:00:00Z",
        favorite: false,
        people: [],
        sources: [
          {
            id: randomUUID(),
            originalText: "Exact fixture source",
            relevantComments: null,
            sourceUrl: null,
            person: null,
          },
        ],
      },
    }),
  );
  await page.goto(`/insights?insight=${id}`);
  await expect(
    page
      .getByRole("region", { name: "Selected Insight" })
      .getByRole("heading", { name: "Partial metadata fixture" }),
  ).toBeVisible();
  await expect(
    page.getByText("Person not recorded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No source URL recorded.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A user note", { exact: true })).toBeVisible();
  await page.unroute(`**/api/insights/${id}`);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Insight not found");
  await page
    .getByRole("navigation", { name: "Insights navigation" })
    .getByRole("link", { name: "Themes", exact: true })
    .click();
  await expect(
    page.getByText(
      "Themes is planned for a later phase. The Insights Library is available now.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Insights navigation" })
    .getByRole("link", { name: "Connections", exact: true })
    .click();
  await expect(
    page.getByText(
      "Connections is planned for a later phase. The Insights Library is available now.",
      { exact: true },
    ),
  ).toBeVisible();
});
