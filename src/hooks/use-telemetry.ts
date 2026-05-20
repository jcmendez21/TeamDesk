'use client';

import { useEffect, useState } from 'react';
import type { ConnectionStats } from '@/services/quality-strategy';
import type { MediatorEvent } from '@/services/session-mediator';
import { useMediator } from '@/hooks/use-session';

export type LinkQuality = 'good' | 'degraded' | 'critical';

export function useTelemetry(): {
  stats: ConnectionStats | null;
  quality: LinkQuality;
} {
  const mediator = useMediator();
  const [stats, setStats] = useState<ConnectionStats | null>(null);

  useEffect(() => {
    return mediator.on((event: MediatorEvent) => {
      if (event.type === 'telemetry') setStats(event.stats);
    });
  }, [mediator]);

  const quality: LinkQuality = !stats
    ? 'good'
    : stats.rttMs > 160 || stats.lossPct > 3.5
      ? 'critical'
      : stats.rttMs > 90 || stats.lossPct > 1.5
        ? 'degraded'
        : 'good';

  return { stats, quality };
}
