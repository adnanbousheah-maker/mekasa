"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
  isNumberSetting,
  isToggleSetting,
  nameArSchema,
  newProductSchema,
  numberSettingSchema,
  piecesOverrideSchema,
  shelfLifeOverrideSchema,
  scheduleTimeSchema,
  wholeNumber,
} from "./schemas";

// كل الكتابة هون بجلسة الأدمن نفسه: RLS بتسمح للأدمن بس، والـ triggers بتسجل كل تغيير بـ audit_log.

export type SaveResult = { status: "error"; message: string } | { status: "done" };
export type NewProductState = { status: "error"; message: string } | { status: "created" } | undefined;

const idSchema = z.uuid();
const SAVE_FAILED = "ما انحفظ. جرب كمان مرة.";
const done: SaveResult = { status: "done" };

function fail(message: string): SaveResult {
  return { status: "error", message };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "القيمة مش صحيحة";
}

/** إعداد عام واحد (رقم أو تشغيل/إيقاف). */
export async function updateSettingAction(key: string, value: string | boolean): Promise<SaveResult> {
  const admin = await requireAdmin();

  let parsed: number | boolean;
  if (isToggleSetting(key)) {
    if (typeof value !== "boolean") return fail("القيمة مش صحيحة");
    parsed = value;
  } else if (isNumberSetting(key)) {
    const result = numberSettingSchema(key).safeParse(typeof value === "string" ? value : "");
    if (!result.success) return fail(firstIssue(result.error));
    parsed = result.data;
  } else {
    return fail("الإعداد مش موجود");
  }

  // المفتاح والقيمة متطابقين: كل مفتاح انفحص مع نوعه فوق
  const changes = {
    [key]: parsed,
    updated_by: admin.id,
  } as Database["public"]["Tables"]["app_settings"]["Update"];
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update(changes).eq("id", true);
  if (error) {
    console.error("updateSetting", key, error);
    return fail(SAVE_FAILED);
  }
  refresh();
  return done;
}

/** الاسم الأساسي (بالإنجليزي متل المنيو، أو أي اسم للتغليف والصوصات). لازم ما يتكرر. */
export async function updateProductNameEnAction(productId: string, value: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("الصنف مش موجود");
  const name = itemNameSchema.safeParse(value);
  if (!name.success) return fail(firstIssue(name.error));

  return updateProduct(productId, { name_en: name.data });
}

export async function updateProductNameArAction(productId: string, value: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("الصنف مش موجود");
  const name = nameArSchema.safeParse(value);
  if (!name.success) return fail(firstIssue(name.error));

  return updateProduct(productId, { name_ar: name.data });
}

/** فاضي = الرقم العام. الصنف اللي بينباع قطع بس ما إله كيكة. */
export async function updateProductPiecesAction(productId: string, value: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("الصنف مش موجود");
  const pieces = piecesOverrideSchema.safeParse(value);
  if (!pieces.success) return fail(firstIssue(pieces.error));

  return updateProduct(productId, { pieces_per_cake: pieces.data });
}

export async function updateProductShelfLifeAction(productId: string, value: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("الصنف مش موجود");
  const days = shelfLifeOverrideSchema.safeParse(value);
  if (!days.success) return fail(firstIssue(days.error));

  return updateProduct(productId, { shelf_life_days: days.data });
}

export async function setProductActiveAction(productId: string, active: boolean): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("الصنف مش موجود");
  if (typeof active !== "boolean") return fail("القيمة مش صحيحة");

  return updateProduct(productId, { is_active: active });
}

async function updateProduct(
  productId: string,
  changes: {
    name_en?: string;
    name_ar?: string | null;
    pieces_per_cake?: number | null;
    is_active?: boolean;
    shelf_life_days?: number | null;
  },
): Promise<SaveResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(changes)
    .eq("id", productId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("updateProduct", error);
    // pieces_only_has_no_cake_size، أو اسم مكرر
    if (error.code === "23505") return fail("في صنف بنفس الاسم");
    return fail(error.code === "23514" ? "هالصنف بينباع قطع بس" : SAVE_FAILED);
  }
  if (!data) return fail("الصنف مش موجود");
  refresh();
  return done;
}

export async function createProductAction(
  _previous: NewProductState,
  formData: FormData,
): Promise<NewProductState> {
  await requireAdmin();
  const parsed = newProductSchema.safeParse({
    nameEn: formData.get("nameEn") ?? "",
    nameAr: formData.get("nameAr") ?? "",
    sellMode: formData.get("sellMode") ?? "",
    piecesPerCake: formData.get("piecesPerCake") ?? "",
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  const supabase = await createClient();
  // الصنف الجديد بآخر القائمة
  const { data: last, error: readError } = await supabase
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("createProduct: sort order", readError);
    return { status: "error", message: SAVE_FAILED };
  }

  const { error } = await supabase.from("products").insert({
    name_en: parsed.data.nameEn,
    name_ar: parsed.data.nameAr,
    sell_mode: parsed.data.sellMode,
    pieces_per_cake: parsed.data.piecesPerCake,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) {
    console.error("createProduct", error);
    const message = error.code === "23505" ? "في صنف بنفس الاسم" : SAVE_FAILED;
    return { status: "error", message };
  }
  refresh();
  return { status: "created" };
}

const itemNameSchema = z.string().trim().min(1, "اكتب الاسم").max(80, "الاسم طويل كثير");

/** مادة تغليف أو صوص جديد: بالحبة، وبآخر القائمة. */
export async function createSimpleItemAction(kind: "packaging" | "sauce", name: string): Promise<SaveResult> {
  await requireAdmin();
  if (kind !== "packaging" && kind !== "sauce") return fail("القيمة مش صحيحة");
  const parsed = itemNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data: last, error: readError } = await supabase
    .from("products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("createSimpleItem: sort order", readError);
    return fail(SAVE_FAILED);
  }
  const { error } = await supabase.from("products").insert({
    name_en: parsed.data,
    sell_mode: "pieces_only",
    kind,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) {
    console.error("createSimpleItem", kind, error);
    return fail(error.code === "23505" ? "في صنف بنفس الاسم" : SAVE_FAILED);
  }
  refresh();
  return done;
}

/** موعد جديد، أو رجعة موعد انشال قبل (الصف نفسه بيرجع فعّال). */
export async function addScheduleTimeAction(locationId: string, time: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(locationId).success) return fail("الموقع مش موجود");
  const parsed = scheduleTimeSchema.safeParse(time);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { data: location, error: readError } = await supabase
    .from("locations")
    .select("kind")
    .eq("id", locationId)
    .maybeSingle();
  if (readError) {
    console.error("addScheduleTime: location", readError);
    return fail(SAVE_FAILED);
  }
  if (!location || (location.kind !== "factory" && location.kind !== "branch")) {
    return fail("الموقع مش موجود");
  }

  const { error } = await supabase
    .from("count_schedules")
    .upsert(
      { location_id: locationId, time_of_day: parsed.data, is_active: true },
      { onConflict: "location_id,time_of_day" },
    );
  if (error) {
    console.error("addScheduleTime", error);
    return fail(SAVE_FAILED);
  }
  refresh();
  return done;
}

/** المواعيد ما بتنحذف: بتنوقف، وسجلها والجرودات المرتبطة فيها بتضل. */
export async function removeScheduleTimeAction(scheduleId: string): Promise<SaveResult> {
  await requireAdmin();
  if (!idSchema.safeParse(scheduleId).success) return fail("الموعد مش موجود");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("count_schedules")
    .update({ is_active: false })
    .eq("id", scheduleId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("removeScheduleTime", error);
    return fail(SAVE_FAILED);
  }
  if (!data) return fail("الموعد مش موجود");
  refresh();
  return done;
}

const parSchema = z.object({ locationId: z.uuid(), productId: z.uuid() });

/** الحد المطلوب لصنف بفرع. بيندخل بالكيكات (أو بالقطع للأصناف اللي قطع بس) وبينحفظ بالقطع. */
export async function setParLevelAction(
  locationId: string,
  productId: string,
  value: string,
): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!parSchema.safeParse({ locationId, productId }).success) return fail("الصنف أو الفرع مش موجود");
  const amount = wholeNumber({ min: 0, max: 999 }).safeParse(value);
  if (!amount.success) return fail(firstIssue(amount.error));

  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("v_products")
    .select("effective_pieces_per_cake")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) return fail("الصنف مش موجود");

  const { error } = await supabase.from("par_levels").upsert(
    {
      location_id: locationId,
      product_id: productId,
      par_pieces: amount.data * (product.effective_pieces_per_cake ?? 1),
      updated_by: admin.id,
    },
    { onConflict: "location_id,product_id" },
  );
  if (error) {
    console.error("setParLevel", error);
    return fail(SAVE_FAILED);
  }
  refresh();
  return done;
}

/** الحد الأدنى لصنف بموقع (فرع، مصنع، مستودع تغليف؛ فاضي = ما في). تحته بيوصل تنبيه للموقع وللأدمن. */
export async function setMinLevelAction(
  locationId: string,
  productId: string,
  value: string,
): Promise<SaveResult> {
  const admin = await requireAdmin();
  if (!parSchema.safeParse({ locationId, productId }).success) return fail("الصنف أو الفرع مش موجود");
  let units: number | null = null;
  if (value.trim() !== "") {
    // التغليف بالحبة ممكن يكون بالآلاف
    const amount = wholeNumber({ min: 0, max: 99_999 }).safeParse(value);
    if (!amount.success) return fail(firstIssue(amount.error));
    units = amount.data;
  }

  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("v_products")
    .select("effective_pieces_per_cake")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) return fail("الصنف مش موجود");
  const minPieces = units === null ? null : units * (product.effective_pieces_per_cake ?? 1);

  // الصف ممكن ما يكون موجود (صنف جديد): بينعمل بحد مطلوب صفر
  const { data: updated, error } = await supabase
    .from("par_levels")
    .update({ min_pieces: minPieces, updated_by: admin.id })
    .eq("location_id", locationId)
    .eq("product_id", productId)
    .select("location_id");
  if (!error && updated.length === 0 && minPieces !== null) {
    const { error: insertError } = await supabase.from("par_levels").insert({
      location_id: locationId,
      product_id: productId,
      par_pieces: 0,
      min_pieces: minPieces,
      updated_by: admin.id,
    });
    if (insertError) {
      console.error("setMinLevel insert", insertError);
      return fail(SAVE_FAILED);
    }
  } else if (error) {
    console.error("setMinLevel", error);
    return fail(SAVE_FAILED);
  }
  refresh();
  return done;
}

const monthlySchema = z.object({ locationId: z.uuid(), scope: z.enum(["stock", "raw"]) });

/** ساعة جرد آخر الشهر لموقع (بتفعّله كمان). */
export async function setMonthlyCountTimeAction(
  locationId: string,
  scope: string,
  time: string,
): Promise<SaveResult> {
  await requireAdmin();
  const key = monthlySchema.safeParse({ locationId, scope });
  if (!key.success) return fail("الموقع مش موجود");
  const parsed = scheduleTimeSchema.safeParse(time);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_counts")
    .upsert(
      { location_id: locationId, scope: key.data.scope, time_of_day: parsed.data, is_active: true },
      { onConflict: "location_id,scope" },
    );
  if (error) {
    console.error("setMonthlyCountTime", error);
    return fail(error.code === "23514" ? "هالموقع ما إله هالجرد" : SAVE_FAILED);
  }
  refresh();
  return done;
}

/** تشغيل أو إيقاف جرد آخر الشهر لموقع. */
export async function setMonthlyCountActiveAction(
  locationId: string,
  scope: string,
  active: boolean,
): Promise<SaveResult> {
  await requireAdmin();
  const key = monthlySchema.safeParse({ locationId, scope });
  if (!key.success) return fail("الموقع مش موجود");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_counts")
    .update({ is_active: active })
    .eq("location_id", locationId)
    .eq("scope", key.data.scope)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("setMonthlyCountActive", error);
    return fail(SAVE_FAILED);
  }
  if (!data) return fail("اختار الساعة أول");
  refresh();
  return done;
}
