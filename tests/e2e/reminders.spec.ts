import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH_DBQ, BRANCH_JBH, clearMinLevels, signInAndWait, temporarySchedule } from "./support";

function cronSecret(): string {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith("CRON_SECRET="));
  return line!.slice("CRON_SECRET=".length).trim();
}

// موعد قبل 20 دقيقة بتوقيت عمّان: "متأخر"
function minutesAgoInAmman(minutes: number): string {
  const at = new Date(Date.now() - minutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(at)
    .concat(":00");
}

test("a late count shows on the branch home, and the cron logs one late alert", async ({ page, request }) => {
  const time = minutesAgoInAmman(20);
  // لو عدّى نص الليل، الموعد بيصير لبكرة. منتخطى الاختبار هالدقايق.
  test.skip(time > minutesAgoInAmman(0), "around midnight");
  const schedule = await temporarySchedule("DBQ", time);
  try {
    await signInAndWait(page, BRANCH_DBQ.phone, BRANCH_DBQ.pin);
    const banner = page.getByRole("region", { name: "تذكير الجرد" });
    await expect(banner).toContainText(
      `جرد الساعة ${Number(time.slice(0, 2))}:${time.slice(3, 5)} لسا ما انعمل`,
    );
    await expect(banner).toContainText("متأخر 20 دقيقة");
    await expect(banner.getByRole("link", { name: "ابدأ الجرد الآن" })).toHaveAttribute("href", "/count");

    expect((await request.post("/api/cron/reminders")).status()).toBe(401);
    expect(
      (await request.post("/api/cron/reminders", { headers: { Authorization: "Bearer wrong" } })).status(),
    ).toBe(401);

    const auth = { headers: { Authorization: `Bearer ${cronSecret()}` } };
    const first = await (await request.post("/api/cron/reminders", auth)).json();
    expect(first.sent).toContainEqual({ kind: "count_late", scheduleId: schedule.id, recipients: 0 });
    const second = await (await request.post("/api/cron/reminders", auth)).json();
    expect(second.sent.filter((s: { scheduleId: string }) => s.scheduleId === schedule.id)).toEqual([]);
  } finally {
    await schedule.remove();
  }
});

test("a minimum level alerts the branch home and the cron, once a day", async ({ browser, request }) => {
  await clearMinLevels();
  try {
    const admin = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    await signInAndWait(admin, ADMIN.phone, ADMIN.pin);
    await admin.goto("/admin/settings?tab=par");
    const field = admin.getByRole("textbox", { name: "الحد الأدنى لـ Pecan بـالجبيهة" });
    await expect(field).toHaveValue("");
    await field.fill("50");
    await field.press("Enter");
    await expect(admin.getByRole("status").filter({ hasText: "انحفظ" })).toBeVisible();
    await admin.goto("/admin");
    await expect(admin.getByText(/بـالجبيهة تحت الحد الأدنى/)).toBeVisible();
    await admin.close();

    const branch = await browser.newPage();
    await signInAndWait(branch, BRANCH_JBH.phone, BRANCH_JBH.pin);
    const banner = branch.getByRole("link", { name: /تحت الحد الأدنى/ });
    await expect(banner).toContainText("Pecan");
    await expect(banner).toHaveAttribute("href", "/order");
    await branch.close();

    const auth = { headers: { Authorization: `Bearer ${cronSecret()}` } };
    const first = await (await request.post("/api/cron/reminders", auth)).json();
    expect(first.sent.filter((s: { kind: string }) => s.kind === "below_min")).toHaveLength(1);
    const second = await (await request.post("/api/cron/reminders", auth)).json();
    expect(second.sent.filter((s: { kind: string }) => s.kind === "below_min")).toEqual([]);
  } finally {
    await clearMinLevels();
  }
});

test("the app can be installed: manifest and service worker are public", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).short_name).toBe("ميكاسا");
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain("showNotification");
});
