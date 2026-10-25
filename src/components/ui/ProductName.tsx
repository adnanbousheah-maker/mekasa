type Props = {
  name: string;
  className?: string;
};

/** أسماء الكيك إنجليزي حالياً (LTR بخط Jost)، ومواد التغليف ممكن تكون عربي: الاتجاه حسب النص، والمحاذاة يمين. */
export function ProductName({ name, className = "" }: Props) {
  return (
    <span dir="auto" className={`text-right ${className}`}>
      {name}
    </span>
  );
}
