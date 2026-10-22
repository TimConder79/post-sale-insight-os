import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
const draft = {
  title: "Proposed learning",
  summary: "User learning about evidence.",
  takeaways: [],
  seeds: [],
  themes: [],
};
const analysis = {
  mode: "openai",
  aiReceipt: "test-ui-receipt",
  seeds: [],
  themes: [],
  distinctions: ["An observation is not an outcome."],
  questions: [],
  comment: "A proposed response.",
  insight: draft,
};
// Browser fixtures exercise presentation/explicit approval. Server tests verify real signed receipts and DB writes.
test("real AI proposals never replace manual response/Insight drafts implicitly, and failures retain edits", async ({
  page,
  request,
}) => {
  const sourceId = randomUUID();
  await request.post("/api/conversations", {
    data: {
      id: sourceId,
      source: {
        originalText: "  Exact AI browser source\r\n",
        relevantComments: "",
        sourceUrl: "",
      },
    },
  });
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { aiMode: "openai" } }),
  );
  await page.route("**/api/assist", (route) =>
    route.fulfill({ json: analysis }),
  );
  await page.goto(`/post-workspace?conversation=${sourceId}`);
  await page
    .getByLabel("Our response", { exact: true })
    .fill("My response, keep it.");
  await page.getByLabel("Insight title", { exact: true }).fill("My draft");
  await page
    .getByLabel("Insight summary", { exact: true })
    .fill("My original learning");
  await page
    .getByRole("button", { name: "Analyze source", exact: true })
    .click();
  await expect(page.getByLabel("Our response", { exact: true })).toHaveValue(
    "My response, keep it.",
  );
  await expect(page.getByLabel("Insight title", { exact: true })).toHaveValue(
    "My draft",
  );
  const saved = await (
    await request.get(`/api/conversations/${sourceId}`)
  ).json();
  expect(saved.insights).toHaveLength(0);
  await page
    .getByText("Suggested Insight (unconfirmed)", { exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Use suggested Insight", exact: true })
    .click();
  await expect(page.getByLabel("Insight title", { exact: true })).toHaveValue(
    draft.title,
  );
  await page
    .getByLabel("Insight summary", { exact: true })
    .fill("Edited after AI");
  await expect(
    page.getByText("AI draft edited by you · unconfirmed until approval.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "AI failed; draft unchanged." },
    }),
  );
  await page
    .getByRole("button", { name: "Analyze source", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("AI failed");
  await expect(page.getByLabel("Insight summary", { exact: true })).toHaveValue(
    "Edited after AI",
  );
  await expect(page.getByLabel("Our response", { exact: true })).toHaveValue(
    "My response, keep it.",
  );
  let approved: Record<string, unknown> | undefined;
  await page.route(
    `**/api/conversations/${sourceId}/insights`,
    async (route) => {
      approved = route.request().postDataJSON();
      await route.fulfill({
        json: {
          ...saved,
          insights: [
            {
              ...approved,
              userConfirmed: true,
              creationMethod: "ai_then_edited",
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
    },
  );
  await page
    .getByRole("button", { name: "Approve & save Insight", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Approved Insights", exact: true }),
  ).toContainText("AI suggestion edited by user");
  expect(approved).toMatchObject({
    confirmed: true,
    aiReceipt: "test-ui-receipt",
    summary: "Edited after AI",
  });
  expect(
    (await (await request.get(`/api/conversations/${sourceId}`)).json())
      .originalText,
  ).toBe(saved.originalText);
});

test("Connection and existing Theme proposals require individual approval and allow zero suggestions", async ({
  page,
  request,
}) => {
  const id = randomUUID(),
    candidate = randomUUID(),
    theme = randomUUID(),
    source = randomUUID();
  await request.post("/api/conversations", {
    data: {
      id: source,
      source: {
        originalText: "Approved knowledge fixture",
        relevantComments: "",
        sourceUrl: "",
      },
    },
  });
  for (const insight of [id, candidate])
    await request.post(`/api/conversations/${source}/insights`, {
      data: { ...draft, id: insight, confirmed: true },
    });
  await request.post("/api/themes", {
    data: {
      id: theme,
      name: `AI Theme fixture ${randomUUID()}`,
      description: "Existing recurring subject",
      confirmed: true,
    },
  });
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { aiMode: "openai" } }),
  );
  await page.route("**/api/assist/knowledge", (route) =>
    route.fulfill({
      json: {
        connections: [
          {
            candidateId: candidate,
            title: "Candidate learning",
            summary: "Evidence from an approved Insight.",
            direction: "incoming",
            relationship: "Supports",
            rationale: "Candidate supports the subject learning.",
            aiReceipt: "connection-ui-receipt",
          },
        ],
        themes: [
          {
            themeId: theme,
            name: "Existing subject",
            rationale: "Shares the working subject.",
            aiReceipt: "theme-ui-receipt",
          },
        ],
        contextNote: "Bounded approved context.",
      },
    }),
  );
  let connections = 0,
    memberships = 0;
  await page.route("**/api/connections", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    connections++;
    expect(route.request().postDataJSON()).toMatchObject({
      insightA: candidate,
      insightB: id,
      confirmed: true,
      aiReceipt: "connection-ui-receipt",
    });
    await route.fulfill({ json: { id: randomUUID() } });
  });
  await page.route(`**/api/themes/${theme}/insights`, async (route) => {
    memberships++;
    expect(route.request().postDataJSON()).toMatchObject({
      insightIds: [id],
      confirmed: true,
      aiReceipt: "theme-ui-receipt",
    });
    await route.fulfill({ json: { id: theme } });
  });
  await page.goto(`/insights?insight=${id}`);
  await page
    .getByText("AI-assisted Connections & Themes", { exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "AI Connection and Theme suggestions",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Suggest Connections & Themes", exact: true })
    .click();
  await expect(panel).toContainText("Candidate supports the subject learning.");
  expect(connections).toBe(0);
  expect(memberships).toBe(0);
  await panel
    .getByRole("button", { name: "Approve Connection", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Connection approved", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Approve Theme association", exact: true })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Theme association approved",
      exact: true,
    }),
  ).toBeDisabled();
  expect(connections).toBe(1);
  expect(memberships).toBe(1);
  await page.route("**/api/assist/knowledge", (route) =>
    route.fulfill({ status: 503, json: { error: "AI suggestion failure" } }),
  );
  await panel
    .getByRole("button", { name: "Suggest Connections & Themes", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("AI suggestion failure");
  await expect(panel).toContainText("Candidate supports the subject learning.");
  await page.route("**/api/assist/knowledge", (route) =>
    route.fulfill({
      json: {
        connections: [],
        themes: [],
        contextNote: "No meaningful match.",
      },
    }),
  );
  await panel
    .getByRole("button", { name: "Suggest Connections & Themes", exact: true })
    .click();
  await expect(panel).toContainText("No Connection suggestions.");
  await expect(panel).toContainText("No Theme suggestions.");
});

test("AI synthesis is editable, preserves selected sources and manual Seeds on failure, and waits for approval", async ({
  page,
  request,
}) => {
  const token = `AI synthesis ${randomUUID()}`;
  const ids: string[] = [];
  const source = randomUUID();
  await request.post("/api/conversations", {
    data: {
      id: source,
      source: {
        originalText: "Synthesis browser source",
        relevantComments: "",
        sourceUrl: "",
      },
    },
  });
  for (let n = 0; n < 2; n++) {
    const id = randomUUID();
    ids.push(id);
    await request.post(`/api/conversations/${source}/insights`, {
      data: { ...draft, id, title: `${token} ${n}`, confirmed: true },
    });
  }
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { aiMode: "openai" } }),
  );
  await page.route("**/api/assist/synthesis", (route) => {
    expect(route.request().postDataJSON().sourceIds.sort()).toEqual(
      [...ids].sort(),
    );
    return route.fulfill({
      json: {
        draft: {
          title: "AI synthesis proposal",
          summary: "A larger observation.",
          takeaways: [],
          seeds: [],
          seedRationale: [],
        },
        aiReceipt: "synthesis-ui-receipt",
      },
    });
  });
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/syntheses", (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({
      status: 503,
      json: { error: "Save failed; retain draft" },
    });
  });
  await page.goto("/connections");
  await page
    .getByLabel("Search approved Insights", { exact: true })
    .fill(token);
  for (let n = 0; n < 2; n++)
    await page
      .getByRole("checkbox", { name: `${token} ${n}`, exact: true })
      .check();
  await page
    .getByRole("button", { name: "Synthesize a larger insight", exact: true })
    .click();
  const form = page.getByRole("region", {
    name: "Manual synthesis",
    exact: true,
  });
  await form
    .getByLabel("Synthesis title", { exact: true })
    .fill("Manual synthesis title");
  await form
    .getByLabel("Synthesis Insight text", { exact: true })
    .fill("Manual synthesis learning");
  await form.getByText("Seeds & Takeaways (optional)", { exact: true }).click();
  await form.getByLabel("Economics", { exact: true }).check();
  await form
    .getByRole("button", { name: "Draft synthesis with AI", exact: true })
    .click();
  await expect(
    form.getByText("AI synthesis proposal", { exact: true }),
  ).toBeVisible();
  await expect(form.getByLabel("Synthesis title", { exact: true })).toHaveValue(
    "Manual synthesis title",
  );
  expect(saved).toBeUndefined();
  await page.route("**/api/assist/synthesis", (route) =>
    route.fulfill({ status: 503, json: { error: "Provider unavailable" } }),
  );
  await form
    .getByRole("button", { name: "Draft synthesis with AI", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("Provider unavailable");
  await expect(form.getByLabel("Economics", { exact: true })).toBeChecked();
  for (let n = 0; n < 2; n++)
    await expect(
      form.getByRole("link", { name: `${token} ${n}`, exact: true }),
    ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await form
    .getByRole("button", { name: "Use AI synthesis draft", exact: true })
    .click();
  await form
    .getByLabel("Synthesis Insight text", { exact: true })
    .fill("My edited larger learning");
  await form
    .getByRole("button", { name: "Approve & save synthesis", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("Save failed");
  await expect(
    form.getByLabel("Synthesis Insight text", { exact: true }),
  ).toHaveValue("My edited larger learning");
  expect(saved).toMatchObject({
    aiReceipt: "synthesis-ui-receipt",
    confirmed: true,
    seeds: [],
  });
  expect([...(saved?.sourceIds as string[])].sort()).toEqual([...ids].sort());
});
