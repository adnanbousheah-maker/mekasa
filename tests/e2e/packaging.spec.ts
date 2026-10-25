import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_DBQ, PACKAGING, deactivateProduct, signInAndWait, stockOf } from "./support";

test.describe.configure({ mode: "serial" });

test("the admin adds a packaging item in settings", async ({ browser }) => {
  const name = `Ribbon ${Date.now()}`;
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/settings?tab=packaging");
    await page.getByRole("textbox", { name: "اسم مادة التغليف" }).fill(name);
    await page.getByRole("button", { name: "+ مادة تغليف" }).click();
    await expect(page.getByRole("status").filter({ hasText: `انضافت: ${name}` })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("0 حبة");
    // ما بتطلع مع أصناف الكيك
    await page.goto("/admin/settings?tab=products");
    await expect(page.getByText(name)).toHaveCount(0);
  } finally {
    await page.close();
    await deactivateProduct(name);
  }
});

test("a branch orders packaging, the keeper sends it, and the branch receives it", async ({ page }) => {
  // أمين التغليف بيجرد المستودع: 500 علبة
  await signInAndWait(page, PACKAGING.phone, PACKAGING.pin);
  await page.getByRole("link", { name: /جرد المستودع/ }).click();
  await page.getByRole("textbox", { name: "عدد Cake Box" }).fill("500");
  await page.getByRole("button", { name: "تأكيد الجرد" }).click();
  await expect(page.getByText("انحفظ جرد المستودع")).toBeVisible();
  expect(await stockOf("PKG", "Cake Box")).toBe(500);

  // الفرع بيطلب 50
  const branchBefore = await stockOf("DBQ", "Cake Box");
  await page.context().clearCookies();
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.getByRole("link", { name: /تغليف/ }).click();
  await page.getByRole("textbox", { name: "عدد Cake Box" }).fill("50");
  await page.getByRole("button", { name: "مراجعة الطلب" }).click();
  await expect(page.getByRole("dialog", { name: "راجع طلبك قبل الإرسال" })).toContainText("50 حبة");
  await page.getByRole("button", { name: "إرسال الطلب لمستودع التغليف" }).click();
  await expect(page.getByText("انبعت طلبك")).toBeVisible();
  await expect(page.getByText(/طلب تغليف/).first()).toBeVisible();

  // أمين التغليف بيطلّعه
  await page.context().clearCookies();
  await signInAndWait(page, PACKAGING.phone, PACKAGING.pin);
  await page.getByRole("link", { name: /طلبات التغليف/ }).click();
  await page
    .getByRole("listitem", { name: "طلب فرع دابوق" })
    .first()
    .getByRole("link", { name: "ابدأ الإخراج" })
    .click();
  await page.getByRole("textbox", { name: "اسم السائق" }).fill("أبو سامي");
  await page.getByRole("button", { name: "تأكيد الإخراج" }).click();
  await expect(page.getByRole("heading", { name: "مستودع التغليف" })).toBeVisible();
  expect(await stockOf("PKG", "Cake Box")).toBe(450);

  // الفرع بيستلم
  await page.context().clearCookies();
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.goto("/orders");
  await page.getByRole("link", { name: "استلم الطلبية" }).first().click();
  await page.getByRole("button", { name: "تأكيد Cake Box" }).click();
  await page.getByRole("checkbox", { name: /فحصت البضاعة قدام السائق/ }).check();
  await page.getByRole("button", { name: "تأكيد الاستلام" }).click();
  await expect(page.getByText("انسجل الاستلام")).toBeVisible();
  expect(await stockOf("DBQ", "Cake Box")).toBe(branchBefore + 50);
});
