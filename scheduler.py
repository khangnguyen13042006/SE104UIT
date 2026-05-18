/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#dc2626",
          600: "#b91c1c",
          700: "#991b1b",
          900: "#450a0a",
        },
        ink: {
          900: "#0a0a0a",
          800: "#1a1a1a",
          700: "#262626",
          400: "#737373",
        },
      },
      fontFamily: {
        display: ['"Times New Roman"', "Times", "serif"],
        sans: ['"Times New Roman"', "Times", "serif"],
        serif: ['"Times New Roman"', "Times", "serif"],
      },
    },
  },
  plugins: [],
};
