"use server";

import { headers } from "next/headers";

/**
 * خطأ صار بشاشة عند المستخدم (error boundary): بينكتب بسجلات Vercel مشان نعرف شو صار.
 * ما فيه بيانات حساسة: الرسالة والمسار وأول سطور الـ stack، مقصوصين.
 */
export async function reportClientErrorAction(input: {
  message?: string;
  digest?: string;
  stack?: string;
  path?: string;
}): Promise<void> {
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const agent = (await headers()).get("user-agent")?.slice(0, 160);
  console.error("client-error", {
    message: clip(input?.message, 500),
    digest: clip(input?.digest, 100),
    path: clip(input?.path, 200),
    stack: clip(input?.stack, 1500),
    agent,
  });
}
