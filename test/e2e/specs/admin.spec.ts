import { expect, test } from "@playwright/test";

import { loginAsAdmin, uniqueEmail } from "../helpers/auth";

function mainHeading(page: import("@playwright/test").Page, name: string | RegExp) {
  return page.getByRole("main").getByRole("heading", { name });
}

test.describe("Administrator workflows (#712)", () => {
  test("admin can open dashboard, users, audit, and settings", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/admin/users");
    await expect(mainHeading(page, "User Management")).toBeVisible();
    await expect(page.getByRole("button", { name: "New Instructor" })).toBeVisible();

    await page.goto("/admin/audit");
    await expect(mainHeading(page, "Audit Logs")).toBeVisible();

    await page.goto("/admin/settings");
    await expect(mainHeading(page, "Admin Settings")).toBeVisible();

    await page.goto("/admin/profile");
    await expect(mainHeading(page, "Profile")).toBeVisible();

    await page.goto("/admin/system-health");
    await expect(mainHeading(page, /System Health/i)).toBeVisible();
  });

  test("admin can create an instructor account from User Management", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/users");

    const email = uniqueEmail("e2e_managed");
    await page.getByRole("button", { name: "New Instructor" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Create instructor account")).toBeVisible();

    await dialog.locator("#instructor-first-name").fill("Managed");
    await dialog.locator("#instructor-last-name").fill("Instructor");
    await dialog.locator("#instructor-email").fill(email);
    await dialog.locator("#instructor-temporary-password").fill("Managed123!");
    await dialog.getByRole("button", { name: "Create instructor" }).click();

    await expect(page.getByText(email).first()).toBeVisible({ timeout: 20_000 });
  });
});
