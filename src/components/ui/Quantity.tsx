import { formatQuantity, formatQuantityCompact } from "@/lib/units";

type Props = {
  pieces: number;
  /** null للأصناف اللي بتنباع قطع بس */
  piecesPerCake: number | null;
  compact?: boolean;
};

/** بيعرض كمية مخزنة بالقطع بشكل "3 كيكات + 5 قطع". الرقم السالب بالأحمر لأنه مشكلة. */
export function Quantity({ pieces, piecesPerCake, compact = false }: Props) {
  const text = compact ? formatQuantityCompact(pieces, piecesPerCake) : formatQuantity(pieces, piecesPerCake);
  const tone = pieces < 0 ? "text-danger font-semibold" : undefined;

  return <span className={tone}>{text}</span>;
}
