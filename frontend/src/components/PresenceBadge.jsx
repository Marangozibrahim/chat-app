export default function PresenceBadge({ members }) {
  const online = members.filter(m => m.online)
  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 shrink-0">
      <span className="font-semibold text-gray-800 dark:text-gray-200">Online ({online.length}):</span>{' '}
      {online.map(m => m.username).join(', ') || '—'}
    </div>
  )
}
