"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { BranchCountForm, type PrefilledLine } from "@/features/counts/components/BranchCountForm";
import type { CountProduct } from "@/features/counts/queries";
import { uploadPhotoAction } from "@/features/photos/actions";
import { compressImage } from "@/lib/image";
import { readCountFormAction } from "../actions";

type Props = { title: string; scheduleId: string | null; startedAt: string };

type State =
  | { step: "shoot" }
  | { step: "reading" }
  | { step: "error"; message: string }
  | {
      step: "confirm";
      products: CountProduct[];
      initial: Record<string, PrefilledLine>;
      photo: { path: string; formVersionId: string };
    };

/** design/branch/CountCamera ← CountConfirm: صوّر، Claude بيقرأ، والموظف بيراجع ويأكد. */
export function PhotoCount({ title, scheduleId, startedAt }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: "shoot" });
  const [preview, setPreview] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shoot = async (file: File | undefined) => {
    if (!file) return;
    setState({ step: "reading" });
    try {
      const blob = await compressImage(file);
      setPreview(URL.createObjectURL(blob));
      const data = new FormData();
      data.set("photo", new File([blob], "form.jpg", { type: "image/jpeg" }));
      const upload = await uploadPhotoAction("count-photos", data);
      if (upload.status === "error") return setState({ step: "error", message: upload.message });

      const read = await readCountFormAction(upload.path);
      if (read.status === "error") return setState({ step: "error", message: read.message });
      setState({
        step: "confirm",
        products: read.products,
        initial: Object.fromEntries(
          read.lines.map((l) => [
            l.productId,
            { wholeCakes: l.wholeCakes, loosePieces: l.loosePieces, unsure: l.unsure, ocr: l.ocr },
          ]),
        ),
        photo: { path: upload.path, formVersionId: read.formVersionId },
      });
    } catch {
      setState({ step: "error", message: "ما قدرنا نرفع الصورة. تأكد من النت وجرب كمان مرة." });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  if (state.step === "confirm") {
    return (
      <>
        <ScreenHeader
          title="راجع الأرقام"
          subtitle="صحح أي رقم غلط، وبعدين أكّد"
          backHref="/count"
          aside={
            preview && (
              <button
                type="button"
                onClick={() => setShowPhoto(true)}
                aria-label="كبّر صورة الفورم"
                className="flex h-16 w-[52px] flex-col items-center justify-end overflow-hidden rounded-lg border border-line-strong bg-table-head p-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- صورة محلية من الجوال */}
                <img src={preview} alt="" className="h-10 w-full object-cover" />
                <span className="text-[9px] text-muted">الصورة</span>
              </button>
            )
          }
        />
        <BranchCountForm
          products={state.products}
          scheduleId={scheduleId}
          startedAt={startedAt}
          initial={state.initial}
          photo={state.photo}
        />
        <Dialog open={showPhoto} onClose={() => setShowPhoto(false)} title="صورة الفورم">
          {/* eslint-disable-next-line @next/next/no-img-element -- صورة محلية من الجوال */}
          {preview && <img src={preview} alt="صورة الفورم" className="max-h-[70vh] w-full object-contain" />}
          <button
            type="button"
            onClick={() => setShowPhoto(false)}
            className="mt-4 h-12 w-full rounded-xl bg-ink font-semibold text-white"
          >
            رجوع للأرقام
          </button>
        </Dialog>
      </>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col gap-4 bg-ink px-5 pt-4 pb-8 text-white">
      <header className="flex items-center justify-between">
        <Link
          href="/count"
          aria-label="رجوع"
          className="flex size-12 items-center justify-center rounded-full bg-white/10"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
        <h1 className="text-[17px] font-semibold">
          صوّر فورم {title === "الجرد" ? "الجرد" : title.replace("جرد ", "")}
        </h1>
        <span className="w-12" />
      </header>

      <div className="relative flex grow items-center justify-center overflow-hidden rounded-[20px] bg-white/10">
        {[
          "top-10 right-10 border-t-4 border-r-4 rounded-tr-lg",
          "top-10 left-10 border-t-4 border-l-4 rounded-tl-lg",
          "bottom-10 right-10 border-b-4 border-r-4 rounded-br-lg",
          "bottom-10 left-10 border-b-4 border-l-4 rounded-bl-lg",
        ].map((c) => (
          <span key={c} aria-hidden="true" className={`absolute size-9 border-white ${c}`} />
        ))}
        {state.step === "reading" ? (
          <div role="status" className="flex flex-col items-center gap-4 text-center">
            <span
              aria-hidden="true"
              className="size-14 animate-spin rounded-full border-4 border-white/20 border-t-white"
            />
            <span className="text-xl font-semibold">عم نقرأ الأرقام…</span>
            <span className="text-[15px] text-white/75">ثواني وبتطلعلك للتأكيد</span>
          </div>
        ) : state.step === "error" ? (
          <div role="alert" className="flex flex-col items-center gap-4 px-6 text-center">
            <span className="text-lg font-semibold">{state.message}</span>
            <Link href="/count/manual" className="text-[15px] underline">
              أدخل يدوي
            </Link>
          </div>
        ) : (
          <p className="px-10 text-center text-[17px] leading-relaxed text-white/85">
            حط الفورم على سطح مستوي بضو منيح، وخلّي المربعات السودا الأربعة جوا الإطار
          </p>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="صورة الفورم"
        onChange={(e) => shoot(e.target.files?.[0])}
      />
      <div className="flex justify-center">
        <button
          type="button"
          disabled={state.step === "reading"}
          onClick={() => input.current?.click()}
          aria-label={state.step === "error" ? "صوّر كمان مرة" : "التقط الصورة"}
          className="size-20 rounded-full border-[5px] border-white/45 bg-white bg-clip-padding disabled:opacity-40"
        />
      </div>
    </div>
  );
}
