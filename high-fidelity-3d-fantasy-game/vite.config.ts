import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    cors: true,
    // Accept any e2b preview host like https://5173-xxx.e2b.app
    allowedHosts: [".e2b.app", ".amazonaws.com", "localhost"] as any,
    headers: {
      "X-Frame-Options": "ALLOWALL",
    },
    hmr: {
      clientPort: 443,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    cors: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
