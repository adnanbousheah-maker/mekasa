import { expect, test } from "@playwright/test";
import { BRANCH_DBQ, FACTORY, TINY_PNG, lastWaste, signInAndWait, stockOf } from "./support";

test("a branch employee records broken cakes with a photo", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  const before = await stockOf("DBQ", "Classic Choco");

  await page.getByRole("link", { name: /تالف/ }).click();
  await expect(page.getByRole("heading", { name: "تسجيل تالف" })).toBeVisible();

  await page.getByRole("button", { name: "اختار الصنف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Classic Choco" }).click();
  // نستنى الشباك يتسكر، وإلا الكبسة على "زيد" بتضيع
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "زيد" }).click();
  await expect(page.getByRole("status", { name: "الكمية: 2" })).toBeVisible();
  await page.getByRole("radio", { name: "انكسرت" }).click();
  await page.getByLabel("أضف صورة (اختياري)").setInputFiles({
    name: "cake.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByText("انرفعت الصورة")).toBeVisible();

  await page.getByRole("button", { name: "سجّل 2 كيكة تالف" }).click();
  await expect(page.getByRole("heading", { name: "انسجل التالف" })).toBeVisible();

  expect(await stockOf("DBQ", "Classic Choco")).toBe(before - 20);
  const waste = await lastWaste("DBQ");
  expect(waste.qty_pieces).toBe(20);
  expect(waste.reason).toBe("broken");
  expect(waste.photo_path).toMatch(/^[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
});

test("other needs a note, and pieces-only products are counted in pieces", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.goto("/waste");
  await page.getByRole("button", { name: "اختار الصنف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tiramisu" }).click();
  await expect(page.getByRole("radio", { name: "كيكة كاملة" })).toBeHidden();
  await page.getByRole("radio", { name: "غيره" }).click();
  await page.getByRole("button", { name: "سجّل 1 قطعة تالف" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "اكتب شو صار" })).toBeVisible();

  await page.getByLabel("شو صار؟").fill("الزبون رجعها");
  await page.getByRole("button", { name: "سجّل 1 قطعة تالف" }).click();
  await expect(page.getByRole("heading", { name: "انسجل التالف" })).toBeVisible();
  const waste = await lastWaste("DBQ");
  expect(waste.reason_note).toBe("الزبون رجعها");
  expect(waste.qty_pieces).toBe(1);
});

test("the factory records waste on a batch", async ({ page }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.goto("/waste");
  await page.getByRole("button", { name: "اختار الصنف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Carrot" }).click();
  await page.getByRole("button", { name: "سجّل 1 كيكة تالف" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "اختار رقم الدفعة" })).toBeVisible();
  await page.getByRole("radiogroup", { name: "رقم الدفعة" }).getByRole("radio").last().click();
  await page.getByRole("button", { name: "سجّل 1 كيكة تالف" }).click();
  await expect(page.getByRole("heading", { name: "انسجل التالف" })).toBeVisible();
  expect((await lastWaste("FAC")).qty_pieces).toBe(10);
});
