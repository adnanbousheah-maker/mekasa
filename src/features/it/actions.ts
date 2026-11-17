"use server";

import { refresh } from "next/cache";
import { requireItAdmin } from "@/features/auth/session";
import type { SaveResult } from "@/features/settings/actions";
import { createClient } from "@/lib/supabase/server";
import { deleteAllPhotos } from "./storage";
import { END_PREVIEW_WORD, RESET_WORD } from "./words";

export type ResetResult = { status: "error"; message: string } | { status: "done"; photos: number | null };

/** زر التصفير: قاعدة البيانات أول (بتفحص IT ووضع المعاينة والكلمة)، وبعدين الصور. */
export async function resetOperationsAction(confirm: string): Promise<ResetResult> {
  await requireItAdmin();
  if (confirm.trim() !== RESET_WORD) return { status: "error", message: `اكتب «${RESET_WORD}» بالضبط` };
  const supabase = await createClient();
  const { error } = await supabase.rpc("it_reset_operations", { p_confirm: RESET_WORD });
  if (error) {
    console.error("itReset", error);
    const message =
      error.hint === "preview_over"
        ? "فترة المعاينة خلصت، والتصفير مسكّر"
        : error.code === "42501"
          ? "التصفير لسوبر أدمن IT بس"
          : "ما صار التصفير. جرب كمان مرة.";
    return { status: "error", message };
  }
  let photos: number | null = null;
  try {
    photos = await deleteAllPhotos();
  } catch (photoError) {
    // البيانات انمسحت، والصور بتنمسح بالمحاولة الجاية
    console.error("itReset: photos", photoError);
  }
  refresh();
  return { status: "done", photos };
}

/** مفتاح ميزة (هلا المهام المتكررة بس). */
export async function setFeatureAction(feature: "tasks", on: boolean): Promise<SaveResult> {
  await requireItAdmin();
  if (feature !== "tasks" || typeof on !== "boolean") return { status: "error", message: "القيمة مش صحيحة" };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ feature_tasks: on }).eq("id", true);
  if (error) {
    console.error("setFeature", error);
    return { status: "error", message: "ما انحفظ" };
  }
  refresh();
  return { status: "done" };
}

/** نهاية فترة المعاينة: ما بترجع، وزر التصفير بيتسكّر. */
export async function endPreviewAction(confirm: string): Promise<SaveResult> {
  await requireItAdmin();
  if (confirm.trim() !== END_PREVIEW_WORD)
    return { status: "error", message: `اكتب «${END_PREVIEW_WORD}» بالضبط` };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ preview_mode: false }).eq("id", true);
  if (error) {
    console.error("endPreview", error);
    return { status: "error", message: "ما انحفظ" };
  }
  refresh();
  return { status: "done" };
}
