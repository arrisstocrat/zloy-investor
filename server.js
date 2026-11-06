import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/round.js';

const assets = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/mark.svg': ['mark.svg', 'image/svg+xml']
};

const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/round') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64_000) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    req.body = Buffer.concat(chunks).toString('utf8');
    await handler(req, res);
    return;
  }

  const asset = Object.hasOwn(assets, path) ? assets[path] : null;
  if (!asset) return res.writeHead(404).end('Not found');
  const content = await readFile(new URL('./public/' + asset[0], import.meta.url));
  res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' }).end(content);
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
