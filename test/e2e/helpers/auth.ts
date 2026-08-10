import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "AdminPass123!";

/** Live Canvas sandbox defaults (lbjay/canvas-docker). */
export const E2E_CANVAS_URL =
  process.env.E2E_CANVAS_URL?.trim() || "http://localhost:3000";
export const E2E_CANVAS_TOKEN =
  process.env.E2E_CANVAS_TOKEN?.trim() || "canvas-docker";

export function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10_000)}@example.com`;
}

export function requireLiveCanvasCredentials() {
  if (!E2E_CANVAS_TOKEN) {
    throw new Error(
      "E2E_CANVAS_TOKEN is required. Start canvas_lms and set a live token " +
        "(default sandbox token: canvas-docker).",
    );
  }
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

export async function completeOnboardingWithCanvas(
  page: Page,
  {
    canvasUrl = E2E_CANVAS_URL,
    canvasToken = E2E_CANVAS_TOKEN,
  }: { canvasUrl?: string; canvasToken?: string } = {},
) {
  requireLiveCanvasCredentials();

  await expect(page).toHaveURL(/\/canvas-info/);
  await page.getByRole("button", { name: "Proceed to Connect" }).click();
  await expect(page).toHaveURL(/\/connect-canvas/);

  await page.getByLabel("Canvas URL").fill(canvasUrl);
  await page.getByLabel(/Canvas API Token/i).fill(canvasToken);
  await expect(page.getByText("Token is valid")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Connect Canvas" }).click();

  await expect(page).toHaveURL(/\/review-permissions/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Approve & Continue" }).click();
  await expect(page).toHaveURL(/\/instructor\//, { timeout: 30_000 });
  await expect(
    page.getByRole("status").getByText("Limited mode", { exact: true }),
  ).toHaveCount(0);
}

export async function registerAndConnectCanvas(page: Page) {
  const email = uniqueEmail("e2e_inst");
  const password = "Secret123!";
  await registerInstructor(page, email, password);
  await completeOnboardingWithCanvas(page);
  return { email, password };
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
