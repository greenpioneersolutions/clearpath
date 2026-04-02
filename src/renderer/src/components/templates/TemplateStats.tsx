import { useState, useEffect } from 'react'
import type { TemplateUsageStat } from '../../types/template'

export default function TemplateStats(): JSX.Element {
  const [stats, setStats] = useState<TemplateUsageStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const result = await window.electronAPI.invoke('templates:usage-stats') as TemplateUsageStat[]
      setStats(result)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm">Loading stats...</div>

  if (stats.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">No usage data yet</p>
        <p className="text-xs text-gray-400 mt-1">Use some templates to see stats here</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Template Usage Stats</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">Template</th>
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium text-right">Uses</th>
              <th className="pb-2 font-medium text-right">Avg Cost</th>
              <th className="pb-2 font-medium text-right">Total Cost</th>
              <th className="pb-2 font-medium text-right">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.templateId} className="border-b border-gray-50">
                <td className="py-2 text-gray-800">{s.name}</td>
                <td className="py-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s.category}</span>
                </td>
                <td className="py-2 text-right font-mono text-gray-700">{s.usageCount}</td>
                <td className="py-2 text-right font-mono text-gray-600">${s.avgCost.toFixed(4)}</td>
                <td className="py-2 text-right font-mono text-gray-600">${s.totalCost.toFixed(4)}</td>
                <td className="py-2 text-right text-xs text-gray-400">
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
