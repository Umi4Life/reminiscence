/**
 * E2E regression: create a board and verify the QR is shown immediately on
 * the detail page — without the admin needing to click "Rotate QR link".
 *
 * EXPECTED FAILURE on current code: AdminBoardControls only renders
 * img[alt="Queue access QR"] after the Rotate action is triggered manually.
 * These tests define the desired UX once the feature is shipped.
 *
 * DEPENDENCIES:
 *   - Backend PR: POST /api/admin/boards must return { board, credential }
 *   - UI PR: board detail page must render the initial QR from the create
 *     response without requiring a separate rotate step
 *   - Running stack: Postgres on :5433, API on :3002, admin-web on :3001
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

const ADMIN_URL = "http://localhost:3001";

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${ADMIN_URL}/`);
}

test.describe("admin board create → QR visible immediately (regression)", () => {
  test.describe.configure({ mode: "serial" });

  // Shared across serial tests.
  let adminPage: Page;
  let boardDetailUrl = "";

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    adminPage = await ctx.newPage();
  });

  test.afterAll(async () => {
    await adminPage.context().close();
  });

  test("admin creates a board and is redirected to its detail page", async () => {
    await adminLogin(adminPage);

    await adminPage.goto(`${ADMIN_URL}/boards/new`);
    await expect(adminPage.locator("h1.page-title")).toContainText("New board");

    // Use a stable-enough name; uniqueness ensured by a fixed prefix + test slug.
    const boardName = "E2E QR Regression Board";

    // If there are multiple venues a select is shown; pick the first available.
    const venueSelect = adminPage.locator("select").first();
    if (await venueSelect.isVisible()) {
      const options = await venueSelect.locator("option:not([disabled])").all();
      if (options.length > 0) {
        const value = await options[0]!.getAttribute("value");
        if (value) await venueSelect.selectOption(value);
      }
    }

    // Fill name — slugs auto-derive from it.
    await adminPage.getByLabel("Name").fill(boardName);
    // Ensure auto-slug is non-empty before submitting.
    await expect(adminPage.locator('input[pattern="[-a-z0-9._~]+"]').first()).not.toHaveValue("");

    await adminPage.getByRole("button", { name: "Create board" }).click();

    // Successful creation redirects to /boards/<uuid>.
    await expect(adminPage).toHaveURL(/\/boards\/[0-9a-f-]+$/, { timeout: 15_000 });
    boardDetailUrl = adminPage.url();
    expect(boardDetailUrl).toBeTruthy();
  });

  test("QR image is visible on the board detail page without manual rotate", async () => {
    // REGRESSION: img[alt="Queue access QR"] must appear immediately on the
    // newly-created board's page.
    // Old (broken) behavior: the QR is only shown after clicking "Rotate QR link".
    await adminPage.goto(boardDetailUrl);

    await expect(adminPage.locator('img[alt="Queue access QR"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("QR img src references the /qr/ endpoint (not a placeholder)", async () => {
    await adminPage.goto(boardDetailUrl);

    const qrImg = adminPage.locator('img[alt="Queue access QR"]');
    await expect(qrImg).toBeVisible();

    const src = await qrImg.getAttribute("src");
    // src must be a real /qr/<code>.svg path, not empty or a data URI stub.
    expect(src).toMatch(/\/qr\/[a-zA-Z0-9_-]+\.svg$/);
  });

  test("Download SVG and Download PNG actions are available on the new board", async () => {
    // Regression: these actions are only rendered when a credential is present.
    // Their presence confirms the QR is real and actionable without rotate.
    await adminPage.goto(boardDetailUrl);

    await expect(adminPage.getByRole("link", { name: "Download SVG" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Download PNG" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Open QR (print / save)" })).toBeVisible();
  });

  test("Rotate QR button is present and warns about REPLACING the existing QR (not first-time setup)", async () => {
    // The "Rotate QR link" button must still exist for regeneration use cases.
    // When clicked, the confirmation dialog must describe a replacement/revoke
    // of the current code — proving the board already has an active QR.
    await adminPage.goto(boardDetailUrl);

    // After creation with a credential, the button label is "Regenerate QR".
    const rotateBtn = adminPage.getByRole("button", { name: "Regenerate QR" });
    await expect(rotateBtn).toBeVisible();

    // Trigger the confirm dialog.
    await rotateBtn.click();

    // Dialog copy must reference the current QR stopping / being replaced.
    await expect(adminPage.getByText(/current QR.*stop working/i)).toBeVisible({ timeout: 5_000 });

    // Dismiss — no need to confirm.
    const cancelBtn = adminPage.getByRole("button", { name: /cancel/i });
    if (await cancelBtn.isVisible()) await cancelBtn.click();
  });
});
