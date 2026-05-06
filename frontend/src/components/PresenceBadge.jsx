export default function PresenceBadge({ members }) {
  const online = members.filter(m => m.online)
  if (online.length === 0) return <p className="text-xs text-zinc-400">No one online</p>
  return (
    <p className="text-xs text-zinc-400 truncate">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 mb-px" />
      {online.map(m => m.username).join(', ')}
    </p>
  )
}
