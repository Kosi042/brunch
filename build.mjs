import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { liveConfig, renderPage } from './page.mjs';

let url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url && !key) {
  try { ({url, key} = JSON.parse(await readFile(new URL('./public-config.json', import.meta.url)))); }
  catch { throw Error('Set the public Supabase URL and publishable key before building the live site.'); }
}
const html = await renderPage(liveConfig(url, key));
const dist = new URL('./dist/', import.meta.url);
await mkdir(dist, {recursive: true});
await writeFile(new URL('index.html', dist), html);
console.log('Built the shared brunch planner.');
