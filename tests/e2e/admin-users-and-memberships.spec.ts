// BLOCKER: This e2e suite depends on API routes added in PR W3C (field/p17-admins-ui).
// These routes (GET/POST /api/admin/users, membership assign/revoke, password reset)
// are not present in `main` as of the time this PR was opened. The suite cannot
// run until the API PR (or a stack containing it) is merged and the test server
// is started against that code.
//
// What IS verified without the full stack:
//   - TypeScript types for all new API functions compile (checked via `bun run check`)
//   - The admin-web UI components exist and have correct slot/prop types
//   - The API route file (admin-users.ts) and service file (admin-user-management.ts)
//     compile as part of the API package build
//
// Once the API is available, remove this blocker comment and un-skip the tests.

import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

const NEW_ADMIN_EMAIL = "newadmin-e2e@example.com";
const NEW_ADMIN_DISPLAY = "E2E New Admin";
const NEW_ADMIN_PASSWORD = "e2e-newadmin-pass1";
const NEW_ADMIN_SCOPED_ORG = "Test Organisation";

test.describe("admin users and memberships", () => {
  test.describe.configure({ mode: "serial" });
  // SKIP until W3A/W3B API PRs are merged and server is running with admin-users routes.
  test.skip(
    true,
    "Blocked: requires API routes from field/p17-admins-ui (W3C) stack — API PRs not yet merged.",
  );

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto("http://localhost:3001/login");
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("http://localhost:3001/");
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("dashboard shows Admins section for super-admin", async () => {
    await page.goto("http://localhost:3001/");
    await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage", exact: false }).nth(1)).toBeVisible();
  });

  test("admins list page is accessible", async () => {
    await page.getByRole("link", { name: "Manage", exact: false }).nth(1).click();
    await expect(page).toHaveURL(/\/admins/);
    await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible();
  });

  test("super-admin can create a new admin", async () => {
    await page.goto("http://localhost:3001/admins/new");
    await page.locator('input[type="email"]').fill(NEW_ADMIN_EMAIL);
    await page.locator('input[type="text"]').fill(NEW_ADMIN_DISPLAY);
    await page.locator('input[type="password"]').fill(NEW_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Create admin" }).click();
    await expect(page).toHaveURL(/\/admins\/[0-9a-f-]+$/);
    await expect(page.locator(".page-title")).toContainText(NEW_ADMIN_DISPLAY);
  });

  test("super-admin can assign org-level membership", async () => {
    // Already on the admin detail page after creation
    await page.getByRole("combobox").nth(0).selectOption({ label: NEW_ADMIN_SCOPED_ORG });
    await page.getByRole("combobox").nth(2).selectOption("org_owner");
    await page.getByRole("button", { name: "Assign membership" }).click();
    await expect(page.locator(".membership-list")).toBeVisible();
    await expect(page.locator(".membership-list")).toContainText(NEW_ADMIN_SCOPED_ORG);
  });

  test("new admin can log in and see their assigned org", async () => {
    const freshCtx = await page.context().browser()!.newContext();
    const freshPage = await freshCtx.newPage();
    await freshPage.goto("http://localhost:3001/login");
    await freshPage.locator('input[name="email"]').fill(NEW_ADMIN_EMAIL);
    await freshPage.locator('input[name="password"]').fill(NEW_ADMIN_PASSWORD);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await expect(freshPage).toHaveURL("http://localhost:3001/");
    // Scoped admin should NOT see Admins section (not super-admin)
    await expect(freshPage.getByRole("heading", { name: "Admins" })).not.toBeVisible();
    await freshCtx.close();
  });

  test("super-admin can disable the new admin", async () => {
    // Navigate back to the admin detail page
    await page.goto("http://localhost:3001/admins");
    await page.getByText(NEW_ADMIN_DISPLAY).click();
    await page.getByRole("button", { name: "Disable this admin" }).click();
    await expect(page.locator(".status-badge.status-disabled")).toBeVisible();
  });

  test("disabled admin cannot log in", async () => {
    const freshCtx = await page.context().browser()!.newContext();
    const freshPage = await freshCtx.newPage();
    await freshPage.goto("http://localhost:3001/login");
    await freshPage.locator('input[name="email"]').fill(NEW_ADMIN_EMAIL);
    await freshPage.locator('input[name="password"]').fill(NEW_ADMIN_PASSWORD);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await expect(freshPage).toHaveURL(/\/login/);
    await freshCtx.close();
  });
});
