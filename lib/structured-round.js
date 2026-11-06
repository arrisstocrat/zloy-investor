const DIRECTIONS = {
  solution: {
    match: /пилот|прототип|проверил|замер|интервью|обучен|решени|запустил|пользоват|продукт|сервис|помога/iu,
    label: 'проверка решения',
    question: 'По какому результату пользователь поймёт, что ваше решение ему помогло?',
    action: ['Проведи один замер', 'Выбери измеримый результат и запиши, на ком и за какой срок ты его проверил.']
  },
  business: {
    match: /подписк|комисси|оплат|монетизац|выручк|платит|берём|берем|тариф|в месяц|₽|рубл/iu,
    label: 'плательщик и цена',
    question: 'Кто принимает решение заплатить за продукт и из какого бюджета?',
    action: ['Проверь, кто платит', 'Попроси одного потенциального клиента назвать плательщика, сумму и условие, на котором он согласится заплатить.']
  },
  market: {
    match: /рын(ок|ка)|конкурент|альтернатив|сравни|вручную|таблиц|сейчас.+дела/iu,
    label: 'рынок и альтернативы',
    question: 'Чем клиент решает эту задачу сегодня, когда вашего продукта рядом нет?',
    action: ['Сравни с текущим способом', 'Запиши, чем пользуется клиент сегодня. Сравни этот способ с продуктом по времени, цене или числу ошибок.']
  },
  finance: {
    match: /себестоимост|марж|расход|затрат|прибыл|окупаем|переменн|фиксирован|юнит/iu,
    label: 'расходы и маржа',
    question: 'Какой самый большой расход появится при обслуживании следующего клиента?',
    action: ['Посчитай одного клиента', 'Сведи в одну строку цену, время команды, переменные расходы и остаток после затрат.']
  },
  ip: {
    match: /патент|зарегистрир|лицензи|авторск|интеллектуальн|товарн.{0,5} знак|юридическ.{0,5} лиц/iu,
    label: 'права на продукт',
    question: 'Кто сейчас владеет правами на код, контент и название проекта?',
    action: ['Разберись с правами', 'Запиши, кому принадлежат код, контент и название, и укажи документы, которые это подтверждают.']
  },
  sales: {
    match: /оплат|платн|продаж|заплат|оплачен|счёт|счет|договор|пилот|письм.{0,4} о намерени/iu,
    label: 'первые продажи',
    question: 'Какое условие должно выполниться, чтобы первый клиент перешёл к оплате?',
    action: ['Уточни условие оплаты', 'Напиши одному клиенту и зафиксируй, какой результат пилота нужен для оплаты и кто согласует счёт.']
  },
  risk: {
    match: /риск|завис|отказ|огранич|может сорват|опас|персональн.{0,5} данн|если .{3,}/iu,
    label: 'риск проекта',
    question: 'Какое допущение в вашем плане опаснее всего и как вы проверите его до защиты?',
    action: ['Проверь одно допущение', 'Запиши, что может сорваться, какой тест успеешь провести и какой результат заставит изменить план.']
  },
  horizon: {
    match: /горизонт|за \d+ (месяц|недел|год)|через \d+|на \d+ (месяц|год|недел)|на месяц|до конца квартал|прогноз/iu,
    label: 'горизонт расчёта',
    question: 'На какой срок рассчитан ваш прогноз и что сильнее всего влияет на него?',
    action: ['Зафиксируй период расчёта', 'Подпиши период и сведи исходные допущения в таблицу. Отдельно покажи сценарий, в котором спрос ниже.']
  },
  unique: {
    match: /отлича|уникальн|преимуществ|быстрее|дешевле|в отличие|автоматизи|сократил/iu,
    label: 'отличие от привычного способа',
    question: 'Какое преимущество вы можете показать клиенту на конкретном примере?',
    action: ['Покажи отличие', 'Возьми один сценарий клиента и покажи, сколько шагов или минут он займёт с продуктом и без него.']
  },
  investment: {
    match: /инвестиц|вложени|грант|финансирован|бюджет|запрашива|поднять раунд/iu,
    label: 'цель вложений',
    question: 'Какой измеримый результат команда покажет после первого транша?',
    action: ['Привяжи деньги к результату', 'Выпиши одну статью расходов, срок и проверяемый результат, который за неё получит проект.']
  }
};

const INSTRUCTION = /игнорируй|забудь.{0,30}(правила|инструкц)|системн.{0,10}промпт|поставь.{0,25}(балл|максимум)|поставить.{0,25}(балл|максимум)|просто.{0,15}высокий балл|верни json/iu;
const GAP = /пока нет|не (знаем|знаю|измеряли|считали|оплачивали|проверяли|продавали|подписали|проводили)|только планиру|без оплат|со слов|на глаз|не замерял/iu;
const FORECAST = /планиру|прогноз|предполага|ожида|хотим|оценочн|со слов|по словам|на глаз/iu;
const MEASUREMENT = /\d.{0,35}(?:дн|час|минут|недел|интервью|человек|замер|запис|клиент|участник|пользовател|сделк|\s%|%)/iu;
const BEFORE_AFTER = /(?:с |было )\d[\d,.]*\s*(?:\p{L}+\s+){0,2}(?:до|стало)\s+\d/iu;
const ARTEFACT = /лог[аиов]|таблиц|выгрузк|отч[её]т|протокол|квитанц|акт |выписк|оплачен.{0,9}сч[её]т/iu;
const PAID = /оплатили|оплаченный|деньги поступили|заплатил|продали|получили.{0,12}плат[её]ж/iu;

function fragments(text) {
  return text.replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+|$)/gu)?.map(part => part.trim())
    .filter(part => part.length >= 5 && !INSTRUCTION.test(part)) || [];
}

function selectedQuote(text) {
  return text.length <= 155 ? text : text.slice(0, 155).replace(/\s+\S*$/, '');
}

function opening(pitch, focus) {
  const focusArea = Object.values(DIRECTIONS).find(area => focus.toLowerCase().includes(area.label));
  const measurable = pitch.find(part => BEFORE_AFTER.test(part)) || pitch.find(part => MEASUREMENT.test(part));
  if (focusArea) return [focusArea.question, pitch.find(part => focusArea.match.test(part))];
  if (measurable) return ['На скольких случаях вы измерили этот результат?', measurable];
  const alternatives = pitch.find(part => DIRECTIONS.market.match.test(part));
  if (alternatives) return ['Почему клиент откажется от этого способа ради вашего продукта?', alternatives];
  return ['У кого конкретно возникла эта проблема в последний раз?', pitch[0]];
}

function followUp(last, pitch) {
  const answer = last.answer;
  if (INSTRUCTION.test(answer) || GAP.test(answer)) {
    if (/со слов|по словам|сказал|на глаз/iu.test(answer)) {
      return ['Какие записи или замеры позволят проверить эту цифру?', fragments(answer)[0]];
    }
    return ['Какую одну проверку вы можете провести до защиты, чтобы ответить на этот вопрос?', fragments(answer)[0]];
  }
  if (/сказал|сообщил|говорят|утвержда/iu.test(answer)) {
    return ['Как вы можете проверить слова этого человека?', fragments(answer)[0]];
  }
  if (/пилот|договор|интерес/iu.test(answer) && !PAID.test(answer)) {
    return [DIRECTIONS.sales.question, fragments(answer)[0]];
  }
  if (MEASUREMENT.test(answer) || (pitch.some(part => BEFORE_AFTER.test(part)) && /\d/u.test(answer))) {
    return ['Что могло повлиять на результат помимо вашего продукта?', fragments(answer)[0]];
  }
  return null;
}

const JEV_QUESTIONS = {
  reported: 'Какие записи или замеры позволят проверить эту цифру?',
  missing: 'Какую одну проверку вы можете провести до защиты, чтобы ответить на этот вопрос?',
  measured: 'Что могло повлиять на результат помимо вашего продукта?',
  unpaid_pilot: DIRECTIONS.sales.question
};

function nextQuestion({ history, focus }, pitch, followUpHint) {
  if (!history.length) return opening(pitch, focus);
  const last = history.at(-1);
  const adaptive = followUp(last, pitch);
  const used = new Set(history.map(turn => turn.question));
  if (history.length === 1 || history.length === 4) {
    if (adaptive && !used.has(adaptive[0])) return adaptive;
    const jevQuestion = JEV_QUESTIONS[followUpHint];
    if (jevQuestion && !used.has(jevQuestion) && !INSTRUCTION.test(last.answer)) {
      return [jevQuestion, fragments(last.answer)[0], true];
    }
  }

  const order = history.length === 2
    ? ['business', 'sales', 'market', 'finance', 'risk', 'solution']
    : ['finance', 'risk', 'sales', 'market', 'business', 'unique'];
  const recent = fragments(last.answer);
  for (const id of order) {
    const area = DIRECTIONS[id];
    if (used.has(area.question)) continue;
    const anchor = [...recent, ...pitch].find(part => area.match.test(part));
    if (anchor) return [area.question, anchor];
  }

  for (const id of order) {
    const area = DIRECTIONS[id];
    if (!used.has(area.question)) return [area.question, recent[0] || pitch[0]];
  }
  return [DIRECTIONS.horizon.question, pitch[0]];
}

function assess(id, label, pitch, history) {
  const area = DIRECTIONS[id];
  const answers = history.flatMap(turn => {
    const text = fragments(turn.answer);
    const onTopic = turn.question === area.question || (id === 'solution' && /измерили этот результат|записи или замеры|помимо вашего продукта/iu.test(turn.question));
    return onTopic
      ? text
      : text.filter(part => area.match.test(part));
  });
  const relevant = [...answers, ...pitch.filter(part => area.match.test(part))];
  const proof = relevant.find(part => {
    if (FORECAST.test(part) || GAP.test(part)) return false;
    if (id === 'sales') return PAID.test(part) && /\d|сч[её]т|акт/iu.test(part);
    return ARTEFACT.test(part) && /\d/u.test(part);
  });

  if (proof) return { id, label, score: 2, note: 'Ты назвал материал или расчёт, по которому можно проверить ответ.', quote: selectedQuote(proof) };

  const gap = answers.find(part => GAP.test(part));
  if (gap) return { id, label, score: 0, note: 'В ответе есть конкретный пробел, который стоит закрыть до защиты.', quote: selectedQuote(gap) };

  const specific = relevant.find(part => part.length > 24 && !GAP.test(part));
  if (specific) {
    return { id, label, score: 1, note: id === 'sales' && !PAID.test(specific) ? 'Есть сигнал интереса. Оплата в этой реплике не подтверждена.' : 'Есть содержательный ответ. Добавь способ его проверить.', quote: selectedQuote(specific) };
  }
  return { id, label, score: null, note: 'Недостаточно данных в питче и ответах.', quote: '' };
}

function structuredVerdict({ history }, pitch, rubric) {
  const scores = rubric.map(([id, label]) => assess(id, label, pitch, history));
  const lastAnswers = history.flatMap(turn => fragments(turn.answer));
  const hearsay = lastAnswers.find(part => /со слов|по словам|сказал|на глаз/iu.test(part));
  const priority = ['solution', 'sales', 'business', 'finance', 'risk', 'market', 'unique', 'horizon', 'ip', 'investment'];
  const ordered = priority.map(id => scores.find(row => row.id === id));
  const weak = ordered.find(row => row.score === 0) || ordered.find(row => row.score === 1) || ordered.find(row => row.score === null) || ordered[0];
  const ids = [hearsay ? 'solution' : weak.id, ...ordered.filter(row => row.score !== 2).map(row => row.id), ...priority];
  const actions = [...new Set(ids)].slice(0, 3).map(id => {
    const [title, detail] = DIRECTIONS[id].action;
    return { title, detail };
  });
  if (hearsay) {
    actions[0] = {
      title: 'Сверь слова с записями',
      detail: 'Попроси источник показать записи или исходные замеры. Собери короткую таблицу с датами, выборкой и результатом.'
    };
  }
  const blocker = hearsay
    ? 'Проверка решения. Ты ссылаешься на чужие слова. Возьми исходные замеры, чтобы защитить цифру.'
    : 'Слабое место: ' + DIRECTIONS[weak.id].label + '. ' + DIRECTIONS[weak.id].action[1];

  return { kind: 'verdict', blocker, quote: selectedQuote(hearsay || weak.quote), scores, actions, mode: 'rules' };
}

export function runStructuredRound(round, rubric, total, followUpHint = null) {
  const pitch = fragments(round.pitch);
  if (round.history.length === 0 && !pitch.some(part => part.length >= 30 &&
      /мы |дела|проект|продукт|для |помога|сервис|приложени|платформ|команд|решени|рынок|устройств|стартап/iu.test(part))) {
    return { kind: 'needsPitch', mode: 'rules' };
  }
  if (round.history.length === total) return structuredVerdict(round, pitch, rubric);
  const [question, anchor, jev] = nextQuestion(round, pitch, followUpHint);
  return { kind: 'question', question, anchor: selectedQuote(anchor || ''), mode: 'rules', ...(jev ? { jev: true } : {}) };
}
