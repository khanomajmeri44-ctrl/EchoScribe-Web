import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/EchoScribe-Web/",
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  build: { outDir: "pages-dist", emptyOutDir: true },
  worker: { format: "es" },
});
