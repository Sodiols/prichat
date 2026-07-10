import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";

const SITE_URL = "https://prichat-ebf5.vercel.app";
const SITE_NAME = "PriChat";
const DESCRIPTION =
  "PriChat is a free realtime chat app: create public or private rooms, message and reply instantly, send voice messages, and start audio or video calls right in the browser. No download required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PriChat — Free Realtime Private Chat Rooms & Video Calls",
    template: "%s · PriChat",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "PriChat",
    "secret messaging app",
    "private chat website",
    "Private chatting app",
    "private messaging",
    "realtime chat",
    "private chat rooms",
    "online chat app",
    "browser chat",
    "free chat app",
    "encrypted rooms",
    "passcode chat room",
  ],
  authors: [{ name: "PriChat" }],
  creator: "PriChat",
  publisher: "PriChat",
  category: "communication",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "PriChat — Free Realtime Private Chat Rooms & Video Calls",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PriChat — Free Realtime Private Chat Rooms & Video Calls",
    description: DESCRIPTION,
  },
  verification: {
    google: "n8GT8LiHVSkwwvoPwVFiZYYmvDnMvy-cW0sa0emwdbg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#15171A",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "CommunicationApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript. Requires a modern web browser.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Realtime messaging",
    "Public, passcode and admin-approval rooms",
    "Secure and private communication",
    "Voice messages",
    "Audio and video calls",
    "Message replies, editing and deletion",
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-bg text-textPrimary">
        <AuthProvider>{children}</AuthProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
