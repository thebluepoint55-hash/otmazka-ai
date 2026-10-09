/* Звуки синтезируются через Web Audio — никаких файлов. По умолчанию включены (нужны для Reels). */
window.Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true;
  try { enabled = localStorage.getItem('otmaz-sound') !== 'off'; } catch (e) {}
  const listeners = new Set();

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Браузер разрешает звук только после первого жеста пользователя.
  const unlock = () => ensure();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  function tone({ f = 440, f2, type = 'sine', at = 0, dur = 0.2, vol = 0.2, attack = 0.006, q }) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (q) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = q; lp.Q.value = 0.7;
      o.connect(lp); node = lp;
    }
    node.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ at = 0, dur = 0.1, vol = 0.2, type = 'bandpass', f = 2000, f2, q = 1, attack = 0.004 }) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(gn); gn.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  const r = (a, b) => a + Math.random() * (b - a);

  const api = {
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = !!v;
      try { localStorage.setItem('otmaz-sound', enabled ? 'on' : 'off'); } catch (e) {}
      listeners.forEach(fn => fn(enabled));
      if (enabled) api.tap();
    },
    onChange(fn) { listeners.add(fn); },

    tap() { noise({ dur: 0.03, vol: 0.16, f: 3600, q: 0.9 }); tone({ f: 1500, dur: 0.045, vol: 0.035, type: 'triangle' }); },
    key() { noise({ dur: 0.022, vol: r(0.05, 0.09), f: r(2200, 3800), q: 1.6 }); },
    tick() { tone({ f: r(2300, 2700), dur: 0.022, vol: 0.016 }); },
    whoosh() { noise({ dur: 0.5, vol: 0.09, f: 380, f2: 2600, q: 0.6, attack: 0.12 }); },
    open() { tone({ f: 520, f2: 780, dur: 0.28, vol: 0.05, attack: 0.03 }); noise({ dur: 0.35, vol: 0.05, f: 900, f2: 3000, q: 0.5, attack: 0.08 }); },
    scanBeep(i = 0) { tone({ f: 880 + i * 110, dur: 0.09, vol: 0.05, type: 'sine' }); },
    scanSweep() { tone({ f: 300, f2: 1200, dur: 1.4, vol: 0.025, type: 'sine', attack: 0.2 }); },
    // «Оплачено»: светлый двухнотный звон.
    success() {
      tone({ f: 1318.5, dur: 0.6, vol: 0.12, attack: 0.004 });
      tone({ f: 1975.5, at: 0.09, dur: 0.9, vol: 0.11, attack: 0.004 });
      tone({ f: 2637, at: 0.09, dur: 0.5, vol: 0.03 });
      [0, 1, 2, 3, 4].forEach(i => tone({ f: r(3200, 5200), at: 0.12 + i * 0.045, dur: 0.12, vol: 0.018 }));
    },
    think() { tone({ f: 660, f2: 990, dur: 0.35, vol: 0.035, attack: 0.04 }); },
    step() { tone({ f: 1046.5, dur: 0.12, vol: 0.04 }); tone({ f: 1568, at: 0.05, dur: 0.14, vol: 0.03 }); },
    done() { tone({ f: 784, dur: 0.22, vol: 0.05 }); tone({ f: 1174.7, at: 0.07, dur: 0.32, vol: 0.05 }); },
    // «Драматичнее»: низкий удар; на «Трагедии» — классическое «дун-дун-дуууун».
    drama(level) {
      const lp = 900;
      if (level >= 4) {
        [[196, 0, 0.28], [185, 0.32, 0.28], [155.6, 0.64, 1.3]].forEach(([f, at, dur]) => {
          tone({ f, at, dur, vol: 0.2, type: 'sawtooth', q: lp, attack: 0.01 });
          tone({ f: f / 2, at, dur, vol: 0.16, type: 'triangle', attack: 0.01 });
        });
        noise({ at: 0.64, dur: 1.2, vol: 0.05, f: 300, q: 0.4, type: 'lowpass' });
      } else {
        const f = 110 + level * 18;
        tone({ f, dur: 0.6, vol: 0.18, type: 'sawtooth', q: lp, attack: 0.01 });
        tone({ f: f / 2, dur: 0.7, vol: 0.14, type: 'triangle', attack: 0.01 });
      }
    },
    shorter() { noise({ dur: 0.04, vol: 0.12, f: 5200, q: 2 }); noise({ at: 0.07, dur: 0.04, vol: 0.1, f: 6200, q: 2 }); tone({ f: 1200, f2: 600, dur: 0.12, vol: 0.03 }); },
    send() { noise({ dur: 0.28, vol: 0.1, f: 900, f2: 4200, q: 0.8, attack: 0.02 }); tone({ f: 600, f2: 1400, dur: 0.16, vol: 0.04 }); },
    receive() { tone({ f: 1046.5, dur: 0.14, vol: 0.1 }); tone({ f: 1568, at: 0.11, dur: 0.3, vol: 0.09 }); },
    pop() { tone({ f: 420, f2: 900, dur: 0.09, vol: 0.06 }); },
  };
  return api;
})();
