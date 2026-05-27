import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/sofascore-api": {
        target: "https://www.sofascore.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sofascore-api/, "/api/v1"),
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Referer: "https://www.sofascore.com/",
        },
      },
      "/news-rss": {
        target: "https://news.google.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/news-rss/, "/rss"),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/rsshub": {
        target: "https://rsshub.app",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rsshub/, ""),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/nitter-api": {
        target: "https://nitter.net",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nitter-api/, ""),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/xcancel-api": {
        target: "https://xcancel.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/xcancel-api/, ""),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/rss-xcancel": {
        target: "https://rss.xcancel.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rss-xcancel/, ""),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
