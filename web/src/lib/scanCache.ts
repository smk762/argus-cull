import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

/** Delete cached scan files in *dir*. Only `*.json` in that directory. */
export async function purgeScanCache(dir: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return 0;
    throw err;
  }
  const root = path.resolve(dir);
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".json") || name !== path.basename(name)) continue;
    const file = path.join(root, name);
    if (path.dirname(file) !== root) continue;
    await unlink(file);
    removed += 1;
  }
  return removed;
}
