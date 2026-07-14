import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "AdminPass123!";

export function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10_000)}@example.com`;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export async function registerInstructor(page: Page, email: string, password = "Secret123!") {
  await page.goto("/register");
  await page.locator("#first-name").fill("E2E");
  await page.locator("#last-name").fill("Instructor");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirm-password").fill(password);
  await page
    .getByRole("checkbox", {
      name: "I agree to the Terms of Service and Privacy Policy",
    })
    .check();
  await page.getByRole("button", { name: "Create Account" }).click();
}

export async function completeOnboardingWithoutCanvas(page: Page) {
  await expect(page).toHaveURL(/\/canvas-info/);
  await page.getByRole("button", { name: "Proceed to Connect" }).click();
  await expect(page).toHaveURL(/\/connect-canvas/);
  await page.getByRole("button", { name: "Continue without connecting" }).click();
  await expect(page).toHaveURL(/\/instructor\/assistant/);
}

export async function registerAndSkipCanvas(page: Page) {
  const email = uniqueEmail("e2e_inst");
  const password = "Secret123!";
  await registerInstructor(page, email, password);
  await completeOnboardingWithoutCanvas(page);
  return { email, password };
}

export async function loginAsAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
}
