import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_DBQ, BRANCH_MANAGER, TINY_PNG, signInAndWait } from "./support";

test("recurring tasks: the admin adds them, the branch does them, the admin sees them", async ({
  browser,
}) => {
  const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=tasks");
    await admin.waitForLoadState("networkidle");

    for (const task of [
      { title: "تنظيف الثلاجة e2e", photo: false },
      { title: "فحص الحرارة e2e", photo: true },
    ]) {
      await admin.getByRole("button", { name: "+ مهمة جديدة" }).click();
      const dialog = admin.getByRole("dialog");
      await dialog.getByLabel("اسم المهمة").fill(task.title);
      await dialog.getByRole("button", { name: "دابوق" }).click();
      if (task.photo) await dialog.getByLabel("لازم صورة").check();
      await dialog.getByRole("button", { name: "احفظ" }).click();
      await expect(admin.getByRole("dialog")).toHaveCount(0);
      await expect(admin.getByRole("cell", { name: task.title, exact: true })).toBeVisible();
    }

    // الموظف بالفرع
    const staff = await browser.newPage();
    try {
      await signInAndWait(staff, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
      await staff.getByRole("link", { name: /مهام اليوم/ }).click();
      await expect(staff.getByRole("heading", { name: "مهام اليوم" })).toBeVisible();

      const fridge = staff.getByRole("article", { name: "تنظيف الثلاجة e2e" });
      await fridge.getByLabel("ملاحظة (إذا في)").fill("نظفتها كلها");
      await fridge.getByRole("button", { name: "تمّت" }).click();
      await expect(fridge.getByText("✓ انعملت")).toBeVisible();

      const temp = staff.getByRole("article", { name: "فحص الحرارة e2e" });
      await temp.getByRole("button", { name: "تمّت" }).click();
      await expect(temp.getByRole("alert")).toHaveText("صوّر أول، بعدين اكبس تمّت");
      await temp
        .getByLabel("صوّر الشغل")
        .setInputFiles({ name: "t.png", mimeType: "image/png", buffer: TINY_PNG });
      await expect(temp.getByText("انرفعت الصورة")).toBeVisible();
      await temp.getByRole("button", { name: "تمّت" }).click();
      await expect(temp.getByText("✓ انعملت")).toBeVisible();

      // موظف عادي ما بيشوف تقرير الفرع
      await staff.goto("/branch");
      await expect(staff).toHaveURL(/\/$/);
    } finally {
      await staff.close();
    }

    await admin.goto("/admin/tasks");
    const dbq = admin.getByRole("article", { name: "دابوق" });
    await expect(dbq.getByText("✓ انعملت")).toHaveCount(2);
    await expect(admin.getByRole("row", { name: /تنظيف الثلاجة e2e.*نظفتها كلها/ })).toBeVisible();
    await expect(
      admin.getByRole("row", { name: /فحص الحرارة e2e/ }).getByRole("link", { name: "شوف" }),
    ).toBeVisible();
    const href = await admin.getByRole("link", { name: /Excel/ }).getAttribute("href");
    const response = await admin.request.get(href!);
    expect(response.status()).toBe(200);
  } finally {
    await admin.close();
  }
});

test("the branch manager opens the branch report from home", async ({ page }) => {
  await signInAndWait(page, BRANCH_MANAGER.phone, BRANCH_MANAGER.pin);
  await page.getByRole("link", { name: "تقرير الفرع" }).click();
  await expect(page.getByRole("heading", { name: "تقرير الفرع" })).toBeVisible();
  const tiles = page.getByRole("region", { name: "المؤشرات" });
  for (const label of ["الاستهلاك", "نسبة التالف", "الجرد بوقته", "المهام بوقتها"]) {
    await expect(tiles.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByRole("navigation", { name: "الفترة" }).getByRole("link", { name: "الشهر الماضي" }).click();
  await expect(page).toHaveURL(/p=last-month/);
});
