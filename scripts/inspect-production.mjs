import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["node_modules/convex/bin/main.js", "env", "list", "--prod"],
  { encoding: "utf8", windowsHide: true },
);
if (result.status !== 0) {
  console.error("Could not inspect production configuration; output withheld.");
  process.exit(1);
}
const names = result.stdout
  .split(/\r?\n/)
  .map((line) => line.split("=")[0])
  .filter((name) => /^[A-Z][A-Z0-9_]+$/.test(name));
console.log(JSON.stringify({ productionEnvNames: names }));
