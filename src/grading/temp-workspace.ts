import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withTempWorkspace<T>(
  prefix: string,
  callback: (workspaceDir: string) => Promise<T>,
): Promise<T> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), prefix));

  try {
    return await callback(workspaceDir);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}
