import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { emptyLabel, type ImageLabel, type LabelFile } from "./labels";

/** One file per scanned folder, named so a person can find it and two folders cannot collide. */
export function labelFileName(folder: string): string {
  const slug = folder.split("/").filter(Boolean).slice(-2).join("-").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "root";
  const digest = createHash("sha256").update(folder).digest("hex").slice(0, 10);
  return `${slug}-${digest}.json`;
}

export async function readLabels(dir: string, folder: string): Promise<LabelFile> {
  const file = path.join(dir, labelFileName(folder));
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<LabelFile> | null;
    const stored = parsed != null && typeof parsed === "object" ? parsed.labels : undefined;
    // A null-prototype copy: a file that is not a label object reads as empty, and a relPath of
    // "__proto__" is an ordinary key, not the object's prototype.
    const labels: LabelFile["labels"] = Object.create(null);
    if (stored != null && typeof stored === "object" && !Array.isArray(stored)) Object.assign(labels, stored);
    return { folder, labels };
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return { folder, labels: Object.create(null) };
    throw err;
  }
}

// Writes to one directory queue behind each other so two quick labels do not race.
let queue: Promise<unknown> = Promise.resolve();

/** Set or clear one image's label. An empty label removes the entry. */
export function writeLabel(dir: string, folder: string, relPath: string, label: Omit<ImageLabel, "updated_at"> | null): Promise<LabelFile> {
  const task = queue.then(async () => {
    const current = await readLabels(dir, folder);
    if (label == null || emptyLabel(label)) {
      delete current.labels[relPath];
    } else {
      current.labels[relPath] = { ...label, updated_at: new Date().toISOString() };
    }
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, labelFileName(folder));
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    await rename(tmp, file);
    return current;
  });
  queue = task.catch(() => undefined);
  return task;
}
