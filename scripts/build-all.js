const { spawnSync } = require("node:child_process");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error);
  }
  return result.status ?? 1;
}

if (process.platform === "win32") {
  process.exit(run(npmCmd, ["run", "build:win"]));
}

if (process.platform === "darwin") {
  process.exit(run(npmCmd, ["run", "build:mac"]));
}

console.error(
  "Sistema operacional não suportado. Use Windows para gerar .exe ou macOS para gerar .dmg."
);
process.exit(1);
