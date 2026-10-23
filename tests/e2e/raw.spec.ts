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
});
