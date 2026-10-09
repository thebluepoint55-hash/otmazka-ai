/* Локальная «нейросеть»: распознаёт ситуацию и собирает отмазку нужного уровня драмы. */
window.Engine = (() => {
  const { SITUATIONS, PHRASES, LEVELS, THINK_GENERIC } = window.OTMAZ_DATA;
  const MIN_LEVEL = -1, MAX_LEVEL = 4, DEFAULT_LEVEL = 1;
  const used = {}, lastReply = {};
  let gender = 'm';
  try { gender = localStorage.getItem('otmaz-gender') === 'f' ? 'f' : 'm'; } catch (e) {}

  const rnd = n => Math.floor(Math.random() * n);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pickFrom = (arr, k) => arr[k % arr.length];

  // «застрял{|а}» → «застрял» / «застряла»; «{вёл|вела}» → «вёл» / «вела»
  function g(text) {
    return text.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, m, f) => (gender === 'f' ? f : m));
  }

  function setGender(v) {
    gender = v === 'f' ? 'f' : 'm';
    try { localStorage.setItem('otmaz-gender', gender); } catch (e) {}
  }

  function detect(text) {
    const t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
    let best = null, bestScore = 0;
    for (const [key, sit] of Object.entries(SITUATIONS)) {
      const score = sit.keys.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
      if (score > bestScore) { best = key; bestScore = score; }
    }
    if (!best) return { sit: 'late', conf: 61 + rnd(9) };
    return { sit: best, conf: Math.min(99, 84 + bestScore * 4 + rnd(4)) };
  }

  function pickItem(sit, avoid) {
    const n = SITUATIONS[sit].items.length;
    used[sit] = used[sit] || [];
    if (used[sit].length >= n - 1) used[sit] = [];
    let idx;
    do { idx = rnd(n); } while (idx === avoid || used[sit].includes(idx));
    used[sit].push(idx);
    return idx;
  }

  // Все случайные выборы фиксируются один раз, чтобы «Драматичнее/Короче» переписывали ту же историю.
  function createChoice(sit, avoid) {
    return {
      sit, idx: pickItem(sit, avoid),
      hello: rnd(9), promise: rnd(9), apology: rnd(9), feel: rnd(9),
      open3: rnd(9), sigh3: rnd(9), act1: rnd(9), act2: rnd(9), act3: rnd(9),
      jitter: rnd(3) - 1, reply: rnd(9),
    };
  }

  function telegraph(s) {
    return s.toUpperCase()
      .replace(/\s*—\s*/g, ' ')
      .replace(/,(\s|$)/g, ' ЗПТ ')
      .replace(/[.!](\s|$)/g, ' ТЧК ')
      .replace(/«|»/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compose(c, level) {
    const S = SITUATIONS[c.sit], E = S.items[c.idx];
    const pr = pickFrom(S.promise, c.promise);
    const P = (arr, k) => pickFrom(arr, c[k]);
    let text;
    switch (level) {
      case -1: text = telegraph(`${E.s}. ${pr[1]}.`); break;
      case 0: text = `${cap(E.s)}. ${cap(pr[1])}.`; break;
      case 1: text = [P(S.hello, 'hello'), E.c, pr[0], P(PHRASES.apology, 'apology')].join(' '); break;
      case 2: text = [P(S.hello, 'hello'), E.c, E.d, pr[0], P(PHRASES.feel, 'feel')].join(' '); break;
      case 3: text = [P(PHRASES.open3, 'open3'), E.c, E.d, P(PHRASES.sigh3, 'sigh3'), pr[0]].join(' '); break;
      default: text = [
        `Акт I. ${P(PHRASES.act1, 'act1')} ${E.c}`,
        `Акт II. ${E.d} ${P(PHRASES.act2, 'act2')}`,
        `Акт III. ${P(PHRASES.act3, 'act3')} ${pr[0]} Занавес.`,
      ].join('\n');
    }
    const lv = LEVELS.find(l => l.id === level);
    const p = Math.max(4, Math.min(99, E.p + lv.mod + c.jitter));
    return { text: g(text), p, levelName: lv.name };
  }

  function thinkSteps(sit, conf) {
    const S = SITUATIONS[sit];
    const pool = THINK_GENERIC.slice();
    const generic = pool.splice(rnd(pool.length), 1)[0];
    return [
      ['Распознаю ситуацию', `${S.label.toLowerCase()} · ${conf}%`],
      S.step,
      generic,
      ['Подбираю уровень драмы', LEVELS.find(l => l.id === DEFAULT_LEVEL).name.toLowerCase()],
    ];
  }

  // Исход — чистый случай 50/50. Возвращает массив сообщений начальника.
  function bossReply(c, level, ok) {
    const R = window.OTMAZ_DATA.REPLIES[c.sit][ok ? 'ok' : 'fail'];
    const list = ok
      ? (level <= 0 ? R.dry : level <= 2 ? R.normal : level === 3 ? R.high : R.tragedy)
      : (level <= 0 ? R.dry : level <= 2 ? R.normal : R.drama);
    // Одна и та же реплика не выпадает два раза подряд.
    const key = c.sit + ok + list.length + list[0];
    let i = rnd(list.length);
    if (list.length > 1 && i === lastReply[key]) i = (i + 1 + rnd(list.length - 1)) % list.length;
    lastReply[key] = i;
    const pick = list[i];
    const s = cap(g(SITUATIONS[c.sit].items[c.idx].s));
    return (Array.isArray(pick) ? pick : [pick]).map(t => g(t).replace('{s}', s));
  }

  return {
    g, setGender, get gender() { return gender; },
    detect, createChoice, compose, thinkSteps, bossReply,
    bossBefore: sit => g(SITUATIONS[sit].bossBefore),
    levelName: id => LEVELS.find(l => l.id === id).name,
    MIN_LEVEL, MAX_LEVEL, DEFAULT_LEVEL,
  };
})();
