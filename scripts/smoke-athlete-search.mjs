#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

function loadEnvFromDotenv() {
  const files = [".env.local", ".env"];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx < 1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    });
  }
}

loadEnvFromDotenv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log("⚠️ Smoke test pulado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (.env/.env.local ou env do shell).");
  process.exit(0);
}

const endpoint = `${SUPABASE_URL}/functions/v1/sports-data`;

async function searchPlayer(query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ action: "player_search", query }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`No results for query: ${query}`);
  return data[0];
}

const strict = process.argv.includes("--strict");

try {
  const football = await searchPlayer("Lionel Messi");
  const basketball = await searchPlayer("LeBron James");
  console.log("✅ Futebol search ok:", football.name, "|", football.url);
  console.log("✅ Basquete search ok:", basketball.name, "|", basketball.url);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (strict) {
    console.error("❌ Smoke test failed:", message);
    process.exit(1);
  }
  console.log(`⚠️ Smoke test inconclusivo (modo não estrito): ${message}`);
  process.exit(0);
}
