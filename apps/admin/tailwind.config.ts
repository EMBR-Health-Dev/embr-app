import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // EMBR brand palette — deep navy, bone, brass gold, mineral teal. No pink.
        navy: "#0f1b2d",
        bone: "#f4f1ea",
        brass: "#b8974f",
        teal: "#3a6b6a",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
