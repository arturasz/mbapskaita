import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/ecb": {
        target: "https://www.ecb.europa.eu",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ecb/, ""),
      },
      "/api/lb": {
        target: "https://www.lb.lt",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lb/, "/webservices/FxRates"),
      },
    },
  },
});
