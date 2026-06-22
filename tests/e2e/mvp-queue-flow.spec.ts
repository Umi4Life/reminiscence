import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

test.describe("MVP queue flow", () => {
  test.describe.configure({ mode: "serial" });

  let adminPage: Page;
  let publicPage: Page;
  let accessUrl = "";

  test.beforeAll(async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const publicCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    publicPage = await publicCtx.newPage();
  });

  test.afterAll(async () => {
    await adminPage.context().close();
    await publicPage.context().close();
  });

  test("admin logs in and sees CHUNITHM Gold on dashboard", async () => {
    await adminPage.goto("http://localhost:3001/login");
    await adminPage.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await adminPage.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Sign in" }).click();
    await expect(adminPage.getByText("CHUNITHM Gold")).toBeVisible();
  });

  test("admin opens board", async () => {
    await adminPage.getByText("CHUNITHM Gold").click();
    const openBtn = adminPage.getByRole("button", { name: "Open board" });
    const closeBtn = adminPage.getByRole("button", { name: "Close board" });
    // Wait for board page to load (either button must be visible)
    await expect(openBtn.or(closeBtn)).toBeVisible();
    // Close first if already open, so we exercise the open flow
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await adminPage.getByRole("dialog").getByRole("button", { name: "Close board" }).click();
      await expect(openBtn).toBeVisible();
    }
    // Clear any stale queue entries from prior runs
    await adminPage.getByRole("button", { name: "Reset queue" }).click();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Reset queue" }).click();
    await openBtn.click();
    await expect(closeBtn).toBeVisible();
  });

  test("admin generates QR link and reads access URL", async () => {
    await adminPage.getByRole("button", { name: "Generate QR" }).click();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Generate QR" }).click();
    const rotateUrlEl = adminPage.locator(".qr-card-url");
    await expect(rotateUrlEl).toBeVisible();
    accessUrl = (await rotateUrlEl.textContent())?.trim() ?? "";
    expect(accessUrl).toMatch(/\/q\//);
  });

  test("participant claims access via QR link", async () => {
    await publicPage.goto(accessUrl);
    await expect(publicPage).toHaveURL(/\/b\/local-demo-venue-chunithm-gold/);
    await expect(publicPage.getByRole("heading", { name: "CHUNITHM Gold" })).toBeVisible();
  });

  test("blocked cookies surface an honest notice instead of hidden controls", async () => {
    // A browser that blocks cookies still completes the claim server-side and
    // lands on the board with `?claimed=1`, but the session cookie never persists,
    // so the board read reports no mutation access. Reproduce that end state with a
    // fresh context (no session cookie) hitting the board with the claim marker.
    const origin = new URL(accessUrl).origin;
    const blockedCtx = await publicPage.context().browser()!.newContext();
    const blockedPage = await blockedCtx.newPage();
    await blockedPage.goto(`${origin}/b/local-demo-venue-chunithm-gold?claimed=1`);
    // The board is still viewable...
    await expect(blockedPage.getByRole("heading", { name: "CHUNITHM Gold" })).toBeVisible();
    // ...and the cookie problem is named explicitly rather than misreported as an
    // expired session, and the join form is not silently shown.
    await expect(
      blockedPage.getByText("Your browser is blocking cookies for this site"),
    ).toBeVisible();
    await expect(blockedPage.locator("#display-name")).toHaveCount(0);
    await blockedCtx.close();
  });

  test("participant adds Aki to queue", async () => {
    await publicPage.locator("#display-name").fill("Aki");
    await publicPage.getByRole("button", { name: "Join queue" }).click();
    await expect(publicPage.locator(".name", { hasText: "Aki" })).toBeVisible();
  });

  test("participant removes Aki from queue", async () => {
    await publicPage.getByRole("button", { name: "Remove" }).click();
    await publicPage.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(publicPage.getByText("No one is waiting yet.")).toBeVisible();
  });

  test("recent activity shows joined and left events on public page", async () => {
    await publicPage.getByRole("button", { name: /Recent Activity/ }).click();
    await expect(publicPage.getByText("Aki joined the queue.")).toBeVisible();
    await expect(publicPage.getByText("Aki left the queue.")).toBeVisible();
  });

  test("admin sees Aki events in event history", async () => {
    await adminPage.reload();
    await expect(adminPage.getByText("Aki joined the queue.")).toBeVisible();
    await expect(adminPage.getByText("Aki left the queue.")).toBeVisible();
  });
});
