import Image from "next/image";

type Props = {
  size?: "sm" | "lg";
  priority?: boolean;
};

// اللوجو الذهبي (ميكاسا بالإنجليزي والعربي)، خلفيته شفافة. الطول ثابت والعرض حسب الصورة.
const SIZES = {
  sm: "h-[54px] w-auto",
  lg: "h-[112px] w-auto",
} as const;

export function Logo({ size = "sm", priority = false }: Props) {
  return (
    <Image
      src="/logo.png"
      alt="ميكاسا"
      width={720}
      height={390}
      priority={priority}
      className={`${SIZES[size]} object-contain`}
    />
  );
}
