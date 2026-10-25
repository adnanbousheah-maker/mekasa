"use client";

import { useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { baseQuantity, type ImportError, type ImportRow } from "../import";
import { confirmRawImportAction, previewRawImportAction } from "../import-actions";

/** جرد المواد الأولية من ملف Excel: قالب، رفع، مراجعة، تأكيد. */
export function RawImportButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [isWorking, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setErrors([]);
    setMessage(null);
    setDone(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const preview = (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const result = await previewRawImportAction(form);
      if (result.status === "error") {
        setRows(null);
        setErrors([]);
        setMessage(result.message);
      } else {
        setRows(result.rows);
        setErrors(result.errors);
        setMessage(null);
      }
    });
  };

  const confirm = () =>
    startTransition(async () => {
      if (!rows) return;
      const result = await confirmRawImportAction(rows);
      if (result.status === "error") setMessage(result.message);
      else {
        setDone(result.count);
        setRows(null);
      }
    });

  const newMaterials = rows?.filter((r) => !r.existing).length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold"
      >
        رفع جرد من Excel
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="جرد المواد من Excel">
        {done !== null ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="rounded-xl bg-ok-soft px-3 py-2 font-semibold text-ok-text">
              انحفظ جرد {done} {done === 1 ? "مادة" : "مواد"}.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 rounded-xl bg-ink font-semibold text-white"
            >
              تمام
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="flex list-inside list-decimal flex-col gap-1 text-sm text-muted">
              <li>
                نزّل{" "}
                <a href="/admin/export/raw-template" download className="font-semibold text-ink underline">
                  القالب
                </a>{" "}
                (فيه كل المواد الموجودة).
              </li>
              <li>اكتب الكمية لكل مادة انعدّت. اللي بتتركها فاضية ما بتتغير.</li>
              <li>التعبئة متل «كيس 25 كيلو» أو «كيلو». مادة مش موجودة بتنضاف لحالها.</li>
            </ol>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">الملف</span>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => preview(e.target.files?.[0])}
                className="text-sm"
              />
            </label>
            {isWorking && <p className="text-sm text-muted">لحظة…</p>}
            {message && (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-text">
                {message}
              </p>
            )}
            {errors.length > 0 && (
              <div role="alert" className="flex flex-col gap-1 rounded-xl bg-warn-soft px-3 py-2 text-sm">
                <strong className="text-warn-text">
                  {errors.length === 1 ? "سطر ما انقرأ" : `${errors.length} أسطر ما انقرأت`} (رح تنتجاهل)
                </strong>
                <ul className="flex flex-col gap-0.5 text-warn-text">
                  {errors.map((e) => (
                    <li key={e.row}>
                      السطر {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rows && rows.length > 0 && (
              <>
                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line">
                  <table className="w-full text-sm" aria-label="مراجعة الجرد">
                    <thead>
                      <tr className="bg-table-head text-table-head-text">
                        <th className="px-2 py-1.5 text-right">المادة</th>
                        <th className="px-2 py-1.5">الكمية</th>
                        <th className="px-2 py-1.5">بالوحدة الأساسية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.row} className="border-t border-line-soft">
                          <td className="px-2 py-1.5">
                            {r.name}
                            {!r.existing && (
                              <span className="ms-1.5 rounded-md bg-info-soft px-1.5 text-xs text-info-text">
                                جديدة
                              </span>
                            )}
                            {r.existing && r.newUnit && (
                              <span className="ms-1.5 rounded-md bg-info-soft px-1.5 text-xs text-info-text">
                                تعبئة جديدة
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center tabular-nums">
                            {r.qty} {r.packaging.unitName ?? r.packaging.baseUnit}
                          </td>
                          <td className="px-2 py-1.5 text-center tabular-nums">
                            {baseQuantity(r)} {r.packaging.baseUnit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={confirm}
                  className="h-12 rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
                >
                  احفظ جرد {rows.length} {rows.length === 1 ? "مادة" : "مواد"}
                  {newMaterials > 0 ? ` (${newMaterials} جديدة)` : ""}
                </button>
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
