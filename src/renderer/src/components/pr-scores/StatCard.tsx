export default function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}
