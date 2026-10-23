import Image from "next/image";

type Props = {
  size?: "sm" | "lg";
  priority?: boolean;
};

// المقاسات من التصميم: 117×58 بالرئيسية، 240×120 بشاشة الدخول.
const SIZES = {
  sm: "h-[58px] w-[117px]",
  lg: "h-[120px] w-[240px]",
} as const;

/** خلفية اللوجو البيضا بتذوب بالخلفية بـ multiply. */
export function Logo({ size = "sm", priority = false }: Props) {
  return (
    <Image
      src="/logo.jpg"
      alt="ميكاسا"
      width={180}
      height={180}
      priority={priority}
      className={`${SIZES[size]} object-cover mix-blend-multiply`}
    />
  );
}
