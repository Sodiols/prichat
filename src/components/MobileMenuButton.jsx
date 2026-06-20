"use client";

import { useSidebar } from "@/context/SidebarContext";

export default function MobileMenuButton({ variant = "menu", className = "" }) {
  const { openMobile } = useSidebar();

  return (
    <button
      type="button"
      onClick={openMobile}
      className={`md:hidden flex h-10 w-10 items-center justify-center rounded-full text-textPrimary shrink-0 active:scale-95 transition ${className}`}
      aria-label="Open rooms menu"
    >
      {variant === "back" ? <BackIcon /> : <MenuIcon />}
    </button>
  );
}

function MenuIcon() {
  return (
    <span className="block" aria-hidden="true">
      <span className="block w-5 h-0.5 bg-current mb-1" />
      <span className="block w-5 h-0.5 bg-current mb-1" />
      <span className="block w-5 h-0.5 bg-current" />
    </span>
  );
}

function BackIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 19L8 12L15 5"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
