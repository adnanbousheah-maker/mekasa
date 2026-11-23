import { expect, test } from "@playwright/test";
import { BRANCH_JBH, FACTORY, MANAGER, serviceClient, signInAndWait, updateAppSettings } from "./support";

// 22 نوفمبر: التطليع بدون ستوك، الطلب على دفعتين، وتقرير مسؤول المصنع
test.describe.configure({ mode: "serial" });

const db = serviceClient();
const staffId = async (phone: string) =>
  (
    await db
      .from("staff")
      .select("id")
      .eq("phone", `962${phone.slice(1)}`)
      .single()
  ).data!.id;

test("the general manager allows dispatching without stock", async ({ browser }) => {
  const restore = await updateAppSettings({ factory_dispatch_without_stock: false });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, MANAGER.phone, MANAGER.pin);
    await page.goto("/admin/orders");
    const section = page.getByRole("region", { name: "التطليع بدون ستوك" });
    await section.getByRole("switch", { name: "المصنع بيطلّع حتى لو ما في ستوك" }).click();
    await expect(section.getByText("مسموح")).toBeVisible();
    await expect
      .poll(
        async () => (await db.from("app_settings").select("factory_dispatch_without_stock").single()).data,
      )
      .toEqual({ factory_dispatch_without_stock: true });
  } finally {
    await page.close();
    await restore();
  }
});

test("an order goes out in two parts, the second from today's batch without stock", async ({ page }) => {
  const restore = await updateAppSettings({ factory_dispatch_without_stock: true });
  try {
    // الجبيهة بتطلب 3 كيكات Latte
    await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
    await page.goto("/order");
    for (const item of await page.getByRole("listitem").all()) {
      const box = item.getByRole("textbox", { name: "كيكات" });
      if (await box.count()) await box.fill("0");
    }
    await page.getByRole("listitem", { name: "Latte" }).getByRole("textbox", { name: "كيكات" }).fill("3");
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
    await expect(page.getByText("انبعت طلبك للمصنع")).toBeVisible();

    // المصنع بيطلّع كيكة وحدة، والباقي بيضل مفتوح
    await page.context().clearCookies();
    await signInAndWait(page, FACTORY.phone, FACTORY.pin);
    await page.goto("/factory/requests");
    const request = page.getByRole("listitem", { name: "طلب فرع الجبيهة" }).first();
    await request.getByRole("link", { name: "ابدأ الإخراج" }).click();
    await page.getByRole("listitem", { name: "Latte" }).getByRole("textbox", { name: "كيكات" }).fill("1");
    const keepOpen = page.getByRole("checkbox", { name: "الباقي من الطلب رح يطلع بدفعة ثانية اليوم" });
    await expect(keepOpen).toBeChecked();
    await page.getByRole("button", { name: "تأكيد الإخراج" }).click();
    await expect(page.getByRole("heading", { name: "طلبات الفروع" })).toBeVisible();

    const open = page.getByRole("listitem", { name: "طلب فرع الجبيهة" }).first();
    await expect(open.getByText("طلع جزء · الباقي")).toBeVisible();
    const shortages = open.getByRole("table", { name: "نواقص طلب الجبيهة" });
    await expect(shortages.getByRole("row", { name: /Latte/ })).toContainText("كيكتين");
    await open.getByRole("link", { name: "طلّع الباقي" }).click();
    await expect(
      page.getByRole("listitem", { name: "Latte" }).getByRole("textbox", { name: "كيكات" }),
    ).toHaveValue("2");
    await page.getByRole("button", { name: "تأكيد الإخراج" }).click();
    await expect(page.getByRole("heading", { name: "طلبات الفروع" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "طلب فرع الجبيهة" })).toHaveCount(0);
  } finally {
    await restore();
  }
});

test("the factory manager sees the factory report and a count's differences", async ({ page }) => {
  const id = await staffId(FACTORY.phone);
  await db.from("staff_roles").insert({ staff_id: id, role: "factory_manager" });
  try {
    await signInAndWait(page, FACTORY.phone, FACTORY.pin);
    await page.getByRole("link", { name: "تقرير المصنع" }).click();
    await expect(page.getByRole("heading", { name: "تقرير المصنع" })).toBeVisible();
    await expect(page.getByText("الإنتاج", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "آخر الجرودات" })).toBeVisible();
    const first = page.getByRole("link", { name: /كيك/ }).first();
    if (await first.count()) {
      await first.click();
      await expect(page.getByRole("heading", { name: "جرد المصنع" })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await db.from("staff_roles").delete().eq("staff_id", id).eq("role", "factory_manager");
  }
});

test("the factory manager marks an order as out and sees what is left of a partial one", async ({ page }) => {
  const id = await staffId(FACTORY.phone);
  await db.from("staff_roles").insert({ staff_id: id, role: "factory_manager" });
  try {
    await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
    await page.goto("/order");
    for (const item of await page.getByRole("listitem").all()) {
      const box = item.getByRole("textbox", { name: "كيكات" });
      if (await box.count()) await box.fill("0");
    }
    await page.getByRole("listitem", { name: "Flan" }).getByRole("textbox", { name: "كيكات" }).fill("2");
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
    await expect(page.getByText("انبعت طلبك للمصنع")).toBeVisible();

    await page.context().clearCookies();
    await signInAndWait(page, FACTORY.phone, FACTORY.pin);
    await page.goto("/factory/requests");
    const request = page.getByRole("listitem", { name: "طلب فرع الجبيهة" }).first();
    await request.getByRole("button", { name: "تم إخراج الطلبية" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "أيوا، طلعت" }).click();
    await expect(page.getByRole("listitem", { name: "طلب فرع الجبيهة" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await db.from("staff_roles").delete().eq("staff_id", id).eq("role", "factory_manager");
  }
});
