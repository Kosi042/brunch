import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const page = new URL('./Index.html', import.meta.url);
const server = createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/Index.html') {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    const html = await readFile(page, 'utf8');
    const client = await readFile(new URL('./Client.html', import.meta.url), 'utf8');
    response.end(html.replace('<!-- CLIENT -->', client));
  } catch {
    response.writeHead(500).end('Could not load preview');
  }
});
server.listen(4173, '127.0.0.1', () => console.log('Brunch preview: http://127.0.0.1:4173'));
