import { expect, test } from "@playwright/test";
import { ADMIN, signInAndWait } from "./support";

test.describe.configure({ mode: "serial" });
const laptop = { viewport: { width: 1360, height: 900 } };

test("global search finds pages, items and staff from the keyboard", async ({ browser }) => {
  const page = await browser.newPage(laptop);
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/counts");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: "بحث بالنظام" });
    await expect(dialog).toBeVisible();
    // بدون كتابة: آخر الصفحات
    await expect(dialog.getByRole("option", { name: /الجرودات/ })).toBeVisible();

    const box = dialog.getByRole("searchbox", { name: "اكتب للبحث" });
    await box.fill("Flan");
    await expect(dialog.getByRole("option", { name: /Flan/ })).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(/\/admin\/stock\?q=Flan/);
    await expect(page.getByRole("searchbox", { name: "الصنف" })).toHaveValue("Flan");

    await page.keyboard.press("Control+k");
    await box.fill("رنا");
    await expect(dialog.getByRole("option", { name: /رنا/ })).toBeVisible();
    await box.fill("الإعدادات");
    await expect(dialog.getByRole("option", { name: /الإعدادات/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  } finally {
    await page.close();
  }
});

test("filters live in the link, the export follows them, and a filter can be saved", async ({ browser }) => {
  const page = await browser.newPage(laptop);
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/staff");
    await page.waitForLoadState("networkidle");
    await page.getByRole("searchbox", { name: "الاسم أو الجوال أو اسم المستخدم" }).fill("رنا");
    await page.getByRole("button", { name: "طبّق" }).click();
    await expect(page).toHaveURL(/q=%D8%B1%D9%86%D8%A7|q=رنا/);
    await expect(page.getByRole("status").filter({ hasText: /عم يبين 1 من/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Excel/ })).toHaveAttribute("href", /export\/staff\?q=/);

    page.once("dialog", (d) => d.accept("موظفة الجبيهة"));
    await page.getByRole("button", { name: "☆ احفظ هالفلتر" }).click();
    await expect(page.getByRole("link", { name: "★ موظفة الجبيهة" })).toBeVisible();

    await page.getByRole("link", { name: "مسح الفلاتر" }).click();
    await expect(page).toHaveURL(/\/admin\/staff$/);
    await page.getByRole("link", { name: "★ موظفة الجبيهة" }).click();
    await expect(page.getByRole("status").filter({ hasText: /عم يبين 1 من/ })).toBeVisible();

    await page.goto("/admin/raw?low=1");
    await expect(page.getByRole("checkbox", { name: "تحت الحد الأدنى بس" })).toBeChecked();
    await expect(page.getByRole("link", { name: /Excel/ })).toHaveAttribute("href", /export\/raw\?low=1/);

    await page.goto("/admin/counts");
    await page.getByRole("combobox", { name: "الطريقة" }).selectOption({ label: "بالصورة" });
    await page.getByRole("button", { name: "طبّق" }).click();
    await expect(page).toHaveURL(/method=photo/);
  } finally {
    await page.close();
  }
});
