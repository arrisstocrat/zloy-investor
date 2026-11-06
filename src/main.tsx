import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { activePersona as defaultPersona, personas } from '../lib/personas.js';
import { MAX_INPUT, MAX_PITCH, createApiProvider, mockProvider, QUESTION_COUNT, validateInput, validatePitch } from './engine.ts';
import type { Evaluation, InvestorProvider, Session } from './engine.ts';
import { EXAMPLE_PITCH, EXAMPLE_PROFILE, exampleAnswer } from '../public/demo.js';
import './style.css';

const initialExample = new URLSearchParams(window.location.search).get('example') === '1';

type Step = 'home' | 'profile' | 'pitch' | 'intro' | 'chat' | 'result';

function PersonaPortrait({ id, name, className = '' }: { id: string; name: string; className?: string }) {
  return <span className={'persona-portrait ' + className}><span aria-hidden="true">{name.split(' ').map(part => part[0]).join('')}</span><img src={'/images/personas/' + id + '.webp'} alt={'Иллюстрация персонажа: ' + name} width="240" height="240" onError={event => { event.currentTarget.style.display = 'none'; }}/></span>;
}

function App({ provider }: { provider: InvestorProvider }) {
  const [step, setStep] = useState<Step>(initialExample ? 'profile' : 'home');
  const [session, setSession] = useState<Session>({ profile: initialExample ? { ...EXAMPLE_PROFILE } : { stage: 'Идея', goal: 'Проверить гипотезы' }, pitch: initialExample ? EXAMPLE_PITCH : '', exchanges: [] });
  const activePersona = Object.values(personas).find(p => p.id === session.personaId) || defaultPersona;
  const [draft, setDraft] = useState('');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Evaluation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [usingExample, setUsingExample] = useState(initialExample);
  const lock = useRef(false);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось получить ответ. Попробуйте ещё раз.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function loadExample() {
    if (lock.current) return;
    setSession({ profile: { ...EXAMPLE_PROFILE }, pitch: EXAMPLE_PITCH, exchanges: [] });
    setDraft('');
    setQuestion('');
    setResult(null);
    setError('');
    setUsingExample(true);
    setStep('profile');
  }

  function fillExample(value: string) {
    if (lock.current) return;
    setDraft(value);
    setError('');
    setUsingExample(true);
  }

  function send() {
    const invalid = validateInput(draft);
    if (invalid) { setError(invalid); return; }
    void run(async () => {
      const next = { ...session, exchanges: [...session.exchanges, { question, answer: draft.trim() }] };
      if (next.exchanges.length === QUESTION_COUNT) {
        const evaluation = await provider.evaluate(next);
        setResult(evaluation); setStep('result');
      } else {
        setQuestion(await provider.nextQuestion(next, activePersona));
      }
      setSession(next); setDraft('');
    });
  }
  return <main>
    <header><a className="brand-with-cap" href="/landing/" aria-label="Злой инвестор, на лендинг"><img src="/images/3d/cap.webp" alt="" width="44" height="38"/>Злой инвестор<span className="dot">.</span></a><div className="header-actions"><button className="example-button" disabled={busy} onClick={loadExample}>Демо-пример</button><span className="badge">{provider.label}</span></div></header>
    <p className="eyebrow">РЕПЕТИЦИЯ ПЕРЕД ЗАЩИТОЙ</p>
    {usingExample && <p className="demo-note" role="status">Учебный пример «Пересмена». Все цифры и ответы вымышлены.</p>}
    {step === 'home' && <section><img className="home-art" src="/images/pony-candy.webp" alt="Радужные пони, облака и сладости" width="1672" height="941"/><h1>Идея выдержит<br/>пять неудобных вопросов?</h1><p className="lead">Расскажите о стартапе. Скептичный инвестор задаст пять вопросов, разберёт ответы и предложит три следующих шага.</p><button onClick={() => setStep('profile')}>Проверить идею →</button><p className="muted">Без регистрации. История React-интерфейса живёт в этой вкладке. При начале разбора питч и ответы передаются серверу; если на сервере включён DeepSeek, они отправляются модели.</p></section>}
    {step === 'profile' && <section><h1>Сначала контекст</h1><div className="persona-preview"><PersonaPortrait id={activePersona.id} name={activePersona.name}/><div><p className="speaker">Ваш инвестор</p><h2>{activePersona.name}</h2><p>{activePersona.role}</p></div></div><p>AI-персонажи, вдохновлённые предпринимателями; не официальные представители. Один инвестор закрепляется на весь сеанс.</p><label>Режим<select value={session.mode || 'contest'} onChange={e => setSession({ ...session, mode: e.target.value, personaId: defaultPersona.id })}><option value="contest">Конкурсный — один инвестор</option><option value="extended">Расширенный — пять профилей</option></select></label><label>Инвестор<select disabled={session.mode !== 'extended'} value={activePersona.id} onChange={e => setSession({ ...session, personaId: e.target.value })}>{Object.values(personas).map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>{session.mode === 'extended' && <div className="persona-picker" aria-label="Выбор инвестора">{Object.values(personas).map(persona => <button key={persona.id} type="button" className="persona-choice" aria-pressed={activePersona.id === persona.id} onClick={() => setSession({ ...session, personaId: persona.id })}><PersonaPortrait id={persona.id} name={persona.name}/><strong>{persona.name}</strong><span>{persona.role}</span></button>)}</div>}<p>{activePersona.style}</p><form onSubmit={e => { e.preventDefault(); setDraft(session.pitch); setStep('pitch'); }}><button type="button" className="example-button" onClick={() => { setSession({ ...session, profile: { ...EXAMPLE_PROFILE } }); setUsingExample(true); }}>Подставить пример</button><label>На какой вы стадии?<select value={session.profile.stage} onChange={e => setSession({ ...session, profile: { ...session.profile, stage: e.target.value } })}><option>Идея</option><option>Прототип</option><option>Первые пользователи</option></select></label><label>Цель разбора<select value={session.profile.goal} onChange={e => setSession({ ...session, profile: { ...session.profile, goal: e.target.value } })}><option>Проверить гипотезы</option><option>Подготовиться к питчу</option></select></label><button>К питчу →</button></form></section>}
    {step === 'pitch' && <section><h1>Что вы строите?</h1><p>Опишите клиента, проблему и решение. Отделяйте факты от предположений.</p><form onSubmit={e => { e.preventDefault(); const invalid = validatePitch(draft); if (invalid) { setError(invalid); return; } setSession({ ...session, pitch: draft.trim() }); setDraft(''); setError(''); setStep('intro'); }}><label>Питч<textarea value={draft} maxLength={MAX_PITCH} onChange={e => setDraft(e.target.value)} placeholder="Мы помогаем … решать … с помощью …" aria-describedby="input-error"/></label><div className="draft-tools"><button type="button" className="example-button" onClick={() => fillExample(EXAMPLE_PITCH)}>Подставить пример</button><span className="muted">{draft.length} / {MAX_PITCH}</span></div><button>Познакомиться с инвестором →</button></form></section>}
    {step === 'intro' && <section><PersonaPortrait id={activePersona.id} name={activePersona.name} className="intro-portrait"/><h1>{activePersona.name}</h1><p className="eyebrow">{activePersona.role}</p><p className="lead">{activePersona.introduction}</p><details><summary>Источники и интерпретация</summary><p>{activePersona.documented} {activePersona.interpretation}</p>{activePersona.sources.map((s: { url: string }) => <p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">Источник профиля</a></p>)}</details><p>Ваша стадия: {session.profile.stage}. Цель: {session.profile.goal}.</p><button disabled={busy} onClick={() => void run(async () => { setQuestion(await provider.nextQuestion(session, activePersona)); setStep('chat'); })}>Начать пять вопросов →</button></section>}
    {step === 'chat' && <section><h1>Разбор питча</h1><p className="muted">{activePersona.name} · вопрос {session.exchanges.length + 1} из {QUESTION_COUNT}</p><details><summary>Ваш питч</summary><p className="text">{session.pitch}</p></details><div className="history">{session.exchanges.map((exchange, index) => <article key={index}><p className="speaker">{activePersona.name} · {index + 1}/5</p><p className="text">{exchange.question}</p><p className="speaker">Вы</p><p className="text">{exchange.answer}</p></article>)}</div><article className="active-question" aria-live="polite"><div className="question-persona"><PersonaPortrait id={activePersona.id} name={activePersona.name}/><p className="speaker">{activePersona.name} · {session.exchanges.length + 1}/5</p></div><p className="text">{question}</p></article><form key={session.exchanges.length} onSubmit={e => { e.preventDefault(); send(); }}><label>Ваш ответ<textarea autoFocus value={draft} maxLength={MAX_INPUT} onChange={e => setDraft(e.target.value)} disabled={busy} aria-describedby="input-error" placeholder="Если данных нет, напишите «не знаю»."/></label><div className="draft-tools"><button type="button" className="example-button" disabled={busy} onClick={() => fillExample(exampleAnswer(question, session.exchanges.length))}>Подставить пример ответа</button><span className="muted">{draft.length} / {MAX_INPUT}</span></div><button disabled={busy}>{busy ? 'Обрабатываем…' : session.exchanges.length === 4 ? 'Получить разбор →' : 'Ответить →'}</button></form></section>}
    {step === 'result' && result && <section><p className="eyebrow">ПЯТЬ ОТВЕТОВ. ВРЕМЯ РАЗБОРА.</p><h1>{result.total}<span className="muted"> / 20</span></h1><p className="lead">{result.mode === 'model' ? 'Разбор DeepSeek' : result.mode === 'mock' ? 'Локальная mock-оценка' : 'Оценка по правилам, без AI'}. Сумма раскрытых критериев.</p><p className="notice">Это репетиция, не инвестиционный вердикт. Используется общая рубрика команды из 10 критериев «Стартап как диплом»; её соответствие официальной методике ещё нужно подтвердить. Шкала: 0 — пробел, 1 — содержательный ответ, 2 — назван материал для проверки, «нет данных» — тема не раскрыта. Цитаты — заявления автора, их истинность не проверена.</p><div>{result.grades.map(grade => <article key={grade.id}><h2>{grade.title} <span className="score">{grade.score === null ? 'нет данных' : `${grade.score}/2`}</span></h2><p>{grade.reason}</p>{grade.evidence && <blockquote>Из вашего ответа: «{grade.evidence}»</blockquote>}</article>)}</div><h2>Три шага на ближайшие дни</h2><ol className="advice">{result.advice.map(item => <li key={item}>{item}</li>)}</ol><button onClick={() => { setUsingExample(false); setStep('home'); setSession({ profile: { stage: 'Идея', goal: 'Проверить гипотезы' }, pitch: '', exchanges: [] }); setDraft(''); setResult(null); setQuestion(''); setError(''); }}>Новый разбор</button></section>}
    <p id="input-error" role="alert" className="error">{error}</p>
    <footer>Репетиция защиты · Резкий к гипотезам, уважительный к людям</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App provider={import.meta.env.VITE_INVESTOR_MODE === 'mock' ? mockProvider : createApiProvider()}/></React.StrictMode>);
