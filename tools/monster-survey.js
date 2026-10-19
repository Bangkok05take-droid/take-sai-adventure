/* モンスターの現状調査（2026年10月）：ゲームのデータ（js/data.js・js/story.js）をそのまま読み、
 * 出現する章・階・確率、基本値と階ごとの強さ、ドロップを表にする。ゲームの処理・数値は変えない（読むだけ）。
 *   node tools/monster-survey.js            → docs/monsters/ に Markdown と CSV を書き出す
 * 出力：monster-list.md（全モンスター一覧）・spawn-tables.md（章・階ごとの出現率）・monsters.csv */
'use strict';
const fs = require('fs'), path = require('path');
const TS = require('../tests/load');
const D = TS.Data;
const OUT = path.join(__dirname, '..', 'docs', 'monsters');
fs.mkdirSync(OUT, { recursive: true });

const E = D.ENEMIES;
const pct = (w, sum) => (sum ? Math.round((w / sum) * 1000) / 10 : 0);
// 敵1体の能力（js/game.js の makeEnemy と同じ式）
function stats(id, ch, f) {
  const e = E[id];
  const k = e.noScale ? 0 : Math.max(0, f - (e.base || 1));
  const cm = e.noScale ? 1 : D.chapterMul(ch, f);
  return { hp: Math.round(e.hp * (1 + D.ENEMY_SCALE.hp * k) * cm), atk: Math.round(e.atk * (1 + D.ENEMY_SCALE.atk * k) * cm),
    def: e.def, exp: Math.round(e.exp * (1 + D.ENEMY_SCALE.exp * k)), k, cm: Math.round(cm * 1000) / 1000 };
}

/* 出現の場所を集める：新しい探索（配置の版4）の第1〜6章、隠しダンジョン、以前の版（更新前から続く探索）*/
const where = {};   // id → [{ scope, ch, f, w, sum, kind }]
const add = (id, rec) => (where[id] = where[id] || []).push(rec);
const floorsOf = {};   // scope → [{ f, F }]
const scopes = [];
for (const ch of [1, 2, 3, 4, 5, 6]) {
  const C = D.CHAPTERS[ch], goal = D.bossFloorOf(ch, 4), name = C.name + '（' + C.title + '）';
  const list = [];
  for (let f = 1; f <= goal; f++) list.push({ f, F: D.floorFor(ch, f, 4, ch === 6 ? {} : null) });
  scopes.push({ key: 'ch' + ch, name, ch, list });
  if (ch === 6) {
    // 最終章で大魔王バーン（30階）・真大魔王バーン（33階）を倒したあと：その階はボスのいない階になる
    scopes.push({ key: 'ch6skip', name: '最終章・ボスを倒したあとの30階・33階', ch, list: [30, 33].map((f) => ({ f, F: D.floorFor(6, f, 4, { vearn: true, truevearn: true }) })) });
  }
}
{
  const list = [];
  for (let f = D.HIDDEN_DUNGEON.from; f <= D.HIDDEN_DUNGEON.to; f++) list.push({ f, F: D.hiddenFloor(f) });
  scopes.push({ key: 'hidden', name: '隠しダンジョン「' + D.HIDDEN_DUNGEON.name + '」', ch: 6, list });
}
{
  const list = [];
  for (let f = 1; f <= D.MAX_FLOOR; f++) list.push({ f, F: D.floorFor('legacy', f, 1) });
  scopes.push({ key: 'legacy', name: '以前の版（更新前から続く探索だけ）', ch: 'legacy', list });
}
for (const S of scopes) for (const { f, F } of S.list) {
  if (F.boss) { add(F.boss, { scope: S.key, ch: S.ch, f, kind: 'boss' }); continue; }
  const sum = F.enemies.reduce((a, [, w]) => a + w, 0);
  for (const [id, w] of F.enemies) add(id, { scope: S.key, ch: S.ch, f, w, sum, kind: 'table' });
  if (F.mimics) add('mimic', { scope: S.key, ch: S.ch, f, kind: 'mimic', n: F.mimics });
}
// ボスが呼ぶ敵（js/bossai.js・js/game.js の bossAct）
const SUMMONS = {
  kill_clone: { by: 'kill', note: 'キルバーンの分身（2体まで、8行動ごと）。HP1・経験値0。1回当てると消える' },
  mist_clone: { by: 'mist', note: 'ミストバーンの影（2体まで、9行動ごと）。HP1・経験値0' },
  imp: { by: 'vearn', note: '大魔王バーンが呼ぶ（2体まで、10行動ごと）。経験値は20に固定' },
  jelly: { by: 'catfish', note: '大ナマズ王が呼ぶ（以前の版、8行動ごと・2体まで）。経験値1/3' },
  wisp: { by: 'elephant', note: '夢見の黄金象が呼ぶ（以前の版、9行動ごと・2体まで）。経験値1/3' },
};

// 区分
const STRONG_IDS = D.STRONG.spawn.map(([id]) => id).filter((id) => E[id].base === 31 && !['darkknight', 'imp'].includes(id)).concat(['mimic']);
const kindOf = (id) => (E[id].ai === 'boss' ? 'boss' : E[id].clone ? 'clone' : STRONG_IDS.includes(id) ? 'strong' : 'normal');
const newRecs = (id) => (where[id] || []).filter((r) => r.scope !== 'legacy');
const firstFloor = (id) => { const r = newRecs(id); return r.length ? Math.min(...r.map((x) => x.f)) : 999; };

// 画像（js/assets.js の設定と、コードで描いた絵の大きさ。js/sprites.js）
const A = (() => { const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'assets.js'), 'utf8'); const g = {}; new Function('globalThis', src)(g); return g.TS.ASSETS; })();
const pngSize = (p) => { try { const b = fs.readFileSync(path.join(__dirname, '..', p)); return b.readUInt32BE(16) + '×' + b.readUInt32BE(20); } catch (e) { return '読めない'; } };
const spSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'sprites.js'), 'utf8');
const codeSize = (s) => { const m = spSrc.match(new RegExp('E\\.' + s + ' = \\(f\\) => \\{\\s*const P = new Pix\\((\\d+), (\\d+)\\)')); return m ? +m[1] : null; };
const PH = { dragon: 'lizard', silverdevil: 'imp', gigantes: 'guard', bombrock: 'golem', madhand: 'jelly', mimic: '宝箱' };
function image(id) {
  const s = E[id].sprite;
  const ES = A.enemySheets && A.enemySheets.map[s];
  if (ES) {   // 通常の敵15種（ZIP monster_sprites_v1）：96×96 のコマ4つ。本体の高さは たけ（47ドット）に合わせた倍率
    const f = A.enemySheets.dir + ES.file + '.png', body = Math.round(ES.body * A.enemySheets.takeBody / A.enemySheets.bodyRef * 10) / 10;
    return { file: f, size: pngSize(f), disp: '本体の高さ ' + body + 'ドット（' + (ES.body === 64 ? 'たけと同じ' : 'たけの0.625倍') + '）', status: '専用（ChatGPT制作の絵）', frames: '4コマ（待機A・待機B・技の準備・技の発動。技は ' + ES.kind + '）' };
  }
  if (s === 'bat') return { file: 'なし（ドラキーの絵は ZIP が途中で切れていて届いていない）', size: '—', disp: '1マス（今のコードの絵 32×32）', status: '仮（絵が未着のため、旧ヤミコウモリのコードの絵）', frames: '2コマ' };
  if (A.enemies && A.enemies[s]) {
    const sc = A.enemyArtScale[s] || 1, logical = 192 / sc;
    return { file: A.enemies[s], size: pngSize(A.enemies[s]), disp: (logical / 32) + 'マス（' + logical + 'ドット枠）', status: '専用（ChatGPT制作の絵）', frames: '1枚（静止画）' };
  }
  if (A.bosses && A.bosses[s]) {
    const own = s === id || (id === 'kill_clone' || id === 'mist_clone');
    const status = id === 'dragonbaran' ? '借用・仮（通常のバランの絵）' : E[id].clone ? '本体の絵を借用（分身なので同じ姿）' : '専用（見本から切り出した絵）';
    return { file: A.bosses[s], size: pngSize(A.bosses[s]), disp: '3マス（96ドット枠。体は約2マス）', status, frames: '1枚（静止画）', own };
  }
  const n = codeSize(s);
  return { file: 'なし（js/sprites.js の E.' + s + ' でコードが描くドット絵）', size: n ? n + '×' + n + '（2コマ）' : '?', disp: n ? (n / 32) + 'マス' : '?',
    status: '仮（コードで描いた暫定のドット絵。完成の絵はまだ無い：docs/ENEMY_ART.md）', frames: '2コマ（待機の切り替え）' };
}

// AIの説明（js/game.js の enemyAct、js/bossai.js）
const AI = {
  melee: ['隣のたけを殴る。見えていれば近づく', '1歩', '1回（隣8方向）'],
  slow: ['2ターンに1回だけ動く（奇数ターンは休み）', '2ターンに1歩', '動けるターンに1回'],
  ranged: ['一直線上・4マス以内で間に壁や敵が無ければ吹き矢（威力は shoot の値）。隣なら殴る', '1歩', '1回'],
  dormant: ['最初は眠っている（たけが2マス以内に来るか、攻撃されると起きる）。起きたら melee と同じ', '1歩', '1回'],
  erratic: ['35%の確率でふらふら（でたらめな1歩）。それ以外は melee と同じ', '1歩', '1回'],
  telegraph: ['隣に来ると構える（予告：たけのマスが赤）→次の行動で強打（攻撃力×heavy）→1ターンの隙。離れればかわせる', '1歩', '予告して1回'],
  fast: ['1ターンに2歩動ける（2歩目は攻撃しない）。隣なら1回攻撃', '2歩', '1回'],
  support: ['5マス以内でHPが7割未満の仲間（ボス以外）を最大HPの40%回復（3行動待ち）。隣でなく2マス以内なら離れる', '1歩', '1回'],
  poison: ['melee と同じ。当たると40%で毒（8ターン・最大HPの2.5%/ターン、治った後15ターンはかからない）', '1歩', '1回'],
  thief: ['隣で探索中のお金を15%（最低10G）盗み、見えない所へ瞬間移動して逃げ回る。倒すと取り返せる', '1歩（逃げ）', 'なし（盗むだけ）'],
  area: ['動きが遅い（2ターンに1回）。隣に来ると周囲8マスを予告→次の行動で踏みならし（攻撃力×heavy）→1ターンの隙', '2ターンに1歩', '予告して1回（範囲）'],
  magic: ['一直線上・5マス以内で間に壁や敵が無ければ光の矢・火の玉（shoot の値）。隣に来られると1歩離れる', '1歩', '1回'],
  breath: ['一直線上・2〜5マスで炎（攻撃力×1.3）。炎は最初に当たった相手（敵・たけ）か壁で止まる。吐いた後3行動待つ。隣なら殴る', '1歩', '1回'],
  double: ['1回の手番に2回行動。離れていれば2歩、隣なら2回攻撃、1歩目で隣になれば残りで1回攻撃', '2歩', '最大2回'],
  bomb: ['HPが最大の20%以下で移動をやめる（隣なら攻撃はする）。0より大きく10%以下になった瞬間に自爆（周囲1マス・攻撃力×2.5）。一撃で倒せば爆発しない', '1歩（20%以下で0）', '1回'],
  mimic: ['床の宝箱に化けて動かない（見えている敵の一覧にも入らない）。隣に来るか攻撃されると正体を現し、その手番に1回攻撃', '化けている間0・その後1歩', '1回'],
  grab: ['当たると「つかむ」：たけは3ターン移動できない（攻撃・道具・装備はできる）。そのマドハンドを倒すと解ける。3点セットでは無効', '1歩', '1回'],
  clone: ['本体と同じ姿で近づき、弱い攻撃。1回当てると消える', '1歩（ボス部屋の中だけ）', '1回'],
};
const BOSS = {
  lion: '一定の間隔（4行動ごと）で、近ければ周囲1マス（×2.0）、一直線4マス以内なら列（×1.8）を予告して大技。大技のあと2ターンの隙',
  catfish: '4行動ごとに周囲1マス（×2.0）か一直線6マス（×1.7）の予告大技。8行動ごとに水クラゲを呼ぶ（2体まで）',
  elephant: '4行動ごとに周囲2マス（×1.7）か一直線6マス（×2.0）。9行動ごとに光の精を呼ぶ。HP50%未満で間隔3・隙1に',
  croc: '突進（一直線・壁まで予告、×1.7、隙2、待ち5）。隣で大斧（たけの列の奥3マス、×2.0、隙2、待ち4、3行動に1回）',
  flame: '炎と氷の床（部屋の半分のしま、炎×1.25／氷×1.0、数字2で発動、待ち5）。一直線2〜5マスで火の玉（×0.8、待ち2）',
  kill: '3人に分かれる（分身2体、待ち8）。たけのまわり2マスに罠4つ（×1.2、数字2で破裂、待ち4）',
  baran: '雷撃（たけのまわり3×3、×1.2、数字2、待ち5／HP50%未満で4）。隣で剣技（一直線4マス、×2.0、隙2、待ち3）',
  mist: '霧（10ターン、まわり2マスしか見えない、待ち14）。影の分身2体（待ち9）。闇の糸（一直線5マス、×0.6、当たると2ターン拘束、待ち6）',
  vearn: '魔法陣（たけの縦横の列に炎、×1.1、待ち6）。カイザーフェニックス（一直線・壁まで、×1.9、隙1、待ち4）。魔界の小鬼を呼ぶ（待ち10）',
  truevearn: '魔界の炎の輪（たけから2マスの輪、×1.0、待ち5／4）。隣で天地の掌（周囲8マス、×2.0、隙2）。滅びの炎（3列、×1.8、隙1）。HP40%未満で加速',
  dragonbaran: '（数値はすべて仮）なぎ払い（隣、周囲8マス、×1.6、隙1、待ち4/3）。突進（3〜8マス一直線、×1.8、隙2、待ち7/5）。ドルオーラ（2マス以上、一直線→後半は十字、×2.2、隙2、待ち6/5）。HP50%以下で攻撃力×1.15',
};
const bossWhere = {
  croc: '第1章 地下15階（ボス部屋）', flame: '第2章 地下20階', kill: '第3章 地下25階', baran: '第4章 地下30階', mist: '第5章 地下30階',
  vearn: '最終章 地下30階（玉座の間）', truevearn: '最終章 地下33階', dragonbaran: '隠しダンジョン 地下35階',
  lion: '以前の版 地下10階', catfish: '以前の版 地下20階', elephant: '以前の版 地下30階',
};
function bossDrops(id) {
  const ch = Object.keys(D.CHAPTERS).find((c) => D.CHAPTERS[c].boss === id);
  const nm = (i) => (D.ITEMS[i] ? D.ITEMS[i].name : i);
  if (ch) return '初回：' + D.CHAPTERS[ch].reward.items.map(nm).join('・') + '（＋村へ帰ると復興支援金' + D.CHAPTERS[ch].reward.funds + 'G）。2回目から：黄金の象';
  if (id === 'truevearn') return 'なし（版4。帰還口が開くだけ）';
  if (id === 'dragonbaran') return '所有していない品だけ：' + D.DRAGON_KING.rewards.map(nm).join('・') + '。専用の強化素材は未設定（空）';
  if (E[id].drop) return nm(E[id].drop === 'wish_orb' ? 'dream_crown' : E[id].drop) + '（以前の版。願いの宝珠は出ず夢見の王冠）';
  return '—';
}

// 出現の文章（章ごとに、出る階の範囲と、各階の出現率の幅）
function ranges(fs_) { const out = []; let a = null, b = null; for (const f of fs_) { if (a == null) a = b = f; else if (f === b + 1) b = f; else { out.push(a === b ? a + '' : a + '〜' + b); a = b = f; } } if (a != null) out.push(a === b ? a + '' : a + '〜' + b); return out.join('・'); }
function appearText(id, scopeFilter) {
  const recs = (where[id] || []).filter((r) => r.kind === 'table' && scopeFilter(r.scope));
  const by = {};
  for (const r of recs) (by[r.scope] = by[r.scope] || []).push(r);
  const lines = [];
  for (const S of scopes) {
    const rs = by[S.key]; if (!rs) continue;
    const ps = rs.map((r) => pct(r.w, r.sum)), lo = Math.min(...ps), hi = Math.max(...ps);
    lines.push(S.name.replace(/（.*）$/, '') + '：' + ranges(rs.map((r) => r.f)) + '階（' + (lo === hi ? lo : lo + '〜' + hi) + '%）');
  }
  return lines;
}

// ---- 一覧の行を作る ----
const ids = Object.keys(E);
const groups = { normal: [], strong: [], boss: [], unused: [] };
for (const id of ids) {
  const k = kindOf(id), anyNew = newRecs(id).length || (SUMMONS[id] && E[SUMMONS[id].by] && !['lion', 'catfish', 'elephant'].includes(SUMMONS[id].by));
  if (k === 'boss') { (['lion', 'catfish', 'elephant'].includes(id) ? groups.unused : groups.boss).push(id); continue; }
  if (k === 'clone') { groups.boss.push(id); continue; }
  if (!anyNew) { groups.unused.push(id); continue; }
  groups[k].push(id);
}
groups.normal.sort((a, b) => firstFloor(a) - firstFloor(b));
groups.strong.sort((a, b) => STRONG_IDS.indexOf(a) - STRONG_IDS.indexOf(b));
const bossOrder = ['croc', 'flame', 'kill', 'kill_clone', 'baran', 'mist', 'mist_clone', 'vearn', 'truevearn', 'dragonbaran'];
groups.boss.sort((a, b) => bossOrder.indexOf(a) - bossOrder.indexOf(b));

const md = [];
const csv = [['区分', '表示名', '内部ID', '出現（新しい探索）', '出現（以前の版）', 'HP', '攻撃', '防御', '経験値', 'base（強くなり始める階）', '強さの伸び', 'AI', '移動', '攻撃回数', '攻撃の方法', '射程・範囲', '状態異常', 'ドロップ', '画像', '画像の大きさ', '画面での大きさ', '画像の扱い'].join(',')];
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const ailment = (id) => (E[id].ai === 'boss' ? '眠り3ターン・鈍足6ターンに短縮（道具の値より短い）。それ以外の耐性なし' : E[id].clone ? '個別の設定なし（HP1）' :
  id === 'mimic' ? '化けている間は「見えている敵」に入らないので、ねむり草・どんそくの粉・雷鳴の巻物は効かない。正体を現した後は通常どおり。個別の耐性なし' :
  E[id].ai === 'dormant' ? '眠っている（休眠）間は眠りの道具で上書きされない。個別の耐性なし' : '個別の耐性なし（眠り・鈍足とも道具の値どおり効く）');
const range = (id) => { const e = E[id]; return e.ai === 'ranged' || e.ai === 'magic' ? '一直線 ' + e.range + 'マス（射撃の威力 ' + e.shoot + '、深さで攻撃と同じ率で伸びる）' :
  e.ai === 'telegraph' ? '隣1マス（予告したマス）' : e.ai === 'area' ? '周囲8マス' : e.ai === 'breath' ? '一直線 2〜' + D.STRONG.dragon.range + 'マス（最初の相手で止まる）' :
  e.ai === 'bomb' ? '隣1マス／自爆は周囲' + D.STRONG.bombrock.radius + 'マス（たけだけ）' : e.ai === 'boss' ? '技ごと（「行動」の欄）' : '隣1マス（8方向・壁の角越しは不可）'; };
const heavy = (id) => (E[id].heavy ? '（強打 ×' + E[id].heavy + '）' : '');
function rowMd(id, extra) {
  const e = E[id], im = image(id), ai = AI[e.ai];
  const appearNew = SUMMONS[id] && !newRecs(id).length ? ['呼び出しのみ：' + SUMMONS[id].note] : appearText(id, (s) => s !== 'legacy').concat(SUMMONS[id] ? ['呼び出し：' + SUMMONS[id].note] : []);
  const mim = (where[id] || []).filter((r) => r.kind === 'mimic');
  if (mim.length) appearNew.push('隠しダンジョン ' + ranges(mim.map((r) => r.f)) + '階：出現表とは別に、1階に' + mim[0].n[0] + '〜' + mim[0].n[1] + '体を宝箱に化けて置く（仮）');
  const appearOld = appearText(id, (s) => s === 'legacy');
  const L = [];
  L.push('### ' + e.name + '（`' + id + '`）');
  L.push('');
  L.push('| 項目 | 内容 |');
  L.push('|---|---|');
  if (e.ai === 'boss') L.push('| 出現 | ' + bossWhere[id] + '（1体だけ。ボス部屋の外へは出ない） |');
  else {
    L.push('| 出現（新しい探索・版4） | ' + (appearNew.length ? appearNew.join('<br>') : '出ない') + ' |');
    if (appearOld.length) L.push('| 出現（以前の版） | ' + appearOld.join('<br>') + ' |');
  }
  L.push('| 基本値 | HP ' + e.hp + '・攻撃 ' + e.atk + '・防御 ' + e.def + '・経験値 ' + e.exp + ' |');
  if (!e.noScale) {
    const nr = newRecs(id).filter((r) => r.kind !== 'boss');
    const first = nr.length ? nr.reduce((a, b) => (b.f < a.f ? b : a)) : null, last = nr.length ? nr.reduce((a, b) => (b.f > a.f || (b.f === a.f && b.ch > a.ch) ? b : a)) : null;
    const s1 = first && stats(id, first.ch, first.f), s2 = last && stats(id, last.ch, last.f);
    L.push('| 強さの伸び | ' + (e.base || 1) + '階から1階ごとにHP+12%・攻撃+8%・経験値+12%（防御は伸びない）。さらに章の倍率' +
      (s1 ? '<br>例：' + (first.scope === 'hidden' ? '隠し' : '第' + first.ch + '章') + first.f + '階 HP ' + s1.hp + '・攻撃 ' + s1.atk + '・経験値 ' + s1.exp + '（章の倍率 ' + s1.cm + '）' : '') +
      (s2 && last !== first ? '<br>例：' + (last.scope === 'hidden' ? '隠し' : '第' + last.ch + '章') + last.f + '階 HP ' + s2.hp + '・攻撃 ' + s2.atk + '・経験値 ' + s2.exp + '（章の倍率 ' + s2.cm + '）' : '') + ' |');
  } else L.push('| 強さの伸び | なし（noScale：どの章・階でも同じ） |');
  if (e.ai === 'boss') L.push('| 行動 | ' + BOSS[id] + '。予告→次の行動で発動→隙。1ターンに1回行動 |');
  else L.push('| 行動（ai: ' + e.ai + '） | ' + ai[0] + heavy(id) + ' |');
  L.push('| 移動の速さ・行動回数・攻撃回数 | ' + (e.ai === 'boss' ? '1歩・1回・1回（大技は予告つき）' : ai[1] + '・' + (e.ai === 'double' ? '2回' : e.ai === 'fast' ? '移動2回' : '1回') + '・' + ai[2]) + ' |');
  L.push('| 射程・範囲 | ' + range(id) + ' |');
  L.push('| 命中 | 通常攻撃・射撃は88%（敵共通）。予告の大技・炎・自爆は外れない（範囲の外へ出ればかわせる） |');
  L.push('| 状態異常への耐性 | ' + ailment(id) + ' |');
  L.push('| ドロップ | ' + (e.ai === 'boss' ? bossDrops(id) : e.clone ? 'なし' : '12%でその階の道具の表から1つ（呼ばれた敵は落とさない）' + (e.ai === 'thief' ? '。盗んだお金は倒すと戻る' : '') + (id === 'bombrock' ? '。自爆したときは経験値もドロップもなし（仮）' : '')) + ' |');
  L.push('| 画像 | ' + im.file + '（' + im.size + '、' + im.frames + '） |');
  L.push('| 画面での大きさ | ' + im.disp + '（占有は1マス） |');
  L.push('| 画像の扱い | ' + im.status + (PH[e.sprite] ? '。読み込めないときは仮の見た目（' + PH[e.sprite] + 'の絵に色を重ねる）' : '') + ' |');
  if (e.tip) L.push('| 案内の文 | ' + e.tip + ' |');
  L.push('');
  csv.push([extra, e.name, id, appearNew.join(' / '), appearOld.join(' / '), e.hp, e.atk, e.def, e.exp, e.noScale ? 'なし' : (e.base || 1), e.noScale ? 'なし' : 'HP+12%/攻撃+8%/経験値+12% 毎階×章倍率',
    e.ai, e.ai === 'boss' ? '1歩' : ai[1], e.ai === 'boss' ? '1回' : ai[2], e.ai === 'boss' ? BOSS[id] : ai[0] + heavy(id), range(id), ailment(id),
    e.ai === 'boss' ? bossDrops(id) : e.clone ? 'なし' : '12% 階の道具', im.file, im.size, im.disp, im.status].map(q).join(','));
  return L.join('\n');
}

md.push('# 全モンスター一覧（現状調査・2026年10月）');
md.push('');
md.push('`node tools/monster-survey.js` が `js/data.js`・`js/story.js` から作った表です。手で書いた数値はありません。ゲームは変えていません。');
md.push('');
md.push('- 「新しい探索」は、今始める探索（配置の版4）です。「以前の版」は、更新前から続いている探索だけで使います。');
md.push('- 出現の%は、その階の出現表の中での割合です。章の偏り（bias）を入れた値です。');
md.push('- 敵の数・追加の湧き・モンスターハウスは `docs/MONSTER_SURVEY.md` の「4. バランス」を見てください。');
md.push('- 「仮」と書いた数値は、Claude が置いた調整案です。まだ確定していません。');
md.push('- 想定レベル・推奨装備は、ゲームのデータにありません。なので **未設定** です。');
md.push('');
const sec = [['normal', '通常のモンスター（出てくる階の順）'], ['strong', '強敵（隠しダンジョン 32〜34階）'], ['boss', 'ボス・分身（出てくる階の順）'], ['unused', '新しい探索では出ないデータ']];
for (const [g, title] of sec) {
  md.push('## ' + title);
  md.push('');
  md.push('| 表示名 | 内部ID | 最初に出る階 | HP | 攻撃 | 防御 | 経験値 | AI |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const id of groups[g]) { const e = E[id]; md.push('| ' + e.name + ' | `' + id + '` | ' + (e.ai === 'boss' ? bossWhere[id] : firstFloor(id) < 999 ? firstFloor(id) + '階' : SUMMONS[id] ? '呼び出し' : '—') + ' | ' + e.hp + ' | ' + e.atk + ' | ' + e.def + ' | ' + e.exp + ' | ' + e.ai + ' |'); }
  md.push('');
  for (const id of groups[g]) md.push(rowMd(id, title.replace(/（.*/, '')));
}
fs.writeFileSync(path.join(OUT, 'monster-list.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'monsters.csv'), '﻿' + csv.join('\n') + '\n');

// ---- 章・階ごとの出現率の表 ----
const T = ['# 章・階ごとの出現率（現状調査・2026年10月）', '', '`node tools/monster-survey.js` で作りました。数値は、その階の出現表での割合（%）です。章の偏りを入れています。',
  '敵の数の欄は、階を作ったときに置く数です（最小〜最大）。このほか45ターンごとに、見えない所へ1体湧きます（上限は階で8〜10体、ボスの階は湧かない）。', ''];
for (const S of scopes) {
  const cols = [];
  for (const { F } of S.list) if (!F.boss) for (const [id] of F.enemies) if (!cols.includes(id)) cols.push(id);
  if (S.list.some(({ F }) => F.mimics)) cols.push('mimic');
  T.push('## ' + S.name, '');
  T.push('| 階 | 敵の数 | ' + cols.map((c) => E[c].name).join(' | ') + ' |');
  T.push('|---|---|' + cols.map(() => '---|').join(''));
  for (const { f, F } of S.list) {
    if (F.boss) { T.push('| ' + f + ' | ボス | ' + E[F.boss].name + (cols.length > 1 ? ' |'.repeat(cols.length - 1) : '') + ' |'); continue; }
    const sum = F.enemies.reduce((a, [, w]) => a + w, 0);
    T.push('| ' + f + (F.strong ? '（強敵）' : '') + ' | ' + F.enemyCount[0] + '〜' + F.enemyCount[1] + ' | ' + cols.map((c) => {
      if (c === 'mimic' && F.mimics) return '別に' + F.mimics[0] + '〜' + F.mimics[1] + '体';
      const x = F.enemies.find(([id]) => id === c); return x ? pct(x[1], sum) : '';
    }).join(' | ') + ' |');
  }
  T.push('');
}
fs.writeFileSync(path.join(OUT, 'spawn-tables.md'), T.join('\n') + '\n');

// ---- 強さの目安：各章のボスの階の手前で出る敵の強さ（平均） ----
const P = ['| 場所 | 出る敵（重みつき平均） HP | 攻撃 | 防御 | 経験値 |', '|---|---|---|---|---|'];
const avgAt = (ch, f, F) => { const sum = F.enemies.reduce((a, [, w]) => a + w, 0); const r = { hp: 0, atk: 0, def: 0, exp: 0 }; for (const [id, w] of F.enemies) { const s = stats(id, ch, f); for (const k of Object.keys(r)) r[k] += s[k] * w / sum; } for (const k of Object.keys(r)) r[k] = Math.round(r[k]); return r; };
for (const [label, ch, f, F] of [['第1章 1階', 1, 1], ['第1章 14階', 1, 14], ['第2章 19階', 2, 19], ['第3章 24階', 3, 24], ['第4章 29階', 4, 29], ['第5章 29階', 5, 29], ['最終章 29階', 6, 29], ['最終章 31〜32階', 6, 32],
  ['隠し 31階', 6, 31, D.hiddenFloor(31)], ['隠し 32階（強敵）', 6, 32, D.hiddenFloor(32)], ['隠し 34階（強敵）', 6, 34, D.hiddenFloor(34)]]) {
  const FF = F || D.floorFor(ch, f, 4, ch === 6 ? {} : null), a = avgAt(ch, f, FF);
  P.push('| ' + label + ' | ' + a.hp + ' | ' + a.atk + ' | ' + a.def + ' | ' + a.exp + ' |');
}
fs.writeFileSync(path.join(OUT, 'progression.md'), '# 強さの移り変わり（出る敵の重みつき平均。現状調査）\n\n`node tools/monster-survey.js` で計算しました（モンスターハウス・追加の湧きも同じ表から選びます）。\n\n' + P.join('\n') + '\n');

console.log('書き出し：', ['monster-list.md', 'spawn-tables.md', 'progression.md', 'monsters.csv'].map((f) => path.join('docs/monsters', f)).join(' '));
console.log('区分：', Object.entries(groups).map(([k, v]) => k + '=' + v.join(',')).join('  '));
