import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

const NEW_ADMIN_EMAIL = "newadmin-e2e@example.com";
const NEW_ADMIN_DISPLAY = "E2E New Admin";
const NEW_ADMIN_PASSWORD = "e2e-newadmin-pass1";
// Must match the organisation seeded by packages/db/src/seed.ts (ORG_NAME).
const NEW_ADMIN_SCOPED_ORG = "Umi4Life Demo";
// Must match the venue seeded by packages/db/src/seed.ts (VENUE_NAME).
const NEW_ADMIN_SCOPED_VENUE = "Local Demo Venue";

// A second scoped admin that the org-owner will manage in e2e tests.
const ORG_MEMBER_EMAIL = "orgmember-e2e@example.com";
const ORG_MEMBER_DISPLAY = "E2E Org Member";
const ORG_MEMBER_PASSWORD = "e2e-orgmember-pass1";

test.describe("admin users and memberships", () => {
  test.describe.configure({ mode: "serial" });

  // Super-admin page (persists across all tests in this describe block).
  let page: Page;
  // Org-owner context and page (persists across all org-owner tests).
  let orgOwnerCtx: BrowserContext;
  let orgOwnerPage: Page;

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
    await orgOwnerCtx?.close();
    await page.context().close();
  });

  // --- Super-admin baseline ---

  test("dashboard shows Admins and Venues sections for super-admin", async () => {
    await page.goto("http://localhost:3001/");
    await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible();
    await expect(page.getByTestId("admins-manage-link")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(page.getByTestId("venues-manage-link")).toBeVisible();
  });

  test("admins list page is accessible", async () => {
    await page.getByTestId("admins-manage-link").click();
    await expect(page).toHaveURL(/\/admins/);
    await expect(page.getByRole("heading", { name: "Admins" })).toBeVisible();
  });

  test("super-admin can create a new admin as an org-owner", async () => {
    // Creation now grants an initial membership atomically (chain of command):
    // pick the org_owner role + organisation scope on the create form.
    await page.goto("http://localhost:3001/admins/new");
    await page.locator('input[type="email"]').fill(NEW_ADMIN_EMAIL);
    await page.locator('input[type="text"]').fill(NEW_ADMIN_DISPLAY);
    await page.locator('input[type="password"]').fill(NEW_ADMIN_PASSWORD);
    await page.getByRole("combobox").first().selectOption("org_owner");
    await page.getByRole("combobox").nth(1).selectOption({ label: NEW_ADMIN_SCOPED_ORG });
    await page.getByRole("button", { name: "Create admin" }).click();
    await expect(page).toHaveURL(/\/admins\/[0-9a-f-]+$/);
    await expect(page.locator(".page-title")).toContainText(NEW_ADMIN_DISPLAY);
  });

  test("created admin shows the org_owner membership granted at creation", async () => {
    // Already on the admin detail page after creation; the membership was created
    // atomically with the user, so it appears without a separate assignment step.
    await expect(page.locator(".membership-list")).toBeVisible();
    await expect(page.locator(".membership-list")).toContainText(NEW_ADMIN_SCOPED_ORG);
  });

  test("super-admin can create a second scoped admin as venue_manager", async () => {
    await page.goto("http://localhost:3001/admins/new");
    await page.locator('input[type="email"]').fill(ORG_MEMBER_EMAIL);
    await page.locator('input[type="text"]').fill(ORG_MEMBER_DISPLAY);
    await page.locator('input[type="password"]').fill(ORG_MEMBER_PASSWORD);
    // venue_manager in the org's seeded venue so they appear in the org-owner's list.
    await page.getByRole("combobox").first().selectOption("venue_manager");
    await page.getByRole("combobox").nth(1).selectOption({ label: NEW_ADMIN_SCOPED_VENUE });
    await page.getByRole("button", { name: "Create admin" }).click();
    await expect(page).toHaveURL(/\/admins\/[0-9a-f-]+$/);
    await expect(page.locator(".page-title")).toContainText(ORG_MEMBER_DISPLAY);
    await expect(page.locator(".membership-list")).toBeVisible();
    await expect(page.locator(".membership-list")).toContainText(NEW_ADMIN_SCOPED_VENUE);
  });

  // --- Org-owner setup: log in once, reuse context for all org-owner tests ---

  test("org-owner can log in and see Admins and Venues entries on dashboard", async ({
    browser,
  }) => {
    orgOwnerCtx = await browser.newContext();
    orgOwnerPage = await orgOwnerCtx.newPage();
    await orgOwnerPage.goto("http://localhost:3001/login");
    await orgOwnerPage.locator('input[name="email"]').fill(NEW_ADMIN_EMAIL);
    await orgOwnerPage.locator('input[name="password"]').fill(NEW_ADMIN_PASSWORD);
    await orgOwnerPage.getByRole("button", { name: "Sign in" }).click();
    await expect(orgOwnerPage).toHaveURL("http://localhost:3001/");
    // Org-owner should see Admins section
    await expect(orgOwnerPage.getByRole("heading", { name: "Admins" })).toBeVisible();
    await expect(orgOwnerPage.getByTestId("admins-manage-link")).toBeVisible();
    // Org-owner owns venue setup for their organization before board setup.
    await expect(orgOwnerPage.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(orgOwnerPage.getByTestId("venues-manage-link")).toBeVisible();
    // Organizations section is super-admin only
    await expect(orgOwnerPage.getByRole("heading", { name: "Organizations" })).not.toBeVisible();
  });

  test("org-owner can reach venue management from dashboard", async () => {
    await orgOwnerPage.getByTestId("venues-manage-link").click();
    await expect(orgOwnerPage).toHaveURL(/\/venues/);
    await expect(orgOwnerPage.getByRole("heading", { name: "Venues" })).toBeVisible();
    await expect(orgOwnerPage.getByRole("link", { name: "New venue" }).first()).toBeVisible();
  });

  test("org-owner can list scoped admins and has a create button", async () => {
    // Navigate via the Manage link (SPA navigation keeps session warm)
    await orgOwnerPage.goto("http://localhost:3001/");
    await orgOwnerPage.getByTestId("admins-manage-link").click();
    await expect(orgOwnerPage).toHaveURL(/\/admins/);
    await expect(orgOwnerPage.getByRole("heading", { name: "Admins" })).toBeVisible();
    // Scoped list shows only admins in their org
    await expect(orgOwnerPage.getByText(NEW_ADMIN_DISPLAY)).toBeVisible();
    await expect(orgOwnerPage.getByText(ORG_MEMBER_DISPLAY)).toBeVisible();
    // Org-owners can now create admins (chain of command), so the link is present.
    await expect(orgOwnerPage.getByRole("link", { name: "New admin", exact: true })).toBeVisible();
  });

  test("org-owner can manage scoped admin and has no super-admin controls", async () => {
    // Click into the org member's detail
    await orgOwnerPage.getByText(ORG_MEMBER_DISPLAY).click();
    await expect(orgOwnerPage.locator(".page-title")).toContainText(ORG_MEMBER_DISPLAY);
    // The assign form must not expose the org_owner role to org-owners
    await expect(orgOwnerPage.locator('option[value="org_owner"]')).not.toBeAttached();
    // Org dropdown is scoped: only the org-owner's org appears
    const orgOptions = orgOwnerPage.locator("select").first().locator('option:not([value=""])');
    await expect(orgOptions).toHaveCount(1);
    await expect(orgOptions.first()).toHaveText(NEW_ADMIN_SCOPED_ORG);
  });

  test("org-owner can invite an admin into their org via membership assignment", async () => {
    // Still on ORG_MEMBER detail page; assign a venue-level role
    await orgOwnerPage.getByRole("combobox").nth(0).selectOption({ label: NEW_ADMIN_SCOPED_ORG });
    await orgOwnerPage.getByRole("combobox").nth(1).selectOption({ label: NEW_ADMIN_SCOPED_VENUE });
    await orgOwnerPage.getByRole("combobox").nth(2).selectOption("venue_staff");
    await orgOwnerPage.getByRole("button", { name: "Assign membership" }).click();
    // Membership list should update
    await expect(orgOwnerPage.locator(".membership-list")).toContainText(NEW_ADMIN_SCOPED_ORG);
  });

  // --- Super-admin cleanup ---

  test("super-admin can disable the new admin", async () => {
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
