/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx!.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfileModal({ onClose }) {
  const { user, profile, updateMyProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || user?.photoURL || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    setDisplayName(profile?.displayName || user?.displayName || "");
    setPhotoURL(profile?.photoURL || user?.photoURL || "");
  }, [profile, user]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose an image under 5 MB.");
      return;
    }

    setError("");
    try {
      const resized = await resizeImage(file);
      setPhotoURL(resized);
    } catch {
      setError("Couldn't read that image. Try another one.");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError("Display name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateMyProfile({ displayName: name, photoURL: photoURL || null });
      onClose?.();
    } catch {
      setError("Couldn't update your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form onSubmit={handleSave} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Edit profile</h2>
            <p className="text-xs text-textSecondary">Change your name and profile picture.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-textSecondary hover:text-textPrimary">
            Close
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 mb-5">
          <div className="h-24 w-24 overflow-hidden rounded-full border border-border bg-bg flex items-center justify-center">
            {photoURL ? (
              <img src={photoURL} alt="Profile preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-display text-accent">
                {(displayName || user?.email || "P").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-textSecondary hover:border-accent/50 hover:text-textPrimary"
            >
              Upload picture
            </button>
            {photoURL && (
              <button
                type="button"
                onClick={() => setPhotoURL("")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-textSecondary hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="block text-xs uppercase tracking-wider text-textSecondary mb-1">
          Username
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-textSecondary hover:text-textPrimary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !displayName.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
