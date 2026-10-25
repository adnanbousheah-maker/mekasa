import { expect, test, type Page } from "@playwright/test";
import { ADMIN, FACTORY, restoreSettings, signIn } from "./support";

// الأدمن على اللابتوب
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const productName = `E2E Cake ${Date.now()}`;
// ساعة ما إلها موعد بالـ seed
const scheduleTime = "13:47";

test.afterAll(async () => restoreSettings({ productName, scheduleTime: `${scheduleTime}:00` }));

async function openSettings(page: Page, tab?: string) {
  await signIn(page, ADMIN.phone, ADMIN.pin);
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto(tab ? `/admin/settings?tab=${tab}` : "/admin/settings");
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
}

async function saveField(page: Page, label: string, value: string) {
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Enter");
}

test("general settings save on blur and on toggle, and survive a reload", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "عام" }).click();
  await expect(page).toHaveURL(/tab=general/);

  await saveField(page, "تنبيه الإخراج اللي ما انستلم", "5");
  await expect(page.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();

  const returns = page.getByRole("switch", { name: "الإرجاع من الفروع للمصنع" });
  await expect(returns).toHaveAttribute("aria-checked", "false");
  await returns.click();
  await expect(returns).toHaveAttribute("aria-checked", "true");
  await expect(returns).toBeEnabled();

  // الحد نفسه اللي بقاعدة البيانات، والرسالة بتقول الحد
  await saveField(page, "مدة حياة الكيك بالمصنع", "8");
  await expect(page.getByRole("alert").filter({ hasText: "اكتب رقم بين 1 و7" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "تنبيه الإخراج اللي ما انستلم" })).toHaveValue("5");
  await expect(page.getByRole("switch", { name: "الإرجاع من الفروع للمصنع" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "مدة حياة الكيك بالمصنع" })).toHaveValue("7");
});

test("products: Arabic name, own cake size, switching off and adding a product", async ({ page }) => {
  await openSettings(page);

  await saveField(page, "الاسم بالعربي لـ Flan", "فلان");
  await expect(page.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
  await saveField(page, "قطع بالكيكة لـ Flan", "8");
  await expect(page.getByRole("row", { name: /Flan/ }).getByText("خاص")).toBeVisible();

  const tiramisu = page.getByRole("switch", { name: "Tiramisu فعّال" });
  await tiramisu.click();
  await expect(tiramisu).toHaveAttribute("aria-checked", "false");
  await expect(tiramisu).toBeEnabled();

  await page.getByRole("button", { name: "+ صنف جديد" }).click();
  const dialog = page.getByRole("dialog", { name: "صنف جديد" });
  await dialog.getByLabel("الاسم (متل المنيو)").fill(productName);
  await dialog.getByText("قطعة بس").click();
  await expect(dialog.getByLabel("قطع بالكيكة")).toBeHidden();
  await dialog.getByRole("button", { name: "أضف الصنف" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "الاسم بالعربي لـ Flan" })).toHaveValue("فلان");
  await expect(page.getByRole("textbox", { name: "قطع بالكيكة لـ Flan" })).toHaveValue("8");
  await expect(page.getByRole("switch", { name: "Tiramisu فعّال" })).toHaveAttribute("aria-checked", "false");
  const added = page.getByRole("row", { name: new RegExp(productName) });
  await expect(added).toBeVisible();
  await expect(added.getByText("قطعة بس")).toBeVisible();

  // نفس الاسم مرة ثانية
  await page.getByRole("button", { name: "+ صنف جديد" }).click();
  await dialog.getByLabel("الاسم (متل المنيو)").fill(productName);
  await dialog.getByRole("button", { name: "أضف الصنف" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("في صنف بنفس الاسم");
});

test("count schedules: add a time to a branch and take it off again", async ({ page }) => {
  await openSettings(page, "schedule");
  const dabouq = page.getByRole("region", { name: "دابوق" });
  await expect(dabouq.getByText("9:00")).toBeVisible();

  await dabouq.getByRole("button", { name: "+ موعد" }).click();
  await dabouq.getByLabel("موعد جديد لـ دابوق").fill(scheduleTime);
  await dabouq.getByRole("button", { name: "أضف" }).click();
  await expect(dabouq.getByText(scheduleTime)).toBeVisible();

  await page.reload();
  await expect(dabouq.getByText(scheduleTime)).toBeVisible();

  await dabouq.getByRole("button", { name: `شيل موعد ${scheduleTime}` }).click();
  await expect(dabouq.getByText(scheduleTime)).toBeHidden();
  await page.reload();
  await expect(dabouq.getByText(scheduleTime)).toBeHidden();
  await expect(dabouq.getByText("9:00")).toBeVisible();
});

test("a product can live longer than a week, and then its batches go by date", async ({ page, browser }) => {
  await openSettings(page, "products");
  await saveField(page, "مدة الحياة لـ Pecan", "14");
  await expect(page.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "مدة الحياة لـ Pecan", exact: true })).toHaveValue("14");
  await expect(page.getByRole("row", { name: /Pecan/ })).toContainText("بالتاريخ");
  try {
    // أمين المستودع بيختار تاريخ بدل رقم لهالصنف
    const factory = await browser.newPage();
    await signIn(factory, FACTORY.phone, FACTORY.pin);
    await factory.waitForURL((url) => url.pathname !== "/login");
    await factory.goto("/count");
    const pecan = factory.getByRole("listitem", { name: "Pecan" });
    await pecan.getByRole("button", { name: "ضيف تاريخ لـ Pecan" }).click();
    await expect(factory.getByRole("group", { name: "اختار تاريخ Pecan" }).getByRole("button")).toHaveCount(
      14 + 1,
    );
    await factory.close();
  } finally {
    await saveField(page, "مدة الحياة لـ Pecan", "");
    await expect(page.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
  }
});
