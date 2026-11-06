import { parseRound, runRound } from '../lib/round.js';

const WINDOW_MS = 10 * 60_000;
let windowStarted = Date.now();
let globalCount = 0;
const requestCounts = new Map();

function allowed(ip) {
  if (Date.now() - windowStarted >= WINDOW_MS) {
    windowStarted = Date.now();
    globalCount = 0;
    requestCounts.clear();
  }
  const count = requestCounts.get(ip) || 0;
  if (count >= 48 || globalCount >= 300) return false;
  requestCounts.set(ip, count + 1);
  globalCount += 1;
  return true;
}

export default async function handler(req, res) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET') return send(200, { mode: process.env.DEEPSEEK_API_KEY ? 'model' : 'rules' });
  if (req.method !== 'POST') return send(405, { error: 'Используйте POST.' });
  if (!String(req.headers['content-type']).startsWith('application/json')) {
    return send(415, { error: 'Ожидается JSON.' });
  }
  if (Number(req.headers['content-length']) > 64_000) {
    return send(413, { error: 'Сократите описание проекта.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return send(400, { error: 'Не удалось прочитать запрос.' });
  }

  try {
    const round = parseRound(body);
    const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (!allowed(ip)) return send(429, { error: 'Слишком много запросов. Попробуйте через несколько минут.' });
    return send(200, await runRound(round));
  } catch (error) {
    if (error.status) return send(error.status, { error: error.message });
    console.error('Round failed:', error.name, /^provider status \d+$/.test(error.message) ? error.message : '');
    return send(502, { error: 'Инвестор задержался. Повторите отправку, ответы уже на экране.' });
  }
}
