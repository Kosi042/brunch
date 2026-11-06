import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

export async function renderPage(config) {
  const [page, client] = await Promise.all(['Index.html', 'Client.html'].map(name =>
    readFile(new URL(name, import.meta.url), 'utf8')));
  new vm.Script(client.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, ''));
  return page.replace('<!-- CONFIG -->', () => JSON.stringify(config).replaceAll('<', '\\u003c'))
    .replace('<!-- CLIENT -->', () => client);
}

export function liveConfig(url, key) {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(origin.hostname)
      || origin.origin !== url.replace(/\/$/, '')) throw Error('Invalid Supabase project URL.');
  let publicKey = /^sb_publishable_[a-zA-Z0-9_-]+$/.test(key || '');
  if (!publicKey && key?.split('.').length === 3) {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
    publicKey = payload.role === 'anon' && payload.ref === origin.hostname.split('.')[0];
  }
  if (!publicKey) throw Error('Only a public publishable or anonymous client key can be included.');
  return {rpc: origin.origin + '/rest/v1/rpc/', key};
}
