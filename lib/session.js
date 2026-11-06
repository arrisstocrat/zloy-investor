import { randomBytes } from 'node:crypto';
import { parseRound, runRound } from './round.js';
import { readSession, writeSession } from './session-store.js';

function error(status, message) {
  return Object.assign(Error(message), { status });
}

function view(session) {
  const { lastMutation, ...snapshot } = session;
  return snapshot;
}

export function sessionToken(header) {
  return typeof header === 'string' ? /^Bearer ([\w-]{43})$/.exec(header)?.[1] : undefined;
}

export async function getSession(token) {
  const session = token && await readSession(token);
  if (!session) throw error(404, 'Этот раунд больше недоступен. Начни новый.');
  return session;
}

export async function startSession(body) {
  const round = parseRound({ pitch: body.pitch, history: [], useJev: body.useJev, profile: body.profile, personaId: body.personaId, mode: body.mode });
  const result = await runRound(round);
  if (result.kind === 'needsPitch') return result;
  const token = randomBytes(32).toString('base64url');
  const session = { ...round, round: 1, revision: 0, result, first: null };
  if (!await writeSession(token, session)) throw Error('Session ID collision');
  return { kind: 'session', token, session: view(session) };
}

export async function resumeSession(token) {
  return { kind: 'session', session: view(await getSession(token)) };
}

export async function advanceSession(token, body) {
  const session = await getSession(token);
  const action = body.action;
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (action === 'answer' && (!answer || answer.length > 1200)) {
    throw error(400, 'Ответ должен содержать от 1 до 1200 символов.');
  }

  const mutation = JSON.stringify([action, answer]);
  if (body.revision === session.revision - 1 && mutation === session.lastMutation) {
    return { kind: 'session', session: view(session) };
  }
  if (body.revision !== session.revision) {
    return { kind: 'conflict', session: view(session) };
  }

  let next;
  if (action === 'rematch' && session.round === 1 && session.result.kind === 'verdict') {
    next = { ...session, history: [], focus: session.result.blocker, first: session.result, round: 2 };
  } else if (action === 'answer' && session.result.kind === 'question') {
    const history = [...session.history, { question: session.result.question, answer }];
    next = { ...session, history };
  } else {
    throw error(409, 'Это действие больше недоступно для текущего раунда.');
  }
  next.result = await runRound({ pitch: next.pitch, history: next.history, focus: next.focus, useJev: next.useJev, profile: next.profile, personaId: next.personaId, mode: next.mode });
  next.revision += 1;
  next.lastMutation = mutation;
  if (!await writeSession(token, next, session.revision)) {
    const current = await getSession(token);
    const duplicate = current.revision === session.revision + 1 && current.lastMutation === mutation;
    return { kind: duplicate ? 'session' : 'conflict', session: view(current) };
  }
  return { kind: 'session', session: view(next) };
}
