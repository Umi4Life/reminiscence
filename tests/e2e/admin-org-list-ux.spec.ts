import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/env";

const ADMIN_WEB = "http://localhost:3001";

test.describe("admin organization list UX", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto(`${ADMIN_WEB}/login`);
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${ADMIN_WEB}/`);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("organizations page loads with search and sort controls", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
    await expect(page.getByTestId("org-search-input")).toBeVisible();
    await expect(page.getByTestId("org-sort-select")).toBeVisible();
  });

  test("super-admin badge is visible for super-admin session", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);
    await expect(page.getByTestId("super-admin-badge")).toBeVisible();
    await expect(page.getByTestId("super-admin-badge")).toContainText("Super admin");
    await expect(page.getByTestId("super-admin-badge")).toContainText("global organization access");
  });

  test("count hint is shown when organizations are present", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);
    // Count hint appears when the list is non-empty
    const hint = page.getByTestId("org-count-hint");
    const orgList = page.locator(".org-list");
    const isEmpty = !(await orgList.isVisible());
    if (!isEmpty) {
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(/Showing \d+ organization|Loaded \d+ organization/);
    }
  });

  test("search input sends search query param in API request", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);

    const requestUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/organizations")) {
        requestUrls.push(req.url());
      }
    });

    const input = page.getByTestId("org-search-input");
    await input.fill("acme");
    // Wait for debounce (300ms) plus network round-trip
    await page.waitForTimeout(500);

    const searchRequest = requestUrls.find((u) => u.includes("search=acme"));
    expect(searchRequest).toBeTruthy();
  });

  test("sort control sends sort query param in API request", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);

    const requestUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/organizations")) {
        requestUrls.push(req.url());
      }
    });

    const select = page.getByTestId("org-sort-select");
    await select.selectOption("name_asc");
    await page.waitForTimeout(300);

    const sortRequest = requestUrls.find((u) => u.includes("sort=name_asc"));
    expect(sortRequest).toBeTruthy();
  });

  test("changing search resets list (no cursor in request)", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);

    const requestUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/organizations")) {
        requestUrls.push(req.url());
      }
    });

    const input = page.getByTestId("org-search-input");
    await input.fill("test");
    await page.waitForTimeout(500);

    const searchRequest = requestUrls.find((u) => u.includes("search=test"));
    // Search request must NOT include a cursor param (pagination was reset)
    if (searchRequest) {
      expect(new URL(searchRequest).searchParams.has("cursor")).toBe(false);
    }
  });

  test("changing sort resets list (no cursor in request)", async () => {
    await page.goto(`${ADMIN_WEB}/organizations`);

    const requestUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/organizations")) {
        requestUrls.push(req.url());
      }
    });

    await page.getByTestId("org-sort-select").selectOption("name_asc");
    await page.waitForTimeout(300);

    const sortRequest = requestUrls.find((u) => u.includes("sort=name_asc"));
    if (sortRequest) {
      expect(new URL(sortRequest).searchParams.has("cursor")).toBe(false);
    }
  });

  test("load more includes current search and sort params", async () => {
    // This test only runs meaningfully when enough organizations exist to
    // trigger pagination (nextCursor present). It validates the URL shape.
    await page.goto(`${ADMIN_WEB}/organizations`);

    const requestUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/admin/organizations")) {
        requestUrls.push(req.url());
      }
    });

    // Set sort to name_asc
    await page.getByTestId("org-sort-select").selectOption("name_asc");
    await page.waitForTimeout(300);

    const loadMoreBtn = page.getByRole("button", { name: "Load more" });
    if (await loadMoreBtn.isVisible()) {
      await loadMoreBtn.click();
      await page.waitForTimeout(300);

      const loadMoreRequest = requestUrls.find(
        (u) => u.includes("cursor=") && u.includes("sort=name_asc"),
      );
      expect(loadMoreRequest).toBeTruthy();
    }
  });
});
