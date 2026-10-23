type Props = {
  fullName: string;
  pin: string;
};

/** الرمز بيبين مرة وحدة بس، وما بينحفظ بأي مكان. */
export function PinNotice({ fullName, pin }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">
        رمز الدخول لـ <strong>{fullName}</strong>:
      </p>
      <p
        dir="ltr"
        className="rounded-xl bg-quiet py-4 text-center text-4xl font-semibold tracking-[0.4em] tabular-nums"
        aria-label={`الرمز ${pin.split("").join(" ")}`}
      >
        {pin}
      </p>
      <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-text">
        أعطيه للموظف هلأ. ما رح يبين مرة ثانية، وإذا نسيه بتعطيه رمز جديد.
      </p>
    </div>
  );
}
