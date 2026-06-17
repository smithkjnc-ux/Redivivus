import { Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { contentType, expiredPageHtml } from './util';

const storage = new Storage();
const BUCKET_NAME = 'redivivus-pwa-host';
const bucket = storage.bucket(BUCKET_NAME);

interface Meta { entry: string; tier: string; title: string; expiresAt: number; }

export async function handleServe(req: Request, res: Response): Promise<void> {
  const token = req.params.token;
  if (!token) { res.status(404).send('Not found'); return; }

  try {
    const metaFile = bucket.file(`m:${token}`);
    const [exists] = await metaFile.exists();
    
    if (!exists) { 
      res.status(410).type('html').send(expiredPageHtml()); 
      return; 
    }

    const [metaRaw] = await metaFile.download();
    const meta = JSON.parse(metaRaw.toString('utf8')) as Meta;

    if (Date.now() > meta.expiresAt) {
      res.status(410).type('html').send(expiredPageHtml());
      return;
    }

    let path = req.params[0] || '';
    if (!path || path.endsWith('/')) { path = meta.entry; }

    let fileToServe = bucket.file(`b:${token}:${path}`);
    let [fileExists] = await fileToServe.exists();
    let servedPath = path;

    if (!fileExists) {
      // Fallback to entry HTML for SPA routing
      fileToServe = bucket.file(`b:${token}:${meta.entry}`);
      [fileExists] = await fileToServe.exists();
      servedPath = meta.entry;
      
      if (!fileExists) {
        res.status(410).type('html').send(expiredPageHtml());
        return;
      }
    }

    res.set('Content-Type', contentType(servedPath));
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=600');
    
    if (servedPath.endsWith('sw.js')) {
      res.set('Service-Worker-Allowed', '/');
    }

    fileToServe.createReadStream()
      .on('error', (err) => {
        console.error('Error serving file stream:', err);
        if (!res.headersSent) {
          res.status(500).send('Internal server error');
        }
      })
      .pipe(res);

  } catch (err) {
    console.error('Serve error:', err);
    res.status(500).send('Internal server error');
  }
}
