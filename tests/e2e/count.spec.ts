import { expect, test } from "@playwright/test";
import { dayNumberOf } from "../../src/lib/day-number";
import { businessDate } from "../../src/lib/time";
import { ADMIN, BRANCH_DBQ, FACTORY, signInAndWait, stockOf } from "./support";
import { confirmUncountedBatches } from "./support";

test("a branch employee counts by hand and the stock follows the count", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.getByRole("navigation", { name: "المهام" }).getByRole("link", { name: /جرد/ }).click();
  await expect(page.getByText("كيف بدك تجرد؟")).toBeVisible();
  await page.getByRole("link", { name: /أدخل يدوي/ }).click();

  const choco = page.getByRole("listitem", { name: "Classic Choco" });
  await choco.getByRole("button", { name: "زيد كيكة Classic Choco" }).click();
  await choco.getByRole("button", { name: "زيد كيكة Classic Choco" }).click();
  await choco.getByRole("button", { name: "زيد قطعة Classic Choco" }).click();
  await expect(choco.getByRole("textbox", { name: "كيكات" })).toHaveValue("2");

  const tiramisu = page.getByRole("listitem", { name: "Tiramisu" });
  await expect(tiramisu.getByText("قطع (قطع بس)")).toBeVisible();
  await tiramisu.getByRole("button", { name: "زيد قطعة Tiramisu" }).click();

  // الصفحة تحدّثت بنص الجرد: الأرقام بترجع
  await page.reload();
  await expect(page.getByText("رجّعنا الأرقام اللي كنت كاتبها")).toBeVisible();
  await expect(choco.getByRole("textbox", { name: "كيكات" })).toHaveValue("2");
  await expect(page.getByText("عدّيت 2 من 20 · كيكتين · قطعتين")).toBeVisible();
  await expect(choco.getByText("✓ انعدّ")).toBeVisible();
  await page.getByRole("button", { name: "تأكيد الجرد" }).click();
  // 18 صنف ما انعدّوا: تحذير قبل ما ينحسبوا صفر
  const missing = page.getByRole("dialog", { name: "في أصناف ما عدّيتها" });
  await expect(missing).toContainText("هدول الـ18");
  await missing.getByRole("button", { name: "ارجع وعدّهم" }).click();
  await expect(missing).toBeHidden();
  await page.getByRole("button", { name: "ما في Flan" }).click();
  await expect(page.getByText(/^عدّيت 3 من 20/)).toBeVisible();
  await page.getByRole("button", { name: "تأكيد الجرد" }).click();
  await missing.getByRole("button", { name: "أكيد، ما في منهم" }).click();

  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  await expect(page.getByText(/لـ دابوق انحفظ/)).toBeVisible();
  // 2 كيكة × 10 + قطعة
  expect(await stockOf("DBQ", "Classic Choco")).toBe(21);
  expect(await stockOf("DBQ", "Tiramisu")).toBe(1);

  await page.getByRole("link", { name: "رجوع للرئيسية" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BRANCH_DBQ.name);
});

test("the branch fixes its count within 15 minutes, and a too-big number is stopped", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.goto("/count");
  await page.getByRole("link", { name: /^عدّل آخر جرد \(باقي/ }).click();
  await expect(page.getByRole("heading", { name: "تعديل الجرد" })).toBeVisible();

  const choco = page.getByRole("listitem", { name: "Classic Choco" });
  const cakes = choco.getByRole("textbox", { name: "كيكات" });
  await expect(cakes).toHaveValue("2");
  // أكبر رقم كيكات 999: الخانة ما بتقبل أكثر
  await cakes.fill("5000");
  await expect(cakes).toHaveValue("999");
  await cakes.fill("3");
  await page.getByRole("button", { name: "احفظ التعديل (1 صنف)" }).click();
  await expect(page.getByRole("heading", { name: "انعدّل الجرد" })).toBeVisible();
  // كيكة زيادة = 10 قطع
  expect(await stockOf("DBQ", "Classic Choco")).toBe(31);
});

test("the factory counts blind, by day number", async ({ page }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "جرد المصنع" }).click();
  await expect(page.getByText("ما بنعرض الكمية المتوقعة")).toBeVisible();

  const flan = page.getByRole("listitem", { name: "Flan" });
  const today = dayNumberOf(businessDate(new Date()));
  const plus = flan.getByRole("button", { name: `زيد Flan رقم ${today}` });
  // دفعة اليوم بتبين إذا إلها ستوك من قبل، وإلا منضيفها
  if ((await plus.count()) === 0) {
    await flan.getByRole("button", { name: "ضيف رقم لـ Flan" }).click();
    await flan
      .getByRole("group")
      .getByRole("button", { name: `رقم ${today}` })
      .click();
  }
  // أي دفعة ثانية لـ Flan بتنعد صفر
  await plus.click();
  await plus.click();
  await expect(flan.getByText("المجموع: 2 كيكات")).toBeVisible();

  await page.getByRole("button", { name: "تأكيد جرد المصنع" }).click();
  await confirmUncountedBatches(page);
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  expect(await stockOf("FAC", "Flan")).toBe(20);
});

test("the admin adds a product that was missing from a factory count", async ({ page, browser }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "جرد المصنع" }).click();
  await page.getByRole("button", { name: "تأكيد جرد المصنع" }).click();
  await confirmUncountedBatches(page);
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  const countId = new URL(page.url()).searchParams.get("id")!;
  const before = await stockOf("FAC", "Carrot");

  const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto(`/admin/counts/${countId}`);
    await admin.getByRole("button", { name: "+ ضيف صنف ما انعدّ" }).click();
    const dialog = admin.getByRole("dialog", { name: "ضيف صنف للجرد" });
    await dialog.getByLabel("الصنف").selectOption({ label: "Carrot" });
    await dialog.getByLabel("كيكات").fill("3");
    await dialog.getByLabel("السبب").fill("كان موقوف وقت الجرد");
    await dialog.getByRole("button", { name: "ضيف للجرد" }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.getByRole("row", { name: /Carrot/ })).toBeVisible();
    await expect.poll(() => stockOf("FAC", "Carrot")).toBe(30);
    expect(before).toBeLessThanOrEqual(0);
  } finally {
    await admin.close();
  }
});
