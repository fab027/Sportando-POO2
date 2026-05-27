import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
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
      "/news-google": {
        target: "https://news.google.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/news-google/, ""),
        headers: {
          Accept: "application/rss+xml,text/xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/news-lance": {
        target: "https://www.lance.com.br",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/news-lance/, ""),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/news-ge": {
        target: "https://ge.globo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/news-ge/, ""),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/news-espn": {
        target: "https://www.espn.com.br",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/news-espn/, ""),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        },
      },
      "/espn-api": {
        target: "https://site.api.espn.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/espn-api/, ""),
        headers: {
          Accept: "application/json",
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
