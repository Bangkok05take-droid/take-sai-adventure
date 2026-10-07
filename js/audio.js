/* 効果音とBGM（WebAudioで合成。音源ファイル不要）。最初のタップ後に開始。
 * 音の出口：効果音 → sfxBus（効果音の音量）／BGM・音楽 → musicBus（BGMの音量）→ 音割れ防止 → master（音のオン/オフ）。 */
(function (TS) {
  'use strict';
  const A = { enabled: true, ctx: null, master: null, sfxBus: null, musicBus: null, bgmVol: 1, sfxVol: 1, bgmHold: false,
    bgmTimer: null, bgmName: null, step: 0, nextTime: 0 };

  /* 音を使えるようにする。ブラウザは「利用者の操作の中」でないと音を出させない（自動再生の制限）。
   * スマホでは指を置いた瞬間（pointerdown）は操作に数えられず、指を離したとき（pointerup・touchend・click）に数えられるので、
   * どの操作からも呼ばれる（何度呼ばれてもよい）。止まっていれば再開し、タイトルのファンファーレが未再生なら鳴らす */
  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended' || A.ctx.state === 'interrupted') { const r = A.ctx.resume(); if (r && r.catch) r.catch(() => {}); } else kickTitle(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    // 止まっていた音が動き出したとき（操作の後・裏から戻った後）に、待っていたファンファーレを鳴らす
    A.ctx.onstatechange = () => { kickTitle(); if (A.onChange) A.onChange(); };
    A.master = A.ctx.createGain();
    A.master.gain.value = A.enabled ? 0.6 : 0;
    A.master.connect(A.ctx.destination);
    A.sfxBus = A.ctx.createGain(); A.sfxBus.gain.value = A.sfxVol; A.sfxBus.connect(A.master);
    A.musicBus = A.ctx.createGain(); A.musicBus.gain.value = A.bgmVol;
    if (TS.Music && TS.Music.makeMusicChain) {
      const ch = TS.Music.makeMusicChain(A.ctx); A.musicBus.connect(ch.input); ch.output.connect(A.master);
      A.reverbSend = A.ctx.createGain(); A.reverbSend.gain.value = A.bgmVol; A.reverbSend.connect(ch.reverbIn);   // 残響もBGMの音量に合わせる
    }
    else A.musicBus.connect(A.master);
    if (A.bgmName && !A.bgmHold) A.playBgm(A.bgmName, true);
  };
  A.setEnabled = function (on) {
    const was = A.enabled;
    A.enabled = on;
    if (A.master) A.master.gain.setTargetAtTime(on ? 0.6 : 0, A.ctx.currentTime, 0.05);
    // 音オフ：曲の予約も止める（裏で鳴らし続けない）。オンに戻したら、今の場面の曲を流す
    if (!on) { stopSceneMusic(0.1); if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; } }
    else if (!was && A.ctx && !A.bgmHold) A.playBgm(A.bgmName, true);
  };
  // BGMと効果音の音量（0〜1）。急に変えずに短くならす
  A.setVolumes = function (bgm, sfx) {
    if (bgm != null) A.bgmVol = Math.max(0, Math.min(1, bgm));
    if (sfx != null) A.sfxVol = Math.max(0, Math.min(1, sfx));
    if (A.ctx) {
      A.musicBus.gain.setTargetAtTime(A.bgmVol, A.ctx.currentTime, 0.03);
      if (A.reverbSend) A.reverbSend.gain.setTargetAtTime(A.bgmVol, A.ctx.currentTime, 0.03);
      A.sfxBus.gain.setTargetAtTime(A.sfxVol, A.ctx.currentTime, 0.03);
    }
  };
  // アプリが裏に回ったら音を止め、戻ったら再開する（止めている間は予約が進まないので、戻っても音が重ならない）
  A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended' && A.enabled) A.ctx.resume(); };
  /* 試聴などで場面のBGMを一時的に止める。hold の間に playBgm が呼ばれても曲名だけ覚えておき、解除したときにその曲を流す */
  A.holdBgm = function (on) {
    A.bgmHold = !!on;
    if (on) { if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; } stopSceneMusic(0.3); }
    else if (A.bgmName) A.playBgm(A.bgmName, true);
  };
  /* 物語の場面だけ一時的に別の曲（例：ヤナイの会話）。終わったら、その間に変わった場面の曲も含めて元に戻す */
  A.eventBgm = null;
  A.startEventBgm = function (name) { A.eventBgm = name; A.playBgm(A.bgmName, true); };
  A.endEventBgm = function () { if (!A.eventBgm) return; A.eventBgm = null; A.playBgm(A.bgmName, true); };
  /* タイトルのファンファーレ（1回だけ）。fanfareDone は「実際に鳴り始めた」ときだけ立てる。
   * 音が止まっている（自動再生の制限）・音オフ・ボタンを押した操作の中（titleQuiet）では鳴らさず、次の機会まで待つ */
  A.fanfareDone = false;
  A.titleQuiet = false;
  A.onChange = null;   // ファンファーレの状態が変わったとき（タイトルの「タップで音楽を再生」の表示を更新する）
  A.running = () => !!(A.ctx && A.ctx.state === 'running');
  function kickTitle() {
    if (A.bgmName === 'title' && !A.fanfareDone && A.enabled && !A.bgmHold && !A.titleQuiet && A.running()) A.playBgm('title', true);
  }
  /* 読み込み直後に、操作なしで音を出せるか試す（許されないブラウザでは止まったまま作られ、最初の操作で再開する） */
  A.tryAutoplay = function () { if (A.enabled && !A.ctx) A.unlock(); };
  function stopSceneMusic(fade) { const M = TS.Music; if (M && M.current && M.current.bgm) M.stop(fade); }

  function tone(freq, start, dur, type, vol, slideTo, dest) {
    const c = A.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || A.sfxBus);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function noise(start, dur, vol) {
    const c = A.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain();
    g.gain.value = vol || 0.08;
    s.buffer = buf; s.connect(g); g.connect(A.sfxBus); s.start(start);
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
  /* 場面のBGM。name は場面（title / village / dungeon / boss）。
   * TS.Music.SCENES に曲があれば新しい曲（同じ曲が流れていれば続ける）、無ければ以前の合成BGM（boss）。
   * 物語の場面の曲（eventBgm）が流れている間は、場面の名前だけ覚えて切り替えない。曲の変わり目は短くフェードする */
  A.playBgm = function (name, force) {
    A.bgmName = name;
    if (!A.ctx || !name || A.bgmHold || !A.enabled) { if (A.bgmHold || !A.enabled || !name) { if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; } } return; }
    const M = TS.Music, scene = M && M.SCENES && M.SCENES[A.eventBgm || name];
    if (scene) {
      if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; }
      const cur = M.current;
      if (cur && cur.bgm && cur.id === scene.song && !cur.done) return;   // 同じ曲は最初から流し直さない
      if (scene.once) {
        if (A.fanfareDone) { stopSceneMusic(0.6); return; }
        // 音がまだ止まっている（自動再生の制限）、またはボタンを押した操作の中：まだ「鳴らした」にしない
        if (!A.running() || A.titleQuiet) { stopSceneMusic(0.3); return; }
        A.fanfareDone = true;
        if (A.onChange) setTimeout(A.onChange, 0);
      }
      M.play(scene.song, { bgm: true, fadeOut: 0.6, fadeIn: cur && cur.bgm ? 0.4 : 0 });
      return;
    }
    stopSceneMusic(0.6);
    if (A.bgmTimer && !force && A.oldBgm === name) return;
    if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; }
    A.oldBgm = name;
    const B = BGM[name];
    if (!B) return;
    A.step = 0;
    A.nextTime = A.ctx.currentTime + 0.1;
    A.bgmTimer = setInterval(() => {
      if (!A.enabled || A.ctx.state !== 'running') { A.nextTime = A.ctx.currentTime + 0.1; return; }
      while (A.nextTime < A.ctx.currentTime + 0.3) {
        const i = A.step % B.mel.length;
        const n = B.mel[i];
        if (n >= 0) tone(B.scale[n] * 2, A.nextTime, B.tempo * 0.9, 'triangle', 0.025, null, A.musicBus);
        if (i % 4 === 0) tone(B.bass[(i / 4) % B.bass.length], A.nextTime, B.tempo * 3, 'sine', 0.035, null, A.musicBus);
        A.nextTime += B.tempo;
        A.step++;
      }
    }, 100);
  };

  TS.Audio = A;
})(globalThis.TS = globalThis.TS || {});
