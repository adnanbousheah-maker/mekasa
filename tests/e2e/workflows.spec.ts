import { expect, test, type Page } from "@playwright/test";
import { dayNumberOf, recentDates } from "../../src/lib/day-number";
import { businessDate } from "../../src/lib/time";
import {
  ADMIN,
  BRANCH,
  BRANCH_DBQ,
  BRANCH_JBH,
  FACTORY,
  latestDispatchTo,
  setParLevels,
  signInAndWait,
  stockOf,
  updateAppSettings,
} from "./support";

// باقي قائمة الفحص اليدوي: FEFO مع التجاوز، التحويل، رابط فرع ثاني، الإرجاع، وموافقة الطلبات.
// الملف آخر واحد بالترتيب لأن جرد المصنع هون كامل (اللي ما انعد بيصير صفر).
test.describe.configure({ mode: "serial", timeout: 90_000 });

const PRODUCT = "Carrot";
const restores: (() => Promise<void>)[] = [];
test.beforeAll(async () => {
  // بدون اقتراحات من الحد المطلوب، مشان نشتغل على صنف واحد بس
  for (const code of ["SWF", "JBH", "DBQ"]) restores.push(await setParLevels(code, {}));
});
test.afterAll(async () => {
  for (const restore of restores.reverse()) await restore();
});

async function addLine(page: Page, cakes: number) {
  await page.getByRole("button", { name: /أضف صنف/ }).click();
  await page.getByRole("dialog", { name: "أضف صنف" }).getByRole("button", { name: PRODUCT }).click();
  const line = page.getByRole("listitem", { name: PRODUCT });
  for (let i = 0; i < cakes; i++) await line.getByRole("button", { name: `زيد كيكة ${PRODUCT}` }).click();
  return line;
}

/** الوجهة بتجيب الكميات المقترحة، فلازم نستنى قبل ما نضيف أسطر. */
async function pickDestination(page: Page, name: string) {
  await page.getByRole("radio", { name }).click();
  await expect(page.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "لحظة…" })).toHaveCount(0);
}

async function receiveAll(page: Page) {
  await page.getByRole("button", { name: `تأكيد ${PRODUCT}`, exact: true }).click();
  await page.getByRole("checkbox", { name: /فحصت البضاعة قدام السائق/ }).check();
  await page.getByRole("button", { name: "تأكيد الاستلام" }).click();
}

test("the factory counts two batches, and picking the newer one needs a confirmed override", async ({
  page,
}) => {
  const today = businessDate(new Date());
  const yesterday = recentDates(today, 2).find((d) => d !== today)!;

  await signInAndWait(page, FACTORY.phone, FACTORY.pin);
  await page.getByRole("link", { name: "جرد المصنع" }).click();
  const item = page.getByRole("listitem", { name: PRODUCT });
  // الشاشة لازم تخلص تحميل قبل ما نعدّ صفوف الدفعات
  await expect(page.getByRole("button", { name: "تأكيد جرد المصنع" })).toBeVisible();
  for (const date of [yesterday, today]) {
    const day = dayNumberOf(date);
    const plus = item.getByRole("button", { name: `زيد ${PRODUCT} رقم ${day}` });
    if ((await plus.count()) === 0) {
      const picker = page.getByRole("group", { name: `اختار رقم ${PRODUCT}` });
      if (!(await picker.isVisible()))
        await item.getByRole("button", { name: `ضيف رقم لـ ${PRODUCT}` }).click();
      await picker.getByRole("button", { name: `رقم ${day}`, exact: true }).click();
    }
    await plus.click();
    await expect(item.getByRole("status", { name: `${PRODUCT} رقم ${day}: 1` })).toBeVisible();
  }
  await expect(item.getByText("المجموع: 2 كيكات")).toBeVisible();
  await page.getByRole("button", { name: "تأكيد جرد المصنع" }).click();
  await expect(page.getByRole("heading", { name: "تم الجرد" })).toBeVisible();

  await page.goto("/factory/dispatch");
  await pickDestination(page, "فرع الجبيهة");
  const line = await addLine(page, 1);
  await line.getByRole("button", { name: new RegExp(`^ابدأ من رقم ${dayNumberOf(today)} `) }).click();
  await page.getByRole("button", { name: "تأكيد الإخراج" }).click();
  const alert = page.getByRole("dialog", { name: "في دفعة أقدم!" });
  await expect(alert).toContainText(`في دفعة رقم ${dayNumberOf(yesterday)} أقدم`);
  await alert.getByRole("button", { name: /كمّل من الدفعة اللي اخترتها/ }).click();
  await expect(page.getByRole("heading", { name: "طلبات الفروع" })).toBeVisible();

  const dispatch = await latestDispatchTo("JBH");
  expect(dispatch.fefoOverride).toBe(true);

  const before = await stockOf("JBH", PRODUCT);
  await page.context().clearCookies();
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto(`/receive/${dispatch.id}`);
  await receiveAll(page);
  await expect(page.getByText("انسجل الاستلام")).toBeVisible();
  expect(await stockOf("JBH", PRODUCT)).toBe(before + 10);
});

test("a branch transfers to another branch, and a third branch cannot open it", async ({ page }) => {
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto("/transfer");
  await pickDestination(page, "فرع الصويفية");
  await addLine(page, 1);
  await page.getByRole("button", { name: "تأكيد التحويل" }).click();
  await page.waitForURL(/\/orders/);
  const dispatch = await latestDispatchTo("SWF");
  expect(dispatch.kind).toBe("transfer");

  await page.context().clearCookies();
  await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  await page.goto(`/receive/${dispatch.id}`);
  // RLS بيخبّيها كلياً عن فرع ثالث، فبتطلع "مش موجودة"
  await expect(page.getByText("هالصفحة مش موجودة، أو مش إلك.")).toBeVisible();
  await expect(page.getByRole("button", { name: "تأكيد الاستلام" })).toHaveCount(0);
  await expect(page.getByRole("listitem", { name: PRODUCT })).toHaveCount(0);

  const before = await stockOf("SWF", PRODUCT);
  await page.context().clearCookies();
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  await page.goto("/orders");
  await page.getByRole("link", { name: "استلم", exact: true }).first().click();
  await receiveAll(page);
  await expect(page.getByText("انسجل الاستلام")).toBeVisible();
  expect(await stockOf("SWF", PRODUCT)).toBe(before + 10);
});

test.describe("returns", () => {
  let restore: () => Promise<void>;
  test.beforeAll(async () => {
    restore = await updateAppSettings({ returns_enabled: true });
  });
  test.afterAll(async () => restore());

  test("a branch returns a cake, and the storekeeper puts it back on a batch", async ({ page }) => {
    await signInAndWait(page, BRANCH.phone, BRANCH.pin);
    await page.goto("/transfer");
    await pickDestination(page, "مرتجعات المصنع");
    await addLine(page, 1);
    await page.getByRole("button", { name: "تأكيد التحويل" }).click();
    await page.waitForURL(/\/orders/);
    expect((await latestDispatchTo("RET")).kind).toBe("return");

    const before = await stockOf("FAC", PRODUCT);
    await page.context().clearCookies();
    await signInAndWait(page, FACTORY.phone, FACTORY.pin);
    await page.getByRole("link", { name: /المرتجعات/ }).click();
    await page.getByRole("link", { name: "استلم المرتجع" }).first().click();
    await receiveAll(page);
    await page.waitForURL(/\/factory\/returns/);

    const item = page.getByRole("listitem", { name: PRODUCT }).first();
    await item.getByRole("radio", { name: `رقم ${dayNumberOf(businessDate(new Date()))}` }).click();
    await item.getByRole("button", { name: "احفظ القرار" }).click();
    await expect(page.getByText("ما في مرتجعات بانتظار قرار.")).toBeVisible();
    expect(await stockOf("FAC", PRODUCT)).toBe(before + 10);
  });
});

test.describe("order approval", () => {
  let restore: () => Promise<void>;
  test.beforeAll(async () => {
    restore = await updateAppSettings({ order_approval_required: true });
  });
  test.afterAll(async () => restore());

  test("a request waits for the admin, then reaches the factory", async ({ page, browser }) => {
    await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
    await page.goto("/order");
    // شاشة الطلب بتعرض كل الأصناف، والحد المطلوب صفر فكلها فاضية
    await page
      .getByRole("listitem", { name: PRODUCT })
      .getByRole("button", { name: `زيد كيكة ${PRODUCT}` })
      .click();
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
    await expect(page.getByText("بانتظار الموافقة").first()).toBeVisible();

    const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/orders?filter=wait");
    await admin
      .getByRole("region", { name: "التفاصيل" })
      .getByRole("button", { name: "وافق وابعته للمصنع" })
      .click();
    // بعد الموافقة بيضل بـ"بانتظار" (هلا بانتظار المصنع)، بس بدون أزرار الموافقة
    await expect(admin.getByRole("button", { name: "وافق وابعته للمصنع" })).toHaveCount(0);
    await admin.close();

    await page.reload();
    await expect(page.getByText("مرسل").first()).toBeVisible();
  });
});
