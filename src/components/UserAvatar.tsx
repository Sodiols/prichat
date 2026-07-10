/* eslint-disable @next/next/no-img-element */
"use client";

interface UserAvatarProps {
  name?: string | null;
  photoURL?: string | null;
  size?: "sm" | "md" | "lg";
}

export default function UserAvatar({ name, photoURL, size = "md" }: UserAvatarProps) {
  const classes: Record<string, string> = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
  };
  const initial = (name || "P").slice(0, 1).toUpperCase();

  return (
    <div className={`${classes[size] || classes.md} shrink-0 overflow-hidden rounded-full border border-border bg-bg flex items-center justify-center`}>
      {photoURL ? (
        <img src={photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display font-semibold text-accent">{initial}</span>
      )}
    </div>
  );
}
