const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

function pythonCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return [
    process.env.PYTHON,
    path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python310", "python.exe"),
    "python",
    "py",
  ].filter(Boolean);
}

function findPython() {
  for (const candidate of pythonCandidates()) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return "python";
}

const python = findPython();
const script = path.resolve(__dirname, "scraperfc_bridge.py");
const port = Number(process.env.SCRAPERFC_PORT || "8787");

function isPortOpen(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  if (await isPortOpen(port)) {
    console.log(`ScraperFC bridge already listening at http://127.0.0.1:${port}`);
    return;
  }

  const bridge = spawn(python, [script], {
    env: { ...process.env, SCRAPERFC_PORT: String(port) },
    stdio: "inherit",
  });

  bridge.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
