"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { SidebarProvider } from "@/context/SidebarContext";
import Sidebar from "@/components/Sidebar";
import UsernameSetupModal from "@/components/UsernameSetupModal";

export default function ChatLayout({ children }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="h-dvh flex items-center justify-center bg-bg">
        <div className="h-3 w-3 rounded-full bg-accent animate-pulse" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-dvh bg-bg overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">{children}</main>
        {profile && !profile.username && <UsernameSetupModal />}
      </div>
    </SidebarProvider>
  );
}
