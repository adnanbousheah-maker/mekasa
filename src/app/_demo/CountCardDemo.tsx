"use client";

import { useState } from "react";
import { ProductName } from "@/components/ui/ProductName";
import { Quantity } from "@/components/ui/Quantity";
import { Stepper } from "@/components/ui/Stepper";
import { toPieces } from "@/lib/units";

const PIECES_PER_CAKE = 10;

/** نسخة من كرت الصنف بشاشة تأكيد الجرد، للتجربة بس. */
export function CountCardDemo() {
  const [wholeCakes, setWholeCakes] = useState(3);
  const [loosePieces, setLoosePieces] = useState(5);
  const total = toPieces({ wholeCakes, loosePieces }, PIECES_PER_CAKE);

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="size-11 rounded-[10px] bg-quiet-strong" />
        <ProductName name="Classic Choco" className="grow text-[17px] font-semibold" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Stepper
          label="كيكات"
          value={wholeCakes}
          onChange={setWholeCakes}
          incrementLabel="زيد كيكة"
          decrementLabel="نقّص كيكة"
        />
        <Stepper
          label="قطع"
          value={loosePieces}
          onChange={setLoosePieces}
          incrementLabel="زيد قطعة"
          decrementLabel="نقّص قطعة"
        />
      </div>
      <p className="text-sm text-muted">
        المجموع: <Quantity pieces={total} piecesPerCake={PIECES_PER_CAKE} /> ({total} قطعة)
      </p>
    </div>
  );
}
