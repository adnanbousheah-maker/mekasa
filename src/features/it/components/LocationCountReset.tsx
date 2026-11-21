"use client";

import { useState } from "react";
import { resetLocationCountsAction } from "../actions";
import { RESET_WORD } from "../words";
import { ConfirmWordAction } from "./ConfirmWordAction";

type Location = { id: string; name: string; kind: string };

/** تصفير جرودات موقع واحد: بتختار الموقع، والمصنع فيه خيار المواد الأولية كمان. */
export function LocationCountReset({ locations }: { locations: Location[] }) {
  const [locationId, setLocationId] = useState("");
  const [includeRaw, setIncludeRaw] = useState(false);
  const location = locations.find((l) => l.id === locationId) ?? null;
  const isFactory = location?.kind === "factory";

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">الموقع</span>
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setIncludeRaw(false);
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
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            checked={includeRaw}
            onChange={(e) => setIncludeRaw(e.target.checked)}
            className="size-6"
          />
          <span className="text-[15px]">ومعها جرد المواد الأولية</span>
        </label>
      )}
      {location && (
        <ConfirmWordAction
          key={`${location.id}-${includeRaw}`}
          word={RESET_WORD}
          label="ما في رجعة. للتأكيد"
          buttonLabel={`صفّر جرودات ${location.name}`}
          doneMessage="انصفّرت الجرودات"
          onConfirm={(word) => resetLocationCountsAction(location.id, isFactory && includeRaw, word)}
        />
      )}
    </div>
  );
}
