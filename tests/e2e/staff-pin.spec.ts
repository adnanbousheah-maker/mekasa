import { expect, test, type Page } from "@playwright/test";
import { ADMIN, BRANCH_DBQ, restorePin, signIn, signInAndWait } from "./support";

// الرمز الجديد لازم يبين بنافذته (كانت تتسكّر لحالها لما نافذة التأكيد تتسكّر)،
// والأدمن اللي بيغيّر رمزه هو بيضل داخل وبيقدر يدخل بالرمز الجديد.
async function resetPinOf(page: Page, name: string): Promise<string> {
  await page.goto("/admin/staff");
  await page.waitForLoadState("networkidle");
  const row = page.locator("tr").filter({ hasText: name });
  await row.getByRole("button", { name: "رمز جديد" }).click();
  await page.getByRole("button", { name: "اعمل رمز جديد" }).click();
  const shown = page.getByRole("dialog", { name: "الرمز الجديد" });
  await expect(shown).toBeVisible();
  const pin = (await shown.locator("p[dir=ltr]").innerText()).trim();
  expect(pin).toMatch(/^\d{4}$/);
  await shown.getByRole("button", { name: "تمام، أعطيته الرمز" }).click();
  await expect(shown).toBeHidden();
  return pin;
}

test("a new PIN shows once, for another employee and for the admin's own account", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  try {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);

    const otherPin = await resetPinOf(page, BRANCH_DBQ.name);
    const ownPin = await resetPinOf(page, ADMIN.name);

    // لسا داخل بعد ما غيّر رمزه
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/staff/);

    const fresh = await browser.newPage();
    try {
      await signIn(fresh, ADMIN.phone, ownPin);
      await fresh.waitForURL((url) => url.pathname !== "/login");
      await fresh.context().clearCookies();
      await signIn(fresh, BRANCH_DBQ.phone, otherPin);
      await fresh.waitForURL((url) => url.pathname !== "/login");
    } finally {
      await fresh.close();
    }
  } finally {
    await page.close();
    await restorePin(ADMIN.phone, ADMIN.pin);
    await restorePin(BRANCH_DBQ.phone, BRANCH_DBQ.pin);
  }
});
