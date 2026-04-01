export default function Settings(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-lg space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Model</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="claude-sonnet-4.5">Claude Sonnet 4.5</option>
            <option value="claude-sonnet-4">Claude Sonnet 4</option>
            <option value="gpt-5">GPT-5</option>
            <option value="gemini-3-pro">Gemini 3 Pro</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Permission Mode</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="default">Default</option>
            <option value="plan">Plan</option>
            <option value="acceptEdits">Accept Edits</option>
            <option value="auto">Auto</option>
            <option value="bypassPermissions">Bypass Permissions</option>
          </select>
        </div>
      </div>
    </div>
  )
}
