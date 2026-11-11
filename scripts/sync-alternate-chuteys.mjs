// Run from anywhere: node scripts/sync-alternate-chuteys.mjs
// The unpacked Chrome extension cannot directly scan the repository root.
import { readdir, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "alternate-chuteys");
const dest = join(root, "extension", "alternate-chuteys");
const allowed = new Set([".png", ".webp", ".gif", ".jpg", ".jpeg"]);
await mkdir(source, {recursive:true});
await mkdir(dest, {recursive:true});
const entries = await readdir(source, {withFileTypes:true});
const files = entries
  .filter(entry => entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(entry.name) && allowed.has(extname(entry.name).toLowerCase()))
  .map(entry => entry.name).sort((a,b) => a.localeCompare(b, "en"));
const current = await readdir(dest, {withFileTypes:true});
for (const entry of current) {
  if (entry.isFile() && entry.name !== "manifest.json" && allowed.has(extname(entry.name).toLowerCase()) && !files.includes(entry.name)) {
    await rm(join(dest, entry.name));
  }
}
for (const name of files) await copyFile(join(source,name),join(dest,name));
await writeFile(join(dest,"manifest.json"),JSON.stringify(files,null,2)+"\n");
console.log(`Chutey: packaged ${files.length} alternate expression(s). Reload Chrome extension to see them.`);
