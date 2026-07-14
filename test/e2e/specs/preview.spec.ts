import { expect, test } from "@playwright/test";

import { registerAndSkipCanvas } from "../helpers/auth";

test.describe("Preview & confirmation workflows (#713)", () => {
  test("mock dry-run preview loads and can be approved", async ({ page }) => {
    await registerAndSkipCanvas(page);

    await page.goto("/instructor/actions/preview");
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Workflow Preview" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Review AI-generated actions before execution")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Modify Request" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & Execute" })).toBeVisible();

    await page.getByRole("button", { name: "Approve & Execute" }).click();
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Workflow Approved" }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("reject returns to the assistant gate", async ({ page }) => {
    await registerAndSkipCanvas(page);
    await page.goto("/instructor/actions/preview");
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Workflow Preview" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page).toHaveURL(/\/instructor\/assistant/);
  });
});
