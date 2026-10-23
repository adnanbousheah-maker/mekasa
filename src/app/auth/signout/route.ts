import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// لما الجلسة لسا موجودة بس الموظف انوقف (أو انحذف صفه): بنمسح الكوكيز وبنرجع لشاشة الدخول.
// الصفحات ما بتقدر تكتب كوكيز، فبتحول لهون.
export async function GET(request: NextRequest) {
  // بس تحويلاتنا (same-origin) أو كتابة الرابط (none). رابط من موقع ثاني ما بيطلّع حدا.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url));
}
