import { expect, test } from "@playwright/test";
import { ADMIN, BRANCH, signInAndWait } from "./support";

// المساعد بالاختبارات بدون Claude (MEKASA_FAKE_AI=1): الأدوات حقيقية، والجواب ثابت الشكل.
test.describe("assistant", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("the admin asks about today's counts and gets an answer with its source", async ({ page }) => {
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.getByRole("link", { name: /اسأل المساعد/ }).click();
    const chat = page.getByRole("region", { name: "مساعد ميكاسا" });
    await chat.getByRole("button", { name: "مين ما جرد اليوم؟" }).click();
    await expect(chat.getByText(/المصدر: مواعيد جرد اليوم/)).toBeVisible();

    await chat.getByLabel("اكتب سؤالك").fill("مين ربح ماتش امبارح؟");
    await chat.getByRole("button", { name: "اسأل", exact: true }).click();
    await expect(chat.getByText("أنا بساعدك بس بأمور ميكاسا", { exact: false })).toBeVisible();
  });
});

// تسجيل الصوت بمايك مزيف: نفس أحداث Web Speech API اللي بيعطيها Chrome
function fakeSpeech(mode: "speak" | "denied" | "none") {
  return (m: string) => {
    const w = window as unknown as Record<string, unknown>;
    if (m === "none") return;
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      lang = "";
      start() {
        if (m === "denied") {
          setTimeout(() => {
            this.onerror?.({ error: "not-allowed" });
            this.onend?.();
          }, 50);
          return;
        }
        // جملة بسكتة بالنص: نتيجة مؤقتة، بعدين نهائية
        setTimeout(
          () =>
            this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "مين ما" } }] }),
          100,
        );
        setTimeout(
          () =>
            this.onresult?.({
              resultIndex: 0,
              results: [{ isFinal: true, 0: { transcript: "مين ما جرد اليوم؟" } }],
            }),
          1200,
        );
      }
      stop() {
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.onend?.();
      }
    }
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
  };
}

test.describe("assistant voice", () => {
  test.use({ viewport: { width: 1360, height: 900 }, isMobile: false, hasTouch: false });

  test("speaking shows the words live, survives a short pause, then asks", async ({ page }) => {
    await page.addInitScript(fakeSpeech("speak"), "speak");
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/ai");
    const chat = page.getByRole("region", { name: "مساعد ميكاسا" });
    await chat.getByRole("button", { name: "اسأل بالصوت" }).click();
    await expect(chat.getByLabel("اكتب سؤالك")).toHaveValue("مين ما");
    await expect(chat.getByRole("button", { name: "وقّف التسجيل" })).toBeVisible();
    await expect(chat.getByText("رسالة صوتية")).toBeVisible({ timeout: 10_000 });
    await expect(chat.getByText(/المصدر: مواعيد جرد اليوم/)).toBeVisible();
  });

  test("a blocked microphone says how to allow it", async ({ page }) => {
    await page.addInitScript(fakeSpeech("denied"), "denied");
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/ai");
    const chat = page.getByRole("region", { name: "مساعد ميكاسا" });
    await chat.getByRole("button", { name: "اسأل بالصوت" }).click();
    await expect(chat.getByRole("alert")).toContainText("المايك مسكّر");
  });

  test("a browser without voice explains what to do instead", async ({ page }) => {
    await page.addInitScript(fakeSpeech("none"), "none");
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.webkitSpeechRecognition;
      delete w.SpeechRecognition;
    });
    await signInAndWait(page, ADMIN.phone, ADMIN.pin);
    await page.goto("/admin/ai");
    const chat = page.getByRole("region", { name: "مساعد ميكاسا" });
    await chat.getByRole("button", { name: "اسأل بالصوت" }).click();
    await expect(chat.getByRole("alert")).toContainText("الصوت ما بيشتغل على هالمتصفح");
  });
});

test("staff cannot reach the assistant", async ({ page }) => {
  await signInAndWait(page, BRANCH.phone, BRANCH.pin);
  await page.goto("/admin/ai");
  await expect(page).toHaveURL(/\/$/);
});
