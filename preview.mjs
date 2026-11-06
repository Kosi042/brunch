import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPlanner, guestCall } from './local-db.mjs';
import { renderPage } from './page.mjs';

const local = new URL('./.brunch-local/', import.meta.url);
const origin = 'http://127.0.0.1:4173';
let db;
const server = createServer(async (req, res) => {
  const reply = (code, type, body) => res.writeHead(code, {'Content-Type':type,'Cache-Control':'no-store'}).end(body);
  try {
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin))
      return reply(403,'text/plain','Zugriff verweigert');
    if (!db) return reply(503,'text/plain','Die Datenbank startet.');
    if (req.method === 'GET' && ['/', '/Index.html'].includes(req.url))
      return reply(200,'text/html; charset=utf-8',await renderPage({rpc:'/rpc/'}));
    if (req.method !== 'POST' || !req.url.startsWith('/rpc/') || req.headers['content-type'] !== 'application/json')
      return reply(404,'text/plain','Unbekannte Seite');
    let body = '', length = 0;
    req.setEncoding('utf8');
    for await (const part of req) {
      length += Buffer.byteLength(part);
      if (length > 8192) return reply(413,'text/plain','Anfrage zu groß');
      body += part;
    }
    const result = await guestCall(db, req.url.slice(5), JSON.parse(body));
    reply(200,'application/json',JSON.stringify(result));
  } catch (error) {
    reply(400,'application/json',JSON.stringify({code:error.code,message:error.code === 'P0001' ? error.message : 'Die Anfrage konnte nicht gespeichert werden.'}));
  }
});
server.listen(4173,'127.0.0.1', async () => {
  try {
    await mkdir(local, {recursive:true});
    db = await openPlanner(fileURLToPath(new URL('db',local)));
    const {rows} = await db.query('select host_code from brunch_private.settings');
    await writeFile(new URL('Gastgeber-Code.txt',local), rows[0].host_code + '\n', {mode:0o600});
    console.log('Brunch: ' + origin + ' (Code: .brunch-local/Gastgeber-Code.txt)');
  } catch(error) {console.error(error.message);server.close();process.exitCode=1;}
});
async function close() {server.close();if (db) await db.close();process.exit();}
process.on('SIGINT',close);
process.on('SIGTERM',close);
