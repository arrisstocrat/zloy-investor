import { EXAMPLE_PITCH, exampleAnswer } from './demo.js';
const byId = id => document.getElementById(id);
const TOTAL = 5;
const STORAGE_KEY = 'zloy-investor:active-round';
let serverSessions = false;
const SAMPLE = EXAMPLE_PITCH;

const state = {
  pitch: '', personaId: '', mode: 'contest', profile: { stage: 'Идея', goal: 'Проверить гипотезы' },
  history: [],
  question: '',
  round: 1,
  focus: '',
  first: null,
  result: null,
  pending: false,
  token: '',
  revision: 0,
  useJev: false,
  demo: false
};

function create(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}

function show(view) {
  for (const section of ['setup', 'interview', 'report']) byId(section).hidden = section !== view;
  byId('status').textContent = {
    setup: 'Репетиция защиты',
    interview: 'Идёт раунд',
    report: 'Разбор готов'
  }[view];
  byId('demo-note').hidden = !state.demo;
  byId('pixel-banner').hidden = view !== 'setup';
  window.scrollTo(0, 0);
}

function alertAt(id, message = '') {
  byId(id).textContent = message;
  byId(id).hidden = !message;
}

function counter(field, label, max) {
  byId(label).textContent = byId(field).value.length + ' / ' + max;
}

async function request(body, token = '') {
  const response = await fetch('/api/round', {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(42000)
  });
  const data = await response.json().catch(() => null);
  if ((!response.ok && data?.kind !== 'conflict') || !data) {
    throw Object.assign(Error(data?.error || 'Связь прервалась. Отправь ещё раз.'), { status: response.status });
  }
  if (data.kind === 'needsPitch') throw Error('Добавь, для кого проект и какую задачу он решает.');
  return data;
}

function ask(history, focus = state.focus) {
  return request({ pitch: state.pitch, history, focus, useJev: state.useJev, personaId: state.personaId, mode: state.mode, profile: state.profile });
}

function saveRound() {
  try {
    const { pending, ...snapshot } = state;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.token ? { token: state.token } : { snapshot }));
  } catch {
    // The round still works if the browser blocks tab storage.
  }
}

function forgetRound() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The active view can still be reset.
  }
}

function showResult(result) {
  showInvestor(result);
  if (result.kind === 'verdict') drawReport(result);
  else drawQuestion(result);
}

function applySession(data) {
  if (data.token) state.token = data.token;
  Object.assign(state, data.session);
  showResult(state.result);
}

function locked(button, busy, label) {
  const text = button.querySelector('span');
  if (busy) {
    button.dataset.label = text.textContent;
    text.textContent = label;
  } else {
    text.textContent = button.dataset.label;
  }
  button.disabled = busy;
  state.pending = busy;
}

function drawQuestion(data) {
  showInvestor(data);
  const step = state.history.length + 1;
  state.question = data.question;
  state.result = data;
  byId('round-label').textContent = 'Раунд 0' + state.round;
  byId('step-number').textContent = '0' + step;
  byId('step-label').textContent = 'Вопрос ' + step + ' из ' + TOTAL;
  byId('question').textContent = data.question;
  byId('pitch-preview').textContent = state.pitch;
  byId('focus-text').textContent = state.focus;
  byId('round-focus').hidden = !state.focus;
  byId('anchor').textContent = data.anchor ? '«' + data.anchor + '»' : '';
  byId('anchor').hidden = !data.anchor;

  byId('progress').replaceChildren(...Array.from({ length: TOTAL }, (_, i) => {
    const number = i + 1;
    const item = create('li', '0' + number, number === step ? 'current' : number < step ? 'done' : '');
    if (number === step) item.setAttribute('aria-current', 'step');
    return item;
  }));

  byId('history').replaceChildren(...state.history.map(turn => {
    const item = create('li');
    item.append(create('strong', turn.question), create('span', turn.answer));
    return item;
  }));
  byId('history-wrap').hidden = state.history.length === 0;
  byId('answer').value = '';
  counter('answer', 'answer-counter', 1200);
  alertAt('answer-error');
  show('interview');
  byId('question').focus({ preventScroll: true });
  saveRound();
}

function drawComparison(scores) {
  const first = new Map(state.first.scores.map(row => [row.id, row]));
  const compared = scores.filter(row => row.score !== null && first.get(row.id)?.score != null);
  const changed = compared.filter(row => row.score !== first.get(row.id).score);
  const newlyCovered = scores.filter(row => row.score !== null && first.get(row.id)?.score == null);
  const improved = changed.filter(row => row.score > first.get(row.id).score).length;

  byId('compare-summary').textContent = compared.length
    ? 'Сравнили ' + compared.length + ' из 10 критериев. Улучшилось: ' + improved + '.'
    : 'Для сравнения нужны критерии, которые удалось разобрать в обоих раундах.';
  const entries = changed.map(row => {
    const previous = first.get(row.id);
    const item = create('li');
    item.append(create('strong', row.label + ' · ' + previous.score + ' → ' + row.score));
    if (row.quote) item.append(create('p', '«' + row.quote + '»'));
    return item;
  });
  for (const row of newlyCovered) entries.push(create('li', 'Разобрали впервые: ' + row.label + '.'));
  byId('changes').replaceChildren(...entries);
  byId('compare').hidden = false;
}

function drawReport(data) {
  state.result = data;
  if (state.round === 1) state.first = data;
  byId('report-round').textContent = '0' + state.round;
  byId('report-mode').textContent = ' / ' + (data.personaName || '') + (data.mode === 'rules' ? ' / правила, без AI' : ' / DeepSeek');
  byId('blocker').textContent = data.blocker;
  byId('verdict-quote').textContent = data.quote ? '«' + data.quote + '»' : '';
  byId('verdict-quote').hidden = !data.quote;
  byId('action-list').replaceChildren(...data.actions.map(action => {
    const item = create('li');
    item.append(create('strong', action.title), create('p', action.detail));
    return item;
  }));

  const coverage = data.scores.filter(row => row.score !== null).length;
  byId('coverage').textContent = 'Оценено ' + coverage + ' / 10';
  byId('scores').replaceChildren(...data.scores.map(row => {
    const item = create('details', undefined, 'score');
    const summary = create('summary');
    const color = row.score === 2 ? ' strong' : row.score === 0 ? ' weak' : '';
    const badge = create('span', row.score ?? '·', 'score-mark' + color);
    badge.setAttribute('aria-label', row.score === null ? 'Не обсуждалось' : 'Оценка ' + row.score);
    summary.append(badge, create('span', row.label));
    item.append(summary, create('p', row.note));
    if (row.quote) item.append(create('blockquote', '«' + row.quote + '»'));
    return item;
  }));

  byId('compare').hidden = state.round === 1;
  if (state.round > 1) drawComparison(data.scores);
  byId('restart').hidden = state.round > 1;
  alertAt('report-error');
  show('report');
  byId('report-title').focus({ preventScroll: true });
  saveRound();
}

byId('pitch').addEventListener('input', () => counter('pitch', 'counter', 5500));
byId('answer').addEventListener('input', () => counter('answer', 'answer-counter', 1200));
byId('example').addEventListener('click', () => {
  state.demo = true;
  byId('demo-note').hidden = false;
  byId('pitch').value = SAMPLE;
  counter('pitch', 'counter', 5500);
  alertAt('pitch-error');
  byId('pitch').focus();
});

byId('answer-example').addEventListener('click', () => {
  if (state.pending) return;
  state.demo = true;
  byId('demo-note').hidden = false;
  byId('answer').value = exampleAnswer(state.question, state.history.length);
  counter('answer', 'answer-counter', 1200);
  alertAt('answer-error');
  byId('answer').focus();
});

byId('pitch-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.pending) return;
  alertAt('pitch-error');
  state.personaId = byId('persona').value;
  state.mode = byId('training-mode').value;
  state.profile = { stage: byId('project-stage').value, goal: 'Проверить гипотезы' };
  state.pitch = byId('pitch').value.trim();
  state.history = [];
  state.round = 1;
  state.focus = '';
  state.first = null;
  state.result = null;
  state.token = '';
  state.revision = 0;
  state.useJev = byId('use-jev').checked;
  const start = byId('start');
  locked(start, true, 'Инвестор читает питч…');
  try {
    if (serverSessions) {
      applySession(await request({ action: 'start', pitch: state.pitch, useJev: state.useJev, personaId: state.personaId, mode: state.mode, profile: state.profile }));
    } else {
      drawQuestion(await ask([]));
    }
  } catch (error) {
    alertAt('pitch-error', error.message);
  } finally {
    locked(start, false);
  }
});

async function submitAnswer(answer) {
  if (state.pending || !answer) return;
  const next = byId('next');
  const history = [...state.history, { question: state.question, answer }];
  alertAt('answer-error');
  locked(next, true, history.length === TOTAL ? 'Готовит вердикт…' : 'Инвестор читает ответ…');
  byId('answer').disabled = true;
  byId('skip').disabled = true;
  byId('leave').disabled = true;
  byId('answer-example').disabled = true;
  try {
    if (state.token) {
      applySession(await request({ action: 'answer', answer, revision: state.revision }, state.token));
    } else {
      const data = await ask(history);
      state.history = history;
      showResult(data);
    }
  } catch (error) {
    alertAt('answer-error', error.message);
  } finally {
    locked(next, false);
    byId('answer').disabled = false;
    byId('skip').disabled = false;
    byId('leave').disabled = false;
    byId('answer-example').disabled = false;
  }
}

byId('answer-form').addEventListener('submit', event => {
  event.preventDefault();
  const answer = byId('answer').value.trim();
  if (!answer) return alertAt('answer-error', 'Введи ответ или нажми «Пока нет данных».');
  submitAnswer(answer);
});
byId('skip').addEventListener('click', () => submitAnswer('Пока нет данных.'));
byId('leave').addEventListener('click', () => {
  if (state.pending) return;
  forgetRound();
  show('setup');
});
byId('new-pitch').addEventListener('click', () => {
  if (state.pending) return;
  forgetRound();
  state.demo = false;
  byId('pitch').value = '';
  counter('pitch', 'counter', 5500);
  show('setup');
  byId('pitch').focus();
});
byId('restart').addEventListener('click', async () => {
  if (state.pending) return;
  const button = byId('restart');
  alertAt('report-error');
  locked(button, true, 'Готовит новый вопрос…');
  try {
    if (state.token) {
      applySession(await request({ action: 'rematch', revision: state.revision }, state.token));
    } else {
      const focus = state.result.blocker;
      const first = await ask([], focus);
      state.round = 2;
      state.focus = focus;
      state.history = [];
      drawQuestion(first);
    }
  } catch (error) {
    alertAt('report-error', error.message);
  } finally {
    locked(button, false);
  }
});
byId('print').addEventListener('click', () => {
  const closed = [...byId('scores').querySelectorAll('details:not([open])')];
  closed.forEach(item => { item.open = true; });
  window.print();
  closed.forEach(item => { item.open = false; });
});

if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
  const scene = byId('scene');
  const dossier = scene.querySelector('.dossier');
  scene.addEventListener('pointermove', event => {
    const rect = scene.getBoundingClientRect();
    dossier.style.setProperty('--ry', (24 * (event.clientX - rect.left) / rect.width - 28) + 'deg');
    dossier.style.setProperty('--rx', (34 - 20 * (event.clientY - rect.top) / rect.height) + 'deg');
  });
  scene.addEventListener('pointerleave', () => {
    dossier.style.removeProperty('--rx');
    dossier.style.removeProperty('--ry');
  });
}

let profiles = [], defaultPersona = '';
function fillPortrait(target, persona, eager = false) {
  if (!target) return;
  const initials = (persona?.name || 'Инвестор').split(' ').map(word => word[0]).slice(0, 2).join('');
  const fallback = create('span', initials, 'portrait-initials');
  const portrait = document.createElement('img');
  portrait.src = '/images/personas/' + (persona?.id || defaultPersona || 'hartmann') + '.webp';
  portrait.alt = '';
  portrait.width = 160;
  portrait.height = 160;
  portrait.loading = eager ? 'eager' : 'lazy';
  portrait.decoding = 'async';
  portrait.addEventListener('error', () => { portrait.hidden = true; }, { once: true });
  target.replaceChildren(fallback, portrait);
}
function drawPersonaCards() {
  const cards = byId('persona-cards');
  const extended = byId('training-mode').value === 'extended';
  cards.hidden = !extended;
  cards.replaceChildren(...profiles.map(persona => {
    const button = create('button', undefined, 'persona-card');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(persona.id === byId('persona').value));
    button.setAttribute('aria-label', 'Выбрать: ' + persona.name);
    button.dataset.persona = persona.id;
    const portrait = create('span', undefined, 'portrait portrait-card');
    fillPortrait(portrait, persona);
    button.append(portrait, create('strong', persona.name), create('span', persona.role, 'persona-card-role'));
    button.addEventListener('click', () => {
      if (state.pending || byId('training-mode').value !== 'extended') return;
      byId('persona').value = persona.id;
      describePersona();
    });
    return button;
  }));
}
function describePersona() {
  const persona = profiles.find(persona => persona.id === byId('persona').value);
  byId('persona-description').textContent = persona ? persona.introduction + ' ' + persona.style : '';
  if (persona) {
    fillPortrait(byId('selected-portrait'), persona, true);
    byId('selected-name').textContent = persona.name;
    byId('selected-role').textContent = persona.role;
  }
  const sources = byId('persona-sources');
  sources.replaceChildren();
  if (persona) {
    sources.append(create('p', persona.documented + ' ' + persona.interpretation));
    for (const source of persona.sources) {
      const link = create('a', 'Источник профиля ↗');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      sources.append(link, document.createElement('br'));
    }
  }
  drawPersonaCards();
}
byId('training-mode').addEventListener('change', () => {
  byId('persona').disabled = byId('training-mode').value !== 'extended';
  if (byId('persona').disabled) byId('persona').value = defaultPersona;
  describePersona();
});
byId('persona').addEventListener('change', describePersona);
function showInvestor(data) {
  const persona = profiles.find(persona => persona.id === (data.personaId || state.personaId))
    || profiles.find(persona => persona.name === data.personaName)
    || profiles.find(persona => persona.id === defaultPersona);
  byId('investor-name').textContent = data.personaName || persona?.name || '';
  byId('report-investor-name').textContent = data.personaName || persona?.name || '';
  fillPortrait(byId('round-portrait'), persona, true);
  fillPortrait(byId('report-portrait'), persona);
  byId('investor-reaction').textContent = (data.mode === 'model' ? 'DeepSeek · ' : 'Правила, без AI · ') + (data.reaction || 'Проверяем утверждения, не хвалим обещания.');
  const analysis = data.analysis;
  byId('analysis-summary').textContent = analysis ? [analysis.warning, ...analysis.checks.map(check => check.explanation), 'Выделено числовых заявлений: ' + analysis.quantities.length].join(' ') : 'Анализ пока недоступен.';
}
async function initialize() {
  try {
    const capabilities = await request();
    serverSessions = capabilities.sessions === true;
    profiles = capabilities.personas || [];
    defaultPersona = capabilities.defaultPersona || '';
    byId('persona').replaceChildren(...profiles.map(p => { const option = create('option', p.name + ' · ' + p.role); option.value = p.id; return option; }));
    byId('persona').value = defaultPersona;
    describePersona();
    byId('jev-option').hidden = capabilities.jev !== true;
    const note = [];
    note.push(serverSessions
      ? 'Сервер хранит раунд до 24 часов с последнего ответа.'
      : 'Вкладка хранит раунд до закрытия.');
    if (capabilities.mode === 'model') note.push('Для разбора отправляем питч и ответы в DeepSeek.');
    byId('data-note').textContent = note.join(' ');

    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.token && serverSessions) {
      applySession({ ...await request(undefined, saved.token), token: saved.token });
    } else if (saved?.snapshot?.result) {
      Object.assign(state, saved.snapshot);
      showResult(state.result);
    }
    if (new URLSearchParams(location.search).get('example') === '1') {
      forgetRound();
      state.demo = true;
      state.pitch = SAMPLE;
      show('setup');
    }
    if (state.pitch) {
      byId('pitch').value = state.pitch;
      counter('pitch', 'counter', 5500);
    }
  } catch (error) {
    if (error.status === 404) forgetRound();
  } finally {
    byId('start').disabled = false;
  }
}

initialize();
