"use client";

import { useState } from "react";

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  required,
  autoFocus,
  className = "",
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        autoFocus={autoFocus}
        className={`w-full bg-bg border border-border rounded-lg px-3 py-2 pr-10 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary hover:text-textPrimary"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path
        d="M10.6 5.2A10.8 10.8 0 0 1 12 5c7 0 10.5 7 10.5 7a13.4 13.4 0 0 1-2.6 3.4M6.5 6.6C3.7 8.5 1.5 12 1.5 12s3.5 7 10.5 7c1.4 0 2.6-.2 3.7-.6M9.9 9.9a3 3 0 0 0 4.2 4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
