import { expect, test } from "@playwright/test";
import {
  ADMIN,
  BRANCH_DBQ,
  PACKAGING,
  clearMinLevels,
  deactivateProduct,
  signInAndWait,
  stockOf,
} from "./support";

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
  await page.getByRole("button", { name: "أكيد، ما في منهم" }).click();
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

test("the packaging store has its own minimum, and the keeper sees what is low", async ({ browser }) => {
  try {
    const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=par");
    await admin
      .getByRole("navigation", { name: "الموقع" })
      .getByRole("link", { name: "مستودع التغليف" })
      .click();
    const field = admin.getByRole("textbox", { name: "الحد الأدنى لـ Cake Box بـمستودع التغليف" });
    await field.fill("100000");
    await field.press("Enter");
    await expect(admin.getByRole("alert").filter({ hasText: /رقم بين/ })).toBeVisible();
    await field.fill("5000");
    await field.press("Enter");
    await expect(admin.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
    await admin.goto("/admin");
    await expect(admin.getByText(/بـمستودع التغليف تحت الحد الأدنى/)).toBeVisible();
    await admin.close();

    const keeper = await browser.newPage();
    await signInAndWait(keeper, PACKAGING.phone, PACKAGING.pin);
    await keeper.goto("/packaging");
    await expect(keeper.getByRole("alert").filter({ hasText: "تحت الحد الأدنى" })).toContainText("Cake Box");
    await keeper.close();
  } finally {
    await clearMinLevels();
  }
});
