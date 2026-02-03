/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Sora", "ui-sans-serif", "system-ui"],
        display: ["Fraunces", "ui-serif", "Georgia"],
      },
      colors: {
        ink: "#0B1020",
        sand: "#F5F1E8",
        pine: "#0C4A3F",
        ember: "#D97706",
        slate: "#1F2937",
      },
      boxShadow: {
        glow: "0 10px 30px rgba(13, 116, 144, 0.2)",
      },
    },
  },
  plugins: [],
};
