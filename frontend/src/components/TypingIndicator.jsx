export default function TypingIndicator({ typingUsers }) {
  if (typingUsers.length === 0) return null
  const names = typingUsers.map(u => u.username)
  const label = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing`
    : 'Several people are typing'

  return (
    <div className="px-5 pb-1 flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{label}</span>
    </div>
  )
}
