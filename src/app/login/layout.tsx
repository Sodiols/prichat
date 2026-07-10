import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in or create your free account",
  description:
    "Sign in to PriChat or create a free account to start realtime private chat rooms with voice messages and audio/video calls — no download required.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Sign in to PriChat",
    description:
      "Sign in or create a free PriChat account to start realtime private chat rooms with voice messages and audio/video calls.",
    url: "https://prichat-ebf5.vercel.app/login",
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
