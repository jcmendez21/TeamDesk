/**
 * QualityStrategy — Strategy pattern for the bitrate/FPS profile applied to
 * the outbound video. The session mediator polls the strategy with the
 * latest telemetry and applies whatever profile it returns.
 *
 * `AutoStrategy` implements the adaptive logic from the spec: degrade one
 * level if RTT > 150ms or loss > 2%; promote one level after 10 seconds of
 * clean metrics. `FixedStrategy` is the manual override for the operator's
 * quality picker (4K / 1080p / 720p).
 */

export interface ConnectionStats {
  rttMs: number;
  lossPct: number;
  bandwidthMbps: number;
  jitterMs?: number;
}

export interface QualityProfile {
  id: 'high' | 'medium' | 'low';
  label: string;
  width: number;
  height: number;
  fps: number;
  maxBitrateKbps: number;
}

export const PROFILES: Record<QualityProfile['id'], QualityProfile> = {
  high:   { id: 'high',   label: '1080p · 60fps', width: 1920, height: 1080, fps: 60, maxBitrateKbps: 8000 },
  medium: { id: 'medium', label: '720p · 30fps',  width: 1280, height: 720,  fps: 30, maxBitrateKbps: 3000 },
  low:    { id: 'low',    label: '480p · 15fps',  width: 854,  height: 480,  fps: 15, maxBitrateKbps: 800 },
};

const ORDER: QualityProfile['id'][] = ['low', 'medium', 'high'];

export interface QualityStrategy {
  /** Called every telemetry tick (typically 2s). Return the profile to apply. */
  next(stats: ConnectionStats): QualityProfile;
}

export class FixedStrategy implements QualityStrategy {
  constructor(private readonly profileId: QualityProfile['id']) {}
  next(): QualityProfile {
    return PROFILES[this.profileId];
  }
}

/**
 * Adaptive strategy. Hysteresis: promotion needs `promoteAfterTicks`
 * consecutive clean readings to avoid flip-flopping when the link is at the
 * boundary of two profiles.
 */
export class AutoStrategy implements QualityStrategy {
  private currentIdx = 2; // start at "high"
  private cleanStreak = 0;
  private readonly promoteAfterTicks: number;

  constructor(opts: { promoteAfterTicks?: number; startAt?: QualityProfile['id'] } = {}) {
    this.promoteAfterTicks = opts.promoteAfterTicks ?? 5; // 5 ticks × 2s = 10s
    if (opts.startAt) this.currentIdx = ORDER.indexOf(opts.startAt);
  }

  next(stats: ConnectionStats): QualityProfile {
    const degraded = stats.rttMs > 150 || stats.lossPct > 2;
    if (degraded) {
      if (this.currentIdx > 0) this.currentIdx--;
      this.cleanStreak = 0;
    } else {
      this.cleanStreak++;
      if (this.cleanStreak >= this.promoteAfterTicks && this.currentIdx < ORDER.length - 1) {
        this.currentIdx++;
        this.cleanStreak = 0;
      }
    }
    return PROFILES[ORDER[this.currentIdx]];
  }
}
