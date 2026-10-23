import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH, clearLock, expectOnLogin, randomTestPhone, removeStaff, signIn } from "./support";

test("the app is Arabic, right-to-left, and asks you to sign in first", async ({ page }) => {
  await page.goto("/");
  await expectOnLogin(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("branch staff sign in to their branch home and sign out", async ({ page }) => {
  await signIn(page, BRANCH.phone, BRANCH.pin);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(BRANCH.name);
  await expect(page.getByText("فرع الصويفية")).toBeVisible();
  await expect(page.getByRole("link", { name: /جرد/ })).toBeVisible();

  // الجلسة بكوكي ما بيقدر أي سكربت بالصفحة يقرأها
  const authCookies = (await page.context().cookies()).filter((c) => c.name.includes("auth-token"));
  expect(authCookies.length).toBeGreaterThan(0);
  for (const cookie of authCookies) expect(cookie.httpOnly).toBe(true);

  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expectOnLogin(page);
});

test.describe("wrong PIN", () => {
  test.afterEach(async () => clearLock(BRANCH.e164));

  // (Next عنده عنصر alert ثاني للتنقل، فمنفتش عن النص)
  const failure = /رقم الجوال أو الرمز غلط. بعد 5 محاولات غلط/;

  test("explains the lock rule without revealing anything", async ({ page }) => {
    await signIn(page, BRANCH.phone, "7391");
    await expect(page.getByText(failure)).toBeVisible();
    await expectOnLogin(page);
  });

  test("an unknown phone gets exactly the same message", async ({ page }) => {
    await signIn(page, "0799999999", "7391");
    await expect(page.getByText(failure)).toBeVisible();
  });
});

test("branch staff cannot open the admin panel", async ({ page }) => {
  await signIn(page, BRANCH.phone, BRANCH.pin);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BRANCH.name);

  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/\/$/);
});

test.describe("staff management", () => {
  // الأدمن على اللابتوب (الجدول عريض)، والموظف على الجوال
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  const phone = randomTestPhone();
  test.afterAll(async () => removeStaff(phone.e164));

  test("the admin adds staff, the new PIN works, and deactivating signs them out", async ({
    page,
    browser,
  }) => {
    test.slow();

    await signIn(page, ADMIN.phone, ADMIN.pin);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/admin/staff/new");
    await page.getByLabel("الاسم").fill("موظف اختبار");
    await page.getByLabel("رقم الجوال").fill(phone.local);
    await page.getByLabel("الموقع").selectOption({ label: "الصويفية" });
    await page.getByRole("checkbox", { name: /موظف فرع/ }).check();
    await page.getByRole("button", { name: "أضف الموظف" }).click();

    const pinText = page.locator('p[dir="ltr"]').filter({ hasText: /^\d{4}$/ });
    await expect(pinText).toBeVisible();
    const pin = (await pinText.textContent())?.trim() ?? "";

    // الموظف الجديد بجهاز ثاني
    const staffContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "ar-JO",
      timezoneId: "Asia/Amman",
      baseURL: "http://localhost:3000",
    });
    const staffPage = await staffContext.newPage();
    await signIn(staffPage, phone.local, pin);
    await expect(staffPage.getByRole("heading", { level: 1 })).toContainText("موظف");

    // الأدمن بيوقفه
    await page.goto("/admin/staff");
    const row = page.getByRole("row", { name: /موظف اختبار/ });
    await row.getByRole("button", { name: "إيقاف" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "إيقاف" }).click();
    await expect(row.getByText("موقوف")).toBeVisible();

    // من أول ضغطة بيطلع
    await staffPage.reload();
    await expectOnLogin(staffPage);
    await staffContext.close();
  });
});
