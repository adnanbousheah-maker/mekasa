import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_JBH, cancelRequestsSince, deactivateProduct, signInAndWait, stockOf } from "./support";

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const first = `Sauce ${stamp}`;
const renamed = `Caramel Sauce ${stamp}`;

test.afterAll(async () => {
  await deactivateProduct(first);
  await deactivateProduct(renamed);
});

test("the admin adds a sauce and renames it", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/settings?tab=sauces");
    await page.getByRole("textbox", { name: "اسم الصوص" }).fill(first);
    await page.getByRole("button", { name: "+ صوص" }).click();
    await expect(page.getByRole("status").filter({ hasText: `انضاف: ${first}` })).toBeVisible();

    const name = page.getByRole("textbox", { name: `اسم ${first}` });
    await name.fill(renamed);
    await name.press("Enter");
    await expect(page.getByText("انحفظ").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: `اسم ${renamed}` })).toHaveValue(renamed);
    // ما بيطلع مع أصناف الكيك
    await page.goto("/admin/settings");
    await expect(page.getByRole("textbox", { name: `اسم ${renamed}` })).toHaveCount(0);
  } finally {
    await page.close();
  }
});

test("a branch orders a sauce with the cakes and counts its sauces", async ({ page }) => {
  const since = new Date().toISOString();
  try {
    await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
    await page.goto("/order");
    await expect(page.getByRole("heading", { name: "الصوصات" })).toBeVisible();
    await page.getByRole("textbox", { name: `عدد ${renamed}` }).fill("4");
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await expect(page.getByRole("dialog").getByText("4 حبة")).toBeVisible();
    await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
    await expect(page).toHaveURL(/\/orders\?sent=1/);

    await page.goto("/count");
    await page.getByRole("link", { name: "جرد الصوصات (آخر الشهر)" }).click();
    await page.getByRole("textbox", { name: `عدد ${renamed}` }).fill("3");
    await page.getByRole("button", { name: "تأكيد الجرد" }).click();
    // صوصات ثانية (من اختبارات قبل) ما انعدّت
    const sure = page.getByRole("button", { name: "أكيد، ما في منهم" });
    if (await sure.isVisible().catch(() => false)) await sure.click();
    await expect(page.getByText("انحفظ جرد الصوصات ✓")).toBeVisible();
    expect(await stockOf("JBH", renamed)).toBe(3);
  } finally {
    await cancelRequestsSince("JBH", since);
  }
});
