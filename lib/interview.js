import { analyze } from './analysis.js';
import { personas, activePersona } from './personas.js';
import { runStructuredRound } from './structured-round.js';

export function runInterview(round, rubric, total, hint = null) {
  const persona = personas[round.personaId] || activePersona;
  const analysis = analyze(round);
  const base = runStructuredRound(round, rubric, total, hint);
  const shared = { personaId: persona.id, personaName: persona.name, analysis };
  if (base.kind === 'needsPitch') return { ...base, ...shared };
  if (base.kind === 'verdict') {
    if (round.profile?.stage === 'Идея') for (const row of base.scores) if (['sales','ip'].includes(row.id) && row.score !== 2) row.note += ' Для стадии идеи это ограничение зрелости, не приговор всей идее.';
    const prioritized = persona.priority.map(id => base.scores.find(s => s.id === id)).filter(Boolean);
    const weak = prioritized.find(s => s.score === 0) || prioritized.find(s => s.score !== 2);
    const contradiction = analysis.checks.find(c => c.type === 'contradiction');
    const actions = [{ title: persona.action.title, detail: persona.action.detail }, ...base.actions].slice(0, 3);
    if (contradiction) actions[0] = { title: 'Сверь финансовые допущения', detail: 'За 1 день сведи цену, число платящих клиентов и выручку за один период в таблицу. Это нужно, чтобы устранить расхождение; результат — воспроизводимый расчёт.' };
    return { ...base, ...shared, actions, blocker: contradiction ? contradiction.explanation : `${persona.role}. ${weak ? weak.label + ': ' + weak.note : base.blocker}` };
  }
  const used = new Set(round.history.map(t => t.question));
  const last = round.history.at(-1)?.answer || '';
  let candidates = persona.questions;
  if (/миллион|млн/iu.test(round.pitch + ' ' + last)) candidates = ['Как цена, число платящих клиентов и период складываются в заявленную выручку?', ...candidates];
  if (analysis.checks.some(c => c.type === 'contradiction')) candidates = ['Чем объясняется расхождение цены, числа платящих клиентов и выручки за один период?', ...candidates];
  // Existing evidence-sensitive follow-ups keep priority over the character's theme.
  const adaptive = round.history.length && /со слов|по словам|сказал|на глаз|не знаю|нет данных|не провер/iu.test(last);
  let question = adaptive && !used.has(base.question) ? base.question : candidates.find(q => !used.has(q));
  question ||= !used.has(base.question) ? base.question : 'Какой проверяемый результат вы покажете до защиты?';
  return { ...base, ...shared, question, reaction: last ? persona.reaction : persona.introduction };
}
