import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

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
            {m.body}
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
}) {
  const bottomRef = useRef(null);
  const { username } = useAuth();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      onVisible?.(last.id);
    }
  }, [messages]);

  const seenByOthers = new Set(Object.values(seenMap));

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
      {messages.map((m) => {
        const isMe = m.username === username;
        const seen = isMe && seenByOthers.has(m.id);
        return (
          <MessageItem
            key={m.id}
            m={m}
            isMe={isMe}
            seen={seen}
            onEdit={onEdit}
            onDelete={onDelete}
            isEditing={editingId === m.id}
            onEditingChange={(val) => onEditingIdChange(val ? m.id : null)}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
