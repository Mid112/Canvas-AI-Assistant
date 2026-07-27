import { expect, test } from "@playwright/test";

import {
  completeOnboardingWithCanvas,
  completeOnboardingWithoutCanvas,
  login,
  registerAndConnectCanvas,
  registerAndSkipCanvas,
  registerInstructor,
  uniqueEmail,
} from "../helpers/auth";

function mainHeading(page: import("@playwright/test").Page, name: string | RegExp) {
  return page.getByRole("main").getByRole("heading", { name });
}

test.describe("Instructor workflows (#711)", () => {
  test("register, skip Canvas, and land on assistant limited mode", async ({ page }) => {
    await registerAndSkipCanvas(page);
    await expect(mainHeading(page, "AI Assistant")).toBeVisible();
    await expect(page.getByText("Limited mode")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Chat message" }),
    ).toBeVisible();
  });

  test("instructor can open core nav pages without Canvas", async ({ page }) => {
    await registerAndSkipCanvas(page);

    const pages: { path: string; assert: () => Promise<void> }[] = [
      {
        path: "/instructor/dashboard",
        assert: async () => {
          await expect(mainHeading(page, "Dashboard")).toBeVisible();
        },
      },
      {
        path: "/instructor/courses",
        assert: async () => {
          await expect(
            page.getByRole("heading", { name: "Connect Canvas to continue" }),
          ).toBeVisible();
        },
      },
      {
        path: "/instructor/messages",
        assert: async () => {
          await expect(
            page.getByRole("heading", { name: "Connect Canvas to continue" }),
          ).toBeVisible();
        },
      },
      {
        path: "/instructor/history",
        assert: async () => {
          await expect(mainHeading(page, "Workflow Audit Log")).toBeVisible();
        },
      },
      {
        path: "/instructor/settings",
        assert: async () => {
          await expect(mainHeading(page, "Settings")).toBeVisible();
        },
      },
      {
        path: "/instructor/profile",
        assert: async () => {
          await expect(mainHeading(page, "Profile")).toBeVisible();
        },
      },
      {
        path: "/instructor/notifications",
        assert: async () => {
          await expect(
            page.getByRole("heading", { name: "Connect Canvas to continue" }),
          ).toBeVisible();
        },
      },
      {
        path: "/instructor/assignments/create",
        assert: async () => {
          await expect(mainHeading(page, "AI Assignment Creator")).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Connect Canvas to continue" }),
          ).toBeVisible();
        },
      },
    ];

    for (const target of pages) {
      await page.goto(target.path);
      await target.assert();
    }
  });

  test("register, connect Canvas, and land connected (not limited mode)", async ({
    page,
  }) => {
    await registerAndConnectCanvas(page);
    await expect(page).toHaveURL(/\/instructor\//);
    await expect(page.getByText("Limited mode")).toHaveCount(0);
    await page.goto("/instructor/assistant");
    await expect(mainHeading(page, "AI Assistant")).toBeVisible();
    await expect(page.getByText("Limited mode")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Chat message" }),
    ).toBeVisible();
  });

  test("instructor can open core nav pages with Canvas connected", async ({ page }) => {
    await registerAndConnectCanvas(page);

    await page.goto("/instructor/assistant");
    await expect(page).toHaveURL(/\/instructor\/assistant/);
    await expect(page.getByText("Limited mode")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();

    await page.goto("/instructor/settings");
    await expect(page).toHaveURL(/\/instructor\/settings/);
    await expect(mainHeading(page, "Settings")).toBeVisible();

    await page.goto("/instructor/courses");
    await expect(page).toHaveURL(/\/instructor\/courses/);
    await expect(
      page.getByRole("heading", { name: "Connect Canvas to continue" }),
    ).toHaveCount(0);
  });

  test("returning instructor can log in after registration", async ({ page }) => {
    const email = uniqueEmail("e2e_return");
    const password = "Secret123!";
    await registerInstructor(page, email, password);
    await completeOnboardingWithoutCanvas(page);

    // Clear only the auth token so onboarding completion stays in localStorage
    await page.evaluate((tokenKey) => {
      localStorage.removeItem(tokenKey);
      sessionStorage.clear();
    }, "access_token");

    await login(page, email, password);
    await expect(page).toHaveURL(/\/instructor\//);
  });

  test("returning instructor can log in after Canvas-connected registration", async ({
    page,
  }) => {
    const email = uniqueEmail("e2e_return_canvas");
    const password = "Secret123!";
    await registerInstructor(page, email, password);
    await completeOnboardingWithCanvas(page);

    await page.evaluate((tokenKey) => {
      localStorage.removeItem(tokenKey);
      sessionStorage.clear();
    }, "access_token");

    await login(page, email, password);
    await expect(page).toHaveURL(/\/instructor\//);
  });
});
