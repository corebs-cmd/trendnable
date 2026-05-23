// Direct APNs HTTP/2 sender — no third-party relay.
// Requires APNS_AUTH_KEY (p8 content), APNS_KEY_ID, APNS_TEAM_ID, APNS_ENVIRONMENT secrets.

const BUNDLE_ID = 'com.trendnable.app';

function pemToUint8Array(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(data: Uint8Array | string): string {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeJwt(p8: string, keyId: string, teamId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToUint8Array(p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header  = toBase64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = toBase64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const input   = `${header}.${payload}`;

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  );

  return `${input}.${toBase64Url(new Uint8Array(sig))}`;
}

export interface ApnsPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
}

export async function sendApnsNotification(
  deviceToken: string,
  { title, body, data = {}, badge = 1 }: ApnsPayload,
): Promise<boolean> {
  const p8Key  = Deno.env.get('APNS_AUTH_KEY') ?? '';
  const keyId  = Deno.env.get('APNS_KEY_ID')   ?? '';
  const teamId = Deno.env.get('APNS_TEAM_ID')  ?? '';
  const env    = Deno.env.get('APNS_ENVIRONMENT') ?? 'production';

  if (!p8Key || !keyId || !teamId) {
    console.warn('APNs credentials not configured — skipping push');
    return false;
  }

  const jwt  = await makeJwt(p8Key, keyId, teamId);
  const host = env === 'sandbox'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com';

  const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'authorization':    `bearer ${jwt}`,
      'apns-topic':       BUNDLE_ID,
      'apns-push-type':   'alert',
      'apns-priority':    '10',
      'content-type':     'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title, body }, sound: 'default', badge },
      ...data,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    console.error(`APNs rejected (${res.status}):`, err);
    return false;
  }

  return true;
}
