"use client";

import "./globals.css";
import { ErrorScreen } from "@/features/errors/ErrorScreen";

// الخطأ بالـ layout الأساسي نفسه: لازم html و body هون
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ar" dir="rtl" translate="no">
      <body className="flex min-h-full flex-col bg-canvas">
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
