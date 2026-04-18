interface Props {
  label: string;
  value: string;
  valueClassName?: string;
}

export function StatItem({ label, value, valueClassName = "text-lg" }: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className={`${valueClassName} font-bold text-slate-100`}>{value}</span>
    </div>
  );
}
