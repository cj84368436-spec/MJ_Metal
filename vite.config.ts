import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  define: {
    __HAS_HOME_COVER__: JSON.stringify(
      existsSync(new URL("./public/secret-five-cover.jpg", import.meta.url)),
    ),
  },
  server: { allowedHosts: ["terminal.local"] },
});
