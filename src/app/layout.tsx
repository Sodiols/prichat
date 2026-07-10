import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata = {
  title: "PriChat — Realtime Chat",
  description: "A realtime multi-user chat app built with Next.js and Supabase.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-body bg-bg text-textPrimary">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
