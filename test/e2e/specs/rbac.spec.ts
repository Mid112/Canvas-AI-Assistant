import { expect, test } from "@playwright/test";

import { loginAsAdmin, registerAndConnectCanvas } from "../helpers/auth";

test.describe("Role-based access control (#714)", () => {
  test("instructor is redirected away from admin routes", async ({ page }) => {
    await registerAndConnectCanvas(page);

    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\//);
    await expect(page).toHaveURL(/\/instructor\//);
  });

  test("admin is redirected away from instructor routes", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/instructor/dashboard");
    await expect(page).not.toHaveURL(/\/instructor\//);
    await expect(page).toHaveURL(/\/admin\//);
  });

  test("unauthenticated users are sent to login for protected pages", async ({ page }) => {
    await page.goto("/instructor/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("guest route keeps authenticated admin off the login page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});
