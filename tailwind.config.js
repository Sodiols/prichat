/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#15171A",
        surface: "#1E2024",
        surfaceHover: "#262930",
        border: "#2C2F36",
        textPrimary: "#ECEDEE",
        textSecondary: "#9AA0A6",
        accent: "#4FD1C5",
        accentMuted: "#1F3D3A",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
