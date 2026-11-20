import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_JBH, MANAGER, serviceClient, signInAndWait } from "./support";

// 20 نوفمبر: القطع لحد 99، الفرع بيعدّل طلبه خلال ربع ساعة، والأدمن والمدير العام بيحذفوه.
test.describe.configure({ mode: "serial" });

/** آخر طلب مفتوح للفرع. */
async function latestRequest(branchCode: string) {
  const db = serviceClient();
  const { data: loc } = await db.from("locations").select("id").eq("code", branchCode).single();
  const { data, error } = await db
    .from("stock_requests")
    .select("id, status, replaces_request_id")
    .eq("requesting_location_id", loc!.id)
    // التعديل بياخذ نفس وقت الطلب الأصلي، فبنستثني الملغي
    .in("status", ["sent", "pending_approval"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

test("pieces stop at 99, and the branch edits its order within 15 minutes", async ({ page }) => {
  await signInAndWait(page, BRANCH_JBH.phone, BRANCH_JBH.pin);
  await page.goto("/order");
  const tiramisu = page.getByRole("listitem", { name: "Tiramisu" });
  const pieces = tiramisu.getByRole("textbox", { name: "قطع (قطع بس)" });
  await pieces.fill("150");
  await expect(pieces).toHaveValue("99");
  await expect(tiramisu.getByRole("button", { name: "زيد قطعة Tiramisu" })).toBeDisabled();

  await page.getByRole("button", { name: "مراجعة الطلب" }).click();
  await page.getByRole("button", { name: "إرسال الطلب للمصنع" }).click();
  await expect(page.getByText("انبعت طلبك للمصنع")).toBeVisible();
  const sent = await latestRequest("JBH");

  await page
    .getByRole("link", { name: /^عدّل \(باقي/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "تعديل الطلب" })).toBeVisible();
  const again = page
    .getByRole("listitem", { name: "Tiramisu" })
    .getByRole("textbox", { name: "قطع (قطع بس)" });
  await expect(again).toHaveValue("99");
  await again.fill("5");
  await page.getByRole("button", { name: "مراجعة الطلب" }).click();
  await page.getByRole("button", { name: "احفظ التعديل" }).click();
  await expect(page.getByText("انعدّل طلبك")).toBeVisible();

  const edited = await latestRequest("JBH");
  expect(edited.replaces_request_id).toBe(sent.id);
  const { data: old } = await serviceClient()
    .from("stock_requests")
    .select("status")
    .eq("id", sent.id)
    .single();
  expect(old!.status).toBe("cancelled");

  await page.getByRole("link", { name: "استعراض الطلب" }).first().click();
  await expect(page.getByRole("list", { name: "أصناف الطلب" })).toContainText("Tiramisu");
  await expect(page.getByRole("list", { name: "أصناف الطلب" })).toContainText("5 قطع");
});

test("the general manager and the admin can delete a request that has not left", async ({ browser }) => {
  const request = await latestRequest("JBH");
  for (const who of [MANAGER, ADMIN]) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    try {
      await signInAndWait(page, who.phone, who.pin);
      await page.goto(`/admin/orders?filter=all&id=${request.id}`);
      await expect(page.getByRole("button", { name: "احذف الطلب" })).toBeVisible();
      if (who === ADMIN) {
        await page.getByRole("button", { name: "احذف الطلب" }).click();
        await page.getByRole("dialog", { name: "حذف الطلب" }).getByRole("button", { name: "احذفه" }).click();
        await expect(page.getByRole("dialog", { name: "حذف الطلب" })).toBeHidden();
      }
    } finally {
      await page.close();
    }
  }
  const { data } = await serviceClient()
    .from("stock_requests")
    .select("status")
    .eq("id", request.id)
    .single();
  expect(data!.status).toBe("cancelled");
});
