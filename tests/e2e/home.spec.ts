import { expect, test } from "@playwright/test";

test("the app is Arabic and right-to-left", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("الأساس جاهز");
});

test("the count stepper updates the total", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "زيد كيكة" }).click();
  await expect(page.getByText("4 كيكات + 5 قطع")).toBeVisible();
});

test("tap targets are at least 48px tall", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }
});
