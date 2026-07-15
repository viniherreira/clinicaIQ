/**
 * Supabase Storage helper for patient files (X-rays, photos, documents).
 * Uses the service-role key server-side only, against a PRIVATE bucket —
 * files are served through short-lived signed URLs, never public (LGPD).
 * Inert until SUPABASE_SERVICE_ROLE_KEY is configured.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://aalukuesfuzvwgkvhfog.supabase.co';
const BUCKET = 'patient-files';

function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function storageEnabled(): boolean {
  return !!serviceKey();
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = serviceKey();
  return { Authorization: `Bearer ${key}`, apikey: key ?? '', ...extra };
}

async function ensureBucket(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 10485760 }),
  });
  // 409/400 = already exists — fine.
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    throw new Error(`storage: bucket create failed (${res.status})`);
  }
}

export async function uploadObject(path: string, file: File): Promise<void> {
  const doUpload = () =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': file.type || 'application/octet-stream' }),
      body: file,
    });

  let res = await doUpload();
  if (res.status === 400 || res.status === 404) {
    // Likely "bucket not found" on first ever upload — create it and retry once.
    const text = await res.text();
    if (/bucket/i.test(text)) {
      await ensureBucket();
      res = await doUpload();
    } else if (!res.ok) {
      throw new Error(`storage: upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(`storage: upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Short-lived signed URL for a private object (default 1h). */
export async function signObject(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
}

export async function deleteObject(path: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: headers(),
  });
}
