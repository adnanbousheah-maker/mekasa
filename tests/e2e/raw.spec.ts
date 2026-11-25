import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { ADMIN, FACTORY, signInAndWait } from "./support";

test("the storekeeper receives two materials from one supplier, and counts every day", async ({ page }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "استلام مواد من مورد" }).click();
  await expect(page.getByRole("heading", { name: "استلام من مورد" })).toBeVisible();
  // الصرف انسكّر (اجتماع 20 نوفمبر)
  await expect(page.getByRole("radio", { name: "صرف للإنتاج" })).toHaveCount(0);

  await page.getByRole("button", { name: "+ اختار المادة" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^طحين/ }).click();
  const flourLine = page.getByRole("listitem", { name: "طحين" });
  // الكيس (25 كيلو) مختار لحاله
  await expect(flourLine.getByRole("radio", { name: "كيس (25 كيلو)" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await flourLine.getByLabel("كمية طحين").fill("4");
  await expect(flourLine.getByText(/= 100 كيلو/)).toBeVisible();

  await page.getByRole("button", { name: "+ ضيف مادة ثانية" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^سكر/ }).first().click();
  const sugarLine = page.getByRole("listitem").filter({ has: page.getByLabel(/^كمية سكر/) });
  await sugarLine.getByRole("radio", { name: /^كيلو$/ }).click();
  await sugarLine.getByLabel(/^كمية سكر/).fill("10");

  await page.getByPlaceholder("اسم المورد").fill("المطاحن");
  await page.getByRole("button", { name: "سجّل استلام 2 مواد" }).click();
  await expect(page.getByText("انحفظت الحركة")).toBeVisible();
  await expect(page.getByRole("link", { name: "صرف" })).toHaveCount(0);

  const flour = page.getByRole("listitem", { name: "طحين" });
  await page.getByRole("link", { name: "جرد المواد اليومي" }).click();
  await expect(page.getByRole("heading", { name: "جرد المواد الأولية" })).toBeVisible();
  const countRow = page.getByRole("main").getByRole("listitem", { name: "طحين" });
  // أكثر من تعبئة لنفس المادة: 3 أكياس (25 كيلو) + 5 كيلو
  await countRow.getByRole("textbox", { name: "طحين كيس" }).fill("3");
  await countRow.getByRole("textbox", { name: "طحين كيلو" }).fill("5");
  await expect(countRow).toContainText("المجموع: 80 كيلو");
  await page.getByRole("button", { name: "تأكيد جرد المواد" }).click();
  // الجرد كامل: اللي ما انعدّ بينحسب صفر، بس بنسأل أول
  const missing = page.getByRole("dialog", { name: "في مواد ما عدّيتها" });
  await expect(missing).toBeVisible();
  await missing.getByRole("button", { name: "أكيد، ما في منهم" }).click();
  await expect(page.getByText("انحفظ جرد المواد")).toBeVisible();
  await expect(flour).toContainText("80 كيلو");
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
    // تعديل الاسم
    const renamed = `${name} بلدي`;
    await row.getByLabel(`اسم ${name}`).fill(renamed);
    await row.getByLabel(`اسم ${name}`).press("Enter");
    const renamedRow = page.getByRole("row", { name: new RegExp(renamed) });
    await expect(renamedRow.getByLabel(`اسم ${renamed}`)).toHaveValue(renamed);
    await renamedRow.getByRole("switch", { name: `${renamed} فعّالة` }).click();
    await expect(renamedRow.getByRole("switch")).toHaveAttribute("aria-checked", "false");
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
