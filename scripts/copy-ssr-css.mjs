import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const from = "node_modules/.nitro/vite/services/ssr/assets";
const to = "dist/assets";

let names;
try {
  names = await readdir(from);
} catch {
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const name of names) {
  if (!name.endsWith(".css")) continue;
  await copyFile(join(from, name), join(to, name));
}
