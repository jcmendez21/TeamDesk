# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TeamDesk is a remote desktop platform (AnyDesk-style) built on WebRTC. A 9-digit connection ID + an 8-char password identify each session; two peers join a Socket.IO room and `simple-peer` brokers the SDP/ICE handshake. The signaling server validates the password (SHA-256) **before** allowing the WebRTC handshake to start — that's the security boundary for "anyone who knows your ID can connect."

Two host implementations exist:

- **Web host** (legacy): `src/app/page.tsx` "Start Broadcasting" calls `getDisplayMedia()`. Browser-imposed "you are sharing your screen" banner is unavoidable here.
- **Electron agent** (preferred): `apps/agent/` packages a native app that captures via `desktopCapturer`, no banner, no system picker, and injects real OS-level inputs via `@nut-tree-fork/nut-js`. This is the production path.

The operator UI is browser-only (Next.js) and is the same for both host implementations — the host just registers its room+password with the signaling server, the operator connects with the credentials.

The repo is an **npm workspaces monorepo**:

```
TeamDesk/
├─ src/, server.ts, ...    # Next.js operator web app (root project)
├─ apps/agent/             # Electron host agent (workspace)
├─ signaling/              # Standalone Socket.IO server, deployed on Render
└─ shared/                 # Pure-TS types and wire protocol (@teamdesk/shared)
```

## Commands

### Web (root)

```bash
npm run dev          # Custom server (server.ts) — Next.js + Socket.IO on :3000
npm run dev:next     # Next.js only with Turbopack on :9002 (no signaling, useless for testing peer paths)
npm run build        # Production build (NODE_ENV=production)
npm run typecheck    # tsc --noEmit. Required — next.config.ts has ignoreBuildErrors=true
npm run lint         # next lint (ignored during builds)
```

`npm start` runs `next start`, which **does not boot the custom server** — production deploys must run `tsx server.ts` (or compiled equivalent) for the local signaling fallback to work. In normal production usage the signaling lives on Render, not co-hosted with Next.

### Agent (`apps/agent/`)

```bash
cd apps/agent
npm run dev          # Build (tsc main + esbuild renderer + copy HTML) then launch Electron
npm run build        # Build only
npm run package      # electron-builder → .exe/.dmg/.AppImage in apps/agent/out
npm run typecheck
```

Point the agent at the prod signaling before launching:
```powershell
$env:TEAMDESK_SIGNALING_URL="https://teamdesk-tuj4.onrender.com"
npm run dev
```
Without the env var it falls back to `http://localhost:3000`, useful only if you have the local dev server running on the same machine.

### Signaling (`signaling/`)

Deployed on Render as a free-tier Docker web service. The service auto-rebuilds on push to `main` because the dashboard is wired to the repo. To deploy manually or test locally:

```bash
cd signaling
npm install
npm run dev          # tsx standalone.ts — listens on :8080
```

Live URL: `https://teamdesk-tuj4.onrender.com`. Health probe at `/healthz` returns `ok`.

## Architecture

### Two roles, three processes

```
                        Render (Socket.IO signaling)
                                  ▲
                         join-room-secure / register-room
                          /                          \
                         /                            \
      Web operator (browser)            Host: Electron agent OR Web "Start Broadcasting"
      Reads NEXT_PUBLIC_SIGNALING_URL   Reads TEAMDESK_SIGNALING_URL (agent only)
            │                                       │
            └─── WebRTC peer-to-peer (after STUN) ──┘
                 video (media track) + input/file/chat/control (data channel)
```

### Operator side — `src/app/session/[id]/page.tsx`

The operator console mounts the full session UI (top bar, scopes panel, video canvas, action bar, chat, transfers, audit) and shares a single `SessionMediator` via `SessionContextProvider`. Specialized hooks (`use-session`, `use-input-channel`, `use-file-channel`, `use-chat-channel`, `use-telemetry`) consume the mediator from context.

The legacy `useWebRTC` in `src/hooks/use-webrtc.ts` still backs `HostSessionHandler` (the web-as-host fallback). New code goes through `SessionMediator`.

### Layers, top to bottom

```
UI components (src/components/session/*)
       ↓ via React context
useSession / useMediator
       ↓
SessionMediator                       (orchestrates the lifecycle)
  ├─ PeerConnectionFactory            (Factory) → RemotePeer over simple-peer
  ├─ withScope(handler, requiredId)   (Decorator)
  ├─ AuditEventBus                    (Observer)
  └─ QualityStrategy (Auto/Fixed)     (Strategy)
       ↓
SignalingClient                       (Singleton over Socket.IO)
       ↓ wire
signaling/server.ts (Socket.IO room relay)
```

### Wire protocol — `shared/src/protocol.ts`

Discriminated union of data-channel messages: `input` / `file` / `chat` / `control`. `RemotePeer` multiplexes them over a single `RTCDataChannel` and routes by `type` prefix. Media (video) is a separate WebRTC track, independent from the data channel by design — degraded video never blocks input.

Input messages: `mousemove`, `mousedown`, `mouseup`, `wheel`, `keydown`, `keyup`, **`type-text`** (mobile soft-keyboard path), `cad`, `clipboard`. The `type-text` variant exists because Android Chrome's soft keyboard fires `keydown` with `code === ''` — see "Mobile UX" below.

### Scopes — the security pillar

`SCREEN_ONLY < SCREEN_CONTROL < SCREEN_FILES < FULL_CONTROL`. Levels are cumulative (`capsForScope`). The active scope is encoded in a JWT (`src/services/session-token.ts`, HS256 via Web Crypto). `withScope` wraps every inbound input/file handler in the mediator — even a tampered operator UI can't bypass it because the receiving side enforces the same check before invoking the handler.

When porting a new feature, ask: **does this require a capability beyond the operator's scope?** If yes, gate it with `capsForScope(scope)` in the UI AND `withScope` in the mediator. UI-only gating is theatre.

### Auth flow

```
Agent boot:
  password = randomBytes(8) → alphanumeric (no 0/o/1/l for dictation safety)
  hash = sha256(password)
  socket.emit('register-room', { roomId, passwordHash })
  signaling stores rooms[roomId] = { passwordHash, hostSocketId }
  (UI displays password to the human)

Operator connect:
  user types ID + password
  sessionStorage.setItem('teamdesk:pwd:' + id, pw)  (one-shot, cleared on read)
  router.push('/session/' + id)
  SessionMediator.start() → joinRoomSecure(id, pw)
  signaling: sha256(pw) === stored hash ? join : emit 'auth-error'
  mediator routes 'auth-error' → toast + push('/')
```

A room registered with a password rejects the legacy passwordless `join-room` event (`auth-error: password-required`). The web operator falls back to legacy `join-room` only when the user typed no password — used for the legacy web-host path that never registered one.

### Signaling — `signaling/server.ts`

Standalone Socket.IO server, deployed on Render. The same `attachSignaling()` function is reused by the local dev server (`server.ts` at repo root) so dev and prod can't drift apart.

Events:
- `register-room { roomId, passwordHash }` — host registers
- `join-room-secure { roomId, password, userId? }` — operator joins with auth
- `join-room` — legacy unauthenticated join
- `offer` / `answer` / `ice-candidate` — WebRTC relay
- `auth-error`, `register-error`, `registered`, `join-ok`, `user-connected` — feedback

**State is in-memory only** — no Redis, no persistence. A signaling restart drops every active room (the agent's `register-room` re-runs on reconnect). On Render's free tier the service sleeps after 15 min of inactivity, so first connection after a quiet period waits ~30s for cold boot. Mitigation options: cron-job.org pings `/healthz` every 14 min, or upgrade to paid Render tier.

### Repository layer

`src/repositories/` defines `MachineRepository`, `SessionRepository`, `AuditRepository`, `UserRepository` as pure interfaces. `firestore/` holds the concrete Firestore implementations. `getRepositories(firestore)` is the factory. New code should use repos; the legacy `useCollection` hook is for live subscriptions that haven't been migrated yet.

### Firebase layer

- **Auth**: Firebase Auth (email/password). `useUser()` from `@/firebase` provides current user. Config in `src/firebase/config.ts` reads `NEXT_PUBLIC_FIREBASE_*` env vars (`.env.local`).
- **Firestore**: `/users/{userId}/machines/{machineId}/sessions/{sessionId}`. `/roles_admin/{userId}` is admin-only (read-only, granted out-of-band via Firebase Console).
- **`firestore.rules`** enforces strict path-based ownership and `userId`/`machineId` immutability on update. Read it before changing the data model — it documents the *why*. Deploy with `firebase deploy --only firestore:rules`.
- **`useMemoFirebase(factory, deps)`** memoizes Firestore refs. Passing a freshly-built ref into `useCollection`/`useDoc` every render leaks listeners.
- **`addDocumentNonBlocking(ref, data)`** is fire-and-forget. Don't `await` it.

### Agent (`apps/agent/`)

Real, working Electron app — not a skeleton anymore. Key files:

- **`src/main/index.ts`** — Electron main process. Generates the 9-digit ID + 8-char password at boot, registers `setDisplayMediaRequestHandler` to auto-select the primary screen (no system picker, no banner), exposes `agent:bootstrap` / `agent:input` IPC handlers.
- **`src/main/input-injector/nut-injector.ts`** — Actual injection via `@nut-tree-fork/nut-js`. One class for all OSes; per-OS subclasses (`windows.ts`, etc.) exist for future overrides (e.g. DXGI-aware Secure Desktop on Windows).
- **`src/renderer/host.ts`** — Browser-context code inside the Electron BrowserWindow. Captures via `getDisplayMedia`, connects to signaling, acts as host peer over simple-peer, forwards incoming input messages to main via IPC.
- **`src/renderer/index.html`** — Status UI showing connection ID + password (both click-to-copy).
- **`src/wire-types.ts`** — Local copy of the wire types (mirrored from `shared/`) to keep the agent's compile graph self-contained.

Build pipeline: `tsc` compiles main, `esbuild` bundles renderer to a self-contained IIFE (because nodeIntegration alone doesn't give `<script>` tags a `require`/`exports` shim). `scripts/copy-assets.js` copies `index.html` into `dist/`.

Trust model: `nodeIntegration: true`, `contextIsolation: false` — we ship the renderer code ourselves, no untrusted content. The renderer can `require('socket.io-client')` and `require('electron')` directly. Tightening to contextBridge + preload is on the roadmap.

## Mobile UX

The operator UI works on mobile browsers via cloudflared tunnels (or any HTTPS deployment). `VideoCanvas` implements a touch gesture model designed for remote-desktop UX, not page-scroll UX:

- **1 finger tap** (no drag, <350ms, <8px movement) → click at that point
- **1 finger drag** → moves the remote cursor only (no click held — moving your finger isn't "holding mouse button")
- **2 finger pinch** → local CSS-transform zoom + pan of the video, **not relayed to the host**. Useful when the remote screen has small targets you can't otherwise hit on a phone.
- **Keyboard button (⌨)** → focuses a hidden `<textarea>` inside the canvas container. The textarea's `input` event drives the `type-text` message because Android Chrome's soft keyboard fires `keydown` with `code === ''` for character keys (only special keys like Backspace/Enter/arrows give usable codes). Toggling on enters "KBD · ON" mode which re-focuses the textarea after every tap, so typing and tapping mix freely.
- **Fullscreen button (⛶)** → `requestFullscreen()` on the canvas container. The textarea sits inside the container so the soft keyboard still attaches in fullscreen.

The 44×44 minimum tap target on those buttons is intentional (Apple HIG / Material). Buttons use `data-canvas-button="true"` so the canvas's gesture handler skips `preventDefault` when the touch lands on them — otherwise the synthesized `click` event would be swallowed.

Coordinate normalization in `computeVideoRect()` accounts for `object-contain` letterboxing AND any active zoom/pan transform — taps in the black bars are ignored, taps inside the zoomed video map back to the un-zoomed original pixel position.

## Operations

### Deploy signaling to Render

The Render dashboard is wired to `main` branch with **Root Directory = `signaling`**. Pushing to `main` auto-rebuilds. Manual redeploy from the dashboard if needed. The `Dockerfile` is multi-stage — keep it under 30s of build time.

CORS is currently `*`. When the web app gets a stable domain, tighten:
```bash
gcloud run services update teamdesk-signaling \
  --set-env-vars CORS_ORIGIN=https://your-domain
# (equivalent on Render: env vars in the dashboard)
```

### Expose local dev to mobile

```powershell
# In one terminal:
npm run dev

# In another:
cloudflared tunnel --url http://localhost:3000
# → grabs an https://<random>.trycloudflare.com URL, valid for the session
```

LAN IP (`http://192.168.x.x:3000`) works if your phone is on the same WiFi AND Windows Firewall allows port 3000 (requires admin: `New-NetFirewallRule -DisplayName "TeamDesk dev :3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow`).

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) | `.env.local` | Firebase Auth + Firestore client config |
| `NEXT_PUBLIC_SIGNALING_URL` | `.env.local` | Where the web operator/host connects (falls back to same-origin) |
| `NEXT_PUBLIC_SIGNING_SECRET` | `.env.local` (optional) | HS256 secret for session JWTs. Defaults to dev placeholder. **Must move server-side before prod.** |
| `TEAMDESK_SIGNALING_URL` | Agent process env | Where the Electron agent connects (falls back to `http://localhost:3000`) |
| `TEAMDESK_AGENT_DEV` | Agent process env | Set to `0` to suppress auto-open of DevTools in packaged builds |
| `CORS_ORIGIN` | Render env vars | Signaling CORS origin (defaults to `*`) |

## Conventions

- **Path aliases**: `@/*` → `./src/*`; `@teamdesk/shared` → `./shared/src/index.ts` (defined in `tsconfig.json`). The agent has its own `wire-types.ts` (mirrored) to keep its compile graph self-contained — when shared types grow, update both.
- **Client components everywhere**: `'use client'` at the top of nearly every component because Firebase hooks, WebRTC, and Socket.IO need browser APIs. Don't try to make the session pages server components.
- **No barrel files** outside `src/domain/index.ts` — import from concrete file paths.
- **Forms**: `react-hook-form` + `zod` resolvers + shadcn `<Form>`.
- **Toasts**: `useToast()` from `@/hooks/use-toast`.
- **TypeScript**: `strict: true` is on, but `next.config.ts` sets `typescript.ignoreBuildErrors: true`. Run `npm run typecheck` manually before committing.

## Gotchas

- **`reactStrictMode: false`** in `next.config.ts`. WebRTC peers were doubling under StrictMode's double-mount. `useSession` uses a ref guard but until every peer-related path is verified idempotent, keep this off.
- **`require('simple-peer')`** in `peer-factory.ts` (not `import`) is intentional — ESM/CJS interop quirks with Next/Turbopack. Don't "fix" it without testing both `npm run dev` and `npm run build`.
- **`getDisplayMedia` requires a user gesture** — only call it from a click handler (web host only; the agent bypasses this restriction).
- **STUN only**: hardcoded to Google's public STUN. No TURN — peers behind symmetric NAT will fail to connect (the agent + operator combo works in most home networks, but some corporate ones won't).
- **`reactStrictMode: false` + Render cold start**: if the signaling has been asleep for 15+ min, the agent's first `register-room` waits ~30s while Render boots. The agent's UI shows "starting…" then "waiting for operator…" — that's correct behavior.
- **Soft keyboard on Android Chrome** fires `keydown` with `code === ''` or `'Unidentified'` for character keys. The `type-text` wire message + `input` event handler is the only reliable path. iOS Safari has even worse keyboard event quirks — if iOS support becomes critical, may need a more invasive workaround.
- **Self-control loop**: testing agent + operator on the same physical machine moves the local cursor to wherever you tap on the web canvas — physically inescapable when one mouse controls both sides. Use a phone, tablet, second PC, or VM for meaningful testing.
- **SSH terminal is a mock**: `SshTerminalView` uses xterm.js with no backend wired up.
- **Agent runs as the current user**, not as `NT AUTHORITY\SYSTEM`. That means it can't post inputs into the Windows Secure Desktop (UAC prompts). Real production deploys would install the agent as a service with elevated privileges.

## Style guide (from `docs/blueprint.md`)

- Primary `#FF7043` (warm orange), Background `#F5F5DC` (soft beige), Accent `#FF4081` (coral red). These power the dashboard and home page.
- Session console palette is dark (`--cyan`, `--amber`, `--crimson` in `globals.css`) and lives only inside session components. Don't replace `--primary`.
- Headlines: `Montserrat`. Body: `Open Sans`. Code: `Source Code Pro`.
- Icons: minimalist via `lucide-react`. Animations via `framer-motion`.
- Dashboard uses Bento Grid layout.

## Roadmap

Ordered by impact-per-effort. Pick from the top.

### High impact

1. **Deploy the web to Firebase App Hosting.** `apphosting.yaml` already exists. After deploy, set `NEXT_PUBLIC_SIGNALING_URL` to the Render URL in App Hosting's env, tighten Render's `CORS_ORIGIN` to the App Hosting domain, and the system has a stable public URL without cloudflared.
2. **Move JWT signing server-side.** `session-token.ts` currently signs with `NEXT_PUBLIC_SIGNING_SECRET`, which is exposed to the client. Move to a Cloud Function or to the signaling server (`signaling/` could expose an HTTPS endpoint that returns a fresh JWT). The agent already validates signatures locally — that path stays.
3. **Add a TURN server.** Coturn on Cloud Run or a managed service like Twilio NTS. Without TURN, ~15% of NAT scenarios fail to connect. The `iceServers` config in `peer-factory.ts` accepts the TURN URLs directly.
4. **Persist chat to Firestore on session close.** The mediator collects `ChatMessage`s in memory but `SessionRepository.appendChat` is never called. Wire it in `SessionMediator.stop()` or in `useSession`'s cleanup effect.

### Medium impact

5. **Heartbeat to prevent Render cold starts.** A cron job at cron-job.org pings `/healthz` every 14 min for free. Or upgrade Render to paid tier ($7/mo).
6. **Multi-monitor + region capture in the agent.** `desktopCapturer.getSources()` returns all displays — add a dropdown to the agent UI to pick which one is shared. Region capture needs an overlay window for selection.
7. **Wire the file-system module on the agent.** `apps/agent/src/main/file-system/index.ts` has the primitives. Hook it up to the file channel so transfers actually land on disk on the agent side (currently the agent ignores file messages — the engine works web-to-web only).
8. **Tighten Electron security**: move to `contextIsolation: true` + preload script with `contextBridge.exposeInMainWorld`. Currently the renderer has full Node access.

### Lower priority / future

9. **Real SSH terminal backend.** Today `SshTerminalView` is xterm.js UI only. Backend would be a Node SSH client (`ssh2`) in the agent or a separate service.
10. **Native screen capture upgrade**: DXGI on Windows, ScreenCaptureKit on macOS, PipeWire on Linux. Lower latency, higher quality. Today the agent uses Electron's `desktopCapturer` which is Chromium-backed — fine for MVP, not for production at scale.
11. **Wake-on-LAN.** For powering on agent machines from the operator console.
12. **DNS / UEM policy push.** Send agent-side policies from the server.
13. **Recording**: video + event timeline. Server-side or client-side recording with a marker stream of events (file transferred, UAC popped, etc.).
14. **Tests.** End-to-end testing is currently manual (see the test plan in `~/.claude/plans/prompt-para-claude-expressive-hinton.md`). At minimum, Playwright for the operator UI and a Jest harness for `FileTransferEngine` + scope guards.
15. **Migrate Firestore → PostgreSQL** if you outgrow Firestore's billing or need complex audit queries. The Repository layer is in place specifically to make this safe.

### Known small bugs / debt

- `apps/agent/src/main/input-injector/{windows,macos,linux}.ts` are vestigial stubs after we centralized injection in `nut-injector.ts`. Either delete them or move per-OS overrides into them.
- The agent's `wire-types.ts` duplicates `shared/src/protocol.ts`. When you add new message types, update both.
- The legacy `use-webrtc.ts` and `HostSessionHandler` are kept for the web-as-host flow. If you commit fully to the agent path, those can be deleted along with the home page's "Start Broadcasting" UI.
- `next.config.ts` has `ignoreBuildErrors: true` — production builds hide type errors. Tighten when you're ready to enforce.
