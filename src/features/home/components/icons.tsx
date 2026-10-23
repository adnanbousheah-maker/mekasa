// أيقونات من ملفات التصميم (نفس الـ paths).

import type { ReactNode } from "react";

type Props = { size?: number; color?: string };

function Icon({ size = 30, color = "currentColor", children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ClipboardIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </Icon>
  );
}

export function TrashIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Icon>
  );
}

export function TruckIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </Icon>
  );
}

export function CartIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 5h2l2 11h10l2-8H7" />
      <circle cx="10" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </Icon>
  );
}

export function ListIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </Icon>
  );
}

export function OvenIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 14h8" />
    </Icon>
  );
}

export function BoxIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M6 8h12l-1 12H7zM9 8V5h6v3" />
    </Icon>
  );
}

export function ReturnIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </Icon>
  );
}
