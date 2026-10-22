import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const base = "http://127.0.0.1:3102";
async function fixtures(request: APIRequestContext) {
  const token = `Theme fixture ${randomUUID()}`;
  const ids: string[] = [],
    sources: string[] = [];
  for (let n = 0; n < 3; n++) {
    const source = randomUUID();
    sources.push(source);
    expect(
      (
        await request.post(`${base}/api/conversations`, {
          data: {
            id: source,
            source: {
              originalText: `  Theme synthetic source ${n}\r\n`,
              relevantComments: "",
              sourceUrl: "",
              ...(n === 0
                ? {
                    person: {
                      name: "Fixture Person",
                      company: "Test company",
                      role: "",
                      linkedinUrl: "",
                    },
                  }
                : {}),
            },
          },
        })
      ).status(),
    ).toBe(201);
    const id = randomUUID();
    ids.push(id);
    expect(
      (
        await request.post(`${base}/api/conversations/${source}/insights`, {
          data: {
            id,
            title: `${token} ${n}`,
            summary: `Learned observation ${n}`,
            takeaways: [],
            seeds: n === 0 ? ["Progression"] : n === 1 ? ["Economics"] : [],
            themes: [],
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(201);
  }
  const synthesis = randomUUID();
  ids.push(synthesis);
  expect(
    (
      await request.post(`${base}/api/syntheses`, {
        data: {
          id: synthesis,
          title: `${token} synthesis`,
          summary: "A larger user-authored learning.",
          takeaways: [],
          seeds: [],
          sourceIds: ids.slice(0, 2),
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(201);
  return { ids, sources, token };
}

test("manual Theme creation, explicit membership, recurrence and removal work with AI unavailable and preserve existing data", async ({
  page,
  request,
}) => {
  const { ids, sources, token } = await fixtures(request);
  const before = await Promise.all(
    sources.map(async (id) =>
      (await request.get(`${base}/api/conversations/${id}`)).json(),
    ),
  );
  const synthesisBefore = await (
    await request.get(`${base}/api/insights/${ids[3]}`)
  ).json();
  await page.goto(`${base}/insights`);
  await page.getByRole("link", { name: "Themes", exact: true }).click();
  await page.getByLabel("Theme name", { exact: true }).fill(token);
  await page
    .getByLabel("Working definition (optional)")
    .fill("Evidence across different subjects and sources.");
  await page.getByRole("button", { name: "Save Theme", exact: true }).click();
  const detail = page.getByRole("region", {
    name: "Theme detail",
    exact: true,
  });
  await expect(
    detail.getByRole("heading", { name: token, exact: true }),
  ).toBeVisible();
  await expect(detail).toContainText(
    "0 Insights · from 0 distinct source conversations",
  );
  await expect(detail).toContainText("No Insights associated yet.");
  await page.getByLabel("Search Theme Insights and candidates").fill(token);
  for (const title of [
    `${token} 0`,
    `${token} 1`,
    `${token} 2`,
    `${token} synthesis`,
  ])
    await detail.getByLabel(`Select ${title}`, { exact: true }).check();
  await page
    .getByRole("button", { name: "Add selected Insights (4)", exact: true })
    .click();
  await expect(detail).toContainText(
    "4 Insights · from 3 distinct source conversations",
  );
  const members = page.getByRole("region", {
    name: "Associated Insights",
    exact: true,
  });
  await expect(members.getByRole("link")).toHaveCount(4);
  await expect(members).toContainText("Synthesized Insight");
  await expect(members).toContainText("Source-derived Insight");
  await expect(members).toContainText("Unclassified");
  await expect(members).toContainText("Progression");
  await expect(members).toContainText("Economics");
  await expect(members).toContainText("Fixture Person · Test company");
  await page.getByLabel("Filter Insights by Seed").selectOption("Unclassified");
  await expect(members.getByRole("link")).toHaveCount(2);
  await page.getByLabel("Filter Insights by Seed").selectOption("");
  await page
    .getByLabel("Search Theme Insights and candidates")
    .fill("no such learning");
  await expect(members).toContainText(
    "No associated Insights match your filters.",
  );
  await page.getByLabel("Search Theme Insights and candidates").fill(token);
  const row = members.locator("li").filter({
    has: page.getByRole("link", { name: `${token} 2`, exact: true }),
  });
  page.once("dialog", (dialog) => dialog.accept());
  await row
    .getByRole("button", { name: "Remove from Theme", exact: true })
    .click();
  await expect(detail).toContainText(
    "3 Insights · from 2 distinct source conversations",
  );
  await members
    .getByRole("link", { name: `${token} synthesis`, exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Synthesis lineage", exact: true }),
  ).toContainText("Synthesized from");
  await page.goBack();
  await expect(
    detail.getByRole("heading", { name: token, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Theme name", { exact: true })
    .fill(token.toUpperCase());
  await page.getByRole("button", { name: "Save Theme", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page.getByLabel("Theme name", { exact: true })).toHaveValue(
    token.toUpperCase(),
  );
  await page.getByLabel("Search Themes", { exact: true }).fill("no such theme");
  await expect(
    page.getByRole("region", { name: "Themes overview", exact: true }),
  ).toContainText("No Themes match your search.");
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    await Promise.all(
      sources.map(async (id) =>
        (await request.get(`${base}/api/conversations/${id}`)).json(),
      ),
    ),
  ).toEqual(before);
  expect(
    await (await request.get(`${base}/api/insights/${ids[3]}`)).json(),
  ).toEqual(synthesisBefore);
});

test("Theme API failures retain drafts and selections and can be retried without silent membership", async ({
  page,
  request,
}) => {
  const { token, ids } = await fixtures(request);
  await page.goto(`${base}/insights/themes`);
  await page.getByLabel("Theme name", { exact: true }).fill(token);
  await page
    .getByLabel("Working definition (optional)")
    .fill("Keep this draft.");
  await page.route("**/api/themes", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: "Temporary Theme failure" },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save Theme", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Temporary Theme failure",
  );
  await expect(page.getByLabel("Theme name", { exact: true })).toHaveValue(
    token,
  );
  await expect(page.getByLabel("Working definition (optional)")).toHaveValue(
    "Keep this draft.",
  );
  await page.unroute("**/api/themes");
  await page.getByRole("button", { name: "Save Theme", exact: true }).click();
  const detail = page.getByRole("region", {
    name: "Theme detail",
    exact: true,
  });
  await expect(
    detail.getByRole("heading", { name: token, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search Theme Insights and candidates")
    .fill(`${token} 0`);
  const choice = detail.getByLabel(`Select ${token} 0`, { exact: true });
  await choice.check();
  await page.route("**/api/themes/*/insights", (route) =>
    route.fulfill({ status: 503, json: { error: "Membership unavailable" } }),
  );
  await page
    .getByRole("button", { name: "Add selected Insights (1)", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Membership unavailable");
  await expect(choice).toBeChecked();
  await expect(detail).toContainText(
    "0 Insights · from 0 distinct source conversations",
  );
  await page.unroute("**/api/themes/*/insights");
  await page
    .getByRole("button", { name: "Add selected Insights (1)", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Associated Insights", exact: true })
      .getByRole("link", { name: `${token} 0`, exact: true }),
  ).toHaveAttribute("href", `/insights?insight=${ids[0]}`);
  const themeId = new URL(page.url()).searchParams.get("theme");
  await page.route(`**/api/themes/${themeId}`, (route) =>
    route.fulfill({ status: 500, json: { error: "Detail unavailable" } }),
  );
  await page.reload();
  await expect(detail.getByRole("alert")).toContainText("Detail unavailable");
  await page.unroute(`**/api/themes/${themeId}`);
  await page.getByRole("button", { name: "Retry Theme", exact: true }).click();
  await expect(
    detail.getByRole("heading", { name: token, exact: true }),
  ).toBeVisible();
});

test("Themes loading, empty, unavailable and no-match states are explicit", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/themes", async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/insights", (route) => route.fulfill({ json: [] }));
  await page.goto("/insights/themes");
  await expect(page.getByRole("status")).toHaveText("Loading Themes…");
  release();
  await expect(page.getByText(/No Themes yet/)).toBeVisible();
  await page.unroute("**/api/themes");
  await page.route("**/api/themes", (route) =>
    route.fulfill({
      status: 500,
      json: { error: "Themes database unavailable" },
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Themes database unavailable",
  );
  await page.unroute("**/api/themes");
  await page.route("**/api/themes", (route) => route.fulfill({ json: [] }));
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(page.getByText(/No Themes yet/)).toBeVisible();
  await page.goto(`/insights/themes?theme=${randomUUID()}`);
  await expect(
    page
      .getByRole("region", { name: "Theme detail", exact: true })
      .getByRole("alert"),
  ).toContainText("Theme not found");
});
