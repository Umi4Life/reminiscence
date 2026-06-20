import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

// NOTE: After a successful password change the API revokes other sessions and
// the seed password no longer works.  These tests must run in a fixed order and
// the suite restores the original password at the end so the other suites keep
// working.
const NEW_PASSWORD = "new-e2e-pw-1";

test.describe("account password change", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("admin can navigate to /account from the dashboard", async () => {
    await page.goto("http://localhost:3001/login");
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
    await page.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  });

  test("client-side validation: mismatched confirm password", async () => {
    await page.locator('input[name="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="new-password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirm-password"]').fill("does-not-match");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("alert")).toContainText("do not match");
  });

  test("client-side validation: new password too short", async () => {
    await page.locator('input[name="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="new-password"]').fill("short");
    await page.locator('input[name="confirm-password"]').fill("short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("alert")).toContainText("at least 8 characters");
  });

  test("client-side validation: new password same as current", async () => {
    await page.locator('input[name="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="new-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("alert")).toContainText("must differ");
  });

  test("wrong current password shows server error", async () => {
    await page.locator('input[name="current-password"]').fill("wrong-password");
    await page.locator('input[name="new-password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("successful password change shows confirmation", async () => {
    await page.locator('input[name="current-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="new-password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status")).toContainText("Password changed successfully");
  });

  test("old password no longer works", async () => {
    const freshCtx = await page.context().browser()!.newContext();
    const freshPage = await freshCtx.newPage();
    await freshPage.goto("http://localhost:3001/login");
    await freshPage.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await freshPage.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    // Should stay on /login (redirect did not happen) and show an error
    await expect(freshPage).toHaveURL(/\/login/);
    await freshCtx.close();
  });

  test("new password signs in successfully", async () => {
    const freshCtx = await page.context().browser()!.newContext();
    const freshPage = await freshCtx.newPage();
    await freshPage.goto("http://localhost:3001/login");
    await freshPage.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await freshPage.locator('input[name="password"]').fill(NEW_PASSWORD);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await expect(freshPage).toHaveURL("http://localhost:3001/");
    await freshCtx.close();
  });

  test("restore original password so other suites are unaffected", async () => {
    // The current session remains valid after changePassword (only other sessions are revoked),
    // so we can navigate directly to /account without re-logging in.
    await page.goto("http://localhost:3001/account");
    await expect(page).toHaveURL(/\/account/);
    await page.locator('input[name="current-password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="new-password"]').fill(ADMIN_PASSWORD);
    await page.locator('input[name="confirm-password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status")).toContainText("Password changed successfully");
  });
});
