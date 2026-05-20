'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ScopeId } from '@/domain/scopes';
import { useSession, SessionContextProvider } from '@/hooks/use-session';
import { TopBar } from '@/components/session/top-bar';
import { AccessScopes } from '@/components/session/access-scopes';
import { SessionInfo } from '@/components/session/session-info';
import { VideoCanvas } from '@/components/session/video-canvas';
import { ActionBar } from '@/components/session/action-bar';
import { ChatPanel } from '@/components/session/chat-panel';
import { TransferQueue } from '@/components/session/transfer-queue';
import { AuditFeed } from '@/components/session/audit-feed';

/**
 * SessionPage — operator console for a live remote-control session.
 * Layout: TopBar (full width) · Left scopes/info · Center video/actions ·
 * Right chat/transfers/audit. The whole tree shares a single SessionMediator
 * via SessionContextProvider so child components don't each spin up a peer.
 */
export default function SessionPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const sessionId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [activeScope, setActiveScope] = useState<ScopeId>('SCREEN_FILES');
  const sessionStart = useMemo(() => new Date(), []);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setUptimeSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const session = useSession({
    sessionId,
    connectionId: sessionId,
    role: 'operator',
    initialScope: activeScope,
  });

  // Keep mediator's scope in sync if user picks a different one.
  useEffect(() => {
    session.setScope(activeScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScope]);

  const handleDisconnect = (): void => {
    session.mediator.stop();
    router.push('/');
  };

  return (
    <SessionContextProvider mediator={session.mediator}>
      <div
        className="min-h-screen flex flex-col"
        style={{ background: 'var(--session-bg)', color: 'var(--fg-0)' }}
      >
        <TopBar
          sessionId={sessionId}
          device={`HOST · ${sessionId}`}
          uptimeSeconds={uptimeSeconds}
          operatorName="Operator"
          onDisconnect={handleDisconnect}
        />

        <main
          className="flex-1 grid gap-3 p-3"
          style={{ gridTemplateColumns: '300px 1fr 360px', minHeight: 0 }}
        >
          <div className="flex flex-col gap-3">
            <AccessScopes active={activeScope} onChange={setActiveScope} />
            <SessionInfo
              device={`HOST · ${sessionId}`}
              scope={activeScope}
              startedAt={sessionStart}
              uptimeSeconds={uptimeSeconds}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <VideoCanvas
              stream={session.remoteStream}
              scope={activeScope}
              qualityLabel={session.qualityProfile?.label ?? 'AUTO'}
            />
            <ActionBar
              scope={activeScope}
              sessionId={sessionId}
              onQuality={(q) => session.setQuality(q)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <ChatPanel sessionId={sessionId} role="operator" />
            <TransferQueue scope={activeScope} sessionId={sessionId} />
            <AuditFeed />
          </div>
        </main>
      </div>
    </SessionContextProvider>
  );
}
