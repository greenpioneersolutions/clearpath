interface ScoreWeightSliderProps {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}

export default function ScoreWeightSlider({ label, description, value, onChange }: ScoreWeightSliderProps): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        <span className="text-sm font-mono text-indigo-600 font-medium">{value.toFixed(2)}</span>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">{description}</p>
      <input
        type="range"
        min={0}
        max={0.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  )
}
