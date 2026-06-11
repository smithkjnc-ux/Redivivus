// [SCOPE] Encrypted backup + restore of AI provider API keys. AES-256-GCM with a passphrase-derived
// key (scrypt). Replaces the old plaintext .env export: a stolen backup file is useless without the
// passphrase, and users can restore their keys after a reload or on a brand-new device.
// [WARN] The passphrase is never stored. If the user loses it, the backup is unrecoverable by design.

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getKeyCached, getConfiguredProviders } from '../ai/secretKeyStore.js';

const MAGIC = 'RDVKEYS1';            // format header + version. Bump trailing digit on any format change.
const PROVIDERS = ['gemini', 'claude', 'openai', 'groq', 'xai', 'kimi', 'deepseek'];

// Encrypt a provider->key map into a self-describing base64 blob (salt+iv+tag+ciphertext).
export function encryptKeyBackup(keys: Record<string, string>, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const dk = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', dk, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(keys), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = Buffer.concat([salt, iv, tag, enc]).toString('base64');
  return `${MAGIC}\n${body}\n`;
}

// Decrypt a blob produced by encryptKeyBackup. Throws on a wrong passphrase or any tampering (GCM auth).
export function decryptKeyBackup(blob: string, passphrase: string): Record<string, string> {
  const body = blob.replace(/^RDVKEYS\d+\s*/, '').trim();
  const buf = Buffer.from(body, 'base64');
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const enc = buf.subarray(44);
  const dk = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dk, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// Ask for a passphrase twice and confirm they match. Returns null if cancelled or mismatched.
async function promptNewPassphrase(): Promise<string | null> {
  const p1 = await vscode.window.showInputBox({
    prompt: 'Create a passphrase to encrypt your key backup (you will need it to import later)',
    password: true, ignoreFocusOut: true,
    validateInput: v => (v && v.length >= 6) ? null : 'Use at least 6 characters',
  });
  if (!p1) { return null; }
  const p2 = await vscode.window.showInputBox({
    prompt: 'Re-enter the passphrase to confirm', password: true, ignoreFocusOut: true,
  });
  if (p2 !== p1) {
    vscode.window.showErrorMessage('Redivivus: Passphrases did not match. Export cancelled.');
    return null;
  }
  return p1;
}

// Gather configured keys, ask for a passphrase, encrypt, and save an .rdvkeys file to disk.
export async function exportKeysEncrypted(): Promise<void> {
  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    vscode.window.showWarningMessage('Redivivus: No API keys configured to export.');
    return;
  }
  const pass = await promptNewPassphrase();
  if (!pass) { return; }
  const keys: Record<string, string> = {};
  for (const p of providers) { const k = getKeyCached(p); if (k) { keys[p] = k; } }
  const blob = encryptKeyBackup(keys, pass);
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('redivivus-keys.rdvkeys'),
    filters: { 'Redivivus Key Backup': ['rdvkeys'], 'All Files': ['*'] },
  });
  if (!uri) { return; }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(blob, 'utf8'));
  vscode.window.showInformationMessage(
    `Redivivus: ${Object.keys(keys).length} key(s) exported (encrypted) to ${uri.fsPath}`
  );
}

// Open a backup file, ask for the passphrase, decrypt, and store every key. Returns count imported.
export async function importKeysEncrypted(): Promise<number> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, openLabel: 'Import Keys',
    filters: { 'Redivivus Key Backup': ['rdvkeys'], 'All Files': ['*'] },
  });
  if (!picked || picked.length === 0) { return 0; }
  const blob = Buffer.from(await vscode.workspace.fs.readFile(picked[0])).toString('utf8');
  const pass = await vscode.window.showInputBox({
    prompt: 'Enter the passphrase for this key backup', password: true, ignoreFocusOut: true,
  });
  if (!pass) { return 0; }
  let keys: Record<string, string>;
  try {
    keys = decryptKeyBackup(blob, pass);
  } catch {
    vscode.window.showErrorMessage('Redivivus: Could not decrypt — wrong passphrase or corrupted file.');
    return 0;
  }
  const { storeKey } = await import('../ai/secretKeyStore.js');
  let count = 0;
  for (const p of PROVIDERS) {
    if (typeof keys[p] === 'string' && keys[p]) { await storeKey(p, keys[p]); count++; }
  }
  vscode.window.showInformationMessage(`Redivivus: Imported ${count} key(s) from backup.`);
  return count;
}
