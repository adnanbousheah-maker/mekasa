import { expect, test } from "@playwright/test";
import { MANAGER, signInAndWait } from "./support";

test("the general manager reads the management reports and exports them", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, MANAGER.phone, MANAGER.pin);
    await page
      .getByRole("navigation", { name: "القائمة الرئيسية" })
      .getByRole("link", { name: /تقارير الإدارة/ })
      .click();
    await expect(page.getByRole("heading", { name: "تقارير الإدارة" })).toBeVisible();
    const tiles = page.getByRole("region", { name: "المؤشرات" });
    for (const label of ["الاستهلاك بالفروع", "نسبة التالف بالفروع", "الجرد بوقته", "فروقات الاستلام"]) {
      await expect(tiles.getByText(label)).toBeVisible();
    }
    await expect(page.getByRole("row", { name: /الصويفية/ })).toBeVisible();

    await page
      .getByRole("navigation", { name: "الفترة" })
      .getByRole("link", { name: "الشهر الماضي" })
      .click();
    await expect(page).toHaveURL(/p=last-month/);
    await expect(
      page.getByRole("navigation", { name: "الفترة" }).getByRole("link", { name: "الشهر الماضي" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByLabel("من", { exact: true }).fill("2026-10-01");
    await page.getByLabel("لـ", { exact: true }).fill("2026-10-10");
    await page.getByRole("button", { name: "اعرض الفترة" }).click();
    await expect(page).toHaveURL(/p=custom&from=2026-10-01&to=2026-10-10/);
    await expect(page.getByText("(10 يوم)")).toBeVisible();

    const href = await page.getByRole("link", { name: /Excel/ }).getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheet");
  } finally {
    await page.close();
  }
});
