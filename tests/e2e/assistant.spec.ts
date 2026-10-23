import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH, signInAndWait } from "./support";

// المساعد بالاختبارات بدون Claude (MEKASA_FAKE_AI=1): الأدوات حقيقية، والجواب ثابت الشكل.
test.describe("assistant", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin asks about today's counts and gets an answer with its source", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.getByRole("link", { name: /اسأل المساعد/ }).click();
    const chat = page.getByRole("region", { name: "مساعد ميكاسا" });
    await chat.getByRole("button", { name: "مين ما جرد اليوم؟" }).click();
    await expect(chat.getByText(/المصدر: مواعيد جرد اليوم/)).toBeVisible();

    await chat.getByLabel("اكتب سؤالك").fill("مين ربح ماتش امبارح؟");
    await chat.getByRole("button", { name: "اسأل", exact: true }).click();
    await expect(chat.getByText("أنا بساعدك بس بأمور ميكاسا", { exact: false })).toBeVisible();
  });
});

test("staff cannot reach the assistant", async ({ page }) => {
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  await page.goto("/admin/ai");
  await expect(page).toHaveURL(/\/$/);
});
