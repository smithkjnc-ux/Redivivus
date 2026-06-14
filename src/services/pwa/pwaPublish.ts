// [SCOPE] PWA publish client (Phase 2 core) — bridges the Phase 0 generator to the Phase 1 ephemeral host. Takes a
// built project folder, generates the PWA bundle (manifest/sw/icon/badge), base64-encodes each file, and POSTs it
// to the host's /publish, returning the install URL + token + expiry. No UI — the "Add to Phone" button calls this.
// See docs/REDIVIVUS_ADD_TO_PHONE.md.
import { generatePwa, PwaOptions } from './pwaGenerator.js';

export interface PublishOptions extends PwaOptions {
  hostUrl: string;                 // the deployed Worker, e.g. https://redivivus-pwa-host.smithkjnc.workers.dev
  appToken: string;                // X-Redivivus-App — v1: any non-empty Redivivus instance token (gates publishing)
  ttlMinutes?: 15 | 60 | 240;      // install-link lifetime (default 60)
}

export interface PublishResult {
  url: string;          // install URL to QR/share
  token: string;
  expiresAt: number;    // epoch ms
  ttlMinutes: number;
  warnings: string[];   // un-bundled local refs (from the generator) — may not run standalone
}

// Generate + publish a project folder as an ephemeral installable PWA. Throws on a non-2xx host response.
export async function publishPwa(srcDir: string, opts: PublishOptions): Promise<PublishResult> {
  const pwa = generatePwa(srcDir, opts);

  const files: Record<string, string> = {};
  for (const [rel, buf] of pwa.files) { files[rel] = buf.toString('base64'); }

  const res = await fetch(`${opts.hostUrl.replace(/\/+$/, '')}/publish`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-redivivus-app': opts.appToken,
      // [FIX] Cloudflare's edge 403s a bare/Node/Python UA on workers.dev — send a real UA so /publish is reachable.
      'user-agent': 'Redivivus-Extension/1.0',
    },
    body: JSON.stringify({ ttlMinutes: opts.ttlMinutes || 60, entry: pwa.entry, title: opts.title, files }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`PWA publish failed (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json() as { url: string; token: string; expiresAt: number; ttlMinutes: number };
  return { ...data, warnings: pwa.warnings };
}
