import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, la API corre en el puerto 3000 (npm run dev en backend).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
