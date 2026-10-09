/* Отмаз Pro — экраны, переходы, генерация, мессенджер, режиссёрские клавиши. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const E = window.Engine, Snd = window.Sound, Orb = window.Orb, DATA = window.OTMAZ_DATA;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // На телефоне (и в низком альбомном окне) мессенджер открывается на весь экран, без макета телефона.
  const FULL_MSG = matchMedia('(max-width: 599px), (min-width: 600px) and (max-height: 520px)');
  const PHONE = matchMedia('(max-width: 599px)');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  /* ---------- настоящие пружины: симуляция → CSS linear() ---------- */
  const LINEAR_OK = window.CSS && CSS.supports('transition-timing-function', 'linear(0, 1)');
  function springCurve(k, c) {
    const dt = 1 / 240, xs = [0];
    let x = 0, v = 0, t = 0;
    for (let i = 0; i < 240 * 3; i++) {
      v += (-k * (x - 1) - c * v) * dt; x += v * dt; t += dt; xs.push(x);
      if (Math.abs(1 - x) < 0.0008 && Math.abs(v) < 0.01) break;
    }
    const n = 56, pts = [];
    for (let i = 0; i <= n; i++) pts.push(+xs[Math.round(i / n * (xs.length - 1))].toFixed(4));
    pts[n] = 1;
    return LINEAR_OK
      ? { easing: `linear(${pts.join(', ')})`, duration: Math.round(t * 1000) }
      : { easing: 'cubic-bezier(.32,.72,0,1)', duration: 600 };
  }
  const SPR = { soft: springCurve(170, 24), pop: springCurve(300, 22) };
  if (LINEAR_OK) {
    const rs = document.documentElement.style;
    rs.setProperty('--spring-soft', SPR.soft.easing);
    rs.setProperty('--spring-soft-d', SPR.soft.duration + 'ms');
    rs.setProperty('--spring-pop', SPR.pop.easing);
    rs.setProperty('--spring-pop-d', SPR.pop.duration + 'ms');
  }
  function popIn(el, from = 'translateY(14px) scale(.96)', spr = SPR.pop) {
    if (reduce.matches) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); return; }
    el.animate([{ transform: from }, { transform: 'none' }], { duration: spr.duration, easing: spr.easing });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
  }

  /* ---------- экраны ---------- */
  const screens = { home: $('#home'), pay: $('#pay'), gen: $('#gen'), msg: $('#msg') };
  const LAYERS = { home: ['home'], pay: ['home', 'pay'], gen: ['gen'], msg: ['msg'] };
  let current = null;

  function go(name, opts = {}) {
    if (name === current && !opts.force) return;
    const prev = current;
    current = name;
    document.body.dataset.screen = name;
    closeModelMenu();
    setDrawer(false);
    for (const [key, el] of Object.entries(screens)) {
      const active = LAYERS[name].includes(key);
      if (active && !el.classList.contains('is-on')) {
        clearTimeout(el._t);
        el.classList.remove('is-leaving');
        el.classList.add('is-on');
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
      } else if (!active && el.classList.contains('is-on')) {
        el.classList.remove('is-on');
        el.classList.add('is-leaving');
        if (key === 'pay') el.classList.remove('is-in');
        el._t = setTimeout(() => el.classList.remove('is-in', 'is-leaving'), 750);
      }
    }
    ENTER[name](prev, opts);
    if (prev && !opts.silent) (name === 'pay' ? Snd.open() : Snd.whoosh());
  }

  const ENTER = {
    home(prev, opts) {
      if (opts.reset) resetAll();
      Orb.to($('#slot-home'), { opacity: 1 });
      Orb.energy(0);
    },
    pay() {
      resetPay();
      Orb.to($('#slot-home'), { opacity: 1, magnet: false, blur: 1 });
    },
    gen() {
      msgRun++;
      if (curBot) Orb.to(curBot.avSlot, { grow: 0.4, clamp: avatarClamp, magnet: false });
      else Orb.to($('#slot-gen'), { opacity: 1 });
    },
    msg() {
      Orb.to($('#slot-msg'), { opacity: FULL_MSG.matches ? 0 : 0.55, magnet: false });
      Orb.energy(0);
      playMessenger();
    },
  };

  /* ---------- главная ---------- */
  $('#slot-home').addEventListener('click', () => { Orb.poke(); Snd.think(); });
  $$('[data-go]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    Snd.tap();
    go(el.dataset.go);
  }));
  $('[data-demo]').addEventListener('click', () => {
    Snd.tap();
    go('gen');
    setTimeout(() => runPrompt(E.g(DATA.PROMPTS[0].text)), 900);
  });

  /* ---------- оплата (бутафория: никакие данные не вводятся и не отправляются) ---------- */
  const fid = $('.faceid'), fidTxt = $('.fid-txt'), payBtn = $('#pay-btn'), payLabel = $('#pay-btn span');
  let payRun = 0;
  (function buildMesh() {
    const g = $('.fid-mesh'), NS = 'http://www.w3.org/2000/svg';
    for (let y = 30; y <= 96; y += 7) {
      for (let x = 30; x <= 90; x += 7) {
        const dx = (x - 60) / 29, dy = (y - 62) / 34;
        if (dx * dx + dy * dy > 1) continue;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x + rnd(-1.2, 1.2)); c.setAttribute('cy', y + rnd(-1.2, 1.2)); c.setAttribute('r', 1.35);
        c.style.setProperty('--d', ((y - 30) * 16 + rnd(0, 180)).toFixed(0) + 'ms');
        g.appendChild(c);
      }
    }
  })();

  function resetPay() {
    payRun++;
    fid.dataset.state = 'idle';
    fidTxt.textContent = 'Подтвердите оплату лицом';
    payBtn.disabled = false;
    payBtn.classList.remove('is-busy', 'is-done');
    payLabel.textContent = 'Оплатить лицом';
  }

  async function pay() {
    if (payBtn.disabled) return;
    const token = ++payRun;
    const alive = () => token === payRun && current === 'pay';
    Snd.tap();
    payBtn.disabled = true;
    payBtn.classList.add('is-busy');
    payLabel.textContent = 'Сканируем…';
    fid.dataset.state = 'scan';
    fidTxt.textContent = 'Смотрите в камеру…';
    Snd.scanSweep();
    Orb.energy(0.7);
    const lines = ['Распознаём лицо…', 'Оцениваем виноватость… 98%', 'Лицо подходит'];
    for (let i = 0; i < lines.length; i++) {
      await sleep(i ? 750 : 700);
      if (!alive()) return;
      fidTxt.textContent = lines[i];
      Snd.scanBeep(i);
    }
    await sleep(500);
    if (!alive()) return;
    fid.dataset.state = 'done';
    fidTxt.textContent = 'Оплачено · добро пожаловать в Pro';
    payBtn.classList.remove('is-busy');
    payBtn.classList.add('is-done');
    payLabel.textContent = 'Оплачено';
    Snd.success();
    Orb.energy(0);
    Orb.poke();
    await sleep(1500);
    if (!alive()) return;
    go('gen');
  }
  payBtn.addEventListener('click', pay);
  $$('#pay [data-close]').forEach(el => el.addEventListener('click', () => { Snd.tap(); go('home'); }));

  // На телефоне шторку оплаты можно смахнуть вниз за ручку или шапку.
  (function sheetDrag() {
    const modal = $('#pay .modal');
    let y0 = 0, dy = 0, t0 = 0, dragging = false;
    modal.addEventListener('pointerdown', e => {
      if (!PHONE.matches || e.target.closest('button') || !e.target.closest('.sheet-handle, .modal-top')) return;
      dragging = true; y0 = e.clientY; dy = 0; t0 = performance.now();
      modal.classList.add('is-dragging');
      modal.setPointerCapture(e.pointerId);
    });
    modal.addEventListener('pointermove', e => {
      if (!dragging) return;
      const raw = e.clientY - y0;
      dy = raw > 0 ? raw : raw * 0.12;   // вверх — лёгкое сопротивление
      modal.style.transform = `translateY(${dy.toFixed(1)}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const v = dy / Math.max(1, performance.now() - t0);
      modal.classList.remove('is-dragging');
      modal.style.transform = '';
      if (dy > 110 || (dy > 30 && v > 0.55)) { Snd.tap(); go('home'); }
    };
    modal.addEventListener('pointerup', end);
    modal.addEventListener('pointercancel', end);
  })();

  /* ---------- генератор ---------- */
  const thread = $('#thread'), col = $('#col'), empty = $('#empty'), input = $('#input');
  const sendBtn = $('#send'), composer = $('#composer'), title = $('#gen-title');
  let busy = false, genRun = 0, curBot = null, follow = false;

  function renderLists() {
    const hist = $('#hist');
    hist.innerHTML = '';
    DATA.HISTORY.forEach(gr => {
      hist.appendChild(h('span', 'hist-label', gr.group));
      gr.items.forEach(t => {
        const b = h('button', '', E.g(t));
        b.addEventListener('click', () => {
          $$('#hist button').forEach(x => x.classList.toggle('cur', x === b));
          Snd.tap();
          setDrawer(false);
          newChat(true);
          runPrompt(E.g(t));
        });
        hist.appendChild(b);
      });
    });
    const sugg = $('#sugg');
    sugg.innerHTML = '';
    DATA.PROMPTS.forEach(p => {
      const b = h('button', '', E.g(p.label));
      b.addEventListener('click', () => { Snd.tap(); runPrompt(E.g(p.text)); });
      sugg.appendChild(b);
    });
    $$('#gender button').forEach(b => b.classList.toggle('on', b.dataset.g === E.gender));
  }

  $$('#gender button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.g === E.gender) return;
    Snd.tap();
    E.setGender(b.dataset.g);
    renderLists();
    if (curBot && !busy) {
      const res = E.compose(curBot.choice, curBot.level);
      curBot.text = res.text;
      renderStatic(curBot.answer, res.text, curBot.level);
    }
  }));

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(96, input.scrollHeight) + 'px';
  }
  function updateSend() { sendBtn.disabled = busy || !input.value.trim(); }
  input.addEventListener('input', e => {
    autosize(); updateSend();
    if (e.inputType && e.inputType.startsWith('insert')) Snd.key();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); }
  });
  composer.addEventListener('submit', e => { e.preventDefault(); submit(input.value); });

  // Чип или пункт истории «впечатывает» текст в поле и отправляет.
  async function runPrompt(text) {
    if (busy) return;
    const token = ++genRun;
    busy = true; updateSend();
    input.value = '';
    for (const ch of text) {
      if (token !== genRun) return;
      input.value += ch;
      autosize();
      if (ch !== ' ') Snd.key();
      await sleep(rnd(22, 48));
    }
    await sleep(320);
    if (token !== genRun) return;
    busy = false;
    submit(input.value);
  }

  function avatarClamp() {
    const top = $('.gen-head').getBoundingClientRect().bottom + 20;
    const bottom = composer.getBoundingClientRect().top - 24;
    return [top, Math.max(top, bottom)];
  }

  // Плавно держим конец ленты в кадре, пока модель пишет.
  function followLoop() {
    if (!follow) return;
    const max = thread.scrollHeight - thread.clientHeight;
    const d = max - thread.scrollTop;
    if (d > 0.5) thread.scrollTop += reduce.matches ? d : Math.max(1, d * 0.16);
    requestAnimationFrame(followLoop);
  }
  function startFollow() { if (!follow) { follow = true; requestAnimationFrame(followLoop); } }
  thread.addEventListener('wheel', e => { if (e.deltaY < 0) follow = false; }, { passive: true });

  function newChat(silent) {
    genRun++;
    busy = false;
    follow = false;
    curBot = null;
    $$('.msg-me, .msg-bot', col).forEach(el => el.remove());
    empty.hidden = false;
    requestAnimationFrame(() => empty.classList.remove('is-gone'));
    title.textContent = 'Новая отмазка';
    input.value = ''; autosize(); updateSend();
    thread.scrollTop = 0;
    Orb.energy(0);
    if (current === 'gen') Orb.to($('#slot-gen'), { opacity: 1 });
    if (!silent) Snd.tap();
  }
  $('#new-chat').addEventListener('click', () => { $$('#hist button').forEach(x => x.classList.remove('cur')); setDrawer(false); newChat(); });
  $('#new-chat-m').addEventListener('click', () => { $$('#hist button').forEach(x => x.classList.remove('cur')); newChat(); });

  /* ---------- выдвижное меню (планшет и телефон) ---------- */
  const menuBtn = $('#menu-btn');
  function setDrawer(open) {
    const was = screens.gen.classList.contains('drawer-open');
    if (was === open) return;
    screens.gen.classList.toggle('drawer-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    Orb.hide(open);
    if (open) $('#new-chat').focus({ preventScroll: true });
  }
  menuBtn.addEventListener('click', () => { Snd.tap(); setDrawer(!screens.gen.classList.contains('drawer-open')); });
  $('#scrim').addEventListener('click', () => setDrawer(false));
  window.addEventListener('resize', () => { if (innerWidth >= 1024) setDrawer(false); });

  /* ---------- клавиатура телефона не закрывает поле ввода ---------- */
  const composerWrap = $('.composer');
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const syncKb = () => {
      const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      composerWrap.style.transform = kb > 40 ? `translateY(${-kb}px)` : '';
    };
    vv.addEventListener('resize', syncKb);
    vv.addEventListener('scroll', syncKb);
  }

  const ICONS = {
    more: '<svg viewBox="0 0 20 20"><path d="M10 3.5c.6 2.6 2.3 3.4 3.7 4.6 1.2 1 1.8 2.3 1.8 3.8a5.5 5.5 0 0 1-11 0c0-1.7.8-3 2-3.9-.1 1.3.4 2.2 1.3 2.6C7.4 7.9 8.6 5.7 10 3.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    less: '<svg viewBox="0 0 20 20"><path d="M4 6h12M4 10h8M4 14h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    again: '<svg viewBox="0 0 20 20"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 4v3.5h3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 20 20"><path d="M17 3 8.5 11.5M17 3l-5.2 14-3.3-5.5L3 8.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function buildBot() {
    const el = h('div', 'msg-bot');
    el.innerHTML = `
      <div class="bot-av"><i class="av-static"></i><div class="av-slot"></div></div>
      <div class="bot-body">
        <div class="think">
          <div class="think-head"><span class="think-label shimmer">Рассуждаю</span><span class="think-time">0,0 с</span>${ICONS.chev}</div>
          <div class="think-wrap"><ol class="think-steps"></ol></div>
        </div>
        <div class="rewrite-note"><span class="think-label shimmer"></span></div>
        <div class="answer"></div>
        <div class="result reveal">
          <div class="meter">
            <svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg>
            <div><b class="pct">0%</b><small>Правдоподобие</small></div>
          </div>
          <div class="drama">
            <div class="drama-top"><small>Драма</small><b class="lvl"></b></div>
            <div class="bars">${[0, 1, 2, 3, 4, 5].map(k => `<i style="--k:${k}"></i>`).join('')}</div>
          </div>
        </div>
        <div class="actions reveal">
          <button class="chip-btn" data-act="more">${ICONS.more}<span>Драматичнее</span></button>
          <button class="chip-btn" data-act="less">${ICONS.less}<span>Короче</span></button>
          <button class="chip-btn" data-act="again">${ICONS.again}<span>Другая</span></button>
        </div>
        <button class="send-boss reveal">Отправить начальнику${ICONS.send}</button>
      </div>`;
    const bot = {
      el,
      avSlot: $('.av-slot', el),
      think: $('.think', el),
      thinkLabel: $('.think-head .think-label', el),
      thinkTime: $('.think-time', el),
      steps: $('.think-steps', el),
      note: $('.rewrite-note', el),
      noteLabel: $('.rewrite-note .think-label', el),
      answer: $('.answer', el),
      result: $('.result', el),
      actions: $('.actions', el),
      sendBoss: $('.send-boss', el),
      fg: $('.fg', el), pct: $('.pct', el), lvl: $('.lvl', el), bars: $$('.bars i', el),
      level: E.DEFAULT_LEVEL, p: 0, text: '', choice: null,
    };
    $('.think-head', el).addEventListener('click', () => {
      if (bot.think.classList.contains('is-collapsed')) bot.think.classList.toggle('is-open');
    });
    $$('.chip-btn', el).forEach(b => b.addEventListener('click', () => rewrite(bot, b.dataset.act)));
    bot.sendBoss.addEventListener('click', () => { if (busy) return; Snd.tap(); go('msg'); });
    return bot;
  }

  const fmtSec = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' с';

  function appendWords(p, text, run, speed) {
    return (async () => {
      const caret = h('span', 'caret');
      const words = text.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (run !== genRun) return false;
        const s = h('span', 'w', (i ? ' ' : '') + words[i]);
        p.appendChild(s);
        p.appendChild(caret);
        if (i % 2 === 0) Snd.tick();
        const pause = /[.!?]$/.test(words[i]) ? speed * 3.2 : /[,—:]$/.test(words[i]) ? speed * 1.8 : 0;
        await sleep(speed * rnd(0.7, 1.3) + pause);
      }
      caret.remove();
      return true;
    })();
  }

  async function stream(el, text, level, run, speed = 40) {
    el.innerHTML = '';
    el.classList.toggle('is-tele', level === -1);
    for (const para of text.split('\n')) {
      const p = h('p');
      el.appendChild(p);
      let rest = para;
      const m = para.match(/^(Акт [IVX]+\.)\s/);
      if (m) {
        p.appendChild(h('b', 'act w', m[1]));
        p.appendChild(document.createTextNode(' '));
        rest = para.slice(m[0].length);
        await sleep(speed * 4);
      }
      const ok = await appendWords(p, rest.trim(), run, speed);
      if (!ok) return false;
      if (m) await sleep(speed * 3);
    }
    return true;
  }

  function renderStatic(el, text, level) {
    el.innerHTML = '';
    el.classList.toggle('is-tele', level === -1);
    text.split('\n').forEach(para => {
      const p = h('p');
      const m = para.match(/^(Акт [IVX]+\.)\s/);
      if (m) { p.appendChild(h('b', 'act', m[1])); p.appendChild(document.createTextNode(' ' + para.slice(m[0].length))); }
      else p.textContent = para;
      el.appendChild(p);
    });
  }

  function countTo(el, from, to, dur = 1000) {
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(from + (to - from) * ease(t)) + '%';
      if (t < 1) requestAnimationFrame(frame);
    })(t0);
  }

  function updateResult(bot, res) {
    const prev = bot.p;
    bot.p = res.p;
    bot.fg.style.strokeDashoffset = (113.1 * (1 - res.p / 100)).toFixed(2);
    countTo(bot.pct, prev, res.p);
    bot.lvl.textContent = res.levelName;
    bot.bars.forEach((b, k) => b.classList.toggle('on', k <= bot.level + 1));
    const more = $('[data-act="more"]', bot.el), less = $('[data-act="less"]', bot.el);
    more.disabled = bot.level >= E.MAX_LEVEL;
    less.disabled = bot.level <= E.MIN_LEVEL;
    $('span', more).textContent = more.disabled ? 'Драматичнее некуда' : 'Драматичнее';
    $('span', less).textContent = less.disabled ? 'Короче некуда' : 'Короче';
  }

  function setActions(bot, enabled) {
    $$('.chip-btn', bot.el).forEach(b => { b.disabled = !enabled; });
    bot.sendBoss.disabled = !enabled;
    if (enabled) updateResult(bot, { p: bot.p, levelName: E.levelName(bot.level) });
  }

  async function submit(raw) {
    const text = raw.trim();
    if (!text || busy) return;
    busy = true;
    const run = ++genRun;
    const alive = () => run === genRun;
    input.value = ''; autosize(); updateSend();
    input.blur();

    if (!empty.hidden) {
      empty.classList.add('is-gone');
      await sleep(260);
      if (!alive()) return;
      empty.hidden = true;
    }
    title.textContent = text.length > 34 ? text.slice(0, 32) + '…' : text;
    if (curBot) {
      curBot.el.classList.add('is-past');
      curBot.result.remove(); curBot.actions.remove(); curBot.sendBoss.remove();
    }

    const me = h('div', 'msg-me', text);
    col.appendChild(me);
    popIn(me, 'translateY(16px) scale(.95)');
    Snd.send();
    startFollow();
    await sleep(420);
    if (!alive()) return;

    const det = E.detect(text);
    const bot = buildBot();
    bot.choice = E.createChoice(det.sit);
    curBot = bot;
    col.appendChild(bot.el);
    popIn(bot.el, 'translateY(10px)', SPR.soft);
    Orb.to(bot.avSlot, { grow: 0.4, clamp: avatarClamp, magnet: false });
    Orb.energy(1);
    Snd.think();

    // шаги рассуждения
    const t0 = performance.now();
    const timer = setInterval(() => { bot.thinkTime.textContent = fmtSec(performance.now() - t0); }, 100);
    const steps = E.thinkSteps(det.sit, det.conf);
    for (const [label, result] of steps) {
      const li = h('li');
      li.innerHTML = '<i class="st"></i><span class="st-t"></span><span class="st-r"></span>';
      $('.st-t', li).textContent = label;
      $('.st-r', li).textContent = result;
      bot.steps.appendChild(li);
      requestAnimationFrame(() => li.classList.add('in'));
      await sleep(rnd(560, 820));
      if (!alive()) { clearInterval(timer); return; }
      li.classList.add('done');
      Snd.step();
      await sleep(140);
    }
    clearInterval(timer);
    const spent = performance.now() - t0;
    bot.thinkLabel.classList.remove('shimmer');
    bot.thinkLabel.textContent = `Рассуждал ${fmtSec(spent)}`;
    bot.thinkTime.textContent = `· ${steps.length} шага`;
    bot.think.classList.add('is-collapsed');
    Orb.energy(0.4);

    const res = E.compose(bot.choice, bot.level);
    bot.text = res.text;
    await sleep(300);
    const ok = await stream(bot.answer, res.text, bot.level, run);
    if (!ok) return;

    Orb.energy(0);
    Snd.done();
    updateResult(bot, res);
    bot.result.classList.add('in');
    await sleep(90);
    bot.actions.classList.add('in');
    await sleep(90);
    bot.sendBoss.classList.add('in');
    busy = false;
    updateSend();
    setTimeout(() => { if (run === genRun) follow = false; }, 900);
  }

  async function rewrite(bot, kind) {
    if (busy || bot !== curBot) return;
    let level = bot.level;
    if (kind === 'more') level = Math.min(E.MAX_LEVEL, level + 1);
    if (kind === 'less') level = Math.max(E.MIN_LEVEL, level - 1);
    if (kind !== 'again' && level === bot.level) return;
    busy = true;
    const run = ++genRun;
    setActions(bot, false);
    updateSend();

    const name = E.levelName(level);
    bot.noteLabel.textContent = kind === 'more' ? `Добавляю драмы → «${name}»` : kind === 'less' ? `Сокращаю → «${name}»` : 'Ищу другую отмазку…';
    bot.note.classList.add('on');
    bot.answer.classList.add('is-dim');
    Orb.energy(kind === 'more' && level >= 3 ? 1 : 0.8);
    if (kind === 'more') Snd.drama(level);
    else if (kind === 'less') Snd.shorter();
    else Snd.think();
    if (kind === 'again') bot.choice = E.createChoice(bot.choice.sit, bot.choice.idx);
    startFollow();

    await sleep(kind === 'more' && level === E.MAX_LEVEL ? 1700 : 780);
    if (run !== genRun) return;
    bot.level = level;
    const res = E.compose(bot.choice, level);
    bot.text = res.text;
    bot.answer.classList.remove('is-dim');
    Orb.energy(0.45);
    const ok = await stream(bot.answer, res.text, level, run, level >= 3 ? 30 : 36);
    if (!ok) return;
    bot.note.classList.remove('on');
    Orb.energy(0);
    Snd.done();
    busy = false;
    setActions(bot, true);
    updateResult(bot, res);
    updateSend();
    setTimeout(() => { if (run === genRun) follow = false; }, 900);
  }

  /* ---------- выбор модели (декоративный) ---------- */
  const pill = $('#model-pill'), menu = $('#model-menu');
  function closeModelMenu() { menu.classList.remove('open'); pill.setAttribute('aria-expanded', 'false'); }
  pill.addEventListener('click', e => {
    e.stopPropagation();
    Snd.tap();
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    pill.setAttribute('aria-expanded', String(open));
  });
  $$('button:not([disabled])', menu).forEach(b => b.addEventListener('click', () => {
    $$('button', menu).forEach(x => x.classList.toggle('on', x === b));
    $('#model-name').textContent = b.dataset.model;
    Snd.tap();
    closeModelMenu();
  }));
  document.addEventListener('click', e => { if (!menu.contains(e.target)) closeModelMenu(); });

  /* ---------- мессенджер: финал ролика ---------- */
  const phBody = $('#ph-body'), phField = $('#ph-field'), phSend = $('#ph-send'), phState = $('#ph-state'), msgCtrl = $('#msg-ctrl');
  let msgRun = 0;
  const score = { win: 0, lose: 0 };
  const hhmm = d => d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  const TICKS = '<span class="ticks"><svg class="t1" viewBox="0 0 17 11"><path d="M1 6l3.2 3.2L11 2"/></svg><svg class="t2" viewBox="0 0 17 11"><path d="M6.5 8.4l.8.8L14 2"/></svg></span>';

  function bubble(cls, text, time, ticks) {
    const b = h('div', 'bb ' + cls);
    b.appendChild(document.createTextNode(text));
    const meta = h('span', 'bb-meta', time);
    if (ticks) meta.insertAdjacentHTML('beforeend', TICKS);
    b.appendChild(meta);
    return b;
  }

  async function playMessenger() {
    const run = ++msgRun;
    const alive = () => run === msgRun && current === 'msg';
    let choice, level, text;
    if (curBot && curBot.text) { choice = curBot.choice; level = curBot.level; text = curBot.text; }
    else { choice = E.createChoice('absent'); level = E.DEFAULT_LEVEL; text = E.compose(choice, level).text; }
    // Первая отправка за сессию всегда проходит, вторая всегда проваливается,
    // дальше — чистый случай 50/50. Правдоподобие тут ничего не гарантирует.
    const attempt = score.win + score.lose;
    const ok = attempt === 0 ? true : attempt === 1 ? false : Math.random() < 0.5;
    const replies = E.bossReply(choice, level, ok);

    const now = new Date();
    $('#ph-clock').textContent = hhmm(now);
    phBody.innerHTML = '';
    phBody.appendChild(h('div', 'ph-day', 'Сегодня'));
    phBody.appendChild(bubble('bb-in', E.bossBefore(choice.sit), hhmm(new Date(now - 3 * 60000))));
    phState.textContent = 'был недавно';
    phState.classList.remove('is-typing');
    phField.innerHTML = '<span class="ph-ph">Сообщение</span>';
    phSend.classList.remove('on', 'press');
    msgCtrl.classList.remove('in');
    screens.msg.classList.remove('is-done');

    await sleep(1100);
    if (!alive()) return;
    phField.textContent = text.replace(/\n/g, ' ');
    phField.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    phSend.classList.add('on');
    Snd.tap();

    await sleep(1000);
    if (!alive()) return;
    phSend.classList.add('press');
    Snd.send();
    await sleep(110);
    phSend.classList.remove('press', 'on');
    phField.innerHTML = '<span class="ph-ph">Сообщение</span>';
    const out = bubble('bb-out', text, hhmm(now), true);
    phBody.appendChild(out);
    popIn(out, 'translateY(40px) scale(.9)');

    await sleep(900);
    if (!alive()) return;
    $('.ticks', out).classList.add('read');
    phState.textContent = 'в сети';

    const typing = h('div', 'bb-typing');
    typing.innerHTML = '<i></i><i></i><i></i>';
    const setTyping = on => {
      phState.textContent = on ? 'печатает…' : 'в сети';
      phState.classList.toggle('is-typing', on);
      if (on) { phBody.appendChild(typing); popIn(typing, 'translateY(10px) scale(.8)'); }
      else typing.remove();
    };

    await sleep(700);
    if (!alive()) return;
    // Перед отказом шеф начинает печатать, передумывает и пишет снова — как вживую.
    if (!ok) {
      setTyping(true);
      await sleep(1300);
      if (!alive()) return;
      setTyping(false);
      await sleep(1100);
      if (!alive()) return;
    }
    let t = now.getTime() + 60000;
    for (let i = 0; i < replies.length; i++) {
      setTyping(true);
      await sleep((i ? 900 : 1400) + Math.min(1300, replies[i].length * 32));
      if (!alive()) return;
      setTyping(false);
      const back = bubble('bb-in', replies[i], hhmm(new Date(t)));
      phBody.appendChild(back);
      popIn(back, 'translateY(16px) scale(.86)');
      Snd.receive();
      await sleep(450);
      if (!alive()) return;
    }

    // Итог — служебной плашкой, как в мессенджерах.
    ok ? score.win++ : score.lose++;
    await sleep(500);
    if (!alive()) return;
    const verdict = h('div', 'ph-verdict ' + (ok ? 'is-ok' : 'is-fail'));
    verdict.innerHTML = (ok
      ? '<svg viewBox="0 0 20 20"><path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 20 20"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>')
      + `<b>${ok ? 'Шеф поверил' : 'Не прокатило'}</b><span>Счёт ${score.win}:${score.lose}</span>`;
    phBody.appendChild(verdict);
    popIn(verdict, 'translateY(10px) scale(.9)');
    if (ok) { Snd.done(); Orb.poke(); } else { Snd.fail(); Orb.energy(0.6); setTimeout(() => Orb.energy(0), 1600); }
    $('#msg-replay span').textContent = ok ? 'Ещё раз' : 'Ещё попытка';

    await sleep(1000);
    if (!alive()) return;
    msgCtrl.classList.add('in');
    screens.msg.classList.add('is-done');
  }
  $('#msg-replay').addEventListener('click', () => { Snd.tap(); playMessenger(); });

  /* ---------- сброс и режиссёрские клавиши ---------- */
  function resetAll() {
    newChat(true);
    resetPay();
    msgRun++;
    score.win = score.lose = 0;
    $$('#hist button').forEach(x => x.classList.remove('cur'));
  }

  const soundBtn = $('#sound');
  const syncSound = on => {
    soundBtn.setAttribute('aria-pressed', String(on));
    $$('#sound-seg button').forEach(b => b.classList.toggle('on', (b.dataset.s === 'on') === on));
  };
  $$('#sound-seg button').forEach(b => b.addEventListener('click', () => Snd.setEnabled(b.dataset.s === 'on')));
  syncSound(Snd.enabled);
  Snd.onChange(syncSound);
  soundBtn.addEventListener('click', () => Snd.setEnabled(!Snd.enabled));

  window.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    switch (e.code) {
      case 'KeyR': go('home', { reset: true, force: true }); break;
      case 'Digit1': case 'Numpad1': go('home'); break;
      case 'Digit2': case 'Numpad2': go('pay'); break;
      case 'Digit3': case 'Numpad3': go('gen'); break;
      case 'Digit4': case 'Numpad4': go('msg', { force: true }); break;
      case 'KeyM': Snd.setEnabled(!Snd.enabled); break;
      case 'KeyD':
        if (current !== 'gen') go('gen');
        setTimeout(() => runPrompt(E.g(DATA.PROMPTS[Math.floor(Math.random() * DATA.PROMPTS.length)].text)), current === 'gen' ? 0 : 900);
        break;
      case 'Escape':
        if (current === 'pay') go('home');
        closeModelMenu();
        setDrawer(false);
        break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- старт ---------- */
  renderLists();
  Orb.init();
  Orb.to($('#slot-home'), { opacity: 1 });
  const start = () => go('home', { silent: true });
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, sleep(900)]) : Promise.resolve();
  fontsReady.then(start);
})();
