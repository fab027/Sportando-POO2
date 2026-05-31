import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

function findPythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python310", "python.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "python";
}

function scraperFcBridgePlugin() {
  let bridge: ChildProcessWithoutNullStreams | null = null;

  return {
    name: "scraperfc-bridge",
    apply: "serve" as const,
    configureServer() {
      if (process.env.SCRAPERFC_BRIDGE_AUTO === "0") return;

      const script = path.resolve(__dirname, "scripts", "scraperfc_bridge.py");
      const python = findPythonExecutable();
      bridge = spawn(python, [script], {
        env: { ...process.env, SCRAPERFC_PORT: process.env.SCRAPERFC_PORT || "8787" },
        stdio: "pipe",
      });

      bridge.stdout.on("data", (data) => process.stdout.write(`[ScraperFC] ${data}`));
      bridge.stderr.on("data", (data) => process.stderr.write(`[ScraperFC] ${data}`));
      bridge.on("error", (error) => {
        console.warn(`[ScraperFC] Nao foi possivel iniciar a ponte Python: ${error.message}`);
      });
      bridge.on("exit", (code) => {
        if (code && code !== 0) {
          console.warn("[ScraperFC] Ponte Python encerrada. Instale Python e rode `pip install -r requirements.txt` se os dados nao carregarem.");
        }
      });

      const closeBridge = () => {
        if (bridge && !bridge.killed) bridge.kill();
      };
      process.once("exit", closeBridge);
      process.once("SIGINT", () => {
        closeBridge();
        process.exit();
      });
      process.once("SIGTERM", () => {
        closeBridge();
        process.exit();
      });
    },
  };
}

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
      "/scraperfc-api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/scraperfc-api/, ""),
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
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), scraperFcBridgePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
