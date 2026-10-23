// الوحدة الأساسية للكيك هي القطعة (CLAUDE.md، القاعدة 2).
// كل الكميات المخزنة أعداد صحيحة بالقطع، والواجهة بتعرضها "3 كيكات + 5 قطع".

export type CountUnit = "cake" | "piece";

export interface CakeCount {
  wholeCakes: number;
  loosePieces: number;
}

export interface SplitQuantity {
  cakes: number;
  pieces: number;
}

const MINUS = "−";

const WORDS: Record<CountUnit, { singular: string; plural: string; short: string }> = {
  cake: { singular: "كيكة", plural: "كيكات", short: "ك" },
  piece: { singular: "قطعة", plural: "قطع", short: "ق" },
};

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

function assertPiecesPerCake(piecesPerCake: number): void {
  if (!Number.isInteger(piecesPerCake) || piecesPerCake < 1) {
    throw new RangeError(`piecesPerCake must be a positive integer, got ${piecesPerCake}`);
  }
}

export function resolvePiecesPerCake(productOverride: number | null, globalDefault: number): number {
  const value = productOverride ?? globalDefault;
  assertPiecesPerCake(value);
  return value;
}

export function toPieces(count: CakeCount, piecesPerCake: number): number {
  assertCount(count.wholeCakes, "wholeCakes");
  assertCount(count.loosePieces, "loosePieces");
  assertPiecesPerCake(piecesPerCake);
  return count.wholeCakes * piecesPerCake + count.loosePieces;
}

export function splitPieces(totalPieces: number, piecesPerCake: number): SplitQuantity {
  assertCount(totalPieces, "totalPieces");
  assertPiecesPerCake(piecesPerCake);
  return {
    cakes: Math.floor(totalPieces / piecesPerCake),
    pieces: totalPieces % piecesPerCake,
  };
}

/** صيغة العدد بالعربي: 3–10 جمع، والباقي مفرد ("11 كيكة"، "2 كيكة" متل التصميم). */
export function countWord(n: number, unit: CountUnit): string {
  const lastTwo = Math.abs(n) % 100;
  const isPlural = n === 0 || (lastTwo >= 3 && lastTwo <= 10);
  return isPlural ? WORDS[unit].plural : WORDS[unit].singular;
}

function withWord(n: number, unit: CountUnit): string {
  return `${n} ${countWord(n, unit)}`;
}

/**
 * @param piecesPerCake عدد القطع بالكيكة، أو null للأصناف اللي بتنباع قطع بس.
 */
export function formatQuantity(totalPieces: number, piecesPerCake: number | null): string {
  const sign = totalPieces < 0 ? MINUS : "";
  const abs = Math.abs(totalPieces);

  if (piecesPerCake === null) {
    return sign + withWord(abs, "piece");
  }

  const { cakes, pieces } = splitPieces(abs, piecesPerCake);
  if (abs === 0) return withWord(0, "cake");
  if (cakes === 0) return sign + withWord(pieces, "piece");
  if (pieces === 0) return sign + withWord(cakes, "cake");
  return `${sign}${withWord(cakes, "cake")} + ${withWord(pieces, "piece")}`;
}

/** الصيغة القصيرة لجداول الأدمن: "3 ك · 5 ق". */
export function formatQuantityCompact(totalPieces: number, piecesPerCake: number | null): string {
  const sign = totalPieces < 0 ? MINUS : "";
  const abs = Math.abs(totalPieces);

  if (piecesPerCake === null) {
    return `${sign}${abs} ${WORDS.piece.short}`;
  }

  const { cakes, pieces } = splitPieces(abs, piecesPerCake);
  return `${sign}${cakes} ${WORDS.cake.short} · ${pieces} ${WORDS.piece.short}`;
}
