import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";

const exact =
  "  A manually supplied test conversation.\r\nActivity is not evidence of progression.  \t";
const comments = "  Relevant comment\r\nKeep exactly this wording.  ";
async function paste(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: false }).evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}
async function approveManual(page: Page, title: string) {
  await page.getByLabel("Insight title", { exact: true }).fill(title);
  await page
    .getByLabel("Insight summary", { exact: true })
    .fill(
      "The supplied conversation distinguishes activity from evidence of change.",
    );
  await page.getByRole("button", { name: "Approve & save Insight" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Approved Insight saved with provenance to this source.",
  );
  await expect(
    page
      .getByRole("region", { name: "Approved Insights" })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
}

test("source → development preview → editable response → explicitly approved Insight → reopen", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/post-workspace");
  await expect(
    page.getByText(
      "Preview mode — deterministic stub, not real AI. Review every word.",
    ),
  ).toBeVisible();
  await paste(page, "Original Post", exact);
  await page
    .getByLabel("Original Post", { exact: false })
    .press("ControlOrMeta+End");
  await page.getByLabel("Original Post", { exact: false }).press("x");
  await page.getByLabel("Original Post", { exact: false }).press("Backspace");
  await page.getByText("Relevant Comments (optional)", { exact: true }).click();
  await paste(page, "Relevant Comments", comments);
  await page
    .getByText("Provenance & person (optional)", { exact: true })
    .click();
  await page
    .getByLabel("LinkedIn URL Provenance only")
    .fill("https://www.linkedin.com/posts/test-provenance");
  await page.getByLabel("Person name", { exact: true }).fill("A named source");
  await page.getByLabel("Person role", { exact: true }).fill("Customer leader");
  await page.getByLabel("Company", { exact: true }).fill("Example company");
  await page
    .getByLabel("Person LinkedIn URL", { exact: true })
    .fill("https://www.linkedin.com/in/test-provenance");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Source saved exactly as supplied.",
  );
  const savedUrl = page.url();
  const id = new URL(savedUrl).searchParams.get("conversation");
  let data = await (await page.request.get(`/api/conversations/${id}`)).json();
  expect(data.originalText).toBe(exact);
  expect(data.relevantComments).toBe(comments);
  expect(data.insights).toEqual([]);
  await page
    .getByRole("button", { name: "Analyze source", exact: true })
    .click();
  await expect(
    page.getByText("No seed suggested. A lens is optional."),
  ).toBeVisible();
  await page
    .getByLabel("Our response", { exact: true })
    .fill("My editable response, not posted by this app.");
  await page.getByRole("button", { name: "Question", exact: true }).click();
  await expect(page.getByLabel("Our response", { exact: true })).toHaveValue(
    /what changed for the customer/,
  );
  await page
    .getByLabel("Our response", { exact: true })
    .fill("My final manually edited response.");
  await page.getByRole("button", { name: "Copy response" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("My final manually edited response.");
  await page
    .getByText("Suggested Insight (unconfirmed)", { exact: true })
    .click();
  await page.getByRole("button", { name: "Use suggested Insight" }).click();
  data = await (await page.request.get(`/api/conversations/${id}`)).json();
  expect(data.insights).toEqual([]);
  await approveManual(page, "Evidence before conclusions");
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Approved Insights" })
      .getByRole("heading", { name: "Evidence before conclusions" }),
  ).toBeVisible();
  await expect(page.getByLabel("Person name", { exact: true })).toHaveValue(
    "A named source",
  );
  data = await (await page.request.get(`/api/conversations/${id}`)).json();
  expect(data.originalText).toBe(exact);
  expect(data.relevantComments).toBe(comments);
  expect(data.insights[0]).toMatchObject({
    creationMethod: "user",
    userConfirmed: true,
  });
  await page.getByText(/Reopen saved conversations/).click();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByLabel("Original Post", { exact: false })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: new RegExp(id!.slice(0, 8)) }).click();
  await expect(
    page
      .getByRole("region", { name: "Approved Insights" })
      .getByRole("heading", { name: "Evidence before conclusions" }),
  ).toBeVisible();
  await page
    .getByLabel("Insight title", { exact: true })
    .fill("Unsaved draft for this conversation");
  await page.goBack();
  await expect(page.getByLabel("Original Post", { exact: false })).toHaveValue(
    "",
  );
  await expect(page.getByLabel("Insight title", { exact: true })).toHaveValue(
    "",
  );
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Evidence before conclusions" }),
  ).toBeVisible();
  await expect(page.getByLabel("Insight title", { exact: true })).toHaveValue(
    "",
  );
});

test("entire manual path works with AI unavailable and no person", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3102/post-workspace");
  await expect(
    page.getByText(
      "AI is not configured. Save source and capture a manual Insight at any time.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Original Post", { exact: false })
    .fill("  Manual source only.  ");
  await page
    .getByLabel("Original Post", { exact: false })
    .fill("  Edited before initial save.  ");
  await page
    .getByLabel("Our response", { exact: true })
    .fill("A response written entirely by the user.");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Source saved exactly as supplied.",
  );
  await expect(
    page.getByRole("button", { name: "Analyze source" }),
  ).toBeDisabled();
  await approveManual(page, "Manual learning without AI");
  const id = new URL(page.url()).searchParams.get("conversation");
  const data = await (
    await page.request.get(`http://127.0.0.1:3102/api/conversations/${id}`)
  ).json();
  expect(data.person).toBeUndefined();
  expect(data.relevantComments).toBe("");
  expect(data.originalText).toBe("  Edited before initial save.  ");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Manual learning without AI" }),
  ).toBeVisible();
});

test("assistance and persistence failures keep source, response and manual Insight edits", async ({
  page,
}) => {
  await page.goto("/post-workspace");
  await paste(page, "Original Post", exact);
  await page.route("**/api/conversations", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Test database unavailable." }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Test database unavailable.",
  );
  await expect(page.getByLabel("Original Post", { exact: false })).toHaveValue(
    exact.replace(/\r\n/g, "\n"),
  );
  await page.unroute("**/api/conversations");
  await page.getByRole("button", { name: "Save source", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Source saved exactly as supplied.",
  );
  await page
    .getByLabel("Our response", { exact: true })
    .fill("Keep my response.");
  await page
    .getByLabel("Insight title", { exact: true })
    .fill("Keep my manual draft.");
  await page.route("**/api/assist", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test assistance unavailable." }),
    }),
  );
  await page
    .getByRole("button", { name: "Analyze source", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Test assistance unavailable.",
  );
  await expect(page.getByLabel("Our response", { exact: true })).toHaveValue(
    "Keep my response.",
  );
  await expect(page.getByLabel("Insight title", { exact: true })).toHaveValue(
    "Keep my manual draft.",
  );
  await approveManual(page, "Manual fallback after failure");
});

test("browser assets and API responses contain no server credentials or provider code", async ({
  request,
}) => {
  const status = await (await request.get("/api/status")).json();
  expect(status).toEqual({ aiMode: "stub" });
  const assets = await readdir("dist/assets");
  for (const file of assets) {
    const content = await readFile(`dist/assets/${file}`, "utf8");
    expect(content).not.toContain("postgresql://");
    expect(content).not.toContain("DATABASE_URL");
    expect(content).not.toContain("AI_SERVICE_TOKEN");
    expect(content).not.toContain("pg-protocol");
  }
});
