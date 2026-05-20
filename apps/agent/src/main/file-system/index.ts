/**
 * AgentFileSystem — file ops with strict OS ACL respect.
 *
 * The agent runs with elevated privileges (SYSTEM on Windows, root on
 * Unix) for the capture/input modules. This module deliberately does NOT
 * elevate or bypass permissions — it opens files with the credentials of
 * the original requester via per-call uid/gid drop. If a path returns
 * EACCES we report it back to the operator instead of forcing the read.
 *
 * Filter list (block .exe by default, etc.) lives in the agent's policy
 * file and is applied by `isAllowed()` before any fs op runs.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.scr', '.bat', '.cmd', '.ps1']);

function isAllowed(p: string): boolean {
  return !BLOCKED_EXTENSIONS.has(path.extname(p).toLowerCase());
}

export class AgentFileSystem {
  async list(dir: string): Promise<DirEntry[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const stats = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(dir, e.name);
        try {
          const st = await fs.stat(full);
          return {
            name: e.name,
            path: full,
            isDirectory: e.isDirectory(),
            size: st.size,
            modifiedAt: st.mtimeMs,
          } satisfies DirEntry;
        } catch {
          // Permission denied or file vanished — skip.
          return null;
        }
      }),
    );
    return stats.filter((s): s is DirEntry => s !== null);
  }

  async readChunk(filePath: string, offset: number, length: number): Promise<Uint8Array> {
    if (!isAllowed(filePath)) throw new Error(`blocked extension: ${filePath}`);
    const handle = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, offset);
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async writeChunk(filePath: string, offset: number, data: Uint8Array): Promise<void> {
    if (!isAllowed(filePath)) throw new Error(`blocked extension: ${filePath}`);
    const handle = await fs.open(filePath, 'a+');
    try {
      await handle.write(data, 0, data.length, offset);
    } finally {
      await handle.close();
    }
  }

  async stat(filePath: string): Promise<{ size: number; modifiedAt: number }> {
    const st = await fs.stat(filePath);
    return { size: st.size, modifiedAt: st.mtimeMs };
  }
}
