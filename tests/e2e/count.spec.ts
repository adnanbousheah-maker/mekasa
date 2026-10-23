import { expect, test } from "@playwright/test";
import { dayNumberOf } from "../../src/lib/day-number";
import { businessDate } from "../../src/lib/time";
import { BRANCH_DBQ, FACTORY, signInAndWait, stockOf } from "./support";

test("a branch employee counts by hand and the stock follows the count", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.getByRole("navigation", { name: "المهام" }).getByRole("link", { name: /جرد/ }).click();
  await expect(page.getByText("كيف بدك تجرد؟")).toBeVisible();
  await page.getByRole("link", { name: /أدخل يدوي/ }).click();

  const choco = page.getByRole("listitem", { name: "Classic Choco" });
  await choco.getByRole("button", { name: "زيد كيكة Classic Choco" }).click();
  await choco.getByRole("button", { name: "زيد كيكة Classic Choco" }).click();
  await choco.getByRole("button", { name: "زيد قطعة Classic Choco" }).click();
  await expect(choco.getByRole("status", { name: "كيكات: 2" })).toBeVisible();

  const tiramisu = page.getByRole("listitem", { name: "Tiramisu" });
  await expect(tiramisu.getByText("قطع بس")).toBeVisible();
  await tiramisu.getByRole("button", { name: "زيد قطعة Tiramisu" }).click();

  await expect(page.getByText("20 صنف · 2 كيكة · 2 قطعة")).toBeVisible();
  await page.getByRole("button", { name: "تأكيد الجرد" }).click();

  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  await expect(page.getByText(/لـ دابوق انحفظ/)).toBeVisible();
  // 2 كيكة × 10 + قطعة
  expect(await stockOf("DBQ", "Classic Choco")).toBe(21);
  expect(await stockOf("DBQ", "Tiramisu")).toBe(1);

  await page.getByRole("link", { name: "رجوع للرئيسية" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BRANCH_DBQ.name);
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
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  expect(await stockOf("FAC", "Flan")).toBe(20);
});
