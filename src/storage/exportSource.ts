import { apiUrl } from './settings.ts';

export type SourceBundleScope = 'cloudflare' | 'full' | 'server';

export async function downloadSourceZip(scope: SourceBundleScope = 'full'): Promise<void> {
  const endpoint =
    scope === 'cloudflare'
      ? apiUrl('/api/export-cloudflare-zip')
      : scope === 'full'
        ? apiUrl('/api/export-full-source')
        : apiUrl('/api/export-server-source');

  const filename =
    scope === 'cloudflare'
      ? 'neon-strike-cloudflare-pages.zip'
      : scope === 'full'
        ? 'neon-strike-full-source.zip'
        : 'neon-strike-server-source.zip';

  const res = await fetch(endpoint);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok || contentType.includes('text/html')) {
    throw new Error(`Archive export requires the Node.js server (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function downloadServerSourceZip(): Promise<void> {
  return downloadSourceZip('server');
}
