/* Интерактивный тур по интерфейсу.
   Подсвечивает настоящие элементы и ждёт, пока пользователь сам нажмёт нужное:
   тур идёт по живому продукту, а не по отдельному «режиму обучения».
   Ничего не блокирует: затемнение пропускает клики, «Пропустить» есть на каждом шаге. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const App = () => window.OtmazApp;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'otmaz-tour';
  const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(KEY, 'done'); } catch (e) {} };

  /* Шаги. wait — событие приложения, после которого тур идёт дальше; next — кнопка «Дальше». */
  const STEPS = [
    {
      screen: 'home', target: () => $('.cta-main'),
      title: 'Начнём с подписки',
      text: 'Шар над заголовком — это ОТМАЗ-4 Turbo, он живой: поводите по нему курсором. А теперь откройте Pro.',
      action: 'Нажмите «Попробовать Pro»', wait: 'screen:pay',
    },
    {
      screen: 'pay', target: () => $('#pay-btn'),
      title: 'Оплата лицом',
      text: 'Всё понарошку: камера не включается, деньги не списываются, данные карты не нужны.',
      action: 'Нажмите «Оплатить лицом»', wait: 'screen:gen',
    },
    {
      screen: 'gen', target: () => (App().emptyVisible ? $('#sugg') : $('#composer')),
      title: 'Что натворили?',
      text: 'Опишите ситуацию своими словами или выберите готовую. Модель порассуждает и напишет отмазку.',
      action: 'Выберите ситуацию или отправьте свою', wait: 'gen:done',
    },
    {
      screen: 'gen', target: () => App().bot && App().bot.el.querySelector('[data-act="more"]'),
      title: 'Добавьте драмы',
      text: 'Ответ перепишется на глазах. Уровней шесть: от «Телеграфа» до «Трагедии в трёх актах».',
      action: 'Нажмите «Драматичнее»', wait: 'rewrite:done',
    },
    {
      screen: 'gen', target: () => App().bot && App().bot.result,
      title: 'Правдоподобие',
      text: 'Чем больше драмы, тем меньше вам верят. «Короче» вернёт деловой тон, «Другая» подберёт новую отмазку.',
      next: true,
    },
    {
      screen: 'gen', target: () => App().bot && App().bot.sendBoss,
      title: 'Финал',
      text: 'Отправьте отмазку начальнику. Поверит он или нет — решит случай, а не проценты.',
      action: 'Нажмите «Отправить начальнику»', wait: 'msg:verdict',
    },
    {
      screen: 'msg', target: () => $('.ph-verdict') || $('.phone'),
      title: 'Вот и всё',
      text: 'Теперь вы знаете всё. Отправьте ещё раз, чтобы испытать удачу, или вернитесь к генератору. Пройти тур заново можно кнопкой «?» на главной.',
      done: true,
    },
  ];

  /* ---------- разметка ---------- */
  const root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="tour-dim"></div>
    <div class="tour-hole"><i class="tour-ring"></i></div>
    <div class="tour-card" role="dialog" aria-live="polite" aria-labelledby="tour-title">
      <div class="tour-top"><span class="tour-count"></span><span class="tour-dots"></span></div>
      <h3 class="tour-title" id="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-foot">
        <button class="tour-skip" type="button">Пропустить</button>
        <span class="tour-action"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3.5v8.2l-1.6-1.6a1.5 1.5 0 0 0-2.2 2l3.6 4.2c.5.6 1.2.9 2 .9h3.4a2.6 2.6 0 0 0 2.6-2.4l.4-4.4a1.7 1.7 0 0 0-1.4-1.8L10.5 8V3.5a1.25 1.25 0 0 0-2.5 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><span></span></span>
        <button class="tour-next" type="button">Дальше</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const hole = $('.tour-hole', root), card = $('.tour-card', root);
  const elCount = $('.tour-count', root), elDots = $('.tour-dots', root), elTitle = $('.tour-title', root), elText = $('.tour-text', root);
  const elAction = $('.tour-action', root), elActionText = $('.tour-action span', root), btnSkip = $('.tour-skip', root), btnNext = $('.tour-next', root);
  elDots.innerHTML = STEPS.map(() => '<i></i>').join('');

  const help = document.createElement('button');
  help.className = 'tour-help';
  help.setAttribute('aria-label', 'Пройти обучение заново');
  help.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.6 7.4a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.2.9-1.2 1.6v.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.1" fill="currentColor"/></svg>';
  document.body.appendChild(help);

  /* ---------- состояние ---------- */
  let active = false, idx = -1, mode = 'off';   // off | welcome | step | waiting
  let showTimer = 0;
  const cur = { x: 0, y: 0, w: 0, h: 0, r: 16 }, tgt = { x: 0, y: 0, w: 0, h: 0, r: 16 };
  const cardPos = { x: 0, y: 0 }, cardTgt = { x: 0, y: 0 };
  let snap = true, last = 0, raf = 0;

  function setVisible(on, withHole = true) {
    root.classList.toggle('on', on);
    root.classList.toggle('no-hole', !withHole);
    root.setAttribute('aria-hidden', String(!on));
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function render(step) {
    const n = STEPS.indexOf(step);
    elCount.textContent = `${n + 1} из ${STEPS.length}`;
    [...elDots.children].forEach((d, i) => d.classList.toggle('on', i <= n));
    elTitle.textContent = step.title;
    elText.textContent = step.text;
    elAction.hidden = !step.action;
    elActionText.textContent = step.action || '';
    btnNext.hidden = !(step.next || step.done);
    btnNext.textContent = step.done ? 'Готово' : 'Дальше';
    btnSkip.hidden = !!step.done;
    card.classList.remove('is-welcome');
    card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
  }

  function renderWelcome() {
    elCount.textContent = 'Обучение · около минуты';
    [...elDots.children].forEach(d => d.classList.remove('on'));
    elTitle.textContent = 'Добро пожаловать в Отмаз Pro';
    elText.textContent = 'Покажу, как это работает: оформим подписку, сгенерируем отмазку и отправим её начальнику. Всё можно нажимать по-настоящему.';
    elAction.hidden = true;
    btnSkip.hidden = false;
    btnSkip.textContent = 'Сам разберусь';
    btnNext.hidden = false;
    btnNext.textContent = 'Пройти тур';
    card.classList.add('is-welcome');
  }

  // Показываем шаг, только когда пользователь на нужном экране и цель на месте.
  function tryShow() {
    clearTimeout(showTimer);
    if (!active || mode === 'welcome') return;
    const step = STEPS[idx];
    if (!step) return;
    const app = App();
    const el = step.target();
    if (app.screen !== step.screen || !el || app.busy) { setVisible(false); mode = 'waiting'; return; }
    mode = 'step';
    btnSkip.textContent = 'Пропустить';
    render(step);
    snap = !root.classList.contains('on');
    setVisible(true, true);
    try { el.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' }); } catch (e) {}
  }
  function later(ms) { clearTimeout(showTimer); showTimer = setTimeout(tryShow, ms); }

  function go(i, delay = 0) {
    idx = i;
    if (idx >= STEPS.length) { finish(); return; }
    setVisible(false);
    mode = 'waiting';
    later(delay);
  }

  function start(fromWelcome) {
    active = true;
    App().closeDrawer();
    if (fromWelcome) { go(0, 250); return; }
    App().restart();
    go(0, 900);
  }

  function finish() {
    active = false; mode = 'off'; idx = -1;
    clearTimeout(showTimer);
    markSeen();
    setVisible(false);
  }

  function welcome() {
    if (seen() || active) return;
    active = true; mode = 'welcome';
    renderWelcome();
    setVisible(true, false);
  }

  /* ---------- события приложения ---------- */
  function on(name, fn) { window.addEventListener('otmaz:' + name, e => fn(e.detail)); }
  function advanceIf(eventName, delay) {
    if (!active || mode === 'welcome') return false;
    const step = STEPS[idx];
    if (step && step.wait === eventName) { go(idx + 1, delay); return true; }
    return false;
  }
  on('screen', name => {
    // Ушли с главной, не ответив на приветствие, — значит, разбираются сами.
    if (mode === 'welcome' && name !== 'home') { finish(); return; }
    if (advanceIf('screen:' + name, name === 'gen' ? 1100 : 650)) return;
    // Закрыли оплату — возвращаемся к шагу «Попробовать Pro».
    if (active && mode !== 'welcome' && idx === 1 && name === 'home') idx = 0;
    if (active && mode !== 'welcome') { setVisible(false); later(name === 'gen' ? 1100 : 650); }
  });
  on('gen:done', () => { if (!advanceIf('gen:done', 500)) later(300); });
  on('rewrite:done', () => { if (!advanceIf('rewrite:done', 450)) later(300); });
  on('msg:verdict', () => { advanceIf('msg:verdict', 600); });
  on('reset', () => { if (active && mode !== 'welcome' && idx > 0) { /* сброс R прерывает тур без отметки «пройден» */ active = false; mode = 'off'; setVisible(false); } });

  // Пока модель думает или переписывает, тур прячется, чтобы не мешать читать.
  document.addEventListener('click', e => {
    if (!active || mode !== 'step') return;
    const step = STEPS[idx];
    if (step && step.wait && e.target.closest('.chip-btn, .send-boss, #sugg button, .send, .cta-main, #pay-btn, .hist button')) {
      setVisible(false); mode = 'waiting';
    }
  }, true);
  document.addEventListener('submit', () => { if (active && mode === 'step') { setVisible(false); mode = 'waiting'; } }, true);

  btnNext.addEventListener('click', () => {
    window.Sound && Sound.tap();
    if (mode === 'welcome') { start(true); return; }
    const step = STEPS[idx];
    if (step && step.done) { finish(); return; }
    go(idx + 1, 120);
  });
  btnSkip.addEventListener('click', () => { window.Sound && Sound.tap(); finish(); });
  help.addEventListener('click', () => { window.Sound && Sound.tap(); finish(); start(false); });
  const again = $('#tour-again');
  if (again) again.addEventListener('click', () => { window.Sound && Sound.tap(); finish(); start(false); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && active) finish();
  }, true);

  /* ---------- подсветка следует за целью ---------- */
  function measure() {
    const step = STEPS[idx];
    const el = step && step.target();
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const pad = 8;
    const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
    tgt.x = r.left - pad; tgt.y = r.top - pad; tgt.w = r.width + pad * 2; tgt.h = r.height + pad * 2;
    tgt.r = Math.min(br + pad, tgt.h / 2);

    // Карточка — снизу от цели, если помещается, иначе сверху; на телефоне — по ширине экрана.
    const vw = innerWidth, vh = innerHeight, m = 16;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x = Math.min(Math.max(r.left + r.width / 2 - cw / 2, m), vw - cw - m);
    let y;
    if (r.bottom + pad + 14 + ch <= vh - m) { y = r.bottom + pad + 14; card.dataset.place = 'below'; }
    else if (r.top - pad - 14 - ch >= m) { y = r.top - pad - 14 - ch; card.dataset.place = 'above'; }
    else { y = r.top + r.height / 2 > vh / 2 ? m : vh - ch - m; card.dataset.place = 'side'; }
    cardTgt.x = x; cardTgt.y = y;
    card.style.setProperty('--caret', Math.min(Math.max(r.left + r.width / 2 - x, 24), cw - 24) + 'px');
    return true;
  }

  function loop(now) {
    raf = 0;
    if (!root.classList.contains('on')) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'welcome') {
      const cw = card.offsetWidth, ch = card.offsetHeight;
      cardPos.x = (innerWidth - cw) / 2; cardPos.y = (innerHeight - ch) / 2;
      card.style.transform = `translate(${cardPos.x}px, ${cardPos.y}px)`;
      return;
    }
    if (!measure()) return;
    const k = snap || reduce.matches ? 1 : Math.min(1, dt * 11);
    snap = false;
    for (const p of ['x', 'y', 'w', 'h', 'r']) cur[p] += (tgt[p] - cur[p]) * k;
    cardPos.x += (cardTgt.x - cardPos.x) * k;
    cardPos.y += (cardTgt.y - cardPos.y) * k;
    hole.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px)`;
    hole.style.width = cur.w.toFixed(1) + 'px';
    hole.style.height = cur.h.toFixed(1) + 'px';
    hole.style.borderRadius = cur.r.toFixed(1) + 'px';
    card.style.transform = `translate(${cardPos.x.toFixed(1)}px, ${cardPos.y.toFixed(1)}px)`;
  }

  // Первый визит: приветствие после того, как главная проявилась.
  window.addEventListener('otmaz:screen', function first(e) {
    if (e.detail !== 'home') return;
    window.removeEventListener('otmaz:screen', first);
    setTimeout(() => { if (App().screen === 'home') welcome(); }, 1500);
  });

  window.OtmazTour = { start: () => { finish(); start(false); }, reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} } };
})();
