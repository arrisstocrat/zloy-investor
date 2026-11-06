import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/round.js';

const assets = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/mark.svg': ['mark.svg', 'image/svg+xml']
};

process.env.INVESTOR_DB_PATH ||= '.data/rounds.sqlite';

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

  // React is additive: the team's existing homepage and assets keep their URLs.
  if (path === '/prototype') {
    res.writeHead(302, { Location: '/prototype/' }).end();
    return;
  }
  if (path === '/prototype/' || /^\/prototype\/assets\/[\w.-]+\.(js|css)$/.test(path)) {
    const file = path === '/prototype/' ? 'prototype/index.html' : path.slice(1);
    try {
      const content = await readFile(new URL('./public/' + file, import.meta.url));
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }).end(content);
    } catch {
      res.writeHead(404).end('Run npm run build to build the React prototype.');
    }
    return;
  }

  const asset = Object.hasOwn(assets, path) ? assets[path] : null;
  if (!asset) return res.writeHead(404).end('Not found');
  const content = await readFile(new URL('./public/' + asset[0], import.meta.url));
  res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' }).end(content);
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
