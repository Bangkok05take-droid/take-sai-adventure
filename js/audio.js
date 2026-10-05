/* 効果音とBGM（WebAudioで合成。音源ファイル不要）。最初のタップ後に開始。 */
(function (TS) {
  'use strict';
  const A = { enabled: true, ctx: null, master: null, bgmTimer: null, bgmName: null, step: 0, nextTime: 0 };

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.enabled ? 0.6 : 0;
    A.master.connect(A.ctx.destination);
    if (A.bgmName) A.playBgm(A.bgmName, true);
  };
  A.setEnabled = function (on) {
    A.enabled = on;
    if (A.master) A.master.gain.setTargetAtTime(on ? 0.6 : 0, A.ctx.currentTime, 0.05);
  };

  function tone(freq, start, dur, type, vol, slideTo) {
    const c = A.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(A.master);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function noise(start, dur, vol) {
    const c = A.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain();
    g.gain.value = vol || 0.08;
    s.buffer = buf; s.connect(g); g.connect(A.master); s.start(start);
  }

  const SFX = {
    hit: (t) => { noise(t, 0.08, 0.12); tone(220, t, 0.08, 'square', 0.05, 110); },
    hurt: (t) => { tone(180, t, 0.15, 'sawtooth', 0.07, 80); },
    miss: (t) => { tone(600, t, 0.06, 'triangle', 0.04, 900); },
    kill: (t) => { tone(440, t, 0.06, 'square', 0.05); tone(660, t + 0.06, 0.1, 'square', 0.05); },
    heal: (t) => { [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.06, 0.12, 'triangle', 0.07)); },
    eat: (t) => { tone(300, t, 0.05, 'square', 0.05); tone(360, t + 0.08, 0.05, 'square', 0.05); },
    pickup: (t) => { tone(880, t, 0.05, 'square', 0.04); tone(1175, t + 0.05, 0.08, 'square', 0.04); },
    gold: (t) => { tone(1319, t, 0.05, 'square', 0.04); tone(1760, t + 0.05, 0.1, 'square', 0.04); },
    levelup: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.14, 'square', 0.06)); },
    stairs: (t) => { [784, 659, 523, 392].forEach((f, i) => tone(f, t + i * 0.07, 0.1, 'triangle', 0.07)); },
    return: (t) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.2, 'triangle', 0.07)); },
    bolt: (t) => { noise(t, 0.2, 0.1); tone(1200, t, 0.2, 'sawtooth', 0.05, 200); },
    sleep: (t) => { tone(660, t, 0.3, 'sine', 0.06, 330); },
    dart: (t) => { tone(1500, t, 0.08, 'triangle', 0.04, 700); },
    warn: (t) => { tone(440, t, 0.12, 'square', 0.05); tone(440, t + 0.18, 0.12, 'square', 0.05); },
    buy: (t) => { tone(1047, t, 0.05, 'square', 0.04); tone(1568, t + 0.06, 0.12, 'square', 0.04); },
    tap: (t) => { tone(700, t, 0.03, 'square', 0.025); },
    bump: (t) => { tone(120, t, 0.06, 'square', 0.04); },
  };
  A.sfx = function (name) {
    if (!A.ctx || !A.enabled || !SFX[name]) return;
    SFX[name](A.ctx.currentTime + 0.005);
  };

  // BGM：ペンタトニックのやさしいループ（ラナート風の木琴＋低音）
  const BGM = {
    village: { tempo: 0.26, scale: [392, 440, 523, 587, 659, 784, 880],
      mel: [0, 2, 3, 4, -1, 3, 2, -1, 1, 2, 4, 5, 4, -1, 2, -1, 0, 2, 3, 2, -1, 1, 0, -1, 3, 4, 2, 1, 0, -1, -1, -1],
      bass: [196, 196, 147, 147, 131, 131, 147, 147] },
    dungeon: { tempo: 0.32, scale: [220, 262, 294, 330, 392, 440, 523],
      mel: [0, -1, 2, -1, 3, 2, -1, -1, 4, -1, 3, -1, 2, 0, -1, -1, 1, -1, 2, -1, 0, -1, -1, -1, 3, 2, 1, -1, 0, -1, -1, -1],
      bass: [110, 110, 98, 98, 87, 87, 98, 82] },
    boss: { tempo: 0.2, scale: [220, 233, 294, 330, 349, 440, 466],
      mel: [0, 0, 3, -1, 0, 0, 4, -1, 0, 0, 3, 2, 1, -1, 0, -1],
      bass: [110, 110, 117, 117, 110, 110, 98, 104] },
  };
  A.playBgm = function (name, force) {
    if (A.bgmName === name && !force && A.bgmTimer) return;
    A.bgmName = name;
    if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; }
    if (!A.ctx || !name) return;
    const B = BGM[name];
    A.step = 0;
    A.nextTime = A.ctx.currentTime + 0.1;
    A.bgmTimer = setInterval(() => {
      if (!A.enabled || A.ctx.state !== 'running') { A.nextTime = A.ctx.currentTime + 0.1; return; }
      while (A.nextTime < A.ctx.currentTime + 0.3) {
        const i = A.step % B.mel.length;
        const n = B.mel[i];
        if (n >= 0) tone(B.scale[n] * 2, A.nextTime, B.tempo * 0.9, 'triangle', 0.025);
        if (i % 4 === 0) tone(B.bass[(i / 4) % B.bass.length], A.nextTime, B.tempo * 3, 'sine', 0.035);
        A.nextTime += B.tempo;
        A.step++;
      }
    }, 100);
  };

  TS.Audio = A;
})(globalThis.TS = globalThis.TS || {});
