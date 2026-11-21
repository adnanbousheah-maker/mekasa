"use client";

import { useState } from "react";
import { resetLocationCountsAction, type ResetScope } from "../actions";
import { RESET_WORD } from "../words";
import { ConfirmWordAction } from "./ConfirmWordAction";

type Location = { id: string; name: string; kind: string };

const SCOPES: { value: ResetScope; label: string; button: string }[] = [
  { value: "stock", label: "جرد الكيك والصوصات", button: "صفّر جرد الكيك والصوصات" },
  { value: "raw", label: "جرد المواد الأولية بس", button: "صفّر جرد المواد الأولية" },
  { value: "both", label: "الاثنين", button: "صفّر كل الجرودات" },
];

/** تصفير جرودات موقع واحد. بالمصنع بتختار: الكيك والصوصات، أو المواد الأولية بس، أو الاثنين. */
export function LocationCountReset({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState("");
  const [scope, setScope] = useState<ResetScope>("stock");
  const location = locations.find((l) => l.id === locationId) ?? null;
  const isFactory = location?.kind === "factory";
  const effective: ResetScope = isFactory ? scope : "stock";
  const chosen = SCOPES.find((s) => s.value === effective)!;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">الموقع</span>
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setScope("stock");
          }}
          className="h-12 rounded-xl border border-line bg-surface px-3 text-base"
        >
          <option value="">اختار الموقع</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {isFactory && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-muted">شو بدك تصفّر؟</legend>
          {SCOPES.map((s) => (
            <label key={s.value} className="flex min-h-12 items-center gap-3">
              <input
                type="radio"
                name="reset-scope"
                value={s.value}
                checked={scope === s.value}
                onChange={() => setScope(s.value)}
                className="size-6"
              />
              <span className="text-[15px]">{s.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {location && (
        <ConfirmWordAction
          key={`${location.id}-${effective}`}
          word={RESET_WORD}
          label="ما في رجعة. للتأكيد"
          buttonLabel={`${chosen.button} بـ${location.name}`}
          doneMessage="انصفّرت الجرودات"
          onConfirm={(word) => resetLocationCountsAction(location.id, effective, word)}
        />
      )}
    </div>
  );
}
