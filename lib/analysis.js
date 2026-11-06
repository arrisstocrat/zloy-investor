// Conservative extraction: every item is an author statement, never a verified fact.
export function analyze(round) {
  const sources = [round.pitch, ...round.history.map(t => t.answer)];
  const statements = sources.flatMap((source, index) => source.split(/(?<=[.!?])\s+|\n/u)
    .filter(s => s.trim()).map(quote => ({ source: index === 0 ? 'pitch' : `answer:${index}`, quote: quote.trim(), status: 'unverified' })));
  const pick = re => statements.filter(s => re.test(s.quote)).slice(0, 8);
  const quantities = sources.flatMap((source, index) => [...source.matchAll(/\d+(?:[.,]\d+)?\s*(?:млн|миллион\p{L}*|тыс\.?|тысяч\p{L}*)?\s*(?:доллар\p{L}*|USD|руб\p{L}*|₽|\$|%|клиент\p{L}*|пользовател\p{L}*|дней|месяц\p{L}*)/giu)].map(m => ({ quote: m[0], source: index })));
  const checks = [];
  // Explicit labels only, same sentence and currency/period. Never infer conversion or exchange rates.
  for (const s of statements) {
    const number = '(\\d+(?:[.,]\\d+)?)\\s*(млн|миллион[а-я]*|тыс\\.?|тысяч[а-я]*)?';
    const money = '(руб(?:лей|ля|ль)?|₽|доллар(?:ов|а)?|USD|\\$)';
    const period = '(месяц|год)';
    const price = new RegExp('(?:цена|подписка|тариф)\\s*[:=—-]?\\s*'+number+'\\s*'+money+'\\s*(?:в|за|/)\\s*'+period,'iu').exec(s.quote);
    const clients = /(?:платящих клиентов|платящие клиенты)\s*[:=—-]?\s*(\d+)\b/iu.exec(s.quote) || /(\d+)\s+платящих клиентов/iu.exec(s.quote);
    const revenue = new RegExp('выручка\\s*[:=—-]?\\s*'+number+'\\s*'+money+'\\s*(?:в|за|/)\\s*'+period,'iu').exec(s.quote);
    const value = m => Number(m[1].replace(',','.')) * (/млн|миллион/iu.test(m[2] || '') ? 1e6 : /тыс/iu.test(m[2] || '') ? 1e3 : 1);
    const currency = s => /руб|₽/iu.test(s) ? 'RUB' : 'USD';
    if (price && clients && revenue && price[4] === revenue[4] && currency(price[3]) === currency(revenue[3])) {
      const expected = value(price) * Number(clients[1]);
      const claimed = value(revenue);
      if (Number.isFinite(expected) && Number.isFinite(claimed)) checks.push({
        type: Math.abs(expected - claimed) > Math.max(0.01, Math.abs(expected) * .001) ? 'contradiction' : 'consistent',
        expected, claimed, currency: currency(price[3]), period: price[4], quote: s.quote,
        explanation: `При допущении одной оплаты на клиента: цена × платящие клиенты = ${expected} ${currency(price[3])}/${price[4]}, заявлено ${claimed}. Не учтены скидки и прочие источники дохода.`,
      });
    }
  }
  return {
    product: pick(/делаем|продукт|сервис|приложени/iu), audience: pick(/для |клиент|пользовател/iu),
    problem: pick(/проблем|теря|трат|сложн/iu), businessModel: pick(/подпис|плат|выруч|тариф/iu),
    evidenceClaims: pick(/замер|таблиц|отчёт|отчет|оплат|интервью/iu),
    unverifiedClaims: pick(/план|прогноз|миллион|млн|обещ|предполага/iu),
    risks: pick(/риск|не зна|нет |завис|огранич/iu), quantities, checks,
    verifiedFacts: [], warning: 'Внешняя проверка не проводилась. Даже названный артефакт остаётся заявлением пользователя.',
  };
}

export function validatedModelAnalysis(data, sources) {
  const allowed = new Set(['product','audience','problem','businessModel','evidence','assumption','risk','contradiction']);
  return Array.isArray(data) ? data.slice(0, 20).filter(row => row && allowed.has(row.type) && typeof row.quote === 'string' && row.quote.length >= 5 && sources.some(s => s.includes(row.quote)))
    .map(row => ({ type: row.type, quote: row.quote.slice(0, 500), status: 'unverified' })) : [];
}
