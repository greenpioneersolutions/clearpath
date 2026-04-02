import { useState } from 'react'

interface Props {
  since?: number
}

export default function CostExport({ since }: Props): JSX.Element {
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')

  const handleExportCsv = async () => {
    setExporting(true)
    setMessage('')
    const csv = await window.electronAPI.invoke('cost:export-csv', { since: since ?? 0 }) as string
    // Create a downloadable blob
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cost-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExporting(false)
    setMessage('CSV exported')
    setTimeout(() => setMessage(''), 2000)
  }

  const handleClearHistory = async () => {
    if (!confirm('Clear all cost history? This cannot be undone.')) return
    await window.electronAPI.invoke('cost:clear')
    setMessage('History cleared')
    setTimeout(() => setMessage(''), 2000)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => void handleExportCsv()}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {exporting ? 'Exporting...' : 'Export CSV'}
      </button>
      <button
        onClick={() => void handleClearHistory()}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
      >
        Clear History
      </button>
      {message && <span className="text-xs text-green-600">{message}</span>}
    </div>
  )
}
