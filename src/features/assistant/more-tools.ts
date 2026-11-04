import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { loadDocuments, ordersOfDay } from "@/features/orders/queries";
import { ROLE_LABELS } from "@/features/staff/roles";
import { formatScheduleTime } from "@/features/settings/schemas";
import type { createClient } from "@/lib/supabase/server";
import { businessDate, countDay, formatClock, formatLongDate } from "@/lib/time";
import { formatQuantity } from "@/lib/units";

// أدوات المساعد الإضافية: كل تفاصيل البرنامج، قراءة بس، بجلسة الأدمن (RLS). ما في أي كتابة هون.

type Db = Awaited<ReturnType<typeof createClient>>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD (Amman time)");

const json = (value: unknown) => JSON.stringify(value);

function when(at: string, now: Date): string {
  const day = businessDate(new Date(at));
  const label = day === businessDate(now) ? "اليوم" : formatLongDate(day);
  return `${label} ${formatClock(new Date(at))}`;
}

function matches(name: string | null | undefined, query: string | undefined): boolean {
  if (!query) return true;
  if (!name) return false;
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  return n.includes(q) || q.includes(n);
}

/** بداية فترة (من/لحد) كتاريخين ISO، والافتراضي آخر `days` أيام. */
function period(from: string | undefined, to: string | undefined, now: Date, days: number) {
  const end = to ?? businessDate(now);
  const start =
    from ?? businessDate(new Date(new Date(`${end}T12:00:00+03:00`).getTime() - (days - 1) * 86_400_000));
  return {
    start,
    end,
    fromIso: new Date(`${start}T00:00:00+03:00`).toISOString(),
    toIso: new Date(new Date(`${end}T00:00:00+03:00`).getTime() + 86_400_000).toISOString(),
  };
}

async function places(db: Db) {
  const { data } = await db.from("locations").select("id, name, kind").order("sort_order");
  return data ?? [];
}

async function productList(db: Db) {
  const { data } = await db
    .from("v_products")
    .select("id, name_en, name_ar, kind, effective_pieces_per_cake")
    .order("sort_order");
  return (data ?? []).map((p) => ({
    id: p.id!,
    name: p.name_en!,
    nameAr: p.name_ar,
    kind: p.kind,
    ppc: p.effective_pieces_per_cake,
  }));
}

async function staffNames(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from("v_staff_names").select("id, full_name");
  return new Map((data ?? []).map((s) => [s.id!, s.full_name!]));
}

const qty = (pieces: number, ppc: number | null, packaging: boolean) =>
  packaging ? `${pieces} حبة` : formatQuantity(pieces, ppc);

const STATUS: Record<string, string> = {
  pending_approval: "بانتظار موافقة الأدمن",
  sent: "انبعت للمصنع (لسا ما طلع)",
  dispatched: "طلع من المصنع",
  received: "انستلم",
  cancelled: "انلغى",
  in_transit: "بالطريق",
};

/** قيم سجل التعديلات بالأسماء بدل الأرقام الداخلية، وبدون التواريخ التقنية. */
function readable(
  values: unknown,
  locs: { id: string; name: string }[],
  products: { id: string; name: string }[],
  names: Map<string, string>,
): Record<string, unknown> | null {
  if (!values || typeof values !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (key === "location_id") out.place = locs.find((l) => l.id === value)?.name ?? value;
    else if (key === "product_id") out.product = products.find((p) => p.id === value)?.name ?? value;
    else if (key === "staff_id") out.staff = names.get(String(value)) ?? value;
    else if (key === "id" || key.endsWith("_id") || key.endsWith("_by") || key.endsWith("_at")) continue;
    else out[key] = value;
  }
  return out;
}

export function moreAssistantTools(db: Db, now: Date) {
  return [
    betaZodTool({
      name: "orders_detail",
      description:
        "Full details of branch requests (orders) and dispatches: every line with product and quantity, who requested and when, status, items the branch left out, what the factory actually sent (with batch day numbers and driver), what was received, damage in transit and differences. Use for questions like 'what did Jubeiha order today', 'what was sent to Dabouq', 'did Sweifieh receive everything'. Filter by branch (Arabic name), date range (default last 3 days), product, and status.",
      inputSchema: z.object({
        branch: z.string().optional().describe("Branch or place name in Arabic, e.g. الجبيهة"),
        from: isoDate.optional(),
        to: isoDate.optional(),
        product: z.string().optional(),
        packaging: z.boolean().optional().describe("true = packaging orders only, false = cakes only"),
      }),
      run: async ({ branch, from, to, product, packaging }) => {
        const p = period(from, to, now, 3);
        const sinceDays = Math.max(
          1,
          Math.ceil((now.getTime() - new Date(p.fromIso).getTime()) / 86_400_000) + 1,
        );
        const [locs, docs] = await Promise.all([
          places(db),
          loadDocuments({ requests: {}, dispatches: {}, sinceDays: Math.min(sinceDays, 120) }),
        ]);
        const branchIds = new Set(locs.filter((l) => matches(l.name, branch)).map((l) => l.id));
        const inRange = (at: string) => at >= p.fromIso && at < p.toIso;
        const keep = (isPackaging: boolean) => packaging === undefined || packaging === isPackaging;

        const requests = docs.requests
          .filter((r) => inRange(r.requestedAt) && keep(r.isPackaging))
          .filter((r) => !branch || branchIds.has(r.requestingLocationId))
          .map((r) => {
            const dispatch = docs.dispatches.find((d) => d.requestId === r.id);
            return {
              branch: r.fromName,
              to: r.toName,
              requested: when(r.requestedAt, now),
              by: r.requestedBy,
              status: STATUS[r.status] ?? r.status,
              lines: r.lines
                .filter((l) => matches(l.productName, product))
                .map((l) => ({
                  product: l.productName,
                  ordered: qty(l.qtyPieces, l.piecesPerCake, r.isPackaging),
                  suggested:
                    l.suggestedPieces === null
                      ? null
                      : qty(l.suggestedPieces, l.piecesPerCake, r.isPackaging),
                })),
              left_out: r.missing.map(
                (m) => `${m.productName} (مقترح ${qty(m.suggestedPieces, m.piecesPerCake, r.isPackaging)})`,
              ),
              dispatch: dispatch
                ? {
                    sent: when(dispatch.dispatchedAt, now),
                    by: dispatch.dispatchedBy,
                    driver: dispatch.driverName,
                    status: STATUS[dispatch.status] ?? dispatch.status,
                  }
                : null,
            };
          })
          .filter((r) => !product || r.lines.length > 0);

        const dispatches = docs.dispatches
          .filter((d) => inRange(d.dispatchedAt) && keep(d.isPackaging))
          .filter((d) => !branch || branchIds.has(d.toLocationId) || branchIds.has(d.fromLocationId))
          .map((d) => ({
            kind: d.kind === "transfer" ? "تحويل بين فروع" : d.kind === "return" ? "إرجاع" : "إخراج",
            from: d.fromName,
            to: d.toName,
            sent: when(d.dispatchedAt, now),
            by: d.dispatchedBy,
            driver: d.driverName,
            status: STATUS[d.status] ?? d.status,
            hours_on_road: d.status === "in_transit" ? Math.floor(d.hoursInTransit) : null,
            lines: d.lines
              .filter((l) => matches(l.productName, product))
              .map((l) => ({
                product: l.productName,
                sent: qty(l.qtyPieces, l.piecesPerCake, d.isPackaging),
                batches: l.batches.map(
                  (b) =>
                    `رقم ${b.dayNumber}: ${qty(b.qtyPieces, l.piecesPerCake, d.isPackaging)}${b.isOverride ? " (مش الأقدم)" : ""}`,
                ),
                received: l.received ? qty(l.received.qtyPieces, l.piecesPerCake, d.isPackaging) : null,
                damaged_in_transit: l.received?.damagedPieces
                  ? qty(l.received.damagedPieces, l.piecesPerCake, d.isPackaging)
                  : null,
                difference:
                  l.received && l.received.qtyPieces !== l.qtyPieces
                    ? qty(l.received.qtyPieces - l.qtyPieces, l.piecesPerCake, d.isPackaging)
                    : null,
                note: l.received?.note ?? null,
              })),
          }))
          .filter((d) => !product || d.lines.length > 0);

        return json({
          period: `${p.start} → ${p.end}`,
          requests: requests.slice(0, 40),
          dispatches: dispatches.slice(0, 40),
          source: "الطلبات والإخراج بالبرنامج",
        });
      },
    }),

    betaZodTool({
      name: "orders_day_totals",
      description:
        "Totals of everything the branches ordered from the factory on one day, per product and per branch (the production list). Default today.",
      inputSchema: z.object({ date: isoDate.optional() }),
      run: async ({ date }) => {
        const day = date ?? businessDate(now);
        const summary = await ordersOfDay(day);
        return json({
          date: day,
          requests: summary.requests,
          rows: summary.rows.map((r) => ({
            product: r.product.nameEn,
            total: formatQuantity(r.total, r.product.piecesPerCake),
            by_branch: Object.fromEntries(
              summary.branches.map((b) => [
                b.name,
                formatQuantity(r.byBranch.get(b.id) ?? 0, r.product.piecesPerCake),
              ]),
            ),
          })),
          source: `مجموع طلبات ${formatLongDate(day)}`,
        });
      },
    }),

    betaZodTool({
      name: "count_detail",
      description:
        "Line-by-line details of stock counts at a place: for each product what was counted, what the books expected, the difference (consumption or impossible extra), who counted, method (manual/photo) and photo corrections. Default the latest count; give a date for counts on that count day (a count after midnight belongs to the day before).",
      inputSchema: z.object({
        location: z.string().describe("Place name in Arabic"),
        date: isoDate.optional(),
        product: z.string().optional(),
      }),
      run: async ({ location, date, product }) => {
        const locs = await places(db);
        const loc = locs.find((l) => matches(l.name, location));
        if (!loc) return json({ error: "location not found", places: locs.map((l) => l.name) });
        let query = db
          .from("v_count_list")
          .select(
            "id, business_date, started_at, method, is_opening, counted_by, consumed_cakes, impossible_lines",
          )
          .eq("location_id", loc.id)
          .order("started_at", { ascending: false })
          .limit(date ? 6 : 1);
        if (date) query = query.eq("business_date", date);
        const [{ data: counts }, products, names] = await Promise.all([
          query,
          productList(db),
          staffNames(db),
        ]);
        const byId = new Map(products.map((p) => [p.id, p]));
        const result = [];
        for (const c of counts ?? []) {
          const { data: lines } = await db.rpc("count_breakdown", { p_count_id: c.id! });
          result.push({
            started: when(c.started_at!, now),
            count_day: c.business_date,
            by: names.get(c.counted_by!) ?? c.counted_by,
            method: c.method === "photo" ? "بالصورة" : "يدوي",
            opening: c.is_opening,
            consumption_cakes: c.consumed_cakes,
            impossible_lines: c.impossible_lines,
            lines: (lines ?? [])
              .map((l) => ({ l, p: byId.get(l.product_id) }))
              .filter(({ p }) => matches(p?.name, product) || matches(p?.nameAr, product))
              .map(({ l, p }) => ({
                product: p?.name ?? l.product_id,
                counted: formatQuantity(l.counted_qty, p?.ppc ?? null),
                expected: formatQuantity(l.expected_qty, p?.ppc ?? null),
                difference: formatQuantity(l.adjustment_qty, p?.ppc ?? null),
                photo_read_corrected:
                  l.ocr_whole_cakes !== null &&
                  (l.ocr_whole_cakes !== l.whole_cakes || l.ocr_loose_pieces !== l.loose_pieces),
              })),
          });
        }
        return json({ location: loc.name, counts: result, source: `جرودات ${loc.name}` });
      },
    }),

    betaZodTool({
      name: "waste_records",
      description:
        "Individual waste records (not just totals): product, quantity, reason (expired, broken, transit damage, other with note), who recorded it, when, and the batch day number at the factory. Filter by place, product, date range (default last 7 days).",
      inputSchema: z.object({
        location: z.string().optional(),
        product: z.string().optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
      }),
      run: async ({ location, product, from, to }) => {
        const p = period(from, to, now, 7);
        const [locs, products, names, { data }] = await Promise.all([
          places(db),
          productList(db),
          staffNames(db),
          db
            .from("waste_records")
            .select(
              "location_id, product_id, qty_pieces, reason, reason_note, recorded_by, occurred_at, batch:batches(production_date)",
            )
            .gte("occurred_at", p.fromIso)
            .lt("occurred_at", p.toIso)
            .order("occurred_at", { ascending: false })
            .limit(200),
        ]);
        const REASON: Record<string, string> = { expired: "انتهت", broken: "انكسرت", other: "غيره" };
        const rows = (data ?? [])
          .map((w) => ({
            w,
            loc: locs.find((l) => l.id === w.location_id),
            prod: products.find((x) => x.id === w.product_id),
          }))
          .filter(
            ({ loc, prod }) =>
              matches(loc?.name, location) &&
              (matches(prod?.name, product) || matches(prod?.nameAr, product)),
          )
          .map(({ w, loc, prod }) => ({
            place: loc?.name,
            product: prod?.name,
            quantity: qty(w.qty_pieces ?? 0, prod?.ppc ?? null, prod?.kind === "packaging"),
            reason: REASON[w.reason] ?? w.reason,
            note: w.reason_note,
            by: names.get(w.recorded_by) ?? null,
            when: when(w.occurred_at, now),
            batch_date: w.batch?.production_date ?? null,
          }));
        return json({
          period: `${p.start} → ${p.end}`,
          records: rows.slice(0, 80),
          total_records: rows.length,
          source: "سجل التالف",
        });
      },
    }),

    betaZodTool({
      name: "production_records",
      description:
        "What the factory produced: each production entry with products and quantities, batch date and who recorded it. Date range default last 3 days.",
      inputSchema: z.object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        product: z.string().optional(),
      }),
      run: async ({ from, to, product }) => {
        const p = period(from, to, now, 3);
        const [products, names, { data }] = await Promise.all([
          productList(db),
          staffNames(db),
          db
            .from("production_entries")
            .select(
              "production_date, recorded_by, recorded_at, note, production_lines(product_id, qty_pieces)",
            )
            .gte("production_date", p.start)
            .lte("production_date", p.end)
            .order("recorded_at", { ascending: false })
            .limit(60),
        ]);
        const byId = new Map(products.map((x) => [x.id, x]));
        const totals = new Map<string, number>();
        const entries = (data ?? []).map((e) => ({
          batch_date: e.production_date,
          recorded: when(e.recorded_at, now),
          by: names.get(e.recorded_by) ?? null,
          note: e.note,
          lines: e.production_lines
            .filter((l) => matches(byId.get(l.product_id)?.name, product))
            .map((l) => {
              totals.set(l.product_id, (totals.get(l.product_id) ?? 0) + (l.qty_pieces ?? 0));
              const prod = byId.get(l.product_id);
              return { product: prod?.name, quantity: formatQuantity(l.qty_pieces ?? 0, prod?.ppc ?? null) };
            }),
        }));
        return json({
          period: `${p.start} → ${p.end}`,
          totals: [...totals].map(([id, pieces]) => ({
            product: byId.get(id)?.name,
            quantity: formatQuantity(pieces, byId.get(id)?.ppc ?? null),
          })),
          entries,
          source: "تسجيل الإنتاج",
        });
      },
    }),

    betaZodTool({
      name: "factory_batches",
      description:
        "Every batch in factory stock right now: product, day number (1=Saturday … 7=Friday), production date, quantity left, age, last day and expired flags.",
      inputSchema: z.object({ product: z.string().optional() }),
      run: async ({ product }) => {
        const [products, { data }] = await Promise.all([
          productList(db),
          db
            .from("v_factory_batches")
            .select(
              "product_id, production_date, day_number, qty_pieces, age_days, expires_on, is_last_day, is_expired",
            )
            .gt("qty_pieces", 0)
            .order("production_date"),
        ]);
        const byId = new Map(products.map((x) => [x.id, x]));
        return json({
          batches: (data ?? [])
            .filter((b) => matches(byId.get(b.product_id!)?.name, product))
            .map((b) => ({
              product: byId.get(b.product_id!)?.name,
              day_number: b.day_number,
              produced: b.production_date,
              quantity: formatQuantity(b.qty_pieces ?? 0, byId.get(b.product_id!)?.ppc ?? null),
              age_days: b.age_days,
              last_day: b.is_last_day,
              expired: b.is_expired,
            })),
          source: "دفعات المصنع (الدفتر)",
        });
      },
    }),

    betaZodTool({
      name: "staff_directory",
      description:
        "Staff: name, phone, place, roles, active or stopped, locked after wrong PINs, and last login. Never includes PINs (they are not stored).",
      inputSchema: z.object({ name: z.string().optional(), location: z.string().optional() }),
      run: async ({ name, location }) => {
        const [locs, { data }] = await Promise.all([
          places(db),
          db
            .from("staff")
            .select(
              "full_name, phone, location_id, is_active, locked_until, requires_admin_reset, last_login_at, staff_roles!staff_roles_staff_id_fkey(role)",
            )
            .order("full_name"),
        ]);
        return json({
          staff: (data ?? [])
            .map((s) => ({ s, loc: locs.find((l) => l.id === s.location_id) }))
            .filter(({ s, loc }) => matches(s.full_name, name) && (!location || matches(loc?.name, location)))
            .map(({ s, loc }) => ({
              name: s.full_name,
              phone: `0${s.phone.slice(3)}`,
              place: loc?.name ?? "كل المواقع",
              roles: s.staff_roles.map((r) => ROLE_LABELS[r.role] ?? r.role),
              active: s.is_active,
              locked: s.requires_admin_reset || (s.locked_until !== null && new Date(s.locked_until) > now),
              last_login: s.last_login_at ? when(s.last_login_at, now) : "ما دخل لسا",
            })),
          source: "الموظفين والأدوار",
        });
      },
    }),

    betaZodTool({
      name: "settings_and_levels",
      description:
        "App settings (approval, transfers, returns, shelf lives, pieces per cake, loose pieces from factory, photo count, reminder minutes), daily count times and monthly count times per place, and par (target) and minimum levels per product per place.",
      inputSchema: z.object({ location: z.string().optional(), product: z.string().optional() }),
      run: async ({ location, product }) => {
        const [locs, products, settings, schedules, monthly, levels] = await Promise.all([
          places(db),
          productList(db),
          db.from("app_settings").select("*").single(),
          db
            .from("count_schedules")
            .select("location_id, time_of_day")
            .eq("is_active", true)
            .order("time_of_day"),
          db.from("monthly_counts").select("location_id, scope, time_of_day").eq("is_active", true),
          db.from("par_levels").select("location_id, product_id, par_pieces, min_pieces"),
        ]);
        const s = settings.data;
        const wanted = locs.filter((l) => matches(l.name, location) && l.kind !== "returns_bin");
        return json({
          settings: s && {
            order_approval_required: s.order_approval_required,
            branch_transfers_enabled: s.branch_transfers_enabled,
            returns_enabled: s.returns_enabled,
            factory_loose_pieces_enabled: s.factory_loose_pieces_enabled,
            photo_count_enabled: s.photo_count_enabled,
            default_pieces_per_cake: s.default_pieces_per_cake,
            factory_shelf_life_days: s.factory_shelf_life_days,
            branch_shelf_life_days: s.branch_shelf_life_days,
            unreceived_alert_hours: s.unreceived_alert_hours,
            reminder_minutes_before: s.count_reminder_minutes_before,
            late_after_minutes: s.count_late_after_minutes,
          },
          places: wanted.map((l) => ({
            place: l.name,
            daily_counts: (schedules.data ?? [])
              .filter((c) => c.location_id === l.id)
              .map((c) => formatScheduleTime(c.time_of_day)),
            monthly_counts: (monthly.data ?? [])
              .filter((m) => m.location_id === l.id)
              .map(
                (m) =>
                  `${m.scope === "raw" ? "المواد الأولية" : "الستوك"} ${formatScheduleTime(m.time_of_day)}`,
              ),
            levels: (levels.data ?? [])
              .filter((v) => v.location_id === l.id)
              .map((v) => ({ v, p: products.find((x) => x.id === v.product_id) }))
              .filter(({ p }) => matches(p?.name, product) || matches(p?.nameAr, product))
              .map(({ v, p }) => ({
                product: p?.name,
                par: v.par_pieces ? qty(v.par_pieces, p?.ppc ?? null, p?.kind === "packaging") : null,
                min:
                  v.min_pieces === null ? null : qty(v.min_pieces, p?.ppc ?? null, p?.kind === "packaging"),
              })),
          })),
          source: "الإعدادات",
        });
      },
    }),

    betaZodTool({
      name: "raw_material_movements",
      description:
        "Raw material movements: deliveries from suppliers (with supplier name), issues to production, and counts, with quantities in base unit, who and when. Filter by material and date range (default last 7 days).",
      inputSchema: z.object({
        material: z.string().optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
      }),
      run: async ({ material, from, to }) => {
        const p = period(from, to, now, 7);
        const [names, { data }] = await Promise.all([
          staffNames(db),
          db
            .from("raw_movements")
            .select(
              "occurred_at, movement_type, qty_base, supplier_name, created_by, material:raw_materials(name, base_unit)",
            )
            .gte("occurred_at", p.fromIso)
            .lt("occurred_at", p.toIso)
            .order("occurred_at", { ascending: false })
            .limit(200),
        ]);
        const TYPE: Record<string, string> = {
          receipt: "استلام من مورد",
          issue: "صرف للإنتاج",
          count_adjustment: "تعديل جرد",
          opening_balance: "رصيد افتتاحي",
          admin_correction: "تصحيح من الأدمن",
        };
        return json({
          period: `${p.start} → ${p.end}`,
          movements: (data ?? [])
            .filter((m) => matches(m.material?.name, material))
            .slice(0, 80)
            .map((m) => ({
              material: m.material?.name,
              type: TYPE[m.movement_type] ?? m.movement_type,
              quantity: `${Number(m.qty_base)} ${m.material?.base_unit ?? ""}`,
              supplier: m.supplier_name,
              by: m.created_by ? (names.get(m.created_by) ?? null) : null,
              when: when(m.occurred_at, now),
            })),
          source: "حركات المواد الأولية",
        });
      },
    }),

    betaZodTool({
      name: "change_history",
      description:
        "Audit log of changes: corrected counts (with the reason), settings changes, product and level changes, staff changes and PIN resets, schedules. Who changed what and when. Default last 7 days.",
      inputSchema: z.object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        table: z.string().optional(),
      }),
      run: async ({ from, to, table }) => {
        const p = period(from, to, now, 7);
        const [names, locs, products, { data }] = await Promise.all([
          staffNames(db),
          places(db),
          productList(db),
          db
            .from("audit_log")
            .select("table_name, action, reason, changed_by, changed_at, old_values, new_values")
            .gte("changed_at", p.fromIso)
            .lt("changed_at", p.toIso)
            .order("changed_at", { ascending: false })
            .limit(60),
        ]);
        return json({
          period: `${p.start} → ${p.end}`,
          changes: (data ?? [])
            .filter((a) => !table || a.table_name.includes(table))
            .map((a) => ({
              what: a.table_name,
              action: a.action,
              reason: a.reason,
              by: a.changed_by ? (names.get(a.changed_by) ?? null) : "النظام",
              when: when(a.changed_at, now),
              before: readable(a.old_values, locs, products, names),
              after: readable(a.new_values, locs, products, names),
            })),
          source: "سجل التعديلات",
        });
      },
    }),

    betaZodTool({
      name: "today_overview",
      description:
        "A quick picture of right now: today's count day, counts done or late today per place, requests waiting, dispatches on the road, and products under minimum per place. Good first call for 'شو الوضع اليوم'.",
      inputSchema: z.object({}),
      run: async () => {
        const [locs, products, slots, below, docs] = await Promise.all([
          places(db),
          productList(db),
          db.from("v_count_slots_today").select("location_id, time_of_day, status").order("slot_at"),
          db.from("v_below_min").select("location_id, product_id, qty_pieces, min_pieces"),
          loadDocuments({
            requests: { statuses: ["pending_approval", "sent"] },
            dispatches: { statuses: ["in_transit"] },
            sinceDays: 14,
          }),
        ]);
        const name = (id: string | null) => locs.find((l) => l.id === id)?.name;
        const prod = (id: string | null) => products.find((x) => x.id === id);
        const SLOT: Record<string, string> = {
          done: "انعمل",
          late: "متأخر",
          due: "وقته هلا",
          upcoming: "لسا",
        };
        return json({
          count_day: countDay(now),
          counts: (slots.data ?? []).map((s) => ({
            place: name(s.location_id),
            time: formatScheduleTime(s.time_of_day!),
            status: SLOT[s.status!] ?? s.status,
          })),
          waiting_requests: docs.requests.map((r) => ({
            branch: r.fromName,
            to: r.toName,
            status: STATUS[r.status],
            requested: when(r.requestedAt, now),
          })),
          on_the_road: docs.dispatches.map((d) => ({
            from: d.fromName,
            to: d.toName,
            hours: Math.floor(d.hoursInTransit),
            driver: d.driverName,
          })),
          below_min: (below.data ?? []).map((b) => {
            const p = prod(b.product_id);
            return {
              place: name(b.location_id),
              product: p?.name,
              have: qty(b.qty_pieces ?? 0, p?.ppc ?? null, p?.kind === "packaging"),
              min: qty(b.min_pieces ?? 0, p?.ppc ?? null, p?.kind === "packaging"),
            };
          }),
          source: `وضع ${formatLongDate(businessDate(now))} ${formatClock(now)}`,
        });
      },
    }),
  ];
}
