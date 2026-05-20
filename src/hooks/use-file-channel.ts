'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileMsg } from '@teamdesk/shared';
import type { TransferItem } from '@/domain/types';
import { useMediator } from '@/hooks/use-session';
import { FileTransferEngine } from '@/services/file-transfer-engine';

interface UseFileChannelResult {
  transfers: TransferItem[];
  enqueueUpload: (file: File) => Promise<string>;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
}

/**
 * useFileChannel — React surface over `FileTransferEngine`. The engine is
 * created once per mediator and persists for the component's lifetime.
 * Completed downloads trigger a browser file save via a transient anchor.
 */
export function useFileChannel(sessionId = ''): UseFileChannelResult {
  const mediator = useMediator();
  const engineRef = useRef<FileTransferEngine | null>(null);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);

  if (!engineRef.current) {
    engineRef.current = new FileTransferEngine(
      (msg: FileMsg) => mediator.sendFile(msg),
      {
        onChange: (snapshot) => setTransfers(snapshot),
        onComplete: (item, blob) => {
          // Trigger a download in the browser. In Electron this gets
          // replaced with a real fs.writeFile in the agent's main process.
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = item.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        },
      },
      sessionId,
    );
  }

  useEffect(() => {
    const engine = engineRef.current!;
    return mediator.onChannel<FileMsg>('file', (msg) => {
      void engine.handleIncoming(msg);
    });
  }, [mediator]);

  const enqueueUpload = useCallback((file: File) => engineRef.current!.enqueueUpload(file), []);
  const pause = useCallback((id: string) => engineRef.current!.pause(id), []);
  const resume = useCallback((id: string) => engineRef.current!.resume(id), []);
  const cancel = useCallback((id: string) => engineRef.current!.cancel(id), []);

  return { transfers, enqueueUpload, pause, resume, cancel };
}
