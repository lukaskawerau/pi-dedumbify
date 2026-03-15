import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function hashCardFiles(filePaths: string[]): Promise<string> {
  const hash = createHash("sha256");

  for (const filePath of [...filePaths].sort()) {
    const content = await readFile(filePath);
    hash.update(filePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex");
}
