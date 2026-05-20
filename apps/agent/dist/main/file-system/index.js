"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFileSystem = void 0;
const node_fs_1 = require("node:fs");
const path = __importStar(require("node:path"));
const BLOCKED_EXTENSIONS = new Set(['.exe', '.dll', '.scr', '.bat', '.cmd', '.ps1']);
function isAllowed(p) {
    return !BLOCKED_EXTENSIONS.has(path.extname(p).toLowerCase());
}
class AgentFileSystem {
    async list(dir) {
        const entries = await node_fs_1.promises.readdir(dir, { withFileTypes: true });
        const stats = await Promise.all(entries.map(async (e) => {
            const full = path.join(dir, e.name);
            try {
                const st = await node_fs_1.promises.stat(full);
                return {
                    name: e.name,
                    path: full,
                    isDirectory: e.isDirectory(),
                    size: st.size,
                    modifiedAt: st.mtimeMs,
                };
            }
            catch {
                // Permission denied or file vanished — skip.
                return null;
            }
        }));
        return stats.filter((s) => s !== null);
    }
    async readChunk(filePath, offset, length) {
        if (!isAllowed(filePath))
            throw new Error(`blocked extension: ${filePath}`);
        const handle = await node_fs_1.promises.open(filePath, 'r');
        try {
            const buf = Buffer.alloc(length);
            const { bytesRead } = await handle.read(buf, 0, length, offset);
            return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
        }
        finally {
            await handle.close();
        }
    }
    async writeChunk(filePath, offset, data) {
        if (!isAllowed(filePath))
            throw new Error(`blocked extension: ${filePath}`);
        const handle = await node_fs_1.promises.open(filePath, 'a+');
        try {
            await handle.write(data, 0, data.length, offset);
        }
        finally {
            await handle.close();
        }
    }
    async stat(filePath) {
        const st = await node_fs_1.promises.stat(filePath);
        return { size: st.size, modifiedAt: st.mtimeMs };
    }
}
exports.AgentFileSystem = AgentFileSystem;
