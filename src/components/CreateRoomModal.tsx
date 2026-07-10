"use client";

import { useState } from "react";
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
  },
  {
    value: "passcode",
    label: "Passcode",
    description: "People need a code to get in.",
  },
  {
    value: "approval",
    label: "Admin approval",
    description: "You approve every request to join.",
  },
];

export default function CreateRoomModal({ onClose }) {
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-1">New room</h2>
        <p className="text-textSecondary text-sm mb-4">
          You&apos;ll be the room&apos;s admin and can manage members afterward.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Room name, e.g. general"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />

          <div className="space-y-1.5">
            {PRIVACY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  privacy === opt.value
                    ? "border-accent bg-accentMuted"
                    : "border-border hover:bg-surfaceHover"
                }`}
              >
                <input
                  type="radio"
                  name="privacy"
                  value={opt.value}
                  checked={privacy === opt.value}
                  onChange={() => setPrivacy(opt.value)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-textSecondary">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>

          {privacy === "passcode" && (
            <PasswordInput
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Set a passcode"
              autoComplete="new-password"
            />
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent text-bg font-medium disabled:opacity-50 active:scale-[0.97] transition-transform"
            >
              {submitting ? "Creating…" : "Create room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
