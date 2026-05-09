import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { getUploadUrl, putToS3, confirmUpload } from '../api/uploads'

const MAX_BYTES = 50 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1_048_576).toFixed(1)} MB`
}

const MessageInput = forwardRef(function MessageInput({ onSend, onTyping, onEditLast, roomId }, ref) {
  const [text, setText] = useState('')
  const [stagedFile, setStagedFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const typingTimer = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus()
  }))

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onEditLast?.() }
  }

  function handleChange(e) {
    setText(e.target.value)
    if (!typingTimer.current) onTyping?.()
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => { typingTimer.current = null }, 2000)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadError(null)
    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError('File type not allowed.')
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError('File too large (max 50 MB).')
      return
    }
    setStagedFile(file)
  }

  function clearFile() {
    setStagedFile(null)
    setUploadProgress(null)
    setUploadError(null)
  }

  async function submit() {
    if (uploading) return
    if (stagedFile) {
      await submitWithFile()
    } else {
      const trimmed = text.trim()
      if (!trimmed) return
      onSend(trimmed)
      setText('')
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
  }

  async function submitWithFile() {
    setUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    try {
      const { data: urlData } = await getUploadUrl(
        roomId,
        stagedFile.name,
        stagedFile.type,
        stagedFile.size,
      )
      await putToS3(urlData.upload_url, stagedFile, setUploadProgress)
      await confirmUpload(roomId, urlData.object_key, urlData.attachment_url, text.trim())
      setStagedFile(null)
      setUploadProgress(null)
      setText('')
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    } catch (err) {
      const detail = err?.response?.data?.detail
      setUploadError(detail || 'Upload failed. Please try again.')
      setUploadProgress(null)
    } finally {
      setUploading(false)
    }
  }

  const canSend = !uploading && (!!text.trim() || !!stagedFile)

  return (
    <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
      {stagedFile && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 max-w-xs min-w-0">
            <span className="truncate">{stagedFile.name}</span>
            <span className="text-zinc-400 shrink-0">{formatBytes(stagedFile.size)}</span>
            {!uploading && (
              <button onClick={clearFile} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0 ml-1">
                <XIcon />
              </button>
            )}
          </div>
        </div>
      )}
      {uploadProgress !== null && (
        <div className="mb-2 px-1">
          <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
      {uploadError && (
        <p className="text-xs text-red-500 px-1 mb-1">{uploadError}</p>
      )}
      <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,text/plain,application/zip,.docx,.xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
          title="Attach file"
        >
          <PaperclipIcon />
        </button>
        <input
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {uploading
            ? <span className="flex gap-0.5 items-center px-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full bg-white dark:bg-zinc-900 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            : <SendIcon />
          }
        </button>
      </div>
    </div>
  )
})

export default MessageInput
