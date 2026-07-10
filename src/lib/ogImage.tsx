import { ImageResponse } from "next/og";

// Shared Open Graph / Twitter link-preview image, used by both
// app/opengraph-image.tsx and app/twitter-image.tsx.
export const ogSize = { width: 1200, height: 630 };
export const ogAlt =
  "PriChat — Free realtime private chat rooms with voice messages and video calls";
export const ogContentType = "image/png";

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #15171A 0%, #1E2024 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
          <svg width="70" height="70" viewBox="0 0 28 28" fill="none">
            <path
              d="M4 14L11 7M11 7L8 7M11 7L11 10"
              stroke="#4FD1C5"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M24 14L17 21M17 21L20 21M17 21L17 18"
              stroke="#ECEDEE"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ display: "flex", fontSize: "46px", fontWeight: 700, color: "#ECEDEE" }}>
            PriChat
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "78px",
              fontWeight: 800,
              color: "#ECEDEE",
              lineHeight: 1.08,
              maxWidth: "960px",
            }}
          >
            Realtime private chat rooms
          </div>
          <div style={{ display: "flex", fontSize: "34px", color: "#9AA0A6" }}>
            Voice messages · Audio &amp; video calls · Public &amp; private
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: "30px", color: "#4FD1C5", fontWeight: 600 }}>
            prichat-ebf5.vercel.app
          </div>
          <div style={{ display: "flex", fontSize: "26px", color: "#9AA0A6" }}>
            Free · No download
          </div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
