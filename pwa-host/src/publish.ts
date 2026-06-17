import { Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { newToken, ensureBadge } from './util';

const storage = new Storage();
const BUCKET_NAME = 'redivivus-pwa-host';
const bucket = storage.bucket(BUCKET_NAME);

const TTL_CHOICES = new Set([15, 60, 240]);
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024; // 10 MB total
const MAX_PUBLISH_PER_HOUR = 30;

// Simple in-memory rate limiting (sufficient for single-user solo coding Cloud Run instance)
const rateLimits = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(appToken: string): boolean {
  const now = Date.now();
  let record = rateLimits.get(appToken);
  if (!record || record.expiresAt < now) {
    record = { count: 0, expiresAt: now + 3600 * 1000 };
    rateLimits.set(appToken, record);
  }
  record.count++;
  return record.count <= MAX_PUBLISH_PER_HOUR;
}

function verifyApp(token: string): { ok: boolean; tier: 'free' | 'paid' } {
  if (!token) { return { ok: false, tier: 'free' }; }
  return { ok: true, tier: 'free' };
}

interface PublishBody {
  ttlMinutes?: number;
  entry?: string;
  title?: string;
  files?: Record<string, string>; // relpath -> base64
}

export async function handlePublish(req: Request, res: Response): Promise<void> {
  const appToken = req.headers['x-redivivus-app'] as string || '';
  const app = verifyApp(appToken);
  if (!app.ok) { res.status(401).json({ error: 'Missing or invalid Redivivus app token' }); return; }

  if (!checkRateLimit(appToken)) {
    res.status(429).json({ error: 'Rate limit reached — try again later' });
    return;
  }

  const body: PublishBody = req.body;
  const files = body.files || {};
  const names = Object.keys(files);
  if (names.length === 0) { res.status(400).json({ error: 'No files in bundle' }); return; }

  const ttlMin = TTL_CHOICES.has(body.ttlMinutes as number) ? (body.ttlMinutes as number) : 60;
  const ttl = ttlMin * 60;
  const entry = body.entry && files[body.entry]
    ? body.entry
    : (names.find((n) => n.toLowerCase().endsWith('index.html')) || names[0]);

  const decoded: Record<string, Buffer> = {};
  let total = 0;
  for (const n of names) {
    const bytes = Buffer.from(files[n], 'base64');
    total += bytes.length;
    if (total > MAX_BUNDLE_BYTES) { res.status(413).json({ error: 'Bundle too large (max 10 MB)' }); return; }
    decoded[n] = bytes;
  }

  if (app.tier === 'free') {
    const html = decoded[entry].toString('utf8');
    decoded[entry] = Buffer.from(ensureBadge(html), 'utf8');
  }

  const token = newToken();
  const expiresAt = Date.now() + ttl * 1000;

  try {
    const uploadPromises = names.map(n => 
      bucket.file(`b:${token}:${n}`).save(decoded[n], {
        resumable: false,
        metadata: { cacheControl: 'public, max-age=600' }
      })
    );
    uploadPromises.push(
      bucket.file(`m:${token}`).save(
        JSON.stringify({ entry, tier: app.tier, title: body.title || 'App', expiresAt }),
        { resumable: false, contentType: 'application/json' }
      )
    );

    await Promise.all(uploadPromises);

    // Get origin from request to construct the full URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}/p/${token}/`;

    res.json({ token, url, expiresAt, ttlMinutes: ttlMin });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
}
