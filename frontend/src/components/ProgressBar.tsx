interface Props {
  percent: number;
}

export default function ProgressBar({ percent }: Props) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-10 text-right">
        {clamped}%
      </span>
    </div>
  );
}
