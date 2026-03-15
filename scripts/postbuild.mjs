import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

async function copyAsset(relativePath) {
  const source = path.join(projectRoot, "src", relativePath);
  const target = path.join(projectRoot, "dist", relativePath);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

await copyAsset(path.join("engine", "worker-script.js"));
