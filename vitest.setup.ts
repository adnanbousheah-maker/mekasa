import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// بدون globals، Testing Library ما بينظف الـ DOM بين الاختبارات لحاله.
afterEach(() => {
  cleanup();
});
