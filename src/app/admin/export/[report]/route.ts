import { type NextRequest } from "next/server";
import { getCurrentStaff } from "@/features/auth/session";
import { addDays, parseRange, toCakes } from "@/features/reports/format";
import {
  consumptionSince,
  getCountDetail,
  listCounts,
  listReportLocations,
  listReportProducts,
  listWaste,
  stockByProduct,
} from "@/features/reports/queries";
import { listStaff } from "@/features/staff/queries";
import { ROLE_LABELS } from "@/features/staff/roles";
import { WASTE_REASON_LABELS } from "@/features/waste/schemas";
import { buildWorkbook, excelResponse, sheet, type ExcelSheet } from "@/lib/excel";
import { businessDate, formatClock } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// تصدير Excel لكل جداول لوحة الأدمن: /admin/export/{stock|counts|count|waste|staff}
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff?.roles.includes("admin")) return new Response("forbidden", { status: 403 });

  const { report } = await params;
  const search = request.nextUrl.searchParams;
  const today = businessDate(new Date());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- أوراق بأنواع صفوف مختلفة
  let sheets: ExcelSheet<any>[];

  switch (report) {
    case "stock": {
      const use = search.get("view") === "use";
      const [locations, products, source] = await Promise.all([
        listReportLocations(),
        listReportProducts(),
        use ? consumptionSince(addDays(today, -6)) : stockByProduct(),
      ]);
      const columns = use ? locations.filter((l) => l.kind === "branch") : locations;
      sheets = [
        sheet({
          name: use ? "استهلاك 7 أيام" : "الستوك",
          rows: products.filter((p) => p.isActive || source.has(p.id)),
          columns: [
            { header: "الصنف", value: (p: (typeof products)[number]) => p.nameEn, width: 28 },
            { header: "قطع بالكيكة", value: (p) => p.piecesPerCake ?? "قطع بس" },
            ...columns.map((l) => ({
              header: `${l.name} (قطع)`,
              value: (p: (typeof products)[number]) => source.get(p.id)?.get(l.id) ?? 0,
            })),
            ...columns.map((l) => ({
              header: `${l.name} (كيكات)`,
              value: (p: (typeof products)[number]) =>
                p.piecesPerCake
                  ? Math.round(toCakes(source.get(p.id)?.get(l.id) ?? 0, p.piecesPerCake) * 10) / 10
                  : null,
            })),
          ],
        }),
      ];
      break;
    }
    case "counts": {
      const location = search.get("location");
      const counts = await listCounts({
        locationId: location && UUID.test(location) ? location : undefined,
        limit: 1000,
      });
      sheets = [
        sheet({
          name: "الجرودات",
          rows: counts,
          columns: [
            { header: "الموقع", value: (c: (typeof counts)[number]) => c.locationName },
            { header: "التاريخ", value: (c) => c.businessDate },
            { header: "الموعد", value: (c) => c.scheduleTime?.slice(0, 5) ?? "" },
            { header: "بلش", value: (c) => formatClock(new Date(c.startedAt)) },
            { header: "تأكد", value: (c) => formatClock(new Date(c.confirmedAt)) },
            { header: "الموظف", value: (c) => c.countedBy },
            { header: "الطريقة", value: (c) => (c.method === "photo" ? "بالصورة" : "يدوي") },
            { header: "افتتاحي", value: (c) => (c.isOpening ? "نعم" : "") },
            { header: "الاستهلاك (كيكات)", value: (c) => (c.isOpening ? null : c.consumedCakes) },
            { header: "أرقام مستحيلة", value: (c) => c.impossibleLines },
            { header: "صححها الموظف", value: (c) => c.staffCorrectedLines },
          ],
        }),
      ];
      break;
    }
    case "count": {
      const id = search.get("id") ?? "";
      const detail = UUID.test(id) ? await getCountDetail(id) : null;
      if (!detail) return new Response("not found", { status: 404 });
      sheets = [
        sheet({
          name: "الجرد",
          rows: detail.lines,
          columns: [
            { header: "الصنف", value: (l: (typeof detail.lines)[number]) => l.productName, width: 28 },
            { header: "رقم الدفعة", value: (l) => l.dayNumber ?? "" },
            { header: "كيكات", value: (l) => l.wholeCakes },
            { header: "قطع", value: (l) => l.loosePieces },
            { header: "العد (قطع)", value: (l) => l.counted },
            { header: "الجرد قبل (قطع)", value: (l) => l.prev },
            { header: "دخل", value: (l) => l.in },
            { header: "طلع", value: (l) => l.out },
            { header: "تالف", value: (l) => l.waste },
            { header: "المتوقع", value: (l) => l.expected },
            { header: "الاستهلاك", value: (l) => (detail.summary.isOpening ? null : -l.adjustment) },
            { header: "قراءة الصورة: كيكات", value: (l) => l.ocr.wholeCakes },
            { header: "قراءة الصورة: قطع", value: (l) => l.ocr.loosePieces },
          ],
        }),
        sheet({
          name: "سجل التعديلات",
          rows: detail.audit,
          columns: [
            { header: "الوقت", value: (a: (typeof detail.audit)[number]) => a.changedAt },
            { header: "مين", value: (a) => a.changedBy },
            { header: "الصنف", value: (a) => a.productName },
            { header: "قبل", value: (a) => `${a.before.wholeCakes} ك · ${a.before.loosePieces} ق` },
            { header: "بعد", value: (a) => `${a.after.wholeCakes} ك · ${a.after.loosePieces} ق` },
            { header: "السبب", value: (a) => a.reason, width: 40 },
          ],
        }),
      ];
      break;
    }
    case "waste": {
      const { rows } = await listWaste(parseRange(search.get("range")));
      sheets = [
        sheet({
          name: "التالف",
          rows,
          columns: [
            { header: "الوقت", value: (r: (typeof rows)[number]) => r.occurredAt },
            { header: "الموقع", value: (r) => r.locationName },
            { header: "الصنف", value: (r) => r.productName, width: 28 },
            { header: "رقم الدفعة", value: (r) => r.dayNumber ?? "" },
            { header: "الكمية", value: (r) => r.enteredQty },
            { header: "الوحدة", value: (r) => (r.enteredUnit === "cake" ? "كيكة" : "قطعة") },
            { header: "بالقطع", value: (r) => r.qtyPieces },
            { header: "السبب", value: (r) => WASTE_REASON_LABELS[r.reason] },
            { header: "ملاحظة", value: (r) => r.note, width: 30 },
            { header: "مين", value: (r) => r.recordedBy },
            { header: "صورة", value: (r) => (r.photoPath ? "نعم" : "") },
          ],
        }),
      ];
      break;
    }
    case "staff": {
      const rows = await listStaff();
      sheets = [
        sheet({
          name: "الموظفين",
          rows,
          columns: [
            { header: "الاسم", value: (s: (typeof rows)[number]) => s.fullName, width: 22 },
            { header: "الجوال", value: (s) => s.phone },
            { header: "الموقع", value: (s) => s.location?.name ?? "كل المواقع" },
            { header: "الأدوار", value: (s) => s.roles.map((r) => ROLE_LABELS[r]).join("، "), width: 30 },
            { header: "الحالة", value: (s) => (s.isActive ? (s.isLocked ? "مقفول" : "نشط") : "موقوف") },
            { header: "آخر دخول", value: (s) => s.lastLoginAt },
          ],
        }),
      ];
      break;
    }
    default:
      return new Response("not found", { status: 404 });
  }

  return excelResponse(await buildWorkbook(sheets), `mekasa-${report}-${today}`);
}
