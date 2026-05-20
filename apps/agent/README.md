# @teamdesk/agent

Electron-based host agent for TeamDesk. Installs on the **controlled** machine and provides:

- Native screen capture (multi-monitor, region)
- Real OS-level input injection (mouse, keyboard) via `nut-js`
- File system bridge that respects OS ACLs
- Local validation of JWT-signed session scopes — the input/file modules physically do not initialize unless the active scope grants them

## Status

Scaffolded. Implementation lands in Step 9 of the architecture plan. See:

- `src/main/` — privileged Electron main process
- `src/main/capture/` — per-OS capture adapters
- `src/main/input-injector/` — per-OS input injection (Factory pattern)
- `src/main/file-system/` — file ops without privilege escalation
- `src/ipc/` — IpcBridge between main and renderer
- `src/renderer/` — minimal status UI for the host user

## Why a separate workspace

The web operator UI runs in a browser sandbox and cannot inject real OS events. The agent is the only side that can fulfill `SCREEN_CONTROL` / `FULL_CONTROL` scopes truthfully. Splitting it from the Next.js app keeps Electron's `electron`/native binaries out of the web bundle.
