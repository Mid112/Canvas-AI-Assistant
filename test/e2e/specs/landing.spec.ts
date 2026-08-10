import { expect, test } from "../fixtures";

test.describe("Landing & auth smoke (#687)", () => {
  test("landing page links to registration", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Manage Canvas Workflows Using Natural Language",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  });

  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });
});
