import type { Config } from "tailwindcss";

/**
 * Theme = animal-island-ui (Animal Crossing aesthetic), per user override.
 * Tokens extracted from .research/animal-island-ui/DESIGN_PROMPT.md.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        parchment: "#f8f8f0", // primary background (warm parchment)
        content: "#f7f3df", // cards / modals / tables (slightly warmer)
        island: "#7DC395", // homepage green
        ink: {
          header: "#794f27", // header / sidebar text
          body: "#725d42", // body text inside components
          secondary: "#9f927d",
          muted: "#8a7b66",
          disabled: "#c4b89e",
        },
        mint: {
          DEFAULT: "#19c8b9",
          hover: "#3dd4c6",
          active: "#11a89b",
          light: "#e6f9f6",
        },
        status: {
          success: "#6fba2c",
          "success-active": "#5a9e1e",
          warning: "#f5c31c",
          "warning-active": "#dba90e",
          error: "#e05a5a",
          "error-active": "#c94444",
        },
        focusYellow: "#ffcc00",
        line: {
          DEFAULT: "#9f927d", // standard 2px border
          input: "#c4b89e",
          "input-hover": "#a89878",
        },
        shadow3d: "#bdaea0", // bottom pixel-stack shadow color
      },
      fontFamily: {
        sans: [
          "Nunito",
          "Noto Sans SC",
          "-apple-system",
          "PingFang SC",
          "sans-serif",
        ],
      },
      borderRadius: {
        pill: "50px",
        card: "20px",
        panel: "18px",
        bubble: "16px",
        chip: "10px",
      },
      boxShadow: {
        // 3D pixel-stack shadow for primary buttons (bottom only, no blur).
        btn: "0 5px 0 0 #bdaea0",
        "btn-hover": "0 6px 0 0 #bdaea0",
        "btn-active": "0 1px 0 0 #bdaea0",
        "btn-danger": "0 5px 0 0 #c94444",
        // Subtle elevation for default/text buttons.
        soft: "0 2px 4px 0 rgba(61, 52, 40, 0.06)",
        "soft-hover": "0 3px 10px 0 rgba(61, 52, 40, 0.10)",
        feature: "0 8px 24px rgba(114, 93, 66, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
