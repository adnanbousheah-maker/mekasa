import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_JBH, FACTORY, serviceClient, signInAndWait } from "./support";

test.describe.configure({ mode: "serial" });
const laptop = { viewport: { width: 1360, height: 900 } };
const stamp = Date.now() % 100000;
const reason = `حرارة ${stamp}`;
const renamed = `حرارة الثلاجة ${stamp}`;
const supplier = `مورد ${stamp}`;
const category = `كيك شوكولا ${stamp}`;

test.afterAll(async () => {
  const db = serviceClient();
  await db.from("products").update({ category_id: null }).eq("name_en", "Classic Choco");
  await db
    .from("lookup_options")
    .update({ is_active: false })
    .in("name", [renamed, reason, supplier, category]);
});

test("the admin adds a waste reason and the branch uses it", async ({ browser }) => {
  const admin = await browser.newPage(laptop);
  try {
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=lists&list=waste_reasons");
    await expect(admin.getByRole("row", { name: /انتهت/ })).toBeVisible();
    await admin.getByRole("textbox", { name: "خيار جديد بـأسباب التالف" }).fill(reason);
    await admin.getByRole("button", { name: "+ أضف" }).click();
    await expect(admin.getByRole("status").filter({ hasText: `انضاف: ${reason}` })).toBeVisible();
    const icon = admin.getByRole("textbox", { name: `أيقونة ${reason}` });
    await icon.fill("🌡");
    await icon.press("Enter");
    await expect(admin.getByRole("row", { name: new RegExp(reason) }).getByText("انحفظ")).toBeVisible();
    // الأساسي ما بينحذف
    await expect(admin.getByRole("button", { name: "احذف انتهت" })).toHaveCount(0);
  } finally {
    await admin.close();
  }

  const page = await browser.newPage();
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto("/waste");
  await page.getByRole("button", { name: "اختار الصنف" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Classic Choco" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("radio", { name: reason }).click();
  await page.getByRole("button", { name: "سجّل كيكة تالفة" }).click();
  await expect(page.getByRole("heading", { name: "انسجل التالف" })).toBeVisible();
  await page.close();

  // إعادة التسمية بتبين بالتاريخ، والمستعمل ما بينحذف
  const again = await browser.newPage(laptop);
  try {
    await signInAndWait(again, ADMIN.phone, ADMIN.pin);
    await again.goto("/admin/settings?tab=lists&list=waste_reasons");
    const name = again.getByRole("textbox", { name: `اسم ${reason}` });
    await name.fill(renamed);
    await name.press("Enter");
    await expect(again.getByRole("row", { name: new RegExp(renamed) }).getByText("انحفظ")).toBeVisible();
    await expect(again.getByRole("button", { name: `احذف ${renamed}` })).toHaveCount(0);
    await again.goto("/admin/waste");
    await expect(again.getByText(renamed).first()).toBeVisible();
  } finally {
    await again.close();
  }
});

test("a supplier from the list shows on the factory receipt", async ({ browser }) => {
  const admin = await browser.newPage(laptop);
  try {
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=lists&list=suppliers");
    await admin.getByRole("textbox", { name: "خيار جديد بـالموردين" }).fill(supplier);
    await admin.getByRole("button", { name: "+ أضف" }).click();
    await expect(admin.getByRole("status").filter({ hasText: supplier })).toBeVisible();
    // ما انستعمل: بينحذف
    await expect(admin.getByRole("button", { name: `احذف ${supplier}` })).toBeVisible();
  } finally {
    await admin.close();
  }
  const page = await browser.newPage();
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.goto("/factory/raw/move?kind=receipt");
  await expect(
    page.getByRole("radiogroup", { name: "المورد" }).getByRole("radio", { name: supplier }),
  ).toBeVisible();
  await page.close();
});

test("product categories group the branch order", async ({ browser }) => {
  const admin = await browser.newPage(laptop);
  try {
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=lists&list=product_categories");
    await admin.getByRole("textbox", { name: "خيار جديد بـتصنيفات الأصناف" }).fill(category);
    await admin.getByRole("button", { name: "+ أضف" }).click();
    await expect(admin.getByRole("status").filter({ hasText: category })).toBeVisible();
    await admin.goto("/admin/settings");
    await admin.getByRole("combobox", { name: "تصنيف Classic Choco" }).selectOption({ label: category });
    await expect
      .poll(async () => {
        const { data } = await serviceClient()
          .from("products")
          .select("category_id")
          .eq("name_en", "Classic Choco")
          .single();
        return data?.category_id ?? null;
      })
      .not.toBeNull();
  } finally {
    await admin.close();
  }
  const page = await browser.newPage();
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto("/order");
  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await expect(page.getByRole("heading", { name: "بدون تصنيف" })).toBeVisible();
  await page.close();
});
