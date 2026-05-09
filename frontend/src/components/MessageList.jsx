import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);

function getUrlExt(url) {
  try { return new URL(url).pathname.split(".").pop().toLowerCase(); }
  catch { return ""; }
}

function isImageUrl(url) { return IMAGE_EXTS.has(getUrlExt(url)); }
function isVideoUrl(url) { return VIDEO_EXTS.has(getUrlExt(url)); }

function urlFilename(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop());
  } catch {
    return "file";
  }
}

function AttachIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}

function CheckIcon({ double }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline"
    >
      {double ? (
        <>
          <polyline points="1 12 6 17 13 8" />
          <polyline points="9 12 14 17 21 8" />
        </>
      ) : (
        <polyline points="5 12 10 17 19 7" />
      )}
    </svg>
  );
}

function DeleteModal({ onConfirm, onCancel }) {
  const deleteRef = useRef(null);

  useEffect(() => {
    deleteRef.current?.focus();
    function onKey(e) {
      if (e.key === "Enter") onConfirm();
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-72 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Delete message?
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            Cancel
          </button>
          <button
            ref={deleteRef}
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageItem({
  m,
  isMe,
  seen,
  onEdit,
  onDelete,
  isEditing,
  onEditingChange,
}) {
  const [editBody, setEditBody] = useState(m.body);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const inputRef = useRef(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      setEditBody(m.body);
      submittedRef.current = false;
      inputRef.current?.focus();
    }
  }, [isEditing]);

  function cancelEdit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onEdit(m, m.body);
  }

  function submitEdit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!editBody.trim()) {
      onEditingChange(false);
      setTimeout(() => setShowDeleteModal(true), 0);
      return;
    }
    if (editBody !== m.body) onEdit(m, editBody);
    else onEdit(m, m.body);
  }

  if (m.deleted) {
    return (
      <div
        className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
      >
        {!isMe && (
          <span className="text-[11px] text-zinc-400 px-1">{m.username}</span>
        )}
        <div className="px-3 py-2 rounded-2xl text-sm italic text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800">
          Message deleted
        </div>
        <span className="text-[10px] text-transparent px-1 select-none">
          {new Date(m.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    );
  }

  return (
    <>
      {showDeleteModal && (
        <DeleteModal
          onConfirm={() => {
            onDelete(m.id);
            setShowDeleteModal(false);
            onEdit(m, m.body);
          }}
          onCancel={() => {
            setShowDeleteModal(false);
            onEdit(m, m.body);
          }}
        />
      )}
      <div
        className={`flex flex-col gap-0.5 max-w-[72%] group ${isMe ? "self-end items-end" : "self-start items-start"}`}
      >
        {!isMe && (
          <span className="text-[11px] text-zinc-400 px-1">{m.username}</span>
        )}

        {isEditing ? (
          <input
            ref={inputRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitEdit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={submitEdit}
            className="px-3 py-2 rounded-2xl text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 outline-none min-w-30"
          />
        ) : (
          <div
            className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              isMe
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-br-sm"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-sm"
            }`}
          >
            {m.attachment_url && isImageUrl(m.attachment_url) && (
              <a href={m.attachment_url} target="_blank" rel="noreferrer">
                <img
                  src={m.attachment_url}
                  alt="attachment"
                  className="max-w-xs rounded-xl mb-1 block"
                />
              </a>
            )}
            {m.attachment_url && isVideoUrl(m.attachment_url) && (
              <video
                src={m.attachment_url}
                controls
                className="max-w-xs rounded-xl mb-1 block"
              />
            )}
            {m.attachment_url && !isImageUrl(m.attachment_url) && !isVideoUrl(m.attachment_url) && (
              <a
                href={m.attachment_url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1.5 text-xs underline underline-offset-2 mb-1 ${
                  isMe ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <AttachIcon />
                {urlFilename(m.attachment_url)}
              </a>
            )}
            {m.body && <span>{m.body}</span>}
          </div>
        )}

        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
            {new Date(m.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {m.edited_at && <span className="ml-1">(edited)</span>}
          </span>
          {isMe && (
            <span
              className={
                seen ? "text-blue-400" : "text-zinc-300 dark:text-zinc-600"
              }
            >
              <CheckIcon double={seen} />
            </span>
          )}
          {isMe && !isEditing && (
            <span className="hidden group-hover:flex items-center gap-1 ml-1">
              <button
                onClick={() => onEditingChange(true)}
                className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="text-[10px] text-zinc-400 hover:text-red-500 transition"
              >
                Delete
              </button>
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export default function MessageList({
  messages,
  seenMap = {},
  onVisible,
  onEdit,
  onDelete,
  editingId,
  onEditingIdChange,
  onLoadMore,
  hasMore,
  loadingMore,
  newMessageIndex,
}) {
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const newMessageRef = useRef(null);
  const { username } = useAuth();

  const lastSeenRef = useRef(null);
  const prevLengthRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);

  const mountedRef = useRef(false);

  // Scroll to new-messages divider (or bottom if none) before first paint
  useLayoutEffect(() => {
    if (newMessageRef.current) {
      newMessageRef.current.scrollIntoView({ block: "start" });
    } else {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Preserve scroll position when older messages are prepended
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = messages.length - prevLengthRef.current;
    if (mountedRef.current && added > 0) {
      const newScrollHeight = el.scrollHeight;
      const delta = newScrollHeight - prevScrollHeightRef.current;
      if (delta > 0) el.scrollTop += delta;
    }
    prevLengthRef.current = messages.length;
    mountedRef.current = true;
  }, [messages.length]);

  // Smooth scroll to bottom + send seen when a new live message arrives
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!lastMessageId) return;
    if (lastMessageId !== lastSeenRef.current) {
      lastSeenRef.current = lastMessageId;
      onVisible?.(lastMessageId);
      // Only smooth-scroll if already near bottom (don't yank user away while reading history)
      const el = scrollRef.current;
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom < 200) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [lastMessageId]);

  function handleScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadMore?.();
    }
  }

  const seenCursorIndex = (() => {
    const seenIds = Object.values(seenMap);
    if (seenIds.length === 0) return -1;
    let max = -1;
    for (const seenId of seenIds) {
      const idx = messages.findIndex((m) => m.id === seenId);
      if (idx > max) max = idx;
    }
    return max;
  })();

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
    >
      {loadingMore && (
        <div className="flex justify-center py-2">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}
      {messages.map((m, idx) => {
        const isMe = m.username === username;
        const seen = isMe && seenCursorIndex >= idx;
        const isNewStart = idx === newMessageIndex;
        const newCount = newMessageIndex !== null ? messages.length - newMessageIndex : 0;
        return (
          <div key={m.id} className="flex flex-col">
            {isNewStart && (
              <div ref={newMessageRef} className="flex items-center gap-3 py-2 select-none">
                <div className="flex-1 h-px bg-blue-400 dark:bg-blue-500" />
                <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400 shrink-0">
                  {newCount} new {newCount === 1 ? "message" : "messages"}
                </span>
                <div className="flex-1 h-px bg-blue-400 dark:bg-blue-500" />
              </div>
            )}
            <MessageItem
              m={m}
              isMe={isMe}
              seen={seen}
              onEdit={onEdit}
              onDelete={onDelete}
              isEditing={editingId === m.id}
              onEditingChange={(val) => onEditingIdChange(val ? m.id : null)}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
