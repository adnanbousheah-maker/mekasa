import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatScheduleTime } from "@/features/settings/schemas";
import type { createClient } from "@/lib/supabase/server";
import { businessDate, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantity } from "@/lib/units";

// أدوات المساعد: قراءة بس، بجلسة الأدمن نفسه (RLS). كل نتيجة فيها مصدرها مشان الجواب يذكره.

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD (Amman time)");

function when(at: string, now: Date): string {
  const day = businessDate(new Date(at));
  const today = businessDate(now);
  const label = day === today ? "اليوم" : formatLongDate(day);
  return `${label} ${formatClock(new Date(at))}`;
}

function matches(name: string, query: string | undefined): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return name.toLowerCase().includes(q) || q.includes(name.toLowerCase());
}

async function lookups(db: Db) {
  const [{ data: locations }, { data: products }] = await Promise.all([
    // خانة المرتجعات مش موقع بيسأل عنه الأدمن
    db
      .from("locations")
      .select("id, name, kind")
      .eq("is_active", true)
      .neq("kind", "returns_bin")
      .order("sort_order"),
    db
      .from("v_products")
      .select("id, name_en, name_ar, effective_pieces_per_cake, is_active")
      .order("sort_order"),
  ]);
  return {
    locations: locations ?? [],
    products: (products ?? []).map((p) => ({
      id: p.id!,
      name: p.name_en!,
      nameAr: p.name_ar,
      ppc: p.effective_pieces_per_cake,
      active: p.is_active!,
    })),
  };
}

const json = (value: unknown) => JSON.stringify(value);

export function assistantTools(db: Db, now: Date) {
  return [
    betaZodTool({
      name: "stock_by_product",
      description:
        "Current stock (from the ledger: last count plus movements since) of cake products per location, with the time of the last count at each location. Filter by product name (English menu name, partial ok) and/or location name (Arabic, e.g. الجبيهة, المصنع).",
      inputSchema: z.object({ product: z.string().optional(), location: z.string().optional() }),
      run: async ({ product, location }) => {
        const { locations, products } = await lookups(db);
        const [{ data: stock }, { data: counts }] = await Promise.all([
          db.from("v_stock_by_product").select("location_id, product_id, qty_pieces"),
          db
            .from("v_count_list")
            .select("location_id, started_at")
            .order("started_at", { ascending: false })
            .limit(200),
        ]);
        const rows = [];
        for (const l of locations.filter((l) => l.kind !== "returns_bin" && matches(l.name, location))) {
          for (const p of products.filter(
            (p) => matches(p.name, product) || (p.nameAr && matches(p.nameAr, product)),
          )) {
            const qty =
              (stock ?? []).find((s) => s.location_id === l.id && s.product_id === p.id)?.qty_pieces ?? 0;
            if (!product && qty === 0) continue;
            rows.push({
              location: l.name,
              product: p.name,
              quantity: formatQuantity(qty, p.ppc),
              pieces: qty,
            });
          }
        }
        const sources = locations
          .filter((l) => matches(l.name, location))
          .map((l) => {
            const last = (counts ?? []).find((c) => c.location_id === l.id);
            return `${l.name}: ${last ? `آخر جرد ${when(last.started_at!, now)}` : "ما في جرد"}`;
          });
        return json({ rows: rows.slice(0, 120), sources });
      },
    }),

    betaZodTool({
      name: "last_count",
      description:
        "The latest confirmed stock count at a location: when it started, who counted, method, consumption since the count before it, and impossible numbers.",
      inputSchema: z.object({ location: z.string().describe("Location name in Arabic") }),
      run: async ({ location }) => {
        const { locations } = await lookups(db);
        const loc = locations.find((l) => matches(l.name, location));
        if (!loc) return json({ error: "location not found", locations: locations.map((l) => l.name) });
        const { data } = await db
          .from("v_count_list")
          .select(
            "started_at, method, is_opening, counted_by, consumed_cakes, impossible_lines, schedule_time",
          )
          .eq("location_id", loc.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return json({ location: loc.name, count: null });
        const { data: who } = await db
          .from("v_staff_names")
          .select("full_name")
          .eq("id", data.counted_by!)
          .maybeSingle();
        return json({
          location: loc.name,
          started: when(data.started_at!, now),
          slot: data.schedule_time ? formatScheduleTime(data.schedule_time) : null,
          method: data.method === "photo" ? "بالصورة" : "يدوي",
          counted_by: who?.full_name ?? null,
          opening_balance: data.is_opening,
          consumption_cakes: data.is_opening ? null : Number(data.consumed_cakes),
          impossible_numbers: data.impossible_lines,
        });
      },
    }),

    betaZodTool({
      name: "expiring_batches",
      description:
        "Factory batches on their last day or expired (by day number), and branch stock estimated to be near the end of its shelf life.",
      inputSchema: z.object({}),
      run: async () => {
        const { locations, products } = await lookups(db);
        const [{ data: batches }, { data: ages }] = await Promise.all([
          db
            .from("v_factory_batches")
            .select("product_id, day_number, production_date, qty_pieces, is_last_day, is_expired")
            .gt("qty_pieces", 0),
          db
            .from("v_branch_stock_age")
            .select("location_id, product_id, qty_pieces, age_days, near_expiry, is_expired")
            .eq("near_expiry", true),
        ]);
        const name = (id: string) => products.find((p) => p.id === id);
        return json({
          factory: (batches ?? [])
            .filter((b) => b.is_last_day || b.is_expired)
            .map((b) => ({
              product: name(b.product_id!)?.name,
              day_number: b.day_number,
              quantity: formatQuantity(b.qty_pieces!, name(b.product_id!)?.ppc ?? null),
              state: b.is_expired ? "expired" : "last day",
            })),
          branches: (ages ?? []).map((a) => ({
            location: locations.find((l) => l.id === a.location_id)?.name,
            product: name(a.product_id!)?.name,
            quantity: formatQuantity(a.qty_pieces!, name(a.product_id!)?.ppc ?? null),
            age_days: a.age_days,
            state: a.is_expired ? "past shelf life (estimate)" : "near the end (estimate)",
          })),
          source: "دفعات المصنع، وتقدير عمر الكيك بالفروع من تواريخ الاستلام",
        });
      },
    }),

    betaZodTool({
      name: "count_status_today",
      description:
        "Today's count schedule per location: which slots are done, due now, late, or still upcoming.",
      inputSchema: z.object({}),
      run: async () => {
        const { locations } = await lookups(db);
        const { data } = await db
          .from("v_count_slots_today")
          .select("location_id, time_of_day, status, confirmed_at")
          .order("time_of_day");
        const label = { done: "تم", late: "متأخر", due: "وقته هلا", upcoming: "لسا" } as const;
        return json({
          slots: (data ?? []).map((s) => ({
            location: locations.find((l) => l.id === s.location_id)?.name,
            time: formatScheduleTime(s.time_of_day!),
            status: label[s.status as keyof typeof label],
            confirmed_at: s.confirmed_at ? formatClock(new Date(s.confirmed_at)) : null,
          })),
        });
      },
    }),

    betaZodTool({
      name: "pending_orders",
      description:
        "Branch requests waiting for approval or for dispatch, and dispatches in transit (with hours on the road).",
      inputSchema: z.object({}),
      run: async () => {
        const { locations } = await lookups(db);
        const name = (id: string) => locations.find((l) => l.id === id)?.name;
        const [{ data: requests }, { data: dispatches }] = await Promise.all([
          db
            .from("stock_requests")
            .select("requesting_location_id, status, requested_at, stock_request_lines(qty_pieces)")
            .in("status", ["pending_approval", "sent"]),
          db
            .from("v_unreceived_dispatches")
            .select("from_location_id, to_location_id, dispatched_at, hours_in_transit, is_overdue"),
        ]);
        return json({
          requests: (requests ?? []).map((r) => ({
            branch: name(r.requesting_location_id),
            status: r.status === "pending_approval" ? "waiting for admin approval" : "waiting for dispatch",
            requested: when(r.requested_at, now),
            lines: r.stock_request_lines.length,
          })),
          in_transit: (dispatches ?? []).map((d) => ({
            from: name(d.from_location_id!),
            to: name(d.to_location_id!),
            dispatched: when(d.dispatched_at!, now),
            hours: Number(d.hours_in_transit),
            overdue: d.is_overdue,
          })),
        });
      },
    }),

    betaZodTool({
      name: "below_par",
      description: "Products under their par level at each branch (par = target stock after delivery).",
      inputSchema: z.object({ location: z.string().optional() }),
      run: async ({ location }) => {
        const { locations, products } = await lookups(db);
        const [{ data: par }, { data: stock }] = await Promise.all([
          db.from("par_levels").select("location_id, product_id, par_pieces"),
          db.from("v_stock_by_product").select("location_id, product_id, qty_pieces"),
        ]);
        const out = [];
        for (const l of locations.filter((l) => l.kind === "branch" && matches(l.name, location))) {
          for (const p of products.filter((p) => p.active)) {
            const target =
              (par ?? []).find((x) => x.location_id === l.id && x.product_id === p.id)?.par_pieces ?? 0;
            const have =
              (stock ?? []).find((x) => x.location_id === l.id && x.product_id === p.id)?.qty_pieces ?? 0;
            if (have < target) {
              out.push({
                branch: l.name,
                product: p.name,
                have: formatQuantity(Math.max(0, have), p.ppc),
                par: formatQuantity(target, p.ppc),
              });
            }
          }
        }
        return json({ rows: out.slice(0, 120) });
      },
    }),

    betaZodTool({
      name: "raw_material_stock",
      description:
        "Raw materials at the factory: quantity, minimum, average daily issue over 14 days, and days left.",
      inputSchema: z.object({
        material: z.string().optional().describe("Material name in Arabic, partial ok"),
      }),
      run: async ({ material }) => {
        const [{ data: stock }, { data: materials }] = await Promise.all([
          db
            .from("v_raw_stock")
            .select("material_id, qty_base, min_qty, base_unit, avg_daily_issue, days_left, below_min"),
          db.from("raw_materials").select("id, name"),
        ]);
        return json({
          rows: (stock ?? [])
            .map((s) => ({ ...s, name: (materials ?? []).find((m) => m.id === s.material_id)?.name ?? "" }))
            .filter((s) => matches(s.name, material))
            .map((s) => ({
              material: s.name,
              quantity: `${Number(s.qty_base)} ${s.base_unit}`,
              minimum: `${Number(s.min_qty)} ${s.base_unit}`,
              daily_issue: Number(s.avg_daily_issue),
              days_left: s.days_left,
              below_minimum: s.below_min,
            })),
        });
      },
    }),

    betaZodTool({
      name: "waste_in_period",
      description:
        "Waste recorded between two dates (inclusive), with totals by location, product and reason.",
      inputSchema: z.object({ from: isoDate, to: isoDate }),
      run: async ({ from, to }) => {
        const { locations, products } = await lookups(db);
        const { data } = await db
          .from("waste_records")
          .select("location_id, product_id, qty_pieces, reason, occurred_at")
          .gte("occurred_at", new Date(`${from}T00:00:00+03:00`).toISOString())
          .lt("occurred_at", new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000).toISOString());
        const reasons = { expired: "انتهت", broken: "انكسرت", other: "غيره" } as const;
        return json({
          from,
          to,
          records: (data ?? []).map((w) => {
            const p = products.find((x) => x.id === w.product_id);
            return {
              location: locations.find((l) => l.id === w.location_id)?.name,
              product: p?.name,
              quantity: formatQuantity(w.qty_pieces ?? 0, p?.ppc ?? null),
              pieces: w.qty_pieces,
              reason: reasons[w.reason],
              at: when(w.occurred_at, now),
            };
          }),
        });
      },
    }),

    betaZodTool({
      name: "consumption_in_period",
      description:
        "Consumption at branches between two dates (inclusive): previous count + received − dispatched − waste − current count. Not sales. Per branch and product, in pieces and cakes.",
      inputSchema: z.object({ from: isoDate, to: isoDate, location: z.string().optional() }),
      run: async ({ from, to, location }) => {
        const { locations, products } = await lookups(db);
        const { data } = await db
          .from("v_count_consumption")
          .select("location_id, product_id, consumed_pieces, business_date")
          .gte("business_date", from)
          .lte("business_date", to);
        const totals = new Map<string, number>();
        for (const row of data ?? []) {
          const key = `${row.location_id}|${row.product_id}`;
          totals.set(key, (totals.get(key) ?? 0) + (row.consumed_pieces ?? 0));
        }
        return json({
          from,
          to,
          rows: [...totals.entries()]
            .map(([key, pieces]) => {
              const [locationId, productId] = key.split("|");
              const p = products.find((x) => x.id === productId);
              return {
                location: locations.find((l) => l.id === locationId)?.name ?? "",
                product: p?.name,
                quantity: formatQuantity(pieces, p?.ppc ?? null),
                pieces,
              };
            })
            .filter((r) => matches(r.location, location)),
          source: "الفرق بين الجرودات بالفترة",
        });
      },
    }),
  ];
}
