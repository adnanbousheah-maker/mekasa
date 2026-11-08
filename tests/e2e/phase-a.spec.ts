import { expect, test } from "@playwright/test";
import {
  ADMIN,
  BRANCH_MANAGER,
  BRANCH_DBQ,
  MANAGER,
  deactivateProduct,
  serviceClient,
  signInAndWait,
} from "./support";

test.describe.configure({ mode: "serial" });
const laptop = { viewport: { width: 1360, height: 900 } };

test("the general manager sees the whole admin panel but changes nothing", async ({ browser }) => {
  const page = await browser.newPage(laptop);
  try {
    await signInAndWait(page, MANAGER.phone, MANAGER.pin);
    await expect(page).toHaveURL(/\/admin$/);
    const nav = page.getByRole("navigation", { name: "القائمة الرئيسية" });
    await expect(nav.getByRole("link", { name: /لازم تتصرف/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /سجل التعديلات/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /الإعدادات/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /الموظفين/ })).toHaveCount(0);
    await expect(page.getByText("المدير العام · مشاهدة")).toBeVisible();

    // صفحات الأدمن بس بترجعه
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/staff");
    await expect(page).toHaveURL(/\/admin$/);

    // المواد الأولية بدون أزرار تعديل
    await page.goto("/admin/raw");
    await expect(page.getByRole("heading", { name: "المواد الأولية" })).toBeVisible();
    await expect(page.getByRole("button", { name: /مادة جديدة/ })).toHaveCount(0);

    await page.goto("/admin/attention");
    await expect(page.getByRole("heading", { name: "لازم تتصرف" })).toBeVisible();
  } finally {
    await page.close();
  }
});

test("every admin change shows in the audit log, filtered by type", async ({ browser }) => {
  const name = `Audit Sauce ${Date.now()}`;
  const page = await browser.newPage(laptop);
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/settings?tab=sauces");
    await page.getByRole("textbox", { name: "اسم الصوص" }).fill(name);
    await page.getByRole("button", { name: "+ صوص" }).click();
    await expect(page.getByRole("status").filter({ hasText: name })).toBeVisible();

    await page.goto("/admin/audit?type=products");
    const entry = page.getByRole("listitem").filter({ hasText: name }).first();
    await expect(entry).toContainText("إضافة صنف");
    await expect(entry).toContainText(ADMIN.name);
    await page.getByLabel("النوع").selectOption({ label: "موظف" });
    await page.getByRole("button", { name: "طبّق" }).click();
    await expect(page).toHaveURL(/type=staff/);
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
    await page.getByRole("link", { name: "مسح الفلاتر" }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
  } finally {
    await page.close();
    await deactivateProduct(name);
  }
});

test("staff read their notifications in the app and open what they point to", async ({ page }) => {
  const db = serviceClient();
  const { data: staff } = await db.from("staff").select("id").eq("phone", "962790000004").single();
  const title = `تنبيه تجريبي ${Date.now()}`;
  await db.from("notifications").insert([
    { staff_id: staff!.id, kind: "dispatch", title, body: "افتح الطلبات", url: "/orders" },
    { staff_id: staff!.id, kind: "count", title: `${title} 2`, body: null, url: null },
  ]);

  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  const bell = page.getByRole("link", { name: /الإشعارات، \d+ غير مقروء/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByRole("heading", { name: "الإشعارات" })).toBeVisible();
  await page.getByRole("group", { name: "فلتر الإشعارات" }).getByRole("button", { name: "الإخراج" }).click();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(1);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/orders$/);

  await page.goto("/notifications");
  await page.getByRole("button", { name: "✓ علّم الكل مقروء" }).click();
  await expect(page.getByRole("button", { name: "✓ علّم الكل مقروء" })).toHaveCount(0);
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staff!.id)
    .is("read_at", null);
  expect(count).toBe(0);
});

test("a branch manager works the branch like its staff", async ({ page }) => {
  await signInAndWait(page, BRANCH_MANAGER.phone, BRANCH_MANAGER.pin);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BRANCH_MANAGER.name);
  await expect(page.getByText("فرع دابوق")).toBeVisible();
  const tasks = page.getByRole("navigation", { name: "المهام" });
  await expect(tasks.getByRole("link", { name: /جرد/ })).toBeVisible();
  await expect(tasks.getByRole("link", { name: /طلب/ }).first()).toBeVisible();
});
