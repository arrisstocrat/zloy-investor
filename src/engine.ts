import { RUBRIC } from '../lib/rubric.js';
import { runInterview } from '../lib/interview.js';
import { personas } from '../lib/personas.js';
import { activePersona } from './personas.ts';

export const QUESTION_COUNT = 5;
export const MAX_INPUT = 1200;
export const MAX_PITCH = 4000;
export interface Profile { stage: string; goal: string }
export interface Exchange { question: string; answer: string }
export interface Session { personaId?: string; mode?: string; profile: Profile; pitch: string; exchanges: Exchange[] }
export interface Grade { id: string; title: string; score: number | null; reason: string; evidence: string | null }
export interface Evaluation { grades: Grade[]; total: number; advice: [string, string, string]; mode: 'mock' | 'rules' | 'model' }
export interface InvestorProvider {
  readonly label: string;
  nextQuestion(session: Session, persona: typeof activePersona): Promise<string>;
  evaluate(session: Session): Promise<Evaluation>;
}
type RoundResult = { kind: string; mode?: string; question?: string; anchor?: string; scores?: unknown[]; actions?: unknown[] };
type RequestRound = (session: Session) => Promise<RoundResult>;

export function validateInput(value: string, max = MAX_INPUT): string | null {
  if (!value.trim()) return 'Введите текст. Можно честно ответить «не знаю».';
  if (value.length > max) return `Не более ${max} символов.`;
  return null;
}
export function validatePitch(value: string): string | null {
  return validateInput(value, MAX_PITCH) || (value.trim().length < 30 || value.trim().split(/\s+/u).length < 5
    ? 'Опишите проект, аудиторию и решение: от 30 символов и 5 слов.' : null);
}
function checkSession(session: Session) {
  const invalid = validatePitch(session.pitch);
  if (invalid) throw Error(invalid);
  if (session.exchanges.length > QUESTION_COUNT || session.exchanges.some(e => validateInput(e.answer) || !e.question.trim())) {
    throw Error('Некорректная история раунда.');
  }
}
function payload(session: Session) {
  return { pitch: session.pitch, history: session.exchanges, profile: session.profile, personaId: session.personaId || activePersona.id, mode: session.mode };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Некорректный ответ API. Повторите отправку.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw Error('В ответе API отсутствует текст.');
  return value;
}

export function createProvider(request: RequestRound, initialLabel: string, local = false): InvestorProvider {
  let label = initialLabel;
  async function round(session: Session) {
    checkSession(session);
    const result = object(await request(session)) as RoundResult;
    if (!local && result.mode !== 'model' && result.mode !== 'rules') throw Error('API не сообщил режим работы.');
    label = local ? 'MOCK · локальные правила' : result.mode === 'model' ? 'DeepSeek · AI' : 'Правила · без AI';
    if (result.kind === 'needsPitch') throw Error('Уточните питч: кто ваш клиент и какую задачу вы решаете.');
    return result;
  }
  return {
    get label() { return label; },
    async nextQuestion(session, persona) {
      if (!Object.values(personas).some(p => p.id === persona.id) || (session.mode !== 'extended' && persona.id !== activePersona.id)) throw Error('В конкурсном режиме доступен один инвестор.');
      if (session.exchanges.length >= QUESTION_COUNT) throw Error('Пять вопросов уже заданы.');
      const result = await round(session);
      const question = text(result.question);
      if (result.kind !== 'question' || question.length > 240 || !question.endsWith('?') || question.split('?').length !== 2) throw Error('API вернул некорректный вопрос.');
      return question;
    },
    async evaluate(session) {
      if (session.exchanges.length !== QUESTION_COUNT) throw Error('Для оценки нужны ровно пять ответов.');
      const result = await round(session);
      if (result.kind !== 'verdict' || !Array.isArray(result.scores) || result.scores.length !== 10 || !Array.isArray(result.actions) || result.actions.length !== 3) throw Error('API вернул некорректный разбор.');
      const rows = result.scores.map(object);
      if (new Set(rows.map(row => row.id)).size !== 10) throw Error('API повторил критерии.');
      const sources = [session.pitch, ...session.exchanges.map(e => e.answer)].map(s => s.replace(/\s+/gu, ' ').trim());
      const grades = RUBRIC.map(([id, title]) => {
        const row = rows.find(row => row.id === id);
        if (!row || ![null, 0, 1, 2].includes(row.score as number | null)) throw Error('Некорректная шкала оценки API.');
        const quote = typeof row.quote === 'string' ? row.quote.replace(/\s+/gu, ' ').trim() : '';
        const evidence = quote && sources.some(source => source.includes(quote)) ? quote : null;
        if (Number(row.score) > 0 && !evidence) throw Error('Оценка не подкреплена цитатой из ваших данных.');
        return { id, title, score: row.score as number | null, reason: text(row.note), evidence };
      });
      const advice = result.actions.map(value => { const action = object(value); return `${text(action.title)}. ${text(action.detail)} Срок: до 3 дней.`; });
      if (new Set(advice).size !== 3) throw Error('API повторил советы.');
      return { grades, total: grades.reduce((sum, g) => sum + (g.score ?? 0), 0), advice: advice as [string, string, string], mode: local ? 'mock' : result.mode as 'rules' | 'model' };
    },
  };
}

export function createApiProvider(fetcher: typeof fetch = fetch): InvestorProvider {
  return createProvider(async session => {
    const response = await fetcher('/api/round', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(session)), signal: AbortSignal.timeout(42000),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = data && typeof data === 'object' && 'error' in data ? (data as { error: unknown }).error : null;
      throw Error(typeof error === 'string' ? error : 'Сервер недоступен. Повторите отправку.');
    }
    return object(data) as RoundResult;
  }, 'Серверный API');
}

// Offline mode reuses exactly the same rubric and rules as the team's backend.
export const mockProvider = createProvider(async session => runInterview(
  { ...payload(session), focus: '', useJev: false }, RUBRIC, QUESTION_COUNT,
), 'MOCK · локальные правила', true);
