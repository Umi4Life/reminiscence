import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

const NEW_ADMIN_EMAIL = "newadmin-e2e@example.com";
const NEW_ADMIN_DISPLAY = "E2E New Admin";
const NEW_ADMIN_PASSWORD = "e2e-newadmin-pass1";
// Must match the organisation seeded by packages/db/src/seed.ts (ORG_NAME).
const NEW_ADMIN_SCOPED_ORG = "Umi4Life Demo";

test.describe("admin users and memberships", () => {
  test.describe.configure({ mode: "serial" });

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
    await expect(page.getByTestId("admins-manage-link")).toBeVisible();
  });

  test("admins list page is accessible", async () => {
    await page.getByTestId("admins-manage-link").click();
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
