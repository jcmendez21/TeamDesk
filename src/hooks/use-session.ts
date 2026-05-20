/**
 * useSession — the new entry point that replaces the monolithic useWebRTC.
 *
 * Owns a single `SessionMediator` for the component lifetime and returns
 * a stable handle. Child hooks (`useInputChannel`, `useFileChannel`,
 * `useChatChannel`, `useTelemetry`) read the mediator from React context
 * via `SessionContextProvider` so they don't each spin up their own.
 */

'use client';

import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ScopeId } from '@/domain/scopes';
import {
  SessionMediator,
  type MediatorEvent,
  type SessionMediatorOptions,
} from '@/services/session-mediator';
import type { QualityProfile } from '@/services/quality-strategy';

export interface UseSessionResult {
  mediator: SessionMediator;
  isConnected: boolean;
  remoteStream: MediaStream | null;
  scope: ScopeId;
  setScope: (s: ScopeId) => void;
  qualityProfile: QualityProfile | null;
  setQuality: (q: 'auto' | 'high' | 'medium' | 'low') => void;
}

export function useSession(opts: SessionMediatorOptions): UseSessionResult {
  // Mediator is created once per component lifetime. React StrictMode
  // intentionally double-mounts in dev — the ref guard plus idempotent
  // start/stop prevents the second mount from creating a duplicate peer.
  const mediatorRef = useRef<SessionMediator | null>(null);
  if (!mediatorRef.current) {
    mediatorRef.current = new SessionMediator(opts);
  }
  const mediator = mediatorRef.current;

  const [isConnected, setIsConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [scope, setScopeState] = useState<ScopeId>(opts.initialScope);
  const [qualityProfile, setQualityProfile] = useState<QualityProfile | null>(null);

  useEffect(() => {
    mediator.start();
    const off = mediator.on((event: MediatorEvent) => {
      switch (event.type) {
        case 'connected': setIsConnected(true); break;
        case 'closed':    setIsConnected(false); break;
        case 'stream':    setRemoteStream(event.stream); break;
        case 'profile':   setQualityProfile(event.profile); break;
      }
    });
    return () => {
      off();
      mediator.stop();
    };
    // The mediator identity is stable (created once via ref). Re-running
    // this effect on opts changes would create duplicate peers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    mediator,
    isConnected,
    remoteStream,
    scope,
    setScope: (s) => {
      setScopeState(s);
      mediator.setActiveScope(s);
    },
    qualityProfile,
    setQuality: (q) => mediator.setQualityStrategy(q),
  };
}

// ── Context for child hooks ───────────────────────────────────────────────

const SessionContext = createContext<SessionMediator | null>(null);

export function SessionContextProvider({
  mediator,
  children,
}: {
  mediator: SessionMediator;
  children: ReactNode;
}): ReactElement {
  const value = useMemo(() => mediator, [mediator]);
  return createElement(SessionContext.Provider, { value }, children);
}

export function useMediator(): SessionMediator {
  const m = useContext(SessionContext);
  if (!m) throw new Error('useMediator must be used inside <SessionContextProvider>');
  return m;
}
