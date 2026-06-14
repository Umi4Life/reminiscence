import { expect, test } from "@playwright/test";

test("admin login page renders", async ({ page }) => {
  await page.goto("http://localhost:3001/login");
  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
});

test("public board not found renders", async ({ page }) => {
  await page.goto("http://localhost:3000/b/does-not-exist");
  await expect(page.getByText("Board not found")).toBeVisible();
});
