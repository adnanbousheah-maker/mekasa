"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { compressImage } from "@/lib/image";
import { uploadPhotoAction } from "../actions";
import type { PhotoBucket } from "../rules";

type Props = {
  bucket: PhotoBucket;
  label: string;
  onUploaded: (path: string | null) => void;
  // للأدمن بس (الموظف بيرفع لموقعه من الجلسة)
  locationId?: string;
};

/** زر "أضف صورة": الكاميرا الخلفية، ضغط بالجوال، ورفع لمجلد الموقع. */
export function PhotoPicker({ bucket, label, onUploaded, locationId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startTransition] = useTransition();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const blob = await compressImage(file);
        const data = new FormData();
        data.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
        if (locationId) data.set("locationId", locationId);
        const result = await uploadPhotoAction(bucket, data);
        if (result.status === "error") {
          setError(result.message);
          onUploaded(null);
          return;
        }
        setPreview(URL.createObjectURL(blob));
        onUploaded(result.path);
      } catch {
        setError("ما قدرنا نقرأ الصورة. جرب صورة ثانية.");
        onUploaded(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={label}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {preview ? (
        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- صورة محلية من الجوال */}
          <img src={preview} alt="الصورة اللي انرفعت" className="size-14 rounded-lg object-cover" />
          <span className="grow text-[15px] text-ok-text">انرفعت الصورة</span>
          <button
            type="button"
            className="h-12 px-3 text-sm text-muted"
            onClick={() => {
              setPreview(null);
              onUploaded(null);
              if (input.current) input.current.value = "";
            }}
          >
            شيلها
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={isUploading}
          onClick={() => input.current?.click()}
          className="flex h-16 items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-line-dashed text-base text-muted disabled:opacity-60"
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
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {isUploading ? "عم نرفع الصورة…" : label}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
