"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/chat" : "/login");
    }
  }, [user, loading, router]);

  return (
    <div className="h-dvh flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="h-3 w-3 rounded-full bg-accent animate-pulse" />
        <p className="text-textSecondary text-sm">Loading PriChat…</p>
      </div>
    </div>
  );
}
