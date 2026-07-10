"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { sha256Hex } from "@/lib/hash";
import PasswordInput from "@/components/PasswordInput";

const PRIVACY_OPTIONS = [
  {
    value: "public",
    label: "Public",
    description: "Anyone signed in can join instantly.",
    icon: <GlobeIcon />,
  },
  {
    value: "passcode",
    label: "Passcode",
    description: "People need a code to get in.",
    icon: <LockIcon />,
  },
  {
    value: "approval",
    label: "Admin approval",
    description: "You approve every request to join.",
    icon: <ShieldIcon />,
  },
];

export default function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the room a name.");
      return;
    }
    if (privacy === "passcode" && passcode.trim().length < 4) {
      setError("Passcode should be at least 4 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const passcodeHash = privacy === "passcode" ? await sha256Hex(passcode.trim()) : null;
      const { data, error: insertError } = await supabase
        .from("rooms")
        .insert({
          name: trimmed,
          privacy,
          passcode_hash: passcodeHash,
          created_by: user.uid,
          admins: [user.uid],
          members: [user.uid],
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      onClose();
      router.push(`/chat/${data.id}`);
    } catch (err) {
      setError("Couldn't create the room. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="relative border-b border-border bg-gradient-to-br from-accent/12 via-surface to-surface px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-textSecondary transition hover:bg-surfaceHover hover:text-textPrimary"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-accent/25 bg-accent/12 text-accent">
            <HashIcon />
          </div>
          <h2 className="font-display text-lg font-semibold text-textPrimary">New room</h2>
          <p className="mt-1 text-sm leading-6 text-textSecondary">
            You&apos;ll be the room&apos;s admin and can manage members afterward.
          </p>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-textSecondary">
              Room name
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25">
              <span className="select-none text-base text-textSecondary">#</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="general"
                className="w-full bg-transparent py-2.5 text-base placeholder:text-textSecondary focus:outline-none sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-textSecondary">
              Who can join
            </label>
            <div className="space-y-2">
              {PRIVACY_OPTIONS.map((opt) => {
                const selected = privacy === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setPrivacy(opt.value)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-accent bg-accentMuted/60 ring-1 ring-accent/40"
                        : "border-border hover:border-accent/30 hover:bg-surfaceHover"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                        selected ? "bg-accent/15 text-accent" : "bg-bg text-textSecondary"
                      }`}
                    >
                      {opt.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-textPrimary">{opt.label}</span>
                      <span className="block text-xs text-textSecondary">{opt.description}</span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        selected ? "border-accent" : "border-border"
                      }`}
                    >
                      {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {privacy === "passcode" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-textSecondary">
                Passcode
              </label>
              <PasswordInput
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="At least 4 characters"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-2 text-sm text-textSecondary transition hover:bg-surfaceHover hover:text-textPrimary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg shadow-lg shadow-accent/10 transition hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              {submitting ? (
                "Creating…"
              ) : (
                <>
                  <PlusIcon />
                  Create room
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.4 3.8 5.6 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
