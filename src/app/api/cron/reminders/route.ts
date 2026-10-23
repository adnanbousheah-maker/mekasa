import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/features/reminders/run";
import { cronSecret } from "@/lib/server-env";

// pg_cron بيبعت POST كل دقيقة مع Authorization: Bearer CRON_SECRET
export async function POST(request: NextRequest) {
  const secret = cronSecret();
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runReminders());
  } catch (error) {
    console.error("cron reminders", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
