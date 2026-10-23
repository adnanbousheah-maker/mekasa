import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/components/**", "src/features/**/*.ts"],
      // السيرفر وقاعدة البيانات (actions، queries، session، clients) مفحوصين بـ e2e وpgTAP
      exclude: ["**/*.test.{ts,tsx}", "src/lib/supabase/**", "src/lib/*env.ts", "src/features/**/{actions,queries,session}.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
