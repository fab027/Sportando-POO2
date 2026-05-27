import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

<<<<<<< HEAD
// https://vitejs.dev/config/
=======
// https://vite.dev/config/
>>>>>>> 26207cf3d95dadf6c86686adc5376455e05c2062
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
      "/thesportsdb-api": {
        target: "https://www.thesportsdb.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/thesportsdb-api/, "/api/v1/json/123"),
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Referer: "https://www.thesportsdb.com/",
        },
      },
      "/ogol-api": {
        target: "https://www.ogol.com.br",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ogol-api/, ""),
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Referer: "https://www.ogol.com.br/",
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
