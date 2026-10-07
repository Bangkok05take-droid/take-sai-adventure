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
    // ======== 第2版の楽器（ここから下。第1版の曲は上の楽器のまま） ========
    // 金管アンサンブル風（トランペット＋ホルン群）：3本のずれたのこぎり波、出だしにわずかな音程のしゃくり、強さに応じて開くフィルター
    brassEns(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 1.1;
      const open = Math.min(4200, f * (4.5 + 3 * v)), body = Math.min(2600, f * 4.2);
      lp.frequency.setValueAtTime(f * 1.4, t); lp.frequency.linearRampToValueAtTime(open, t + 0.045); lp.frequency.linearRampToValueAtTime(body, t + 0.35);
      const end = env(g, t, 0.022, v * 0.19, dur, rel || 0.2, 0.78);
      const os = oscs(ctx, ['sawtooth', 'sawtooth'], f, [-7, 7], t, end + 0.05);
      for (const o of os) { o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); o.connect(lp); }
      lp.connect(g); g.connect(out);
      if (v >= 0.9) vibrato(ctx, os, t + 0.4, dur, 5.4, 8);   // ビブラートは主旋律だけ（軽くするため）
      return end;
    },
    // ホルン群風：丸く暖かい（和音・合いの手）
    hornEns(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(Math.min(1700, f * 3.6), t + 0.08); lp.frequency.linearRampToValueAtTime(Math.min(1200, f * 2.8), t + 0.5);
      const end = env(g, t, 0.05, v * 0.14, dur, rel || 0.3, 0.85);
      const os = oscs(ctx, ['sawtooth', 'triangle'], f, [-5, 5], t, end + 0.05);
      for (const o of os) o.connect(lp);
      lp.connect(g); g.connect(out);
      return end;
    },
    // 低い金管（トロンボーン・チューバ）風：アクセントで少し明るく開く
    lowBrass(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.9;
      lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(Math.min(1500, f * (6 + 4 * v)), t + 0.05); lp.frequency.linearRampToValueAtTime(Math.min(900, f * 5), t + 0.45);
      const end = env(g, t, 0.03, v * 0.17, dur, rel || 0.25, 0.75);
      const os = oscs(ctx, ['sawtooth'], f, [0], t, end + 0.05);
      for (const o of os) o.connect(lp);
      lp.connect(g); g.connect(out);
      return end;
    },
    // 弦楽合奏風：3本のずれたのこぎり波（共有フィルター）。att で立ち上がりを変える
    stringsEns(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain();
      const end = env(g, t, Math.min(0.3, dur * 0.35), v * 0.05, dur, rel || 0.5, 0.95);
      const os = oscs(ctx, ['sawtooth', 'sawtooth'], f, [-10, 10], t, end + 0.05);
      for (const o of os) o.connect(g);
      g.connect(section(ctx, out, 'ens', 2400));
      return end;
    },
    // 弦の短い刻み（スピッカート風）
    strStac(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), len = Math.min(dur, 0.22);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.09, t + 0.012); g.gain.exponentialRampToValueAtTime(v * 0.015, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.04);
      const os = oscs(ctx, ['sawtooth'], f, [0], t, t + len + 0.06);
      os[0].connect(g);
      g.connect(section(ctx, out, 'stac', 2000));
      return t + len + 0.05;
    },
    // ピチカート風（はじく弦）
    pizz(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), len = 0.45;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(v * 0.004, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.02);
      const os = oscs(ctx, ['sawtooth'], f, [0], t, t + len + 0.05);
      os[0].connect(g);
      g.connect(section(ctx, out, 'pizz', 1300));
      return t + len;
    },
    // 低弦（チェロ・コントラバス）風：ゆっくり立ち上がり、揺れる
    cello(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.8; lp.frequency.value = Math.min(1000, f * 6);
      const end = env(g, t, Math.min(0.4, dur * 0.4), v * 0.09, dur, rel || 0.6, 0.9);
      const os = oscs(ctx, ['sawtooth', 'sawtooth'], f, [-6, 6], t, end + 0.05);
      for (const o of os) o.connect(lp);
      lp.connect(g); g.connect(out);
      vibrato(ctx, os, t + 0.45, dur, 4.4, 7);
      return end;
    },
    // 笛（フルート・リコーダー）風：やわらかい基音＋少しの息の音
    flute(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.3;
      const end = env(g, t, 0.045, v * 0.16, dur, rel || 0.12, 0.85);
      const os = oscs(ctx, ['sine', 'triangle'], f, [0, 3], t, end + 0.05);
      os[0].connect(lp); const tg = ctx.createGain(); tg.gain.value = 0.35; os[1].connect(tg); tg.connect(lp);
      lp.connect(g); g.connect(out);
      noiseHit(ctx, out, t, 0.07, v * 0.025, 'bandpass', Math.min(5000, f * 3));   // 吹き始めの息
      vibrato(ctx, os, t + 0.22, dur, 5.3, 10);
      return end;
    },
    // リード（クラリネット・オーボエ）風：奇数倍音の多いこもった音
    reed(ctx, out, t, dur, n, v, rel) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = Math.min(1800, f * 3.2);
      const end = env(g, t, 0.06, v * 0.08, dur, rel || 0.2, 0.85);
      const os = oscs(ctx, ['square', 'sine'], f, [0, 0], t, end + 0.05);
      os[0].connect(lp); const sg = ctx.createGain(); sg.gain.value = 0.8; os[1].connect(sg); sg.connect(lp);
      lp.connect(g); g.connect(out);
      vibrato(ctx, os, t + 0.3, dur, 4.8, 6);
      return end;
    },
    // 木琴（ラナート風）：基音＋4倍の倍音、すぐ減衰
    marimba(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), g2 = ctx.createGain(), len = Math.max(0.25, Math.min(0.8, 220 / f));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.2, t + 0.003); g.gain.exponentialRampToValueAtTime(v * 0.002, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.02);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(v * 0.05, t + 0.002); g2.gain.exponentialRampToValueAtTime(0.0003, t + len * 0.3); g2.gain.linearRampToValueAtTime(0, t + len * 0.3 + 0.02);
      const os = oscs(ctx, ['sine', 'sine'], f, [0, 0], t, t + len + 0.05); os[1].frequency.value = f * 4;
      os[0].connect(g); os[1].connect(g2); g.connect(out); g2.connect(out);
      return t + len;
    },
    // 小さな鐘風：少しずれた倍音（控えめ）
    bell(ctx, out, t, dur, n, v) {
      const f = hz(n), len = 1.4;
      [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.07 * a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0002, t + len / m); g.gain.linearRampToValueAtTime(0, t + len / m + 0.02);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + len / m + 0.05);
      });
      return t + len;
    },
    // 弾む低音（ベース）：はじいて少し残る
    pluckBass(ctx, out, t, dur, n, v) {
      const f = hz(n), g = ctx.createGain(), lp = ctx.createBiquadFilter(), len = Math.min(dur, 0.5);
      lp.type = 'lowpass'; lp.Q.value = 1; lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.24, t + 0.006); g.gain.exponentialRampToValueAtTime(v * 0.08, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.06);
      const os = oscs(ctx, ['triangle', 'sawtooth'], f, [0, 0], t, t + len + 0.1);
      const sg = ctx.createGain(); sg.gain.value = 0.35; os[0].connect(lp); os[1].connect(sg); sg.connect(lp);
      lp.connect(g); g.connect(out);
      return t + len;
    },
    // 太鼓（低い手持ちの太鼓）風
    kick(ctx, out, t, dur, n, v) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.42, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.34);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.36);
      noiseHit(ctx, out, t, 0.03, v * 0.08, 'lowpass', 1400);   // 皮を打つ音（スマホでも聞こえる）
      return t + 0.34;
    },
    // タンバリン風（小さく、高すぎない帯域）
    tamb(ctx, out, t, dur, n, v) { noiseHit(ctx, out, t, 0.09, v * 0.05, 'bandpass', 5200); return t + 0.1; },
    // 木の拍子木（ウッドブロック）風
    wblock(ctx, out, t, dur, n, v) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = n ? hz(n) : 880;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.11, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.07); g.gain.linearRampToValueAtTime(0, t + 0.08);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.09);
      return t + 0.08;
    },
    // チン（タイの小さなシンバル）風：澄んだ短い金属音（ごく控えめ）
    ching(ctx, out, t, dur, n, v) {
      [[2350, 1], [3480, 0.5]].forEach(([fr, a]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fr;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.025 * a, t + 0.002); g.gain.exponentialRampToValueAtTime(0.00005, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.31);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
      });
      return t + 0.3;
    },
    // シンバル風（やわらかい。高域は抑える）。dur が長いと「わき上がる」
    cymbal(ctx, out, t, dur, n, v) {
      const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), swell = dur > 0.5;
      s.buffer = noiseBuf(ctx); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 2500; lp.type = 'lowpass'; lp.frequency.value = 7000;
      const peak = v * 0.05, len = 2.2;
      g.gain.setValueAtTime(0, t);
      if (swell) { g.gain.linearRampToValueAtTime(peak, t + dur); g.gain.exponentialRampToValueAtTime(0.0003, t + dur + 0.6); g.gain.linearRampToValueAtTime(0, t + dur + 0.62); }
      else { g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0003, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.02); }
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); s.start(t); s.stop(t + (swell ? dur + 0.65 : len + 0.05));
      return t + len;
    },
    // 小太鼓（やわらかめ）
    snare2(ctx, out, t, dur, n, v) {
      noiseHit(ctx, out, t, 0.12, v * 0.13, 'bandpass', 1800);
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 210;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.07, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07); g.gain.linearRampToValueAtTime(0, t + 0.08);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.09);
      return t + 0.13;
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
  function fanfareV1() {
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
  const YANAI_MOTIF_V1 = 'C4:1 F4:1.5 G4:.5 A4:1 A4:.5 G4:.5 F4:1 D4:2';   // 第1版（ヘ長調）
  function yanaiV1() {
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
    add('horn', seq(16, YANAI_MOTIF_V1 + ' F4:1 Bb4:1.5 A4:.5 G4:1 G4:.5 F4:.5 E4:1 C4:2 ' +
      'C4:1 F4:1.5 G4:.5 A4:1 C5:1.5 A4:.5 D5:1 C5:1 Bb4:1 A4:.5 G4:.5 E4:1 G4:1 F4:3.5 r:.5'), 1);
    add('horn', seq(48, 'A4:1.5 F4:.5 D4:1 F4:1 F4:1.5 D4:.5 Bb3:2 D4:1 G4:1.5 A4:.5 Bb4:1 A4:1 G4:.5 F4:.5 E4:2 ' +
      'F4:1 Bb4:1 C5:1 D5:1 C5:1.5 A4:.5 F4:1 A4:1 Bb4:1 D5:1 F5:2 E5:1.5 D5:.5 C5:2'), 1.05);
    add('horn', seq(80, YANAI_MOTIF_V1 + ' F4:1 Bb4:1.5 A4:.5 G4:1 G4:1 A4:.5 Bb4:.5 C5:2 D5:1.5 C5:.5 Bb4:1 G4:1 A4:3.5 r:.5'), 1.1);
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
    return { bpm: 88, beats: 112, tail: 1.2, loop: true, loopStart: 16, loopEnd: 112, events: ev, motif: YANAI_MOTIF_V1 };
  }


  // ======================= 第2版（2026年10月：聴いた感想をもとに作り直し・追加） =======================
  // 楽譜を書くための小さな道具。tr：全体の移調（半音）
  function score(tr) {
    const ev = [];
    const T = {
      ev,
      mel(inst, b, text, v, extra) { for (const [bb, len, n] of seq(b, text)) ev.push(Object.assign({ b: bb, len, n: n + tr, inst, v }, extra || {})); },
      chord(inst, b, len, names, v, extra) { for (const nm of names) ev.push(Object.assign({ b, len, n: midi(nm) + tr, inst, v }, extra || {})); },
      hit(inst, b, v, note, len) { ev.push({ b, len: len || 0.25, n: note ? midi(note) + tr : 0, inst, v }); },
    };
    return T;
  }

  /* 1．冒険のファンファーレ（第2版）：BPM96・4拍子・変ロ長調（ハ長調で書いて2半音下げる）・24拍＝15秒＋余韻約2.4秒。ループしない。
   * 1小節目から金管の合奏。「呼びかけ（付点と休符）→ 応答（下りて長く伸ばす）」を2回くり返し、
   * 5小節目で♭VII（変イ長調の和音）を通って、6小節目の主和音で大きく着地する。
   * 伴奏は刻まず、低い金管・弦の持続音と、和音が変わる所のティンパニ・シンバルのアクセントで支える。 */
  function fanfare2() {
    const S = score(-2);
    S.mel('brassEns', 0, 'C5:1 r:.5 G4:.5 C5:.75 E5:.25 G5:1 ' + 'A5:.75 G5:.25 F5:.5 E5:.5 D5:2 ' +
      'E5:1 r:.5 C5:.5 E5:.75 F5:.25 A5:1 ' + 'G5:.75 F5:.25 E5:.5 D5:.5 E5:.5 F5:.5 G5:1 ' + 'A5:1.5 F5:.5 Bb5:1.5 A5:.5 ' + 'C6:4', 1);
    S.mel('brassEns', 0, 'E4:1 r:.5 E4:.5 E4:.75 G4:.25 C5:1 ' + 'C5:.75 C5:.25 A4:.5 G4:.5 B4:2 ' +
      'C5:1 r:.5 A4:.5 C5:.75 C5:.25 F5:1 ' + 'E5:.75 D5:.25 C5:.5 B4:.5 C5:.5 D5:.5 D5:1 ' + 'F5:1.5 C5:.5 F5:1.5 F5:.5 ' + 'G5:4', 0.48);
    // ホルンの応答（主旋律が伸ばしている間に答える）
    S.mel('hornEns', 4, 'r:2 G4:.5 A4:.5 B4:1', 0.95);
    S.mel('hornEns', 20, 'E5:4', 0.6);
    // 低い金管：和音の変わり目でアクセント、あとは持続
    const lb = [[0, 4, ['C3', 'G3']], [4, 2, ['F2', 'C3', 'A3']], [6, 2, ['G2', 'D3', 'B3']], [8, 2, ['A2', 'E3', 'C4']], [10, 2, ['F2', 'C3', 'A3']],
      [12, 2, ['D3', 'F3', 'C4']], [14, 2, ['G2', 'D3', 'B3']], [16, 2, ['F2', 'C3', 'A3']], [18, 2, ['Bb2', 'F3', 'D4']], [20, 4, ['C3', 'G3', 'C4', 'E4']]];
    for (const [b, len, ns] of lb) S.chord('lowBrass', b, len, ns, b === 20 ? 0.95 : 0.75);
    // 弦：高めの持続音（主旋律の後ろで響きを厚く）。4小節目の後半は上へ駆け上がる
    const st = [[0, 4, ['G4', 'C5', 'E5']], [4, 2, ['A4', 'C5', 'F5']], [6, 2, ['G4', 'B4', 'D5']], [8, 2, ['A4', 'C5', 'E5']], [10, 2, ['A4', 'C5', 'F5']],
      [12, 2, ['F4', 'A4', 'D5']], [16, 2, ['A4', 'C5', 'F5']], [18, 2, ['Bb4', 'D5', 'F5']], [20, 4, ['G4', 'C5', 'E5', 'G5']]];
    for (const [b, len, ns] of st) S.chord('stringsEns', b, len, ns, 0.6);
    S.mel('strStac', 14, 'D4:.25 E4:.25 F4:.25 G4:.25 A4:.25 B4:.25 C5:.25 D5:.25', 0.9);
    S.mel('bass', 0, 'C2:4 F1:2 G1:2 A1:2 F1:2 D2:2 G1:2 F1:2 Bb1:2 C2:4', 1);
    // ティンパニ・シンバル・小太鼓：要所だけ
    S.hit('timpani', 0, 1, 'C2'); S.hit('timpani', 4, 0.8, 'F1'); S.hit('timpani', 6, 0.75, 'G1'); S.hit('timpani', 8, 0.8, 'A1');
    for (let i = 0; i < 8; i++) S.hit('timpani', 14 + i * 0.25, 0.3 + i * 0.07, 'G1');
    S.hit('timpani', 16, 1, 'F1'); S.hit('timpani', 18, 0.85, 'Bb1'); S.hit('timpani', 20, 1, 'C2');
    for (let i = 1; i < 10; i++) S.hit('timpani', 20 + i * 0.25, 0.5 - i * 0.04, 'C2');
    S.hit('timpani', 23, 0.8, 'C2');
    S.hit('cymbal', 0, 0.8); S.ev.push({ b: 18, len: 2, n: 0, inst: 'cymbal', v: 0.7 }); S.hit('cymbal', 20, 1);
    for (let i = 0; i < 8; i++) S.hit('snare2', 14 + i * 0.25, 0.15 + i * 0.05);
    for (const e of S.ev) if (e.b >= 20 && /brass|Brass|horn|strings|Ens|bass/.test(e.inst)) e.rel = 1.8;   // 最後の和音はゆっくり消える
    return { bpm: 96, beats: 24, tail: 2.4, loop: false, reverb: 0.25, events: S.ev };
  }

  /* 2．マスターヤナイのテーマ（第2版）：BPM112・4拍子・変ロ長調（ハ長調で書いて2半音下げる）・1周120拍＝約64.3秒。
   * 導入（2小節）→ 主題A（8）→ 主題A'（8）→ 短い橋B（4：少しだけ哀愁、すぐ希望へ）→ 主題A''（6：勝利）→ 接続（2＝導入と同じ）。
   * ループ：9拍目（主題Aの頭）〜120拍目。主旋律は中音域の金管合奏、ホルン群が1オクターブ下で支え、弦の8分の刻みと控えめな小太鼓で前へ進む。
   * モチーフ（最終決戦用）：主題Aの最初の2小節。第1版の頭（5-1-2-3）を付点で力強くして、5度上まで駆け上がる形に発展させた。 */
  const YANAI_MOTIF = 'G4:.75 C5:1.25 D5:.5 E5:.5 G5:1 A5:.75 G5:.25 F5:.5 E5:.5 D5:1.5';   // ハ長調で記譜（実際の音は2半音下＝変ロ長調）
  function yanai2() {
    const S = score(-2);
    const A1 = 'G4:.75 C5:1.25 D5:.5 E5:.5 G5:1 A5:.75 G5:.25 F5:.5 E5:.5 D5:1.5 r:.5 E5:.75 A4:1.25 B4:.5 C5:.5 E5:1 D5:.75 C5:.25 B4:.5 A4:.5 G4:2 ' +
      'G4:.75 C5:1.25 D5:.5 E5:.5 G5:1 A5:.75 G5:.25 F5:.5 A5:.5 G5:2 ';
    S.mel('brassEns', 8, A1 + 'F5:.75 E5:.25 D5:.5 E5:.5 F5:.5 D5:.5 B4:1 C5:3 r:1', 1);
    S.mel('brassEns', 40, A1 + 'F5:.75 E5:.25 D5:.5 C5:.5 B4:1 G4:1 G4:.75 A4:.25 B4:.5 C5:.5 D5:2', 1);
    S.mel('hornEns', 8, A1.replace(/([A-G]b?)(\d)/g, (m, nn, o) => nn + (o - 1)) + 'F4:.75 E4:.25 D4:.5 E4:.5 F4:.5 D4:.5 B3:1 C4:3 r:1', 0.55);   // 1オクターブ下で支える
    // A' はホルンが3度下で和音を作る
    S.mel('hornEns', 40, 'E4:.75 E4:1.25 B4:.5 C5:.5 E5:1 F5:.75 E5:.25 D5:.5 C5:.5 B4:1.5 r:.5 C5:.75 E4:1.25 G4:.5 A4:.5 C5:1 A4:.75 A4:.25 G4:.5 F4:.5 D4:2 ' +
      'E4:.75 E4:1.25 B4:.5 C5:.5 E5:1 F5:.75 E5:.25 C5:.5 F5:.5 E5:2 D5:.75 C5:.25 A4:.5 A4:.5 G4:1 D4:1 D4:.75 F4:.25 G4:.5 A4:.5 B4:2', 0.6);
    S.mel('hornEns', 36, 'r:2 E4:.5 F4:.5 G4:1', 0.8);   // 主題Aの終わりの応答
    // 橋B：ホルンの独奏（少しだけ哀愁）→ 上向きで希望へ
    S.mel('hornEns', 72, 'E5:1.5 D5:.5 C5:1 A4:1 B4:1.5 A4:.5 G4:2 A4:1 C5:1 F5:1.5 E5:.5 D5:3 r:1', 1.25);
    S.mel('flute', 76, 'r:2 B5:1 G5:1 r:4 r:2 D6:1 C6:1', 0.45);
    // 主題A''：勝利
    S.mel('brassEns', 88, 'G4:.75 C5:1.25 D5:.5 E5:.5 G5:1 A5:.75 G5:.25 F5:.5 E5:.5 D5:1.5 r:.5 E5:.75 C5:.25 E5:.5 F5:.5 G5:1 A5:1 ' +
      'G5:.75 A5:.25 G5:.5 F5:.5 E5:.5 D5:.5 G5:1 A5:1.5 G5:.5 F5:1 D5:1 E5:2 C5:2', 1.1);
    S.mel('brassEns', 88, 'E4:.75 E4:1.25 B4:.5 C5:.5 E5:1 F5:.75 E5:.25 D5:.5 C5:.5 B4:1.5 r:.5 C5:.75 A4:.25 C5:.5 C5:.5 E5:1 F5:1 ' +
      'D5:.75 F5:.25 D5:.5 D5:.5 B4:.5 B4:.5 D5:1 F5:1.5 E5:.5 D5:1 B4:1 C5:2 G4:2', 0.55);
    // 導入と接続（同じ形）：ホルンの短い呼びかけ
    for (const b of [0, 112]) S.mel('hornEns', b, 'G4:.75 C5:.25 E5:1 r:2 A4:.75 C5:.25 F5:1 D5:2', 0.95);
    // 和音の進行
    const prog = [];
    const bar = (b, ...cs) => { const len = 4 / cs.length; cs.forEach((c, i) => prog.push([b + i * len, len, c])); };
    const Aprog = (b, end) => { bar(b, 'C'); bar(b + 4, 'F', 'G'); bar(b + 8, 'Am', 'Em'); bar(b + 12, 'F', 'G'); bar(b + 16, 'C'); bar(b + 20, 'F', 'CE');
      if (end === 'A') { bar(b + 24, 'Dm7', 'G7'); bar(b + 28, 'C'); } else { bar(b + 24, 'Dm7', 'G'); bar(b + 28, 'G'); } };
    bar(0, 'C'); bar(4, 'F', 'G');
    Aprog(8, 'A'); Aprog(40, 'A2');
    bar(72, 'Am'); bar(76, 'Em'); bar(80, 'F', 'G'); bar(84, 'Gsus', 'G');
    bar(88, 'C'); bar(92, 'F', 'G'); bar(96, 'Am', 'F'); bar(100, 'Dm', 'G'); bar(104, 'F', 'G'); bar(108, 'C');
    bar(112, 'C'); bar(116, 'F', 'G');
    const PAD = { C: ['E4', 'G4', 'C5'], CE: ['E4', 'G4', 'C5'], F: ['F4', 'A4', 'C5'], G: ['D4', 'G4', 'B4'], Am: ['E4', 'A4', 'C5'], Em: ['E4', 'G4', 'B4'],
      Dm7: ['D4', 'F4', 'C5'], Dm: ['D4', 'F4', 'A4'], G7: ['D4', 'F4', 'B4'], Gsus: ['D4', 'G4', 'C5'] };
    const OST = { C: ['C3', 'G3', 'C4', 'G3'], CE: ['E3', 'G3', 'C4', 'G3'], F: ['F3', 'C4', 'F4', 'C4'], G: ['G3', 'D4', 'G4', 'D4'], Am: ['A3', 'E4', 'A4', 'E4'],
      Em: ['E3', 'B3', 'E4', 'B3'], Dm7: ['D3', 'A3', 'C4', 'A3'], Dm: ['D3', 'A3', 'D4', 'A3'], G7: ['G3', 'D4', 'F4', 'D4'], Gsus: ['G3', 'D4', 'C4', 'D4'] };
    const LOW = { C: ['C3', 'G3'], CE: ['E2', 'C3'], F: ['F2', 'C3'], G: ['G2', 'D3'], Am: ['A2', 'E3'], Em: ['E2', 'B2'], Dm7: ['D3', 'A3'], Dm: ['D3', 'A3'], G7: ['G2', 'F3'], Gsus: ['G2', 'D3'] };
    const ROOT = { C: 'C2', CE: 'E2', F: 'F1', G: 'G1', Am: 'A1', Em: 'E2', Dm7: 'D2', Dm: 'D2', G7: 'G1', Gsus: 'G1' };
    for (const [b, len, c] of prog) {
      const sec = b < 8 || b >= 112 ? 'intro' : b < 40 ? 'A' : b < 72 ? 'A2' : b < 88 ? 'B' : 'A3';
      // 弦：持続の和音（Bは厚め・ゆったり）＋ 8分の刻み（橋B以外）
      S.chord('stringsEns', b, len, PAD[c], sec === 'B' ? 1.15 : sec === 'A3' ? 1.0 : 0.8);
      if (sec !== 'B') for (let k = 0; k < len * 2; k++) S.mel('strStac', b + k * 0.5, OST[c][k % 4] + ':.5', (k % 2 ? 0.55 : 0.8) * (sec === 'A3' ? 1.1 : 1));
      else for (let k = 0; k < len; k++) S.mel('pizz', b + k, OST[c][k % 4] + ':1', 0.6);
      // 低い金管：和音の頭（A''は強め）
      if (sec !== 'B') S.chord('lowBrass', b, Math.min(len, 2), LOW[c], sec === 'A3' ? 0.95 : 0.7);
      // 低音：2分音符＋変わり目の前に経過音
      S.mel('bass', b, ROOT[c] + ':' + len, 0.85);
    }
    // 小太鼓：行進風だが規則正しすぎないよう、小節の後半に飾りを入れる（橋Bは休み）
    for (let b = 8; b < 120; b += 4) {
      if (b >= 72 && b < 84) continue;
      const w = b >= 88 && b < 112 ? 1.15 : 0.85;
      S.hit('snare2', b, 0.45 * w); S.hit('snare2', b + 1.5, 0.22 * w); S.hit('snare2', b + 2, 0.35 * w);
      if ((b / 4) % 2) { S.hit('snare2', b + 3.5, 0.25 * w); S.hit('snare2', b + 3.75, 0.32 * w); } else S.hit('snare2', b + 3, 0.28 * w);
    }
    for (let i = 0; i < 8; i++) S.hit('snare2', 86 + i * 0.25, 0.12 + i * 0.05);   // 橋Bの終わり：A''へのロール
    for (const b of [8, 40, 88]) S.hit('timpani', b, b === 88 ? 1 : 0.75, 'C2');
    S.hit('timpani', 86, 0.6, 'G1'); S.hit('timpani', 87, 0.7, 'G1'); S.hit('timpani', 108, 0.8, 'C2');
    S.hit('cymbal', 8, 0.5); S.ev.push({ b: 84, len: 4, n: 0, inst: 'cymbal', v: 0.55 }); S.hit('cymbal', 88, 0.85);
    return { bpm: 112, beats: 120, tail: 1.2, loop: true, loopStart: 8, loopEnd: 120, reverb: 0.18, events: S.ev, motif: YANAI_MOTIF };
  }

  /* 3．村の音楽（新規）：BPM120・4拍子・ト長調・1周144拍＝72秒。
   * 導入（2小節：木琴の型）→ A（笛の主旋律、すき間に木琴が答える）→ B（笛と木琴が2拍ずつ掛け合う）→
   * A'（役を入れかえ：木琴が主旋律、笛が答える）→ C（笛とクラリネットの3度の二重奏）→ 接続（＝導入）。ループ：9拍目〜144拍目。
   * リズム：太鼓（1・3拍）、タンバリン（2・4拍、小さく）、拍子木の裏打ち、チン（タイの小さなシンバル）を控えめに。弾む低音と裏拍の和音。 */
  function village() {
    const S = score(0);
    const riff = 'G4:.5 B4:.5 D5:.5 G5:.5 F#5:.5 D5:.5 B4:.5 D5:.5 A4:.5 C5:.5 D5:.5 F#5:.5 E5:.5 C5:.5 A4:.5 F#4:.5';
    S.mel('marimba', 0, riff, 0.9); S.mel('marimba', 136, riff, 0.9);
    const Amel = 'B4:.5 D5:.5 G5:.75 F#5:.25 E5:.5 D5:.5 B4:1 C5:.5 E5:.5 G5:.75 E5:.25 D5:.5 C5:.5 A4:1 ' +
      'A4:.5 D5:.5 F#5:.5 E5:.5 D5:.5 C5:.5 A4:.5 F#4:.5 G4:.75 A4:.25 B4:.5 G4:.5 D5:1 r:1 ' +
      'B4:.5 E5:.5 G5:.75 F#5:.25 E5:.5 B4:.5 G4:1 C5:.5 E5:.5 G5:1 F#5:.5 E5:.5 D5:1 ' +
      'C5:.5 A4:.5 C5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:.5 G4:2 r:2';
    const Aans = (inst, b, v) => { S.mel(inst, b + 12, 'r:3 D5:.25 E5:.25 F#5:.25 G5:.25', v); S.mel(inst, b + 28, 'r:2 B4:.5 D5:.5 G5:1', v); };
    S.mel('flute', 8, Amel, 1); Aans('marimba', 8, 0.95);
    S.mel('marimba', 72, Amel, 1); Aans('flute', 72, 0.9);
    S.mel('reed', 72, 'r:4 r:4 r:4 r:4 G4:2 B4:2 G4:2 A4:2 F#4:2 E4:2 D4:4', 0.55);
    // B：掛け合い
    S.mel('flute', 40, 'E5:1 G5:1 r:2 D5:1 B4:1 r:2 C5:1 E5:1 r:2 F#5:1 A5:.5 F#5:.5 D5:2 G5:.75 E5:.25 C5:1 r:2 D5:.75 B4:.25 G4:1 r:2 ' +
      'C#5:.5 E5:.5 G5:.5 E5:.5 A5:1 G5:1 F#5:1 E5:.5 D5:.5 A4:2', 1);
    S.mel('marimba', 40, 'r:2 E5:.5 D5:.5 C5:1 r:2 D5:.5 B4:.5 G4:1 r:2 A4:.5 C5:.5 E5:1 r:4 r:2 G4:.5 C5:.5 E5:1 r:2 B4:.5 D5:.5 G5:1 r:4 r:2 D5:.5 F#5:.5 A5:1', 0.95);
    // C：二重奏
    S.mel('flute', 104, 'G5:1.5 F#5:.5 E5:1 B4:1 C5:1 E5:1 G5:1.5 F#5:.5 D5:1.5 B4:.5 G4:1 B4:1 A4:1 D5:1 F#5:2 ' +
      'G5:1.5 A5:.5 G5:1 E5:1 C5:1 E5:1 G5:2 E5:1 C5:1 D5:1 F#5:1 D5:2 C5:2', 0.95);
    S.mel('reed', 104, 'E5:1.5 D5:.5 B4:1 G4:1 G4:1 C5:1 E5:1.5 D5:.5 B4:1.5 G4:.5 D4:1 G4:1 F#4:1 A4:1 D5:2 ' +
      'E5:1.5 F#5:.5 E5:1 B4:1 G4:1 C5:1 E5:2 C5:1 A4:1 A4:1 D5:1 B4:2 A4:2', 0.8);
    // 鐘：区切りに小さく
    for (const [b, nm] of [[8, 'G5'], [40, 'E5'], [72, 'G5'], [104, 'B4']]) S.hit('bell', b, 0.8, nm, 2);
    // 和音と低音
    const prog = [];
    const bar = (b, ...cs) => { const len = 4 / cs.length; cs.forEach((c, i) => prog.push([b + i * len, len, c])); };
    const A = (b) => { bar(b, 'G'); bar(b + 4, 'C'); bar(b + 8, 'D'); bar(b + 12, 'G'); bar(b + 16, 'Em'); bar(b + 20, 'C'); bar(b + 24, 'Am', 'D'); bar(b + 28, 'G'); };
    bar(0, 'G'); bar(4, 'D7');
    A(8);
    bar(40, 'C'); bar(44, 'GB'); bar(48, 'Am'); bar(52, 'D'); bar(56, 'C'); bar(60, 'G'); bar(64, 'A7'); bar(68, 'D');
    A(72);
    bar(104, 'Em'); bar(108, 'C'); bar(112, 'G'); bar(116, 'D'); bar(120, 'Em'); bar(124, 'C'); bar(128, 'Am', 'D'); bar(132, 'G', 'D7');
    bar(136, 'G'); bar(140, 'D7');
    const CH = { G: ['B3', 'D4', 'G4'], GB: ['B3', 'D4', 'G4'], C: ['C4', 'E4', 'G4'], D: ['A3', 'D4', 'F#4'], D7: ['A3', 'C4', 'F#4'], Em: ['B3', 'E4', 'G4'], Am: ['A3', 'C4', 'E4'], A7: ['A3', 'C#4', 'G4'] };
    const R = { G: 'G2', GB: 'B2', C: 'C3', D: 'D3', D7: 'D3', Em: 'E2', Am: 'A2', A7: 'A2' };
    const F5 = { G: 'D3', GB: 'D3', C: 'G2', D: 'A2', D7: 'A2', Em: 'B2', Am: 'E2', A7: 'E2' };
    for (const [b, len, c] of prog) {
      for (let k = 0.5; k < len; k += 1) S.chord('pizz', b + k, 0.5, CH[c], 0.42);   // 裏拍の和音
      if (len === 4) S.mel('pluckBass', b, R[c] + ':.75 r:.75 ' + R[c] + ':.5 ' + F5[c] + ':.75 r:.75 ' + F5[c] + ':.5', 1);
      else S.mel('pluckBass', b, R[c] + ':.75 r:.75 ' + F5[c] + ':.5', 1);
    }
    // 打楽器
    for (let b = 0; b < 144; b += 4) {
      S.hit('kick', b, 0.9); S.hit('kick', b + 2, 0.75); if ((b / 4) % 2) S.hit('kick', b + 2.75, 0.45);
      S.hit('tamb', b + 1, 0.8); S.hit('tamb', b + 3, 0.8); S.hit('tamb', b + 3.5, 0.45);
      S.hit('wblock', b + 0.5, 0.5, 'E5'); S.hit('wblock', b + 1.75, 0.4, 'B4'); S.hit('wblock', b + 2.5, 0.5, 'E5');
      if ((b / 4) % 2) S.hit('ching', b + 3, 0.9);
    }
    return { bpm: 120, beats: 144, tail: 0.8, loop: true, loopStart: 8, loopEnd: 144, reverb: 0.1, events: S.ev };
  }

  /* 4．ダンジョンの音楽（新規）：BPM72・4拍子・ニ短調・1周80拍＝約66.7秒。
   * 導入（2小節：低弦の持続音とピチカートの足音）→ A（クラリネットの短い不穏な旋律、間を残す。♭II＝変ホ長調の和音で影）→
   * B（同じ形を笛が中音域で少し変えて。クラリネットは低く長い音で支える）→ 接続（＝導入）。ループ：9拍目〜80拍目。残響はやや深め。
   * 大きな音・鋭い高音・急な強弱は使わない（効果音を邪魔しない）。 */
  function dungeon() {
    const S = score(0);
    S.mel('reed', 8, 'r:1 A4:1 Bb4:.5 A4:.5 F4:1 E4:1.5 D4:.5 r:2 r:1 F4:1 G4:.5 A4:.5 Bb4:1 A4:3 r:1 ' +
      'r:1 D5:1 C5:.5 Bb4:.5 G4:1 Bb4:1.5 G4:.5 r:2 r:1 F4:.5 E4:.5 D4:1 E4:1 E4:3 r:1', 1);
    S.mel('flute', 40, 'r:1 G4:1 A4:.5 Bb4:.5 D5:1 C5:1.5 A4:.5 r:2 r:1 Bb4:1 C5:.5 D5:.5 F5:1 E5:3 r:1 ' +
      'r:1 D5:1 C5:.5 Bb4:.5 A4:1 F4:1.5 A4:.5 r:2 r:1 G4:.5 Bb4:.5 D5:1 C#5:1 A4:3 r:1', 0.85);
    S.mel('reed', 40, 'Bb3:4 A3:4 F4:4 E4:4 D4:4 A3:4 Bb3:4 C#4:4', 0.5);
    const prog = [];
    const bar = (b, c) => prog.push([b, 4, c]);
    bar(0, 'Dm'); bar(4, 'Dm');
    ['Dm', 'Dm', 'Bb', 'A', 'Gm', 'Eb', 'DmA', 'A'].forEach((c, i) => bar(8 + i * 4, c));
    ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'DmF', 'Em7b5', 'A'].forEach((c, i) => bar(40 + i * 4, c));
    bar(72, 'Dm'); bar(76, 'Dm');
    const PAD = { Dm: ['F3', 'A3', 'D4'], Bb: ['F3', 'Bb3', 'D4'], A: ['E3', 'A3', 'C#4'], Gm: ['G3', 'Bb3', 'D4'], Eb: ['G3', 'Bb3', 'Eb4'], DmA: ['F3', 'A3', 'D4'],
      DmF: ['F3', 'A3', 'D4'], Em7b5: ['G3', 'Bb3', 'D4'] };
    const LOWN = { Dm: 'D2', Bb: 'Bb1', A: 'A1', Gm: 'G1', Eb: 'Eb2', DmA: 'A1', DmF: 'F2', Em7b5: 'E2' };
    const STEP = { Dm: ['D3', 'A2'], Bb: ['Bb2', 'F2'], A: ['A2', 'E2'], Gm: ['G2', 'D3'], Eb: ['Eb3', 'Bb2'], DmA: ['A2', 'D3'], DmF: ['F2', 'C3'], Em7b5: ['E2', 'Bb2'] };
    for (const [b, len, c] of prog) {
      const n = midi(LOWN[c]);
      S.ev.push({ b, len, n, inst: 'cello', v: 0.95 }); S.ev.push({ b, len, n: n + 12, inst: 'cello', v: 0.55 });
      S.chord('stringsEns', b, len, PAD[c], 0.55);
      // ピチカートの足音（慎重に歩く）。Bでは小さな寄り道を足す
      S.mel('pizz', b, STEP[c][0] + ':1', 0.7); S.mel('pizz', b + 2, STEP[c][1] + ':1', 0.55);
      if (b >= 40 && b < 72) S.mel('pizz', b + 3.5, STEP[c][0] + ':.5', 0.35);
    }
    for (const b of [8, 24, 40, 56]) S.hit('timpani', b, 0.28, 'D2');
    return { bpm: 72, beats: 80, tail: 2.5, loop: true, loopStart: 8, loopEnd: 80, reverb: 0.42, events: S.ev };
  }

  /* 5．ボス戦（新規・オリジナル）：BPM138・4拍子・ト短調・1周96拍＝約41.7秒。
   * 強敵と向き合う危機感を、明るい行進曲にせず「重い低音・金管の旋律・刻み続ける弦・ティンパニ」で出す。
   * 導入（4小節：金管の和音の打ちこみとティンパニ。♭II＝変イ長調の和音で不安を足し、属和音で張りつめる）→
   * A（8小節：金管の旋律。弦の8分の刻みと、付点の重い低音）→ B（8小節：弦が旋律、ホルンが下で支え、半減七で緊張を高める）→
   * 橋渡し（4小節：上っていく和音とティンパニの連打、属和音からAへ戻る）。ループ：17拍目〜96拍目（属和音→主和音で自然につながる）。
   * 旋律は中〜高音域（スマホでも聞こえる）。効果音を邪魔しないよう、鋭い高音と大きなシンバルは区切りだけ。 */
  function bossBattle() {
    const S = score(0);
    const CH = { Gm: ['G3', 'Bb3', 'D4'], Eb: ['Eb3', 'G3', 'Bb3'], D: ['D3', 'F#3', 'A3'], BbF: ['F3', 'Bb3', 'D4'], Cm: ['C3', 'Eb3', 'G3'], Ab: ['Ab2', 'C3', 'Eb3'],
      Am7b5: ['A2', 'C3', 'Eb3'], D7: ['D3', 'F#3', 'C4'], F: ['F3', 'A3', 'C4'], Bb: ['F3', 'Bb3', 'D4'] };
    const ROOT = { Gm: 'G1', Eb: 'Eb2', D: 'D2', BbF: 'F1', Cm: 'C2', Ab: 'Ab1', Am7b5: 'A1', D7: 'D2', F: 'F1', Bb: 'Bb1' };
    const HI = { Gm: ['G4', 'Bb4', 'D5'], Ab: ['Ab4', 'C5', 'Eb5'], D: ['F#4', 'A4', 'D5'] };
    // ---- 導入（0〜16拍） ----
    for (const [b, c] of [[0, 'Gm'], [4, 'Ab'], [8, 'Gm']]) {
      for (const [o, len, v] of [[0, 0.5, 1], [1.5, 0.5, 0.85], [2, 1.75, 1]]) { S.chord('brassEns', b + o, len, HI[c], v * 0.85); S.mel('lowBrass', b + o, ROOT[c].replace('1', '2') + ':' + len, v); }
      S.hit('timpani', b, 1, c === 'Ab' ? 'Ab1' : 'G1'); S.hit('timpani', b + 1.5, 0.7, 'D2'); S.hit('timpani', b + 2, 0.9, c === 'Ab' ? 'Ab1' : 'G1');
      S.mel('cello', b, ROOT[c].replace('1', '2') + ':4', 0.8);
    }
    S.chord('brassEns', 12, 3.5, HI.D, 0.75); S.chord('hornEns', 12, 3.5, ['D4', 'F#4', 'A4'], 0.7); S.mel('lowBrass', 12, 'D2:3.5', 0.9);
    for (let i = 0; i < 16; i++) S.hit('timpani', 12 + i * 0.25, 0.25 + i * 0.04, 'D2');   // ティンパニの連打（だんだん強く）
    S.hit('cymbal', 12, 0.7, null, 3.9);
    // ---- 和音の進行（A：16〜48、B：48〜80、橋渡し：80〜96） ----
    const prog = [];
    const bar = (b, ...cs) => { const len = 4 / cs.length; cs.forEach((c, i) => prog.push([b + i * len, len, c])); };
    ['Gm', 'Gm', 'Eb', 'D'].forEach((c, i) => bar(16 + i * 4, c)); bar(32, 'Gm'); bar(36, 'BbF', 'Cm'); bar(40, 'Ab'); bar(44, 'D');
    ['Cm', 'Gm', 'Ab', 'Eb', 'Cm', 'Bb', 'Am7b5', 'D7'].forEach((c, i) => bar(48 + i * 4, c));
    ['Eb', 'F', 'Ab', 'D'].forEach((c, i) => bar(80 + i * 4, c));
    for (const [b, len, c] of prog) {
      const [r, t3, f5] = CH[c];
      // 弦の刻み（8分）：根音・5度・3度・5度…（緊張を保つ。音量は控えめ）
      for (let k = 0; k < len; k += 0.5) { const nm = [r, f5, t3, f5][(k * 2) % 4]; S.mel('strStac', b + k, nm.replace(/(\d)$/, (m) => String(+m + 1)) + ':.5', k % 1 === 0 ? 0.62 : 0.48); }
      // 重い低音：付点のリズム（低い金管＋チェロの持続）
      const R = ROOT[c];
      if (len === 4) S.mel('lowBrass', b, R + ':1.5 ' + R + ':1.5 ' + R.replace('1', '2').replace(/2$/, (m) => m) + ':1', 0.85);
      else S.mel('lowBrass', b, R + ':1.5 ' + R + ':.5', 0.85);
      S.ev.push({ b, len, n: midi(R) + 12, inst: 'cello', v: 0.7 });
      // ティンパニ：小節の頭（根音）と3拍目の裏
      if (len === 4 || b % 4 === 0) S.hit('timpani', b, 0.75, R.replace('1', '2'));
      if (len === 4) S.hit('timpani', b + 2.5, 0.5, R.replace('1', '2'));
      // 小太鼓：2拍目と4拍目（軽く）
      if (len === 4 || b % 4 === 0) { S.hit('snare2', b + 1, 0.5); S.hit('snare2', b + 3, 0.55); S.hit('snare2', b + 3.5, 0.3); }
      // Bと橋渡しは弦の持続和音で厚く
      if (b >= 48) S.chord('stringsEns', b, len, CH[c].map((nm) => nm.replace(/(\d)$/, (m) => String(+m + 1))), 0.42);
    }
    // ---- A：金管の旋律（16〜48）。2回目の後半で高く上がる ----
    S.mel('brassEns', 16, 'G4:1.5 D5:.5 D5:1 C5:.5 Bb4:.5 A4:1 Bb4:1 G4:2 G4:1.5 Eb5:.5 Eb5:1 D5:.5 C5:.5 D5:3 r:1 ' +
      'Bb4:1.5 D5:.5 G5:1 F5:.5 Eb5:.5 D5:1 C5:1 Eb5:1.5 D5:.5 C5:1 Eb5:1 Ab5:1.5 G5:.5 F#5:3 r:1', 1);
    S.mel('hornEns', 16, 'D4:4 D4:4 Eb4:4 F#4:4 G4:4 F4:2 G4:2 Ab4:4 A4:4', 0.6);   // ホルンの支え
    // 答え（低い金管の短い応答。旋律の休みに）
    S.mel('brassEns', 31, 'D4:.25 D4:.25 A4:.5', 0.7); S.mel('brassEns', 47, 'D4:.25 D4:.25 F#4:.5', 0.7);
    // ---- B：弦が旋律、ホルンが1オクターブ下で重ねる（48〜80） ----
    const Bmel = 'Eb5:2 D5:1 C5:1 Bb4:2 D5:2 C5:1.5 Eb5:.5 Ab5:2 G5:2 Bb4:2 C5:1 Eb5:1 G5:1 F5:1 D5:2 Bb4:2 C5:1 Eb5:1 A4:2 F#5:2 D5:1 C5:1';
    S.mel('stringsEns', 48, Bmel, 1.15);
    S.mel('hornEns', 48, Bmel.replace(/([A-G][#b]?)(\d)/g, (m, nn, o) => nn + (+o - 1)), 0.75);
    for (const [b, nn] of [[51.5, ['C4', 'G4']], [59.5, ['Eb4', 'Bb4']], [67.5, ['D4', 'F4']], [75.5, ['D4', 'A4']]]) S.chord('brassEns', b, 0.5, nn, 0.55);   // 金管の短い打ちこみ
    // ---- 橋渡し：上っていく金管と、ティンパニの連打（80〜96） ----
    S.mel('brassEns', 80, 'G4:1 Bb4:1 Eb5:2 A4:1 C5:1 F5:2 C5:1 Eb5:1 Ab5:2 A5:2 F#5:1 D5:1', 1);
    S.mel('hornEns', 80, 'Eb4:4 F4:4 Ab4:4 F#4:4', 0.7);
    for (let i = 0; i < 16; i++) S.hit('timpani', 92 + i * 0.25, 0.3 + i * 0.035, 'D2');
    S.hit('cymbal', 92, 0.6, null, 3.9);
    for (const b of [16, 48, 80]) S.hit('cymbal', b, 0.75);
    return { bpm: 138, beats: 96, tail: 1.5, loop: true, loopStart: 16, loopEnd: 96, reverb: 0.2, events: S.ev };
  }

  // 曲の一覧（選ぶ処理）。file を書けば録音した音源で同じように再生する
  // group：'new'＝第2版（試聴の方向性確認用）、'old'＝第1版（比較用）
  M.LIBRARY = {
    fanfare: { title: '冒険のファンファーレ', group: 'new', note: '第2版・冒険の始まり（ループなし）', build: fanfare2 },
    yanai: { title: 'マスターヤナイのテーマ', group: 'new', note: '第2版・英雄のテーマ（主題Aからループ）', build: yanai2 },
    village: { title: '村の音楽', group: 'new', note: 'お祭りのにぎわい（ループ）', build: village },
    dungeon: { title: 'ダンジョンの音楽', group: 'new', note: '地下の静けさと緊張（ループ）', build: dungeon },
    boss: { title: 'ボス戦', group: 'new', note: '強敵との対峙（ループ）。ボス部屋に入ったときから倒すまで', build: bossBattle },
    fanfare_v1: { title: '冒険のファンファーレ', group: 'old', note: '第1版（比較用）', build: fanfareV1 },
    yanai_v1: { title: 'マスターヤナイのテーマ', group: 'old', note: '第1版（比較用）', build: yanaiV1 },
  };
  M.YANAI_MOTIF = YANAI_MOTIF; M.YANAI_MOTIF_V1 = YANAI_MOTIF_V1;
  /* 場面 → 曲（通常プレイで使う曲を選ぶ表）。ここを書きかえれば、場面の曲や録音音源への差し替えができる。
   * ここに無い場面（boss など）は TS.Audio の以前の合成BGMを使う。title のファンファーレは1回だけ鳴らす（once） */
  M.SCENES = {
    title: { song: 'fanfare', once: true },
    village: { song: 'village' },
    dungeon: { song: 'dungeon' },
    boss: { song: 'boss' },   // ボス戦（以前は合成の短いループ。今は新しい曲）
    yanai: { song: 'yanai' },
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
    M.stop(opts.fadeOut == null ? 0.12 : opts.fadeOut);
    if (!A.ctx || !A.musicBus) return null;
    const L = M.LIBRARY[id];
    if (L && L.file) return playFile(id, L, opts);
    const s = M.song(id); if (!s) return null;
    const ctx = A.ctx, out = ctx.createGain();
    if (opts.fadeIn) { out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(1, ctx.currentTime + opts.fadeIn); } else out.gain.value = 1;
    out.connect(A.musicBus);
    if (s.reverb && A.reverbSend) { const send = ctx.createGain(); send.gain.value = s.reverb; out.connect(send); send.connect(A.reverbSend); }
    const from = opts.fromBeat || 0;
    const pb = { id, song: s, out, bgm: !!opts.bgm, t0: ctx.currentTime + 0.08 - from * s.spb, idx: s.events.findIndex((e) => e.b >= from), offset: 0, loops: 0, done: false, onEnd: opts.onEnd };
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
    const pb = { id, out, file: true, bgm: !!opts.bgm, done: false, onEnd: opts.onEnd, t0: ctx.currentTime };
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
    let target = bus.input;
    if (s.reverb) { target = ctx.createGain(); target.connect(bus.input); const send = ctx.createGain(); send.gain.value = s.reverb; target.connect(send); send.connect(bus.reverbIn); }
    const t0 = 0.05, list = [];
    for (let k = 0; k < n; k++) {
      const off = k === 0 ? 0 : s.loopEnd + (k - 1) * (s.loopEnd - s.loopStart) - s.loopStart;
      for (const e of s.events) { if (k > 0 && e.b < s.loopStart) continue; list.push([t0 + (e.b + off) * s.spb, e]); }
    }
    list.sort((a, b) => a[0] - b[0]);
    /* リアルタイムと同じく、少し先の音だけを用意しながら描く（一度に全部の音を作ると、描く処理が実際より重くなる） */
    let i = 0;
    const feed = (upTo) => { while (i < list.length && list[i][0] < upTo) { play1(ctx, target, list[i][1], list[i][0], s.spb); i++; } };
    feed(1.0);
    for (let c = 0.5; c < secs - 0.5; c += 0.5) ctx.suspend(c).then(() => { feed(c + 1.0); ctx.resume(); });
    return ctx.startRendering();
  };
  /* 音楽の出口の音作り：軽いコンプレッサーで音割れを防ぐ（リアルタイムでも同じものを使う） */
  /* 残響：作った減衰ノイズ（約2.2秒、高域を丸める）を畳み込む。曲ごとの送り量（song.reverb）で深さを変える */
  function makeIR(ctx) {
    const len = Math.floor(ctx.sampleRate * 2.2), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate, k = Math.min(1, t / 0.012);   // 最初の12msはなめらかに立ち上げる
      lp += ((Math.random() * 2 - 1) - lp) * (0.35 - 0.25 * (i / len));   // 後ろほど高域が減る
      d[i] = lp * Math.exp(-t * 2.6) * k;
    }
    // 総エネルギーを1にそろえる（残響の音量は送り量だけで決まる。そろえないと残響だけで大きく音割れする）
    let e = 0; for (let i = 0; i < len; i++) e += d[i] * d[i];
    const sc = 1 / Math.sqrt(e || 1); for (let i = 0; i < len; i++) d[i] *= sc;
    return b;
  }
  function makeMusicChain(ctx) {
    const input = ctx.createGain(), comp = ctx.createDynamicsCompressor(), output = ctx.createGain();
    input.gain.value = 0.62;
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    output.gain.value = 1;
    input.connect(comp); comp.connect(output);
    const reverbIn = ctx.createGain(), conv = ctx.createConvolver();
    reverbIn.gain.value = 0.62; conv.normalize = false; conv.buffer = makeIR(ctx);
    reverbIn.connect(conv); conv.connect(comp);
    return { input, output, reverbIn };
  }
  M.makeMusicChain = makeMusicChain;

  TS.Music = M;
})(globalThis.TS = globalThis.TS || {});
