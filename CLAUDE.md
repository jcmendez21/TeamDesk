# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TeamDesk is a remote desktop platform (AnyDesk-style) built on WebRTC. A 9-digit connection ID identifies each session; two peers join a Socket.IO room and `simple-peer` brokers the SDP/ICE handshake. The web operator console is now scope-aware: a JWT-signed `ScopeId` decides which capabilities (input, files, terminal) the active session may exercise, and `withScope` enforces it on every inbound message.

The repo is an **npm workspaces monorepo** with three sub-projects plus the root web app:

- **root (`./`)** — the Next.js operator app (current location of `src/`, `server.ts`, configs). Migrating `src/` into `apps/web/` is on the roadmap but not done yet.
- **`shared/`** — pure-TS types and the wire protocol used by both web and agent (`@teamdesk/shared`).
- **`apps/agent/`** — Electron host agent skeleton. Compiles to `dist/`, packages via `electron-builder.yml`. **Native deps (`electron`, `@nut-tree-fork/nut-js`) are not installed yet** — run `npm install` inside the workspace before `npm run dev:agent`.

## Commands

```bash
npm run dev          # Custom server (server.ts) — Next.js + Socket.IO on :3000. Use this 99% of the time.
npm run dev:next     # Next.js only with Turbopack on :9002 (signaling unavailable)
npm run dev:agent    # Run the Electron agent (requires `npm install` inside apps/agent first)
npm run build        # Production build (NODE_ENV=production)
npm run build:agent  # Bundle the Electron agent
npm run start        # Production server (Next.js standalone — does NOT include Socket.IO)
npm run typecheck    # tsc --noEmit (root). For the agent: `npx --workspace apps/agent tsc --noEmit`
npm run lint         # next lint (ignored during builds)
npm run genkit:dev   # Google Genkit dev runner — wired up but no UI integration yet
```

`npm start` runs `next start`, which **does not boot the custom server** — production deploys must run `tsx server.ts` (or compiled equivalent) for signaling to work. `npm run dev:next` skips the custom server too — the WebRTC UI looks fine but no peer will ever connect.

## Architecture

### Two roles, one Next.js app
- **Operator (controller)**: `src/app/session/[id]/page.tsx`. Mounts the full session console (top bar, scopes panel, video, action bar, chat, transfers, audit). Runs `useSession({ role: 'operator', ... })` which spins up a `SessionMediator` and shares it with children via `SessionContextProvider`.
- **Host (controlled, web fallback)**: `src/app/page.tsx`. Calls `getDisplayMedia()` from a button click; the future Electron agent replaces this with native capture.

`useWebRTC` in `src/hooks/use-webrtc.ts` is the legacy monolith — it still works because `HostSessionHandler` uses it, but new code goes through `SessionMediator` + the specialized hooks (`use-input-channel`, `use-file-channel`, `use-chat-channel`, `use-telemetry`).

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
server.ts (Socket.IO room relay)
```

`shared/src/protocol.ts` defines the discriminated union of data-channel messages — `input` / `file` / `chat` / `control`. The `RemotePeer` wrapper multiplexes them over a single `RTCDataChannel` and routes by `type` prefix. Media (video) is a separate WebRTC track, independent from the data channel by design — degraded video never blocks input.

### Scopes — the security pillar
`SCREEN_ONLY < SCREEN_CONTROL < SCREEN_FILES < FULL_CONTROL`. Levels are cumulative (`capsForScope`). The active scope is encoded in a JWT (`src/services/session-token.ts`, HS256 via Web Crypto). `withScope` wraps every inbound input/file handler in the mediator — even a tampered operator UI can't bypass it because the receiving side enforces the same check before invoking the handler.

When porting a new feature, ask: **does this require a capability beyond the operator's scope?** If yes, gate it with `capsForScope(scope)` in the UI AND `withScope` in the mediator. UI-only gating is theatre.

### Signaling — `server.ts`
Custom Node HTTP server wraps Next's request handler and adds a Socket.IO instance. Three relay events: `offer`, `answer`, `ice-candidate`. Rooms are joined by 9-digit connection ID via `join-room`. **State is in-memory only** — no Redis, no persistence, no TTL despite the blueprint mentioning Redis. A server restart drops every active session.

### Repository layer
`src/repositories/` defines `MachineRepository`, `SessionRepository`, `AuditRepository`, `UserRepository` as pure interfaces. `firestore/` holds the concrete Firestore implementations. `getRepositories(firestore)` is the factory. Pages should use the repo, not raw Firestore — except where the existing `useCollection` hook is doing live subscriptions (those will migrate later).

### Firebase layer
- **Auth**: Firebase Auth (email/password). `useUser()` from `@/firebase` provides current user.
- **Firestore**: `/users/{userId}/machines/{machineId}/sessions/{sessionId}`. `/roles_admin/{userId}` is admin-only (read-only, granted out-of-band).
- **`firestore.rules`** enforces strict path-based ownership and `userId`/`machineId` immutability on update. Read it before changing the data model — it documents the *why*.
- **`useMemoFirebase(factory, deps)`** memoizes Firestore refs. Passing a freshly-built ref into `useCollection`/`useDoc` on every render leaks listeners.
- **`addDocumentNonBlocking(ref, data)`** is fire-and-forget. Don't `await` it.

### Agent (`apps/agent/`)
Electron skeleton with `InputInjectorFactory.create()` picking a Windows/Mac/Linux `InputInjector` adapter, `CaptureAdapterFactory` returning `ElectronCaptureAdapter` (uses Electron's `desktopCapturer`), `AgentFileSystem` for ACL-respecting file ops, and an `IpcBridge` singleton between main and renderer. The injector classes are stubs that log — wiring `@nut-tree-fork/nut-js` is the next implementation step.

## Conventions

- **Path aliases**: `@/*` → `./src/*`; `@teamdesk/shared` → `./shared/src/index.ts` (defined in `tsconfig.json` + `apps/agent/tsconfig.json`). Always use them — never `../../`.
- **Client components everywhere**: `'use client'` at the top of nearly every component because Firebase hooks, WebRTC and Socket.IO need browser APIs. Don't try to make the session pages server components.
- **No barrel files** outside `src/domain/index.ts` — import from concrete file paths. `@/components/ui/button`, not `@/components/ui`.
- **Forms**: `react-hook-form` + `zod` resolvers + shadcn `<Form>` components.
- **Toasts**: `useToast()` from `@/hooks/use-toast` (shadcn pattern, not `sonner`).
- **TypeScript**: `strict: true` is on, but `next.config.ts` sets `typescript.ignoreBuildErrors: true`. Run `npm run typecheck` manually before committing — the build won't catch type errors.

## Gotchas

- **`reactStrictMode: false`** in `next.config.ts`. WebRTC peers were doubling up under StrictMode's double-mount. `useSession` uses a ref guard, but until every peer-related path is verified idempotent, keep this off.
- **`require('simple-peer')`** in `peer-factory.ts` (not `import`) is intentional — `simple-peer` ships ESM/CJS interop quirks with Next/Turbopack. Don't "fix" it without testing both `npm run dev` and `npm run build`.
- **`getDisplayMedia` requires a user gesture** — only call it from a click handler.
- **STUN only**: `iceServers` defaults to Google's public STUN. There's no TURN, so peers behind symmetric NAT will fail to connect.
- **SSH terminal is a mock**: `SshTerminalView` uses xterm.js but there's no real SSH backend wired up. Treat it as UI-only.
- **Agent deps not installed**: `apps/agent/package.json` declares `electron`, `nut-js`, `electron-builder` as **expected** but `npm install` hasn't been run there yet. The agent code typechecks via `import type` shapes and lazy `require()` — but it won't *run* until you install those deps inside the workspace.
- **Session palette is scoped**: the dark cyan/amber/crimson tokens (`--cyan`, `--amber`, etc.) live in `globals.css` and are used inline in the session console only. The rest of the app keeps the warm orange theme from the blueprint — don't replace `--primary`.

## Style guide (from `docs/blueprint.md`)

- Primary `#FF7043` (warm orange), Background `#F5F5DC` (soft beige), Accent `#FF4081` (coral red). These power the dashboard and home page.
- Headlines: `Montserrat`. Body: `Open Sans`. Code: `Source Code Pro`.
- Icons: minimalist via `lucide-react`. Animations via `framer-motion`.
- Dashboard uses Bento Grid layout.
