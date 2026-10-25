import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH, signInAndWait, stockOf } from "./support";

test.describe.configure({ mode: "serial" });

test("branch counts Flan for the admin to review", async ({ page }) => {
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  await page.goto("/count/manual");
  const flan = page.getByRole("listitem", { name: "Flan" });
  for (let i = 0; i < 3; i++) await flan.getByRole("button", { name: "زيد كيكة Flan" }).click();
  await page.getByRole("button", { name: "تأكيد الجرد" }).click();
  await page.getByRole("button", { name: "أكيد، ما في منهم" }).click();
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();
  expect(await stockOf("SWF", "Flan")).toBe(30);
});

test.describe("admin dashboards", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin opens the count, corrects it with a reason, and the stock follows", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);

    // النظرة العامة
    await expect(
      page.getByRole("region", { name: "المواقع" }).getByRole("link", { name: "الصويفية" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "بدها انتباهك" })).toBeVisible();

    await page.getByRole("link", { name: "الجرودات", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/counts$/);
    await page.getByRole("link", { name: "الصويفية", exact: true }).click();
    await page
      .getByRole("link", { name: /^الصويفية ·/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("جرد الصويفية");

    const row = page.getByRole("row", { name: /Flan/ });
    await expect(row).toContainText("3 ك · 0 ق");

    await page.getByRole("button", { name: "تعديل الأرقام" }).click();
    await page.getByLabel("كيكات Flan").fill("2");
    const save = page.getByRole("button", { name: /حفظ التعديل/ });
    await expect(save).toBeDisabled();
    await page.getByLabel("سبب التعديل (إجباري)").fill("غلط بالعد");
    await save.click();

    await expect(row).toContainText("2 ك · 0 ق");
    await expect(page.getByText(/صحح Flan من 3 ك · 0 ق لـ 2 ك · 0 ق \(غلط بالعد\)/)).toBeVisible();
    expect(await stockOf("SWF", "Flan")).toBe(20);

    // الستوك
    await page.getByRole("link", { name: "الستوك والاستهلاك" }).click();
    await expect(page.getByRole("heading", { name: "الستوك والاستهلاك" })).toBeVisible();
    await page.getByLabel("بحث").fill("flan");
    await page.getByLabel("بحث").press("Enter");
    await expect(page.getByRole("row", { name: /Flan/ })).toContainText("2 ك · 0 ق");
    await expect(page.getByRole("row", { name: /Latte/ })).toHaveCount(0);

    // التصدير
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "تصدير Excel" }).click();
    const file = await (await download).path();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file!);
    const sheet = workbook.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    expect(sheet.getRow(1).getCell(1).value).toBe("الصنف");
  });

  test("the waste report and every export answer", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/waste?range=month");
    await expect(page.getByRole("heading", { name: "التالف" })).toBeVisible();
    await expect(page.getByText("التالف هالشهر")).toBeVisible();

    for (const report of ["stock", "stock?view=use", "counts", "waste?range=week", "staff"]) {
      const response = await page.request.get(`/admin/export/${report}`);
      expect(response.status(), report).toBe(200);
      expect(response.headers()["content-type"]).toContain("spreadsheetml");
    }
    expect((await page.request.get("/admin/export/nothing")).status()).toBe(404);
  });
});

test("staff cannot export", async ({ page }) => {
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  expect((await page.request.get("/admin/export/staff")).status()).toBe(403);
});
