import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "warning" | "danger";
type Size = "lg" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white active:bg-black/80",
  secondary: "bg-surface text-ink border border-line-strong active:bg-quiet",
  warning: "bg-warn text-white active:bg-warn/85",
  danger: "bg-danger text-white active:bg-danger/85",
};

// أقل ارتفاع 48px بالجوال (CLAUDE.md). lg للزر الرئيسي بأسفل الشاشة.
const SIZES: Record<Size, string> = {
  lg: "h-14 rounded-[14px] px-5 text-lg",
  md: "h-12 rounded-xl px-4 text-[17px]",
};

const BASE =
  "inline-flex w-full items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40";

export function buttonClass(variant: Variant = "primary", size: Size = "lg"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className = "", ...rest }: ButtonLinkProps) {
  return <Link className={`${buttonClass(variant, size)} ${className}`} {...rest} />;
}
