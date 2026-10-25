import { expect, test } from "@playwright/test";
import {
  ADMIN,
  BRANCH_DBQ,
  FACTORY,
  factoryTodayStock,
  lastWaste,
  setParLevels,
  signInAndWait,
  stockOf,
  updateAppSettings,
} from "./support";

test.describe.configure({ mode: "serial" });

let restorePar: () => Promise<void>;
test.beforeAll(async () => {
  // دابوق: الحد المطلوب Flan كيكتين بس، مشان الاقتراح يكون واضح
  restorePar = await setParLevels("DBQ", { Flan: 20 });
});
test.afterAll(async () => restorePar());

test("the storekeeper records today's production", async ({ page }) => {
  const before = await factoryTodayStock("Flan");
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "تسجيل إنتاج" }).click();
  await expect(page.getByText(/اكتب الرقم \d على كل كيكة/)).toBeVisible();
  const flan = page.getByRole("listitem", { name: "Flan" });
  for (let i = 0; i < 3; i++) await flan.getByRole("button", { name: "زيد Flan" }).click();
  await page.getByRole("button", { name: "حفظ الإنتاج" }).click();
  await expect(page.getByRole("status").filter({ hasText: "انحفظ الإنتاج" })).toBeVisible();
  expect(await factoryTodayStock("Flan")).toBe(before + 30);
});

test("the branch orders what is missing from par", async ({ page }) => {
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  const flanStock = await stockOf("DBQ", "Flan");
  test.skip(flanStock >= 20, "Flan is already at par in this database");
  await page.getByRole("navigation", { name: "المهام" }).getByRole("link", { name: /طلب/ }).click();
  const flan = page.getByRole("listitem", { name: "Flan" });
  await expect(flan.getByRole("status", { name: /^كيكات: / })).not.toHaveAccessibleName("كيكات: 0");
  // نخليها كيكتين بالضبط
  const cakes = flan.getByRole("status", { name: /^كيكات: / });
  while ((await cakes.getAttribute("aria-label")) !== "كيكات: 2") {
    const n = Number((await cakes.getAttribute("aria-label"))!.split(": ")[1]);
    await flan.getByRole("button", { name: n > 2 ? "نقّص كيكة Flan" : "زيد كيكة Flan" }).click();
  }
  await page.getByRole("button", { name: "مراجعة الطلب" }).click();
  await expect(page.getByRole("dialog", { name: "راجع طلبك قبل الإرسال" })).toContainText("كيكتين");
  await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
  await expect(page.getByText("انبعت طلبك للمصنع")).toBeVisible();
  await expect(page.getByText("مرسل").first()).toBeVisible();
});

test("the dispatcher sends it from the oldest batch, and the branch receives one short", async ({ page }) => {
  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: /طلبات الفروع/ }).click();
  await page
    .getByRole("listitem", { name: "طلب فرع دابوق" })
    .first()
    .getByRole("link", { name: "ابدأ الإخراج" })
    .click();
  await expect(page.getByRole("radio", { name: "فرع دابوق" })).toHaveAttribute("aria-checked", "true");
  const flan = page.getByRole("listitem", { name: "Flan" });
  await expect(flan.getByText("طلبوا: كيكتين")).toBeVisible();
  await page.getByRole("textbox", { name: "اسم السائق" }).fill("أبو محمد");
  await page.getByRole("button", { name: "تأكيد الإخراج" }).click();
  await expect(page.getByRole("heading", { name: "طلبات الفروع" })).toBeVisible();
  await expect(page.getByText("بالطريق").first()).toBeVisible();

  const before = await stockOf("DBQ", "Flan");
  await page.context().clearCookies();
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page
    .getByRole("navigation", { name: "المهام" })
    .getByRole("link", { name: /استلام/ })
    .click();
  await page.getByRole("link", { name: "استلم الطلبية" }).first().click();
  const line = page.getByRole("listitem", { name: "Flan" });
  await expect(line.getByText("طلع: كيكتين")).toBeVisible();
  await line.getByRole("button", { name: "نقّص كيكة Flan" }).click();
  await expect(line.getByText("ناقص كيكة")).toBeVisible();
  await line.getByPlaceholder("مثلاً: وحدة وصلت مكسورة").fill("وحدة مكسورة");
  // من الكيكة اللي وصلت، قطعتين تالفات من التوصيل
  await line.getByRole("button", { name: "في تالف من التوصيل؟" }).click();
  await line.getByRole("button", { name: "زيد قطعة تالفة Flan" }).click();
  await line.getByRole("button", { name: "زيد قطعة تالفة Flan" }).click();
  const confirm = page.getByRole("button", { name: "تأكيد الاستلام" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: /فحصت الباقي قدام السائق/ }).check();
  await confirm.click();
  await expect(page.getByText("انسجل الاستلام")).toBeVisible();
  expect(await stockOf("DBQ", "Flan")).toBe(before + 10 - 2);
  const waste = await lastWaste("DBQ");
  expect(waste).toMatchObject({
    qty_pieces: 2,
    reason: "broken",
    reason_note: "وصل تالف بالتوصيل · السائق: أبو محمد",
  });
});

test.describe("admin", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin sees the difference and settles it as waste", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await expect(page.getByText(/فرق استلام بـدابوق/).first()).toBeVisible();
    await page.goto("/admin/orders?filter=diff");
    const detail = page.getByRole("region", { name: "التفاصيل" });
    await expect(detail).toContainText("وحدة مكسورة");
    const id = new URL(
      (await page.locator('a[aria-current="true"]').getAttribute("href"))!,
      page.url(),
    ).searchParams.get("id");
    await detail.getByRole("button", { name: "اعتمد الفرق كتالف" }).click();
    // ما عاد فيها فرق مفتوح، فبتطلع من هالفلتر
    await expect(page.getByText("ما في حركات.")).toBeVisible();
    await page.goto(`/admin/orders?filter=all&id=${id}`);
    await expect(detail).toContainText("اعتُمد تالف");

    await page.goto("/admin/factory");
    await expect(page.getByRole("heading", { name: "إنتاج اليوم مقابل الجرد" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Flan/ }).first()).toBeVisible();

    for (const report of ["orders", "factory"]) {
      expect((await page.request.get(`/admin/export/${report}`)).status(), report).toBe(200);
    }
  });

  test("today's orders add up every branch for production, and print", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/orders");
    await page.getByRole("link", { name: "مجموع طلبات اليوم (للإنتاج)" }).click();
    const table = page.getByRole("region", { name: "مجموع طلبات اليوم" });
    await expect(table.getByRole("heading", { name: /\(اليوم\)/ })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "دابوق" })).toBeVisible();
    await expect(table.getByRole("row", { name: /Flan/ })).toContainText("كيك");
    expect((await page.request.get("/admin/export/orders-day")).status()).toBe(200);
  });

  test("each branch and store has its own page with everything about it", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page
      .getByRole("navigation", { name: "القائمة الرئيسية" })
      .getByRole("link", { name: "الفروع والمستودعات" })
      .click();
    await expect(page.getByRole("heading", { name: "الفروع والمستودعات" })).toBeVisible();
    await page.getByRole("link", { name: "دابوق", exact: true }).click();
    await expect(page.getByRole("heading", { name: "فرع دابوق" })).toBeVisible();
    for (const section of [
      "الستوك والحدود",
      "الطلبات والإخراج (آخر 7 أيام)",
      "آخر الجرودات",
      "التالف هالأسبوع",
      "الموظفين",
    ]) {
      await expect(page.getByRole("region", { name: section })).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "الموظفين" })).toContainText(BRANCH_DBQ.name);
    await page.goto("/admin/locations");
    await page.getByRole("link", { name: "مستودع التغليف" }).click();
    await expect(page.getByRole("region", { name: "مواد التغليف" })).toContainText("Cake Box");
  });

  test("the admin edits par levels in settings", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/settings?tab=par");
    await page.getByRole("navigation", { name: "الموقع" }).getByRole("link", { name: "فرع دابوق" }).click();
    const field = page.getByRole("textbox", { name: "الحد المطلوب لـ Flan بـدابوق" });
    await expect(field).toHaveValue("2");
    await field.fill("3");
    await field.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "الحد المطلوب لـ Flan بـدابوق" })).toHaveValue("3");
  });
});

test("when the factory sends whole cakes only, the pieces box disappears", async ({ page }) => {
  const restore = await updateAppSettings({ factory_loose_pieces_enabled: false });
  try {
    await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
    await page.goto("/order");
    const flan = page.getByRole("listitem", { name: "Flan" });
    await expect(flan.getByRole("button", { name: "زيد كيكة Flan" })).toBeVisible();
    await expect(flan.getByRole("button", { name: "زيد قطعة Flan" })).toHaveCount(0);
    // الأصناف اللي قطع بس بتضل بالقطعة
    await expect(page.getByRole("button", { name: "زيد قطعة Tiramisu" })).toBeVisible();
  } finally {
    await restore();
  }
});
