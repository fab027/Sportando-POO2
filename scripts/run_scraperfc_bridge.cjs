const { spawn } = require("child_process");
const fs = require("fs");
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
const bridge = spawn(python, [script], {
  env: { ...process.env, SCRAPERFC_PORT: process.env.SCRAPERFC_PORT || "8787" },
  stdio: "inherit",
});

bridge.on("exit", (code) => process.exit(code ?? 0));
