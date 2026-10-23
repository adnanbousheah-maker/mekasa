import type { CookieOptionsWithName } from "@supabase/ssr";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * كوكي الجلسة: ما في كود عند المتصفح بيقرأها (كل Supabase على السيرفر)، فـ httpOnly
 * بيمنع أي سكربت يسرق التوكن. 30 يوم مشان الموظف ما يدخل كل يوم.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: THIRTY_DAYS,
};
