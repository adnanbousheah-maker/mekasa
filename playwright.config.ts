import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// الاختبارات بتحتاج Supabase المحلي (db:start + db:seed-staff) ومفاتيحه من .env.local
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3000;

export default defineConfig({
  testDir: "./tests/e2e",
  // الاختبارات بتغير حالة الموظفين التجريبيين، فواحد ورا الثاني
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar-JO",
    timezoneId: "Asia/Amman",
    trace: "on-first-retry",
  },
  projects: [
    // الموظفين على الجوال (مقاس التصميم 390×844)
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    // قراءة الفورم بأرقام ثابتة بدل Claude (للتطوير بس، بتنتجاهل بالإنتاج)
    env: { MEKASA_FAKE_OCR: "1" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
