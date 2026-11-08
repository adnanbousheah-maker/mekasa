"use server";

import { canEdit, canReadAll, getCurrentStaff } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  kind: "product" | "staff" | "location" | "raw" | "option";
  label: string;
  hint: string;
  href: string;
}

const KIND_HINT = { cake: "صنف كيك", sauce: "صوص", packaging: "مادة تغليف" } as const;

/** بحث عام بلوحة الإدارة: أصناف، موظفين، مواقع، مواد أولية، وخيارات القوائم. قراءة بس (RLS). */
export async function globalSearchAction(query: string): Promise<SearchHit[]> {
  const staff = await getCurrentStaff();
  if (!staff || !canReadAll(staff)) return [];
  // فلاتر PostgREST: بنشيل الرموز اللي إلها معنى بالفلتر
  const q = String(query ?? "")
    .replace(/[,()*%\\:"']/g, " ")
    .trim()
    .slice(0, 40);
  if (q.length < 2) return [];
  const like = `*${q}*`;
  const admin = canEdit(staff);
  const digits = q.replace(/\D/g, "").replace(/^0/, "");

  const supabase = await createClient();
  const [products, people, places, raw, options] = await Promise.all([
    supabase
      .from("products")
      .select("id, name_en, name_ar, kind, is_active")
      .or(`name_en.ilike.${like},name_ar.ilike.${like}`)
      .limit(8),
    supabase
      .from("staff")
      .select("id, full_name, username, phone, is_active")
      .or(
        [
          `full_name.ilike.${like}`,
          `username.ilike.${like}`,
          digits.length >= 3 ? `phone.ilike.*${digits}*` : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(6),
    supabase.from("locations").select("id, name, kind").ilike("name", like).limit(6),
    supabase
      .from("raw_materials")
      .select("id, name, code")
      .or(`name.ilike.${like},code.ilike.${like}`)
      .limit(6),
    admin
      ? supabase.from("lookup_options").select("id, name, list_key").ilike("name", like).limit(6)
      : Promise.resolve({ data: [] as { id: string; name: string; list_key: string }[] }),
  ]);

  const hits: SearchHit[] = [];
  for (const p of products.data ?? []) {
    const settingsTab = p.kind === "packaging" ? "packaging" : p.kind === "sauce" ? "sauces" : "products";
    hits.push({
      kind: "product",
      label: p.name_ar ? `${p.name_en} · ${p.name_ar}` : p.name_en,
      hint: `${KIND_HINT[p.kind]}${p.is_active ? "" : " (موقوف)"}`,
      href:
        p.kind === "cake"
          ? `/admin/stock?q=${encodeURIComponent(p.name_en)}`
          : admin
            ? `/admin/settings?tab=${settingsTab}`
            : "/admin/stock",
    });
  }
  for (const s of people.data ?? []) {
    hits.push({
      kind: "staff",
      label: s.full_name,
      hint: `موظف${s.username ? ` · ${s.username}` : ""}${s.is_active ? "" : " (موقوف)"}`,
      href: admin ? `/admin/staff/${s.id}` : "/admin/attention",
    });
  }
  for (const l of places.data ?? []) {
    hits.push({ kind: "location", label: l.name, hint: "موقع", href: `/admin/locations/${l.id}` });
  }
  for (const m of raw.data ?? []) {
    hits.push({
      kind: "raw",
      label: m.name,
      hint: `مادة أولية${m.code ? ` · ${m.code}` : ""}`,
      href: `/admin/raw?q=${encodeURIComponent(m.code ?? m.name)}`,
    });
  }
  for (const o of options.data ?? []) {
    hits.push({
      kind: "option",
      label: o.name,
      hint: "خيار بقائمة",
      href: `/admin/settings?tab=lists&list=${o.list_key}`,
    });
  }
  return hits;
}
