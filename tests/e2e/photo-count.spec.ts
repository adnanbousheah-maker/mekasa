import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_JBH, TINY_PNG, lastCount, signInAndWait } from "./support";

// قراءة الصورة بهالاختبارات وهمية (MEKASA_FAKE_OCR=1 بـ playwright.config.ts): السطر n بيرجع
// كيكات = (n-1) % 3، قطع = (n-1) % 4، والسطر الثاني مش أكيد.

test.describe("printed form", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin prints an A4 count form with its version code", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/settings?tab=schedule");
    const link = page.getByRole("region", { name: "الجبيهة" }).getByRole("link", { name: "اطبع الفورم" });
    await page.goto((await link.getAttribute("href"))!);

    const form = page.getByRole("article", { name: "فورم جرد فرع الجبيهة" });
    await expect(form.getByRole("heading", { name: "فورم جرد · فرع الجبيهة" })).toBeVisible();
    await expect(form.getByText(/^JBH-COUNT-v\d+$/)).toBeVisible();
    await expect(form.getByRole("img", { name: "رمز QR للموقع" }).locator("svg")).toBeVisible();
    await expect(form.getByRole("listitem")).toHaveCount(20);
    await expect(form.getByRole("listitem").first()).toContainText("Classic Choco");
  });
});

test("a branch counts from a photo of the form and confirms the numbers", async ({ page }) => {
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto("/count");
  await page.getByRole("link", { name: /صوّر الفورم/ }).click();
  await expect(page.getByRole("button", { name: "التقط الصورة" })).toBeVisible();

  await page
    .getByLabel("صورة الفورم")
    .setInputFiles({ name: "form.png", mimeType: "image/png", buffer: TINY_PNG });

  await expect(page.getByRole("heading", { name: "راجع الأرقام" })).toBeVisible();
  await expect(page.getByText("مش واضحين بالصورة، تأكد منهم")).toBeVisible();

  const red = page.getByRole("listitem", { name: "The Red One" });
  await expect(red.getByText("تأكد")).toBeVisible();
  // تصحيح الموظف بيشيل البرتقالي
  await red.getByRole("button", { name: "زيد كيكة The Red One" }).click();
  await expect(red.getByText("تأكد")).toBeHidden();

  await page.getByRole("button", { name: "تأكيد الجرد" }).click();
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();

  const count = await lastCount("JBH");
  expect(count.method).toBe("photo");
  expect(count.photo_path).toMatch(/\.jpg$/);
  expect(count.form_version_id).not.toBeNull();
  const redLine = count.stock_count_lines.find((l) => l.products?.name_en === "The Red One")!;
  // قرأ 1 (مش أكيد)، والموظف خلّاها 2: الاثنين محفوظين
  expect(redLine.ocr_whole_cakes).toBe(1);
  expect(redLine.whole_cakes).toBe(2);
});
