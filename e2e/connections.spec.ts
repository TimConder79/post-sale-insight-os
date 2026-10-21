import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

async function fixtures(request: APIRequestContext, base = "") {
  const token = `Connections fixture ${randomUUID()}`;
  const ids: string[] = [],
    sources: string[] = [];
  for (let i = 0; i < 3; i++) {
    const source = randomUUID();
    sources.push(source);
    expect(
      (
        await request.post(`${base}/api/conversations`, {
          data: {
            id: source,
            source: {
              originalText: `  Synthetic observation ${i}\r\nPreserve exactly.  `,
              relevantComments: "  Comment\r\n",
              sourceUrl: "",
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
            title: `${token} ${i}`,
            summary: `A user-approved structural test learning ${i}.`,
            takeaways: [],
            seeds: i === 0 ? ["Progression"] : i === 1 ? ["Economics"] : [],
            themes: [],
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(201);
  }
  return { token, ids, sources };
}

test("connect from detail, inspect List/Map, reject duplicates and disconnect without changing Insights", async ({
  page,
  request,
}) => {
  const { ids, sources, token } = await fixtures(request);
  const before = await (
    await request.get(`/api/conversations/${sources[0]}`)
  ).json();
  await page.goto(`/insights?insight=${ids[0]}`);
  await page.getByRole("link", { name: "Connect this Insight" }).click();
  await expect(page.getByLabel("Insight A", { exact: true })).toHaveValue(
    ids[0],
  );
  await page
    .getByLabel("Search approved Insights", { exact: true })
    .fill(token);
  await page.getByLabel("Insight B", { exact: true }).selectOption(ids[2]);
  await page
    .getByLabel("Relationship", { exact: true })
    .selectOption("Supports");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Connection saved with your approval.",
  );
  const saved = page.getByRole("region", { name: "Saved connections" });
  const row = saved.locator("li").filter({
    has: page.getByRole("link", { name: `${token} 0`, exact: true }),
  });
  await expect(row).toContainText("Supports");
  await expect(row).toContainText("Unclassified");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("equivalent connection");
  await page
    .getByLabel("Relationship", { exact: true })
    .selectOption("Related to");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Connection saved with your approval.",
  );
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(
    page.getByLabel("Connections Map", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".react-flow__edge-text")
      .filter({ hasText: "Supports" })
      .first(),
  ).toBeVisible();
  await expect(
    page.locator(".relation-label").filter({ hasText: "Related to" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: false }).click();
  await page.getByRole("button", { name: "Fit view", exact: false }).click();
  await page
    .locator(".react-flow__node")
    .filter({
      has: page.getByRole("link", { name: `${token} 0`, exact: true }),
    })
    .getByRole("link", { name: `${token} 0`, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/insights\\?insight=${ids[0]}`));
  const links = await (await request.get("/api/connections")).json();
  const related = links.find(
    (edge: { relationship: string; insightA: string; insightB: string }) =>
      edge.relationship === "Related to" &&
      [edge.insightA, edge.insightB].includes(ids[0]) &&
      [edge.insightA, edge.insightB].includes(ids[2]),
  );
  expect(
    (await request.delete(`/api/connections/${related.id}`)).status(),
  ).toBe(200);
  await page.goto("/connections");
  await expect(
    page
      .getByRole("region", { name: "Saved connections" })
      .locator("li")
      .filter({ hasText: `${token} 0` }),
  ).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("region", { name: "Saved connections" })
    .locator("li")
    .filter({ hasText: `${token} 0` })
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Disconnected. Both Insights and their sources are unchanged.",
  );
  expect(
    await (await request.get(`/api/conversations/${sources[0]}`)).json(),
  ).toEqual(before);
});

test("manual synthesis with AI unavailable retains every selected source and appears as a first-class Insight", async ({
  page,
  request,
}) => {
  const base = "http://127.0.0.1:3102";
  const { sources, token } = await fixtures(request, base);
  const before = await (
    await request.get(`${base}/api/conversations/${sources[0]}`)
  ).json();
  await page.goto(`${base}/connections`);
  await page
    .getByLabel("Search approved Insights", { exact: true })
    .fill(token);
  await expect(
    page.getByRole("button", {
      name: "Synthesize a larger insight",
      exact: true,
    }),
  ).toBeDisabled();
  for (const i of [0, 2])
    await page
      .getByRole("checkbox", { name: `${token} ${i}`, exact: true })
      .check();
  await page
    .getByRole("button", { name: "Synthesize a larger insight", exact: true })
    .click();
  const form = page.getByRole("region", { name: "Manual synthesis" });
  await expect(form).toContainText("Manual synthesis works without AI");
  await expect(
    form.getByRole("link", { name: `${token} 0`, exact: true }),
  ).toBeVisible();
  await expect(
    form.getByRole("link", { name: `${token} 2`, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Synthesis title", { exact: true })
    .fill(`${token} synthesis`);
  await page
    .getByLabel("Synthesis Insight text", { exact: true })
    .fill("A larger user-written learning across these observations.");
  await page.route("**/api/syntheses", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Test synthesis save failure" },
    }),
  );
  await page.getByRole("button", { name: "Approve & save synthesis" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Test synthesis save failure",
  );
  await expect(page.getByLabel("Synthesis title", { exact: true })).toHaveValue(
    `${token} synthesis`,
  );
  await page.unroute("**/api/syntheses");
  await page.getByRole("button", { name: "Approve & save synthesis" }).click();
  const detail = page.getByRole("region", { name: "Selected Insight" });
  await expect(
    detail.getByRole("heading", { name: `${token} synthesis`, exact: true }),
  ).toBeVisible();
  await expect(detail).toContainText("Approved synthesized Insight");
  await expect(detail).toContainText("Unclassified");
  const lineage = detail.getByRole("region", { name: "Synthesis lineage" });
  await expect(lineage.getByRole("link")).toHaveCount(2);
  await lineage.getByRole("link", { name: `${token} 0`, exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Source provenance" }),
  ).toContainText("Synthetic observation 0");
  expect(
    await (await request.get(`${base}/api/conversations/${sources[0]}`)).json(),
  ).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/connections`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("empty workspace and API failure states do not block List access", async ({
  page,
}) => {
  await page.route("**/api/insights", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/connections", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/connections");
  await expect(
    page.getByText(/At least two approved Insights are needed/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No saved connections yet. Insights can remain unconnected.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.route("**/api/connections", (route) =>
    route.fulfill({ status: 500, json: { error: "Database unavailable" } }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Database unavailable");
  await expect(
    page.getByRole("button", { name: "List", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List", exact: true }),
  ).toBeEnabled();
});
