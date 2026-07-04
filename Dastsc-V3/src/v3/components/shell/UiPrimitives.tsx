interface PhysicsRowProps {
  label: string;
  value: number;
  unit: string;
  color?: string;
}

export function PhysicsRow({
  label,
  value,
  unit,
  color = 'text-white/70',
}: PhysicsRowProps) {
  return (
    <div className="flex justify-between items-center text-sm font-mono">
      <span className="text-white/30 uppercase tracking-tighter">{label}</span>
      <div className="flex gap-1 items-baseline">
        <span className={color}>{value.toFixed(2)}</span>
        <span className="text-[10px] text-white/20">{unit}</span>
      </div>
    </div>
  );
}

interface DataPointProps {
  label: string;
  value: string | number;
}

export function DataPoint({ label, value }: DataPointProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/20 uppercase tracking-widest leading-none">{label}</span>
      <span className="text-base font-light text-white/80">{value}</span>
    </div>
  );
}
