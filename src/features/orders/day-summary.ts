// طلبيات يوم: كل اللي طلبته الفروع من المصنع، مجمّع حسب الصنف (للإنتاج)

export interface DayLine {
  branchId: string;
  branchName: string;
  productId: string;
  qtyPieces: number;
}

export interface DayProduct {
  id: string;
  nameEn: string;
  piecesPerCake: number | null;
}

export interface DaySummary {
  branches: { id: string; name: string }[];
  rows: { product: DayProduct; byBranch: Map<string, number>; total: number }[];
  requests: number;
}

/** الأصناف بترتيب المنيو، والفروع حسب أول ظهور، وبس الأصناف اللي انطلبت. */
export function summarizeDay(lines: DayLine[], products: DayProduct[], requests: number): DaySummary {
  const branches: DaySummary["branches"] = [];
  const totals = new Map<string, Map<string, number>>();
  for (const l of lines) {
    if (l.qtyPieces <= 0) continue;
    if (!branches.some((b) => b.id === l.branchId)) branches.push({ id: l.branchId, name: l.branchName });
    const byBranch = totals.get(l.productId) ?? new Map<string, number>();
    byBranch.set(l.branchId, (byBranch.get(l.branchId) ?? 0) + l.qtyPieces);
    totals.set(l.productId, byBranch);
  }
  const rows = products.flatMap((product) => {
    const byBranch = totals.get(product.id);
    if (!byBranch) return [];
    return [{ product, byBranch, total: [...byBranch.values()].reduce((s, q) => s + q, 0) }];
  });
  return { branches, rows, requests };
}

/** "2026-10-25" → اليوم اللي قبله أو بعده. */
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
