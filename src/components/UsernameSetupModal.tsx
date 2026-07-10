"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function usernameError(value: string) {
  if (!value) return "Choose a username.";
  if (value.length < 3) return "Use at least 3 characters.";
  if (value.length > 24) return "Use 24 characters or fewer.";
  if (!/^[a-z0-9_]+$/.test(value)) return "Use letters, numbers, or underscores.";
  return "";
}

export default function UsernameSetupModal() {
  const { user, claimUsername } = useAuth();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const username = useMemo(() => normalizeUsername(draft), [draft]);
  const validation = usernameError(username);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validation || saving) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await claimUsername(username);
    } catch (err) {
      const message = (err?.message || "").toLowerCase();
      setError(
        message.includes("taken") || message.includes("duplicate")
          ? "That username is already taken."
          : "Couldn't save that username. Try another one."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/90 px-4 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-accent/30 bg-surface shadow-2xl shadow-black/50"
      >
        <div className="border-b border-border bg-[radial-gradient(circle_at_top_left,rgba(79,209,197,0.18),transparent_34%),linear-gradient(135deg,rgba(31,61,58,0.95),rgba(30,32,36,1)_52%)] px-6 py-6">
          <div className="mb-5 flex items-center gap-3">
            <PriChatMark />
            <div>
              <p className="font-display text-lg font-semibold text-textPrimary">PriChat ID</p>
              <p className="text-xs text-textSecondary">One username, only yours.</p>
            </div>
          </div>
          <h2 className="font-display text-2xl font-semibold leading-tight text-textPrimary">
            Pick the name people will mention.
          </h2>
          <p className="mt-2 text-sm leading-6 text-textSecondary">
            This becomes your unique @username across rooms. Two people cannot use the same one.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-textSecondary">
              Username
            </label>
            <div className="flex items-center rounded-xl border border-border bg-bg px-3 transition focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
              <span className="select-none text-textSecondary">@</span>
              <input
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError("");
                }}
                placeholder={normalizeUsername(user?.displayName || user?.email || "sayem")}
                className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-textPrimary placeholder:text-textSecondary focus:outline-none sm:text-sm"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-textSecondary">
                {username ? `Your ID will be @${username}` : "Letters, numbers, underscore."}
              </span>
              <span className={username.length > 24 ? "text-red-300" : "text-textSecondary"}>
                {username.length}/24
              </span>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !!validation}
            className="flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-bg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Lock username"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PriChatMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M4 14L11 7M11 7L8 7M11 7L11 10"
        stroke="#4FD1C5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 14L17 21M17 21L20 21M17 21L17 18"
        stroke="#ECEDEE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
