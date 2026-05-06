export default function PresenceBadge({ members }) {
  const online = members.filter((m) => m.online)
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
      <strong>Online ({online.length}):</strong>{' '}
      {online.map((m) => m.username).join(', ') || '—'}
    </div>
  )
}
