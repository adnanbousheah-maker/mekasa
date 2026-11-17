import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH, IT_ADMIN, serviceClient, setTasksFeature, signInAndWait } from "./support";

// آخر ملف: التصفير بيمسح كل الشغل اللي عملته الاختبارات قبله
test.afterAll(() => setTasksFeature(false));

test("a plain admin sees no IT page, no hidden tasks, and cannot open the IT account", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    const nav = page.getByRole("navigation", { name: "القائمة الرئيسية" });
    await expect(nav.getByRole("link", { name: "الإعدادات" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "IT" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "المهام المتكررة" })).toHaveCount(0);
    await page.goto("/admin/it");
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/it"));
    await page.goto("/admin/staff");
    await expect(page.getByText(IT_ADMIN.name)).toHaveCount(0);
  } finally {
    await page.close();
  }
});

test("IT shows the tasks, and the branch sees them", async ({ browser }) => {
  const it = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(it, IT_ADMIN.phone, IT_ADMIN.pin);
    await it.goto("/admin/it");
    await it.waitForLoadState("networkidle");
    const tasks = it.getByRole("switch", { name: "المهام المتكررة" });
    await expect(tasks).toHaveAttribute("aria-checked", "false");
    await tasks.click();
    await expect(tasks).toHaveAttribute("aria-checked", "true");
    await it.reload();
    await expect(
      it.getByRole("navigation", { name: "القائمة الرئيسية" }).getByRole("link", { name: "المهام المتكررة" }),
    ).toBeVisible();
  } finally {
    await it.close();
  }
  const db = serviceClient();
  const { data } = await db.from("app_settings").select("feature_tasks").single();
  expect(data?.feature_tasks).toBe(true);
});

test("IT resets the system: the work is gone, the staff and products stay", async ({ browser, page }) => {
  const db = serviceClient();
  // شي أكيد ينمسح، حتى لو الملف اشتغل لحاله على قاعدة فاضية
  const { data: someone } = await db.from("staff").select("id").limit(1).single();
  await db.from("notifications").insert({ staff_id: someone!.id, kind: "test", title: "قبل التصفير" });

  const it = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(it, IT_ADMIN.phone, IT_ADMIN.pin);
    await it.goto("/admin/it");
    await it.waitForLoadState("networkidle");
    const reset = it.getByRole("region", { name: "تصفير النظام" });
    const button = reset.getByRole("button", { name: "صفّر النظام" });
    await expect(button).toBeDisabled();
    await reset.getByRole("textbox").fill("صفّر");
    await button.click();
    await expect(reset.getByRole("status")).toContainText("انصفّر النظام");
  } finally {
    await it.close();
  }

  const { count: after } = await db.from("stock_movements").select("*", { count: "exact", head: true });
  expect(after).toBe(0);
  const { count: inbox } = await db.from("notifications").select("*", { count: "exact", head: true });
  expect(inbox).toBe(0);
  const { count: staff } = await db.from("staff").select("*", { count: "exact", head: true });
  expect(staff ?? 0).toBeGreaterThanOrEqual(9);

  // الموظف لسا بيدخل عادي
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  await expect(page.getByRole("link", { name: /جرد/ }).first()).toBeVisible();
});
