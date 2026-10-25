import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { ADMIN, FACTORY, signInAndWait } from "./support";

test("the storekeeper receives flour in bags, issues some, and counts", async ({ page }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "استلام وصرف مواد" }).click();
  await page.getByRole("button", { name: "اختار المادة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^طحين/ }).click();
  // الكيس (25 كيلو) مختار لحاله بالاستلام
  await expect(page.getByRole("radio", { name: "كيس (25 كيلو)" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "زيد" }).click();
  await page.getByRole("button", { name: "زيد" }).click();
  await page.getByRole("button", { name: "زيد" }).click();
  await expect(page.getByText(/= 100 كيلو/)).toBeVisible();
  await page.getByPlaceholder("اسم المورد").fill("المطاحن");
  await page.getByRole("button", { name: "سجّل الاستلام" }).click();
  await expect(page.getByText("انحفظت الحركة")).toBeVisible();
  const flour = page.getByRole("listitem", { name: "طحين" });
  const before = Number((await flour.textContent())!.match(/([\d.]+) كيلو/)![1]);

  await page.getByRole("link", { name: "صرف" }).click();
  await page.getByRole("button", { name: "اختار المادة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^طحين/ }).click();
  await page.getByLabel("الكمية").fill("20");
  await page.getByRole("button", { name: "سجّل الصرف" }).click();
  await expect(page.getByText("انحفظت الحركة")).toBeVisible();
  await expect(flour).toContainText(`${before - 20} كيلو`);

  await page.getByRole("link", { name: "جرد" }).click();
  await page.getByLabel("كمية طحين").fill("3");
  await page.getByLabel("وحدة طحين").selectOption({ label: "كيس" });
  await page.getByRole("button", { name: "تأكيد جرد المواد" }).click();
  await expect(page.getByText("انحفظ جرد المواد")).toBeVisible();
  await expect(flour).toContainText("75 كيلو");
});

test.describe("admin", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin adds a material with a unit and sees the movements", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/raw");
    await expect(page.getByRole("heading", { name: "آخر الحركات" })).toBeVisible();
    await expect(page.getByText(/المطاحن/).first()).toBeVisible();

    const name = `فانيلا ${Date.now() % 100000}`;
    await page.getByRole("button", { name: "+ مادة جديدة" }).click();
    const dialog = page.getByRole("dialog", { name: "مادة جديدة" });
    await dialog.getByLabel("الاسم").fill(name);
    await dialog.getByLabel("الحد الأدنى").fill("2");
    await dialog.getByLabel("وحدة ثانية (اختياري)").fill("علبة");
    await dialog.getByLabel(/بتساوي كم/).fill("0.5");
    await dialog.getByRole("button", { name: "أضف المادة" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("علبة = 0.5 كيلو");
    await row.getByRole("switch", { name: `${name} فعّالة` }).click();
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect((await page.request.get("/admin/export/raw")).status()).toBe(200);
  });

  test("the admin counts raw materials from an Excel file", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    // القالب بينزل وفيه المواد الموجودة
    const template = await page.request.get("/admin/export/raw-template");
    expect(template.status()).toBe(200);
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(new Uint8Array(await template.body()).buffer);
    const sheet = read.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([, "الكود", "اسم المادة", "التعبئة", "الكمية"]);
    const flourRow = sheet.getColumn(2).values.indexOf("طحين");
    expect(sheet.getRow(flourRow).getCell(3).value).toBe("كيس 25 كيلو");

    // الملف: طحين بالكيس، مادة جديدة، وسطر غلط
    const name = `هيل ${Date.now() % 100000}`;
    const write = new ExcelJS.Workbook();
    const ws = write.addWorksheet("جرد");
    ws.addRow(["الكود", "اسم المادة", "التعبئة", "الكمية"]);
    ws.addRow(["", "طحين", "كيس 25 كيلو", 2]);
    ws.addRow(["", name, "علبة 0.25 كيلو", 8]);
    ws.addRow(["", "سكر", "كيس كبير", 1]);
    const file = Buffer.from(await write.xlsx.writeBuffer());

    await page.goto("/admin/raw");
    await page.getByRole("button", { name: "رفع جرد من Excel" }).click();
    const dialog = page.getByRole("dialog", { name: "جرد المواد من Excel" });
    await dialog.getByLabel("الملف").setInputFiles({
      name: "count.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: file,
    });
    const review = dialog.getByRole("table", { name: "مراجعة الجرد" });
    await expect(review.getByRole("row", { name: /طحين/ })).toContainText("50 كيلو");
    await expect(review.getByRole("row", { name: new RegExp(name) })).toContainText("جديدة");
    await expect(dialog.getByRole("alert")).toContainText("السطر 4");
    await dialog.getByRole("button", { name: /احفظ جرد 2 مواد \(1 جديدة\)/ }).click();
    await expect(dialog.getByRole("status")).toHaveText("انحفظ جرد 2 مواد.");
    await dialog.getByRole("button", { name: "تمام" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("2 كيلو");
  });
});
