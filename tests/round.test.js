import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRound, runRound, RUBRIC } from '../lib/round.js';
import { activePersona } from '../lib/personas.js';
import { startSession, advanceSession, resumeSession } from '../lib/session.js';
import handler from '../api/round.js';

const pitch = 'Мы делаем сервис для учителей, который помогает готовить задания. Проверок пока нет.';
function round(history = []) { return parseRound({ pitch, history, personaId: activePersona.id, profile: { stage: 'Идея', goal: 'Проверить гипотезы' } }); }
async function environment(vars, action) {
  const old = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  try { for (const [key, value] of Object.entries(vars)) value === undefined ? delete process.env[key] : process.env[key] = value; return await action(); }
  finally { for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value; }
}
async function model(response, action) {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = response;
    return await environment({ DEEPSEEK_API_KEY: 'test-only-not-a-real-key', DEEPSEEK_MODEL: undefined, TYPESAFE_API_KEY: undefined }, action);
  } finally { globalThis.fetch = original; }
}

test('сервер отклоняет пустой ввод, слишком много ответов и другого персонажа', () => {
  for (const body of [{ pitch: '', history: [] }, { pitch, history: Array(6).fill({ question: 'Кто?', answer: 'нет' }) }, { pitch, history: [{ question: 'Кто?', answer: ' ' }] }, { pitch, history: [], personaId: 'other' }]) assert.throws(() => parseRound(body));
});

test('без ключа работает полный серверный раунд с общей рубрикой', async () => {
  await environment({ DEEPSEEK_API_KEY: undefined, TYPESAFE_API_KEY: undefined }, async () => {
    const history = [];
    for (let i = 0; i < 5; i++) {
      const result = await runRound(round(history));
      assert.equal(result.kind, 'question'); assert.equal(result.mode, 'rules');
      history.push({ question: result.question, answer: 'не знаю' });
    }
    const result = await runRound(round(history));
    assert.equal(result.kind, 'verdict');
    assert.equal(result.scores.length, 10); assert.equal(result.actions.length, 3);
    assert.deepEqual(result.scores.map(g => g.id), RUBRIC.map(([id]) => id));
  });
});

test('контракт DeepSeek: модель, серверная авторизация, контекст и валидированный вопрос', async () => {
  const r = round([{ question: 'Кто ваш клиент?', answer: 'Не знаю' }]);
  await model(async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer test-only-not-a-real-key');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-chat');
    const context = JSON.parse(body.messages[1].content);
    assert.deepEqual(context.history, r.history); assert.equal(context.pitch, r.pitch);
    assert.deepEqual(context.profile, r.profile);
    assert.equal(body.messages[0].role, 'system');
    return Response.json({ choices: [{ message: { content: JSON.stringify({ question: 'Кто заплатит за продукт?', anchor: 'выдуманная цитата' }) } }] });
  }, async () => {
    const result = await runRound(r);
    assert.equal(result.mode, 'model'); assert.equal(result.anchor, '');
  });
});

test('некорректные JSON и вопросы модели отклоняются', async () => {
  for (const content of ['not json', '{}', JSON.stringify({ question: 'Кто? Где?' })]) {
    await model(async () => Response.json({ choices: [{ message: { content } }] }), () => assert.rejects(() => runRound(round())));
  }
});

test('модель не может выдать положительный балл без точной цитаты', async () => {
  const r = round(Array(5).fill({ question: 'Что проверили?', answer: 'не знаю' }));
  const verdict = { blocker: 'Недостаточно сведений', quote: 'выдуманный факт', scores: RUBRIC.map(([id]) => ({ id, score: 2, note: 'Заявлено', quote: 'несуществующая цитата' })), actions: [1, 2, 3].map(i => ({ title: `Проверь гипотезу ${i}`, detail: 'Запиши результаты за 2 дня.' })) };
  await model(async () => Response.json({ choices: [{ message: { content: JSON.stringify(verdict) } }] }), async () => {
    const result = await runRound(r);
    assert.equal(result.scores.length, 10); assert.equal(result.actions.length, 3);
    assert.ok(result.scores.every(g => g.score === null)); assert.equal(result.quote, '');
  });
  verdict.actions.pop();
  await model(async () => Response.json({ choices: [{ message: { content: JSON.stringify(verdict) } }] }), () => assert.rejects(() => runRound(r)));
});

test('ошибка DeepSeek преобразуется API в 502 без утечки ключа', async () => {
  await model(async () => new Response('upstream secret payload', { status: 401 }), async () => {
    let status, response;
    const res = { writeHead(code) { status = code; return this; }, end(value) { response = JSON.parse(value); } };
    await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { pitch, history: [] } }, res);
    assert.equal(status, 502); assert.ok(response.error);
    assert.ok(!JSON.stringify(response).includes('test-only')); assert.ok(!JSON.stringify(response).includes('upstream'));
  });
});

test('сохранение раунда, идемпотентная повторная отправка и реванш сохранены', async () => {
  await environment({ DEEPSEEK_API_KEY: undefined, TYPESAFE_API_KEY: undefined, INVESTOR_DB_PATH: ':memory:', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }, async () => {
    const started = await startSession({ pitch });
    assert.ok(started.token);
    let current = started;
    for (let revision = 0; revision < 5; revision++) {
      const body = { action: 'answer', revision, answer: 'не знаю' };
      current = await advanceSession(started.token, body);
      const duplicate = await advanceSession(started.token, body);
      assert.equal(duplicate.session.revision, current.session.revision);
      assert.equal(current.session.history.length, revision + 1);
    }
    assert.equal(current.session.result.kind, 'verdict');
    assert.equal((await resumeSession(started.token)).session.history.length, 5);
    const rematch = await advanceSession(started.token, { action: 'rematch', revision: 5 });
    assert.equal(rematch.session.round, 2); assert.equal(rematch.session.history.length, 0);
    assert.ok(rematch.session.first); assert.equal(rematch.session.result.kind, 'question');
  });
});
