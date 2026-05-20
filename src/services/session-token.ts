/**
 * Session token (JWT, HS256) issued at session start to encode the active
 * scope. Web Crypto is used directly so we don't pull in a JWT lib for the
 * three operations we actually need.
 *
 * In production the signing secret lives only on the server (the signaling
 * server in `server.ts` or a Cloud Function), never in the browser. The
 * agent (Electron) holds the *verification* key and rejects tokens with an
 * invalid signature — that is what makes the scope unforgeable from the UI.
 *
 * For local development the secret is read from `NEXT_PUBLIC_SIGNING_SECRET`
 * but the real flow must move signing server-side before any deploy.
 */

import type { ScopeId } from '@/domain/scopes';

export interface SessionTokenClaims {
  sub: string;        // operator user id
  sid: string;        // session id
  scope: ScopeId;
  exp: number;        // epoch seconds
  iat: number;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function getSecret(): string {
  const secret = process.env.NEXT_PUBLIC_SIGNING_SECRET ?? 'dev-only-do-not-use-in-prod';
  return secret;
}

export interface IssueTokenInput {
  userId: string;
  sessionId: string;
  scope: ScopeId;
  ttlSeconds?: number;
}

export async function issueSessionToken(input: IssueTokenInput): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 8 * 60 * 60; // 8 hours, per the spec
  const claims: SessionTokenClaims = {
    sub: input.userId,
    sid: input.sessionId,
    scope: input.scope,
    iat: now,
    exp: now + ttl,
  };
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = b64urlEncode(ENC.encode(JSON.stringify(header)));
  const payloadB64 = b64urlEncode(ENC.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importKey(getSecret());
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(signingInput));
  const sigB64 = b64urlEncode(sig);

  return `${signingInput}.${sigB64}`;
}

export interface VerifyResult {
  valid: boolean;
  claims?: SessionTokenClaims;
  reason?: string;
}

export async function verifySessionToken(token: string): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts;

  const key = await importKey(getSecret());
  const expected = await crypto.subtle.sign('HMAC', key, ENC.encode(`${headerB64}.${payloadB64}`));
  if (b64urlEncode(expected) !== sigB64) return { valid: false, reason: 'bad-signature' };

  let claims: SessionTokenClaims;
  try {
    claims = JSON.parse(DEC.decode(b64urlDecode(payloadB64))) as SessionTokenClaims;
  } catch {
    return { valid: false, reason: 'bad-payload' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return { valid: false, reason: 'expired' };

  return { valid: true, claims };
}

/** Read claims without verifying — only safe for UI display. */
export function decodeClaimsUnsafe(token: string): SessionTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(DEC.decode(b64urlDecode(parts[1]))) as SessionTokenClaims;
  } catch {
    return null;
  }
}
