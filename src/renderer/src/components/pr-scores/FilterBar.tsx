import { useState } from 'react'
import type { PrFilters } from '../../types/prScores'
import { DEFAULT_PR_FILTERS } from '../../types/prScores'

interface FilterBarProps {
  filters: PrFilters
  onChange: (filters: PrFilters) => void
  authors: string[]
  labels: string[]
}

const STATE_OPTIONS: { value: PrFilters['state']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'merged', label: 'Merged' },
]

export default function FilterBar({ filters, onChange, authors, labels: _labels }: FilterBarProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [labelInput, setLabelInput] = useState(filters.labels.join(', '))

  const activeCount = [
    filters.author !== null,
    filters.state !== 'all',
    filters.search !== '',
    filters.dateFrom !== null,
    filters.dateTo !== null,
    filters.labels.length > 0,
  ].filter(Boolean).length

  const update = (partial: Partial<PrFilters>) => {
    onChange({ ...filters, ...partial })
  }

  const clearAll = () => {
    onChange({ ...DEFAULT_PR_FILTERS })
    setLabelInput('')
  }

  const handleLabelBlur = () => {
    const parsed = labelInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    update({ labels: parsed })
  }

  return (
    <div className="space-y-3">
      {/* Toggle row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold text-white bg-indigo-600 rounded-full leading-none">
              {activeCount}
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Quick search always visible */}
        <input
          type="text"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search PR titles..."
          className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Author dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Author</label>
              <select
                value={filters.author ?? ''}
                onChange={(e) => update({ author: e.target.value || null })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">All Authors</option>
                {authors.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* State toggle group */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {STATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ state: opt.value })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      filters.state === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
              <input
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={(e) => update({ dateFrom: e.target.value || null })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo ?? ''}
                onChange={(e) => update({ dateTo: e.target.value || null })}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Label filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Labels (comma-separated)</label>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onBlur={handleLabelBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLabelBlur() }}
              placeholder="e.g. bug, feature, enhancement"
              className="w-full max-w-md px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Clear */}
          {activeCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={clearAll}
                className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
