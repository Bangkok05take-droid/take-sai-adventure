/* 音楽（試作）：曲のデータ（どの曲か）と再生（どう鳴らすか）を分けている。
 *  - TS.Music.LIBRARY：曲の一覧。kind 'synth' は下の楽譜を WebAudio で合成する。後で録音した音源に替えるときは
 *    file: 'assets/music/○○.ogg'（＋ loopStart/loopEnd 秒）を書けば、同じ play() でファイルを再生する。
 *  - 再生：先読みスケジューラ（0.1秒ごとに0.6秒先までの音を予約）。テンポは曲の BPM と AudioContext の時計だけで決まり、
 *    ゲームの速さ（ダッシュ・高速足踏み）とは関係しない。一度に鳴る曲は1つだけ（再生のたびに前の曲を短くフェードして止める）。
 *  - 音の出口：TS.Audio.musicBus（BGM音量）→ master（音のオン/オフ）。効果音は sfxBus。
 * 楽器はすべてプログラムで作った近似（ホルン・金管・弦・木管・ティンパニ・小太鼓「風」）。本物の楽器の質感までは出ない。 */
(function (TS) {
  'use strict';
  const M = { current: null };

  // ---------- 音名 → 周波数 ----------
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* 旋律の書き方："C4:1 F4:1.5 r:.5"（音名:拍数、r は休み）。start は開始の拍。返り値は [拍, 長さ, midi] の並び */
  function seq(start, text) {
    const out = []; let b = start;
    for (const tok of text.trim().split(/\s+/)) {
      const [n, d] = tok.split(':'); const len = parseFloat(d);
      if (n !== 'r') out.push([b, len, midi(n)]);
      b += len;
    }
    return out;
  }
  // 和音：[拍, 長さ, ['F3','A3','C4']]
  const chord = (b, len, names) => names.map((n) => [b, len, midi(n)]);

  // ---------- 楽器（すべて「風」の近似）。(ctx, 出口, 開始秒, 長さ秒, midi, 強さ) ----------
  function env(g, t, a, peak, dur, rel, sus) {
    // 発音と消え際を滑らかに（クリックノイズを防ぐ）。0 から立ち上がり、0 へ戻る
    const s = peak * (sus == null ? 0.8 : sus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(s, t + a + Math.min(0.15, dur * 0.3));
    const end = t + Math.max(dur, a + 0.02);
    g.gain.setValueAtTime(s, end);
    g.gain.linearRampToValueAtTime(0, end + rel);
    return end + rel;
  }
  function vibrato(ctx, osc, t, dur, rate, cents) {
    if (dur < 0.5) return null;
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(cents, t + Math.min(0.6, dur * 0.6));
    l.connect(lg); for (const o of osc) lg.connect(o.detune);
    l.start(t); l.stop(t + dur + 0.6);
    return l;
  }
  function oscs(ctx, types, f, detunes, t, stop) {
    return types.map((ty, i) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = detunes[i] || 0; o.start(t); o.stop(stop); return o; });
  }
  const INST = {
    // ホルン風：やわらかい立ち上がり、こもった倍音（のこぎり波＋三角波を低めのフィルター）
    horn(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(Math.min(1500, f * 4), t + 0.12); lp.frequency.linearRampToValueAtTime(Math.min(1150, f * 3.2), t + 0.5);
      const end = env(g, t, 0.07, v * 0.24, dur, rel || 0.28, 0.85);
      const os = oscs(ctx, ['sawtooth', 'triangle'], f, [-3, 3], t, end + 0.05);
      os[0].connect(lp); const tg = ctx.createGain(); tg.gain.value = 0.9; os[1].connect(tg); tg.connect(lp);
      lp.connect(g); g.connect(out);
      vibrato(ctx, os, t + 0.3, dur, 5, 6);
      return end;
    },
    // 金管（トランペット）風：明るい立ち上がり（フィルターが開く）。高すぎる倍音は切る
    brass(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 1.0;
      lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(Math.min(3200, f * 6), t + 0.05); lp.frequency.linearRampToValueAtTime(Math.min(2300, f * 4.2), t + 0.3);
      const end = env(g, t, 0.025, v * 0.24, dur, rel || 0.16, 0.75);
      const os = oscs(ctx, ['sawtooth', 'sawtooth'], f, [-5, 5], t, end + 0.05);
      for (const o of os) o.connect(lp);
      lp.connect(g); g.connect(out);
      vibrato(ctx, os, t + 0.35, dur, 5.5, 7);
      return end;
    },
    // 低い金管（ホルン・トロンボーンの和音）風
    brassLow(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.08); lp.frequency.linearRampToValueAtTime(950, t + 0.4);
      const end = env(g, t, 0.04, v * 0.1, dur, rel || 0.25, 0.8);
      const os = oscs(ctx, ['sawtooth'], f, [0], t, end + 0.05);
      os[0].connect(lp); lp.connect(g); g.connect(out);
      return end;
    },
    // 弦楽器（合奏）風：ゆっくり立ち上がる2本のずれたのこぎり波
    strings(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain();
      const end = env(g, t, Math.min(0.35, dur * 0.4), v * 0.055, dur, 0.45, 0.95);
      const os = oscs(ctx, ['sawtooth', 'sawtooth'], f, [-8, 8], t, end + 0.05);
      for (const o of os) o.connect(g);
      g.connect(section(ctx, out, 'strings', 1700));   // 2本のずれ（コーラス）で揺れを出す。弦はビブラートなし・フィルターは共有（スマホで軽く）
      return end;
    },
    // 弦の刻み（短め）
    stringsPulse(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain();
      const end = env(g, t, 0.06, v * 0.06, dur * 0.7, 0.18, 0.7);
      const os = oscs(ctx, ['sawtooth'], f, [0], t, end + 0.05);
      os[0].connect(g);
      g.connect(section(ctx, out, 'pulse', 1500));
      return end;
    },
    // 木管（フルート寄り）風：三角波＋息の揺れ
    wood(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
      const end = env(g, t, 0.06, v * 0.13, dur, 0.22, 0.85);
      const os = oscs(ctx, ['triangle', 'sine'], f, [0, 2], t, end + 0.05);
      os[0].connect(lp); const sg = ctx.createGain(); sg.gain.value = 0.5; os[1].connect(sg); sg.connect(lp);
      lp.connect(g); g.connect(out);
      vibrato(ctx, os, t + 0.2, dur, 5.2, 9);
      return end;
    },
    // 低音：三角波（倍音があるのでスマホでも輪郭が少し聞こえる）＋サイン波
    bass(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      const end = env(g, t, 0.02, v * 0.17, dur * 0.9, rel || 0.15, 0.75);
      const os = oscs(ctx, ['triangle', 'sine'], f, [0, 0], t, end + 0.05);
      os[0].connect(lp); os[1].connect(lp); lp.connect(g); g.connect(out);
      return end;
    },
    // ティンパニ風：音程のある胴鳴り（少し下がる）＋ばちの当たる音
    timpani(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), len = Math.min(1.6, 0.5 + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.4, t + 0.006); g.gain.exponentialRampToValueAtTime(v * 0.12, t + len * 0.45); g.gain.linearRampToValueAtTime(0, t + len);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.5; const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
      o.start(t); o.stop(t + len + 0.02); o2.start(t); o2.stop(t + len + 0.02);
      noiseHit(ctx, out, t, 0.06, v * 0.18, 'lowpass', 900);
      return t + len;
    },
    // 小太鼓風：帯域を絞ったノイズ＋短い胴鳴り（控えめ）
    snare(ctx, out, t, dur, n, v) {
      noiseHit(ctx, out, t, 0.14, v * 0.16, 'bandpass', 2200);
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 190;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.08, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08); g.gain.linearRampToValueAtTime(0, t + 0.09);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.1);
      return t + 0.15;
    },
  };
  // 合奏パートの共有フィルター（出口ごとに1つ。音ごとにフィルターを作らないので軽い）
  const sections = new WeakMap();
  function section(ctx, out, name, freq) {
    let m = sections.get(out);
    if (!m) { m = {}; sections.set(out, m); }
    if (!m[name]) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = freq; lp.connect(out); m[name] = lp; }
    return m[name];
  }
  const noiseBufs = new WeakMap();
  function noiseBuf(ctx) {
    let b = noiseBufs.get(ctx);
    if (!b) { b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noiseBufs.set(ctx, b); }
    return b;
  }
  function noiseHit(ctx, out, t, len, vol, type, freq) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf(ctx); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(vol * 0.02, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.01);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + len + 0.02);
  }

  // ---------- 曲 ----------
  /* 1．冒険のファンファーレ（BPM112・4拍子・約11秒・ループしない）。変ロ長調（下の楽譜はハ長調で書き、全体を2半音下げる）。
   * 上昇する分散和音 → 覚えやすい主題（2小節）→ 終止。主旋律は金管風、和音は低い金管風、低音＋ティンパニ風で支える。 */
  function fanfare() {
    const tr = -2, ev = [];
    const add = (inst, list, vel) => { for (const [b, len, n] of list) ev.push({ b, len, n: n + tr, inst, v: vel }); };
    add('brass', seq(0, 'G4:.5 C5:.5 E5:.5 G5:2.5 ' +
      'C5:.75 G4:.25 C5:.5 D5:.5 E5:1 D5:.5 C5:.5 ' +
      'D5:.75 A4:.25 D5:.5 E5:.5 F5:1.5 E5:.5 ' +
      'G5:1 E5:.5 C5:.5 F5:.75 E5:.25 D5:.5 B4:.5 ' +
      'C5:3'), 1);
    add('brass', seq(4, 'E4:.75 E4:.25 E4:.5 F4:.5 G4:1 F4:.5 E4:.5 ' +
      'F4:.75 F4:.25 F4:.5 G4:.5 A4:1.5 G4:.5 ' +
      'E5:1 C5:.5 G4:.5 D5:.75 C5:.25 B4:.5 G4:.5 ' +
      'E4:3'), 0.6);
    const ch = (b, len, names, v) => add('brassLow', chord(b, len, names), v);
    ch(0, 4, ['C3', 'G3'], 0.8);
    ch(4, 2, ['C3', 'E3', 'G3'], 1); ch(6, 2, ['E3', 'G3', 'C4'], 1);
    ch(8, 2, ['D3', 'F3', 'A3'], 1); ch(10, 2, ['F3', 'A3', 'C4'], 1);
    ch(12, 2, ['E3', 'G3', 'C4'], 1); ch(14, 2, ['F3', 'B3', 'D4'], 1);
    ch(16, 3, ['C3', 'E3', 'G3', 'C4'], 1.1);
    add('bass', seq(0, 'C2:4 C2:2 E2:2 D2:2 F2:2 C2:2 G1:2 C2:3'), 1);
    const tp = (b, note, v) => ev.push({ b, len: 0.5, n: midi(note) + tr, inst: 'timpani', v });
    tp(0, 'C2', 0.9);
    for (let i = 0; i < 8; i++) tp(2 + i * 0.25, 'C2', 0.25 + i * 0.06);   // 主題へ向かうロール（だんだん強く）
    tp(4, 'C2', 1); tp(6, 'G1', 0.7); tp(10, 'C2', 0.7);
    tp(12, 'C2', 0.8); tp(14, 'G1', 0.7); tp(15, 'G1', 0.6); tp(15.5, 'G1', 0.75);
    tp(16, 'C2', 1);
    for (let i = 1; i < 7; i++) tp(16 + i * 0.25, 'C2', 0.45 - i * 0.05);   // 着地のあと静まるロール
    for (const e of ev) if (e.b >= 16 && e.inst !== 'timpani') e.rel = 1.3;   // 最後の和音はゆっくり消える
    return { bpm: 112, beats: 19, tail: 1.8, loop: false, events: ev };
  }

  /* 2．マスターヤナイのテーマ（BPM88・4拍子・1周約76秒）。ヘ長調。
   * 導入（4小節）→ 主題A（8）→ 展開B（8：ニ短調から希望へ）→ 主題Aの再提示（6）→ ループへの接続（2）。
   * ループ：17拍目（主題Aの頭）〜112拍目を繰り返す。接続の2小節は導入の後半と同じ形なので、自然に主題Aへ戻る。
   * ヤナイのモチーフ（主題Aの最初の2小節）：C4 F4 G4 A4 | A4 G4 F4 D4（音階の 5-1-2-3 | 3-2-1-6）。最終決戦で力強く編曲する予定。 */
  const YANAI_MOTIF = 'C4:1 F4:1.5 G4:.5 A4:1 A4:.5 G4:.5 F4:1 D4:2';
  function yanai() {
    const ev = [];
    const add = (inst, list, vel) => { for (const [b, len, n] of list) ev.push({ b, len, n, inst, v: vel }); };
    const V = {
      F: ['F3', 'A3', 'C4', 'F4'], BbF: ['F3', 'Bb3', 'D4', 'F4'], Dm: ['D3', 'A3', 'D4', 'F4'], Bb: ['F3', 'Bb3', 'D4', 'F4'],
      C: ['E3', 'G3', 'C4', 'E4'], C7: ['E3', 'Bb3', 'C4', 'G4'], Am: ['E3', 'A3', 'C4', 'E4'], Gm: ['G3', 'Bb3', 'D4', 'G4'],
      Gm7: ['F3', 'Bb3', 'D4', 'G4'], A7: ['E3', 'G3', 'C#4', 'A4'], FA: ['A3', 'C4', 'F4', 'A4'], Csus: ['F3', 'G3', 'C4', 'F4'],
    };
    const ROOT = { F: 'F2', BbF: 'F2', Dm: 'D2', Bb: 'Bb1', C: 'C2', C7: 'C2', Am: 'A1', Gm: 'G1', Gm7: 'G1', A7: 'A1', FA: 'A1', Csus: 'C2' };
    // 和音の進行：[拍, 長さ, 和音]
    const prog = [];
    const bar = (b, ...cs) => { const len = 4 / cs.length; cs.forEach((c, i) => prog.push([b + i * len, len, c])); };
    // 導入
    bar(0, 'F'); bar(4, 'BbF'); bar(8, 'Dm'); bar(12, 'C7');
    // 主題A
    bar(16, 'F'); bar(20, 'Dm'); bar(24, 'Bb'); bar(28, 'C'); bar(32, 'F'); bar(36, 'Am', 'Dm'); bar(40, 'Gm', 'C7'); bar(44, 'F');
    // 展開B
    bar(48, 'Dm'); bar(52, 'Bb'); bar(56, 'Gm'); bar(60, 'A7'); bar(64, 'Bb'); bar(68, 'FA'); bar(72, 'Gm7'); bar(76, 'Csus', 'C7');
    // 主題Aの再提示
    bar(80, 'F'); bar(84, 'Dm'); bar(88, 'Bb'); bar(92, 'C'); bar(96, 'Bb', 'C7'); bar(100, 'F');
    // ループへの接続
    bar(104, 'Dm'); bar(108, 'Bb', 'C7');
    for (const [b, len, c] of prog) {
      const sec = b < 16 ? 'intro' : b < 48 ? 'A' : b < 80 ? 'B' : b < 104 ? 'A2' : 'link';
      // 弦：Bの前半は4分音符の刻み、ほかは持続（再提示は少し厚く）
      if (sec === 'B' && b < 64) for (let k = 0; k < len; k++) add('stringsPulse', chord(b + k, 1, V[c]), k === 0 ? 1.1 : 0.85);
      else add('strings', chord(b, len, V[c]), sec === 'A2' ? 1.15 : sec === 'B' ? 1.1 : sec === 'intro' ? 0.85 : 1);
      // 低音：小節の頭と3拍目（導入・接続は持続）
      const r = midi(ROOT[c]);
      if (sec === 'intro' || sec === 'link' || len < 4) ev.push({ b, len, n: r, inst: 'bass', v: 0.8 });
      else { ev.push({ b, len: 2, n: r, inst: 'bass', v: 0.9 }); ev.push({ b: b + 2, len: 2, n: c === 'F' || c === 'FA' ? midi('C2') : r + (r < midi('C2') ? 7 : -5), inst: 'bass', v: 0.75 }); }
    }
    // ホルン（主旋律）
    add('horn', seq(16, YANAI_MOTIF + ' F4:1 Bb4:1.5 A4:.5 G4:1 G4:.5 F4:.5 E4:1 C4:2 ' +
      'C4:1 F4:1.5 G4:.5 A4:1 C5:1.5 A4:.5 D5:1 C5:1 Bb4:1 A4:.5 G4:.5 E4:1 G4:1 F4:3.5 r:.5'), 1);
    add('horn', seq(48, 'A4:1.5 F4:.5 D4:1 F4:1 F4:1.5 D4:.5 Bb3:2 D4:1 G4:1.5 A4:.5 Bb4:1 A4:1 G4:.5 F4:.5 E4:2 ' +
      'F4:1 Bb4:1 C5:1 D5:1 C5:1.5 A4:.5 F4:1 A4:1 Bb4:1 D5:1 F5:2 E5:1.5 D5:.5 C5:2'), 1.05);
    add('horn', seq(80, YANAI_MOTIF + ' F4:1 Bb4:1.5 A4:.5 G4:1 G4:1 A4:.5 Bb4:.5 C5:2 D5:1.5 C5:.5 Bb4:1 G4:1 A4:3.5 r:.5'), 1.1);
    // 木管：導入と接続でモチーフをほのめかし、主題・展開で温かい合いの手
    const hint = (b) => add('wood', seq(b, 'C5:1 F5:1.5 G5:.5 A5:1 G5:1.5 E5:.5 C5:2'), 0.8);
    hint(8); hint(104);
    add('wood', seq(28, 'r:2 E5:.5 F5:.5 G5:1'), 0.7);
    add('wood', seq(44, 'r:1 A4:.5 C5:.5 F5:2'), 0.7);
    add('wood', seq(64, 'D5:2 F5:2 E5:2 C5:2 D5:1 G5:1 A5:2 G5:1.5 F5:.5 E5:2'), 0.75);
    add('wood', seq(80, 'F5:2 E5:2 D5:2 F5:2 D5:2 C5:2 E5:2 G5:2 F5:2 E5:2 F5:4'), 0.6);
    // 小太鼓：展開Bと再提示だけ、控えめな行進の刻み。接続の最後に小さなロール
    const sn = (b, v) => ev.push({ b, len: 0.25, n: 0, inst: 'snare', v });
    for (let b = 48; b < 104; b += 4) { const w = b >= 80 ? 1.1 : 1; sn(b, 0.35 * w); sn(b + 2, 0.5 * w); sn(b + 3, 0.25 * w); sn(b + 3.5, 0.3 * w); }
    for (let i = 0; i < 8; i++) sn(110 + i * 0.25, 0.12 + i * 0.03);
    sn(14 + 1.5, 0.15); sn(14 + 1.75, 0.2);
    return { bpm: 88, beats: 112, tail: 1.2, loop: true, loopStart: 16, loopEnd: 112, events: ev, motif: YANAI_MOTIF };
  }

  // 曲の一覧（選ぶ処理）。file を書けば録音した音源で同じように再生する
  M.LIBRARY = {
    fanfare: { title: '冒険のファンファーレ', note: '冒険の始まり（約11秒・ループなし）', build: fanfare },
    yanai: { title: 'マスターヤナイのテーマ', note: '師匠のテーマ（1周約76秒・主題Aからループ）', build: yanai },
  };
  const cache = {};
  M.song = function (id) {
    const L = M.LIBRARY[id];
    if (!L) return null;
    if (!cache[id]) {
      const s = L.build();
      s.events.sort((a, b) => a.b - b.b);
      s.spb = 60 / s.bpm;
      s.length = s.beats * s.spb;
      cache[id] = s;
    }
    return cache[id];
  };
  M.info = function (id) {
    const s = M.song(id); if (!s) return null;
    return { title: M.LIBRARY[id].title, bpm: s.bpm, seconds: s.length, tail: s.tail, loop: s.loop,
      loopStartSec: s.loop ? s.loopStart * s.spb : null, loopEndSec: s.loop ? s.loopEnd * s.spb : null, notes: s.events.length };
  };

  // 1つの音を鳴らす
  function play1(ctx, out, e, t, spb) { const f = INST[e.inst]; if (f) f(ctx, out, t, e.len * spb * 0.98, e.n, e.v, e.rel); }

  /* ---------- 再生（リアルタイム） ----------
   * opts.fromBeat：途中から（ループのつなぎ目の確認用）。onEnd：最後まで鳴り終わったとき */
  M.play = function (id, opts) {
    const A = TS.Audio;
    opts = opts || {};
    M.stop(0.12);
    if (!A.ctx || !A.musicBus) return null;
    const L = M.LIBRARY[id];
    if (L && L.file) return playFile(id, L, opts);
    const s = M.song(id); if (!s) return null;
    const ctx = A.ctx, out = ctx.createGain();
    out.gain.value = 1; out.connect(A.musicBus);
    const from = opts.fromBeat || 0;
    const pb = { id, song: s, out, t0: ctx.currentTime + 0.08 - from * s.spb, idx: s.events.findIndex((e) => e.b >= from), offset: 0, loops: 0, done: false, onEnd: opts.onEnd };
    if (pb.idx < 0) pb.idx = s.events.length;
    pb.timer = setInterval(() => tick(pb), 100);
    M.current = pb;
    tick(pb);
    return pb;
  };
  function tick(pb) {
    const A = TS.Audio, ctx = A.ctx, s = pb.song;
    if (M.current !== pb || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.6;
    for (;;) {
      if (pb.idx >= s.events.length) {
        if (s.loop) { pb.offset += s.loopEnd - s.loopStart; pb.loops++; pb.idx = s.events.findIndex((e) => e.b >= s.loopStart); continue; }
        if (!pb.done) {
          pb.done = true;
          const endAt = pb.t0 + s.length + s.tail;
          pb.endTimer = setTimeout(() => { if (M.current === pb) { M.stop(0.05); if (pb.onEnd) pb.onEnd(); } }, Math.max(0, (endAt - ctx.currentTime) * 1000) + 50);
        }
        return;
      }
      const e = s.events[pb.idx], t = pb.t0 + (e.b + pb.offset) * s.spb;
      if (t > horizon) return;
      if (t >= ctx.currentTime - 0.02) play1(ctx, pb.out, e, Math.max(t, ctx.currentTime), s.spb);
      pb.idx++;
    }
  }
  // 録音した音源ファイルの再生（差し替え用。loopStart/loopEnd は秒）
  function playFile(id, L, opts) {
    const A = TS.Audio, ctx = A.ctx, out = ctx.createGain();
    out.connect(A.musicBus);
    const pb = { id, out, file: true, done: false, onEnd: opts.onEnd, t0: ctx.currentTime };
    M.current = pb;
    fetch(L.file).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
      if (M.current !== pb) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      if (L.loop) { src.loop = true; src.loopStart = L.loopStart || 0; src.loopEnd = L.loopEnd || buf.duration; }
      src.connect(out); src.start(); pb.src = src; pb.t0 = ctx.currentTime;
      src.onended = () => { if (M.current === pb) { M.current = null; if (pb.onEnd) pb.onEnd(); } };
    }).catch(() => { if (M.current === pb) M.current = null; });
    return pb;
  }
  // 止める：短くフェードしてから切る（ブツッという音を防ぐ）
  M.stop = function (fade) {
    const pb = M.current;
    if (!pb) return;
    M.current = null;
    clearInterval(pb.timer); clearTimeout(pb.endTimer);
    const ctx = TS.Audio.ctx, f = fade == null ? 0.15 : fade;
    if (!ctx) return;
    try {
      pb.out.gain.cancelScheduledValues(ctx.currentTime);
      pb.out.gain.setValueAtTime(pb.out.gain.value, ctx.currentTime);
      pb.out.gain.linearRampToValueAtTime(0, ctx.currentTime + f);
    } catch (e) { /* ignore */ }
    setTimeout(() => { try { if (pb.src) pb.src.stop(); pb.out.disconnect(); } catch (e) { /* ignore */ } }, (f + 0.7) * 1000);
  };
  // 今の再生位置（表示用）
  M.status = function () {
    const pb = M.current, A = TS.Audio;
    if (!pb || !A.ctx) return null;
    if (pb.file) return { id: pb.id, sec: Math.max(0, A.ctx.currentTime - pb.t0), loops: 0 };
    const s = pb.song;
    let beat = (A.ctx.currentTime - pb.t0) / s.spb, loops = 0;
    if (s.loop) while (beat >= s.loopEnd) { beat -= s.loopEnd - s.loopStart; loops++; }
    return { id: pb.id, sec: Math.max(0, beat * s.spb), loops, total: s.length, loop: s.loop };
  };

  /* ---------- 書き出し（確認用）：OfflineAudioContext で曲を描き、AudioBuffer を返す ----------
   * loops：ループする曲を何周ぶん描くか（1なら1周目の終わりまで。つなぎ目の確認は 2 以上） */
  M.render = function (id, loops, sampleRate) {
    const s = M.song(id), sr = sampleRate || 44100;
    const n = s.loop ? Math.max(1, loops || 1) : 1;
    const beatsTotal = s.loop ? s.loopEnd + (n - 1) * (s.loopEnd - s.loopStart) : s.beats;
    const secs = beatsTotal * s.spb + s.tail + 0.3;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(1, Math.ceil(secs * sr), sr);
    const bus = makeMusicChain(ctx); bus.output.connect(ctx.destination);
    const t0 = 0.05;
    for (let k = 0; k < n; k++) {
      const off = k === 0 ? 0 : s.loopEnd + (k - 1) * (s.loopEnd - s.loopStart) - s.loopStart;
      for (const e of s.events) { if (k > 0 && e.b < s.loopStart) continue; play1(ctx, bus.input, e, t0 + (e.b + off) * s.spb, s.spb); }
    }
    return ctx.startRendering();
  };
  /* 音楽の出口の音作り：軽いコンプレッサーで音割れを防ぐ（リアルタイムでも同じものを使う） */
  function makeMusicChain(ctx) {
    const input = ctx.createGain(), comp = ctx.createDynamicsCompressor(), output = ctx.createGain();
    input.gain.value = 0.62;
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    output.gain.value = 1;
    input.connect(comp); comp.connect(output);
    return { input, output };
  }
  M.makeMusicChain = makeMusicChain;

  TS.Music = M;
})(globalThis.TS = globalThis.TS || {});
