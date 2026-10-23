type Props = {
  name: string;
  className?: string;
};

/** أسماء الأصناف إنجليزي حالياً: اتجاهها LTR بخط Jost، ومحاذاتها يمين جوا الواجهة العربية. */
export function ProductName({ name, className = "" }: Props) {
  return (
    <span dir="ltr" className={`text-right ${className}`}>
      {name}
    </span>
  );
}
