/* ダンジョン生成。3x3の区画に部屋（または通路の分岐点）を置き、
 * 全域木＋追加の通路でつなぐので、すべての部屋は必ず到達可能。 */
(function (TS) {
  'use strict';
  const D = TS.Data, R = TS.RNG;
  const WALL = 0, FLOOR = 1, CORR = 2;

  /* 通常の階：部屋は四角（重ならない）、通路は必ず幅1マス。
   * 3×3の区画に部屋（または通路の分岐点）を1つずつ置き、隣り合う区画を全域木＋追加の通路でつなぐ。
   * 通路を1本掘るたびに地形を検査し、次のどれかになる掘り方は採用しない（別の掘り方を試す）：
   *  ・通路を含む2×2の床（幅2マスの道・部屋の横を沿う道・広い通路状の空間）
   *  ・斜めにだけ接する床（角どうしが触れているように見える形）
   * 本線（全域木）が掘れないときは乱数を進めて最初から作り直す。最後に全マスの到達可能性を確かめる。 */
  function generate(floor, rng) {
    if (D.BOSS_FLOORS[floor]) return generateBossFloor(rng);
    for (let attempt = 0; attempt < 80; attempt++) {
      const g = tryGenerate(floor, rng);
      if (g) return g;
    }
    return fallbackFloor(floor, rng);
  }

  function tryGenerate(floor, rng) {
    const M = D.MAP, w = M.w, h = M.h;
    const tiles = new Array(w * h).fill(WALL);
    const n = M.cols * M.rows;
    const isRoom = new Array(n).fill(true);
    const hubCount = R.int(rng, 0, 3);
    const order = R.shuffle(rng, [...Array(n).keys()]);
    for (let i = 0; i < hubCount; i++) isRoom[order[i]] = false;
    const rooms = [], cells = [];
    for (let cy = 0; cy < M.rows; cy++) for (let cx = 0; cx < M.cols; cx++) {
      const idx = cy * M.cols + cx, ox = cx * M.cellW, oy = cy * M.cellH;
      let r;
      if (isRoom[idx]) {
        // 区画の左上に1マス、右下に2マス以上の余白（隣の部屋との間に3マス以上＝通路が曲がれる）
        const rw = R.int(rng, 4, M.cellW - 3), rh = R.int(rng, 3, M.cellH - 3);
        const rx = R.int(rng, ox + 1, ox + M.cellW - 2 - rw), ry = R.int(rng, oy + 1, oy + M.cellH - 2 - rh);
        r = { id: rooms.length, x: rx, y: ry, w: rw, h: rh };
        rooms.push(r);
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) tiles[y * w + x] = FLOOR;
      } else {
        const hx = R.int(rng, ox + 2, ox + M.cellW - 4), hy = R.int(rng, oy + 2, oy + M.cellH - 4);
        r = { hub: true, x: hx, y: hy, w: 1, h: 1 };
        tiles[hy * w + hx] = CORR;
      }
      cells.push(r);
    }
    // つなぐ区画の組（全域木＋追加）
    const neighbors = (c) => {
      const cx = c % M.cols, cy = Math.floor(c / M.cols), out = [];
      if (cx > 0) out.push(c - 1); if (cx < M.cols - 1) out.push(c + 1);
      if (cy > 0) out.push(c - M.cols); if (cy < M.rows - 1) out.push(c + M.cols);
      return out;
    };
    const tree = [], visited = new Array(n).fill(false), stack = [R.int(rng, 0, n - 1)];
    visited[stack[0]] = true;
    while (stack.length) {
      const c = stack[stack.length - 1], nb = neighbors(c).filter((k) => !visited[k]);
      if (!nb.length) { stack.pop(); continue; }
      const k = R.pick(rng, nb); visited[k] = true; tree.push([c, k]); stack.push(k);
    }
    const extra = [];
    for (let i = 0, m = R.int(rng, 1, 3); i < m; i++) {
      const c = R.int(rng, 0, n - 1), k = R.pick(rng, neighbors(c));
      if (!tree.concat(extra).some((e) => (e[0] === c && e[1] === k) || (e[0] === k && e[1] === c))) extra.push([c, k]);
    }
    const map = { w, h, tiles, rooms };
    for (const [a, b, must] of tree.map((e) => e.concat(true)).concat(extra.map((e) => e.concat(false)))) {
      const A = cells[Math.min(a, b)], B = cells[Math.max(a, b)], horiz = Math.abs(a - b) === 1;
      let ok = false;
      for (let t = 0; t < 14 && !ok; t++) {
        const path = corridorPath(rng, A, B, horiz);
        const added = path.filter(([x, y]) => tiles[y * w + x] === WALL);
        for (const [x, y] of added) tiles[y * w + x] = CORR;
        if (shapeOk(map)) ok = true;
        else for (const [x, y] of added) tiles[y * w + x] = WALL;
      }
      if (!ok && must) return null;
    }
    if (!connected(map)) return null;
    return finishFloor(floor, rng, map);
  }

  // 区画AからB（Aは左または上）への通路：部屋の辺の1マスを出入口にして、直角に1回まで曲がる
  function corridorPath(rng, A, B, horiz) {
    const path = [];
    if (horiz) {
      const ya = A.y + R.int(rng, 0, A.h - 1), yb = B.y + R.int(rng, 0, B.h - 1);
      const sx = A.x + A.w, ex = B.x - 1;
      const mx = ya === yb ? sx : R.int(rng, sx + 1, ex - 1);
      for (let x = sx; x <= mx; x++) path.push([x, ya]);
      for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) path.push([mx, y]);
      for (let x = mx; x <= ex; x++) path.push([x, yb]);
    } else {
      const xa = A.x + R.int(rng, 0, A.w - 1), xb = B.x + R.int(rng, 0, B.w - 1);
      const sy = A.y + A.h, ey = B.y - 1;
      const my = xa === xb ? sy : R.int(rng, sy + 1, ey - 1);
      for (let y = sy; y <= my; y++) path.push([xa, y]);
      for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) path.push([x, my]);
      for (let y = my; y <= ey; y++) path.push([xb, y]);
    }
    return path;
  }

  // 地形の形の検査：通路を含む2×2の床、斜めにだけ接する床がないこと
  function shapeOk(map) {
    const { w, h, tiles } = map;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = tiles[y * w + x], b = tiles[y * w + x + 1], c = tiles[(y + 1) * w + x], d = tiles[(y + 1) * w + x + 1];
      const A = a !== WALL, B = b !== WALL, C = c !== WALL, Dd = d !== WALL;
      if (A && B && C && Dd && (a === CORR || b === CORR || c === CORR || d === CORR)) return false;
      if ((A && Dd && !B && !C) || (B && C && !A && !Dd)) return false;
    }
    return true;
  }
  // すべての床が上下左右のつながりで行き来できるか
  function connected(map) {
    let start = -1, total = 0;
    for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] !== WALL) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    const dist = distances(map, start % map.w, (start / map.w) | 0);
    let reached = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) reached++;
    return reached === total;
  }
  TS.DungeonCheck = { shapeOk, connected };

  function finishFloor(floor, rng, map) {
    const rooms = map.rooms;
    // 入口と階段は別の部屋に
    const ri = R.shuffle(rng, rooms.map((r) => r.id));
    const start = randomRoomTile(rng, rooms[ri[0]]);
    const stairs = randomRoomTile(rng, rooms[ri[1 % ri.length]]);
    let returnPoint = null;
    if (D.RETURN_POINT_FLOORS.includes(floor)) returnPoint = freeTile(map, rng, [start, stairs], rooms[ri[2 % ri.length]]);
    return { map, start, stairs, returnPoint, startRoom: ri[0] };
  }
  // まず起きないが、作り直しが続いたときの予備：中段に3部屋を一直線の通路で
  function fallbackFloor(floor, rng) {
    const M = D.MAP, w = M.w, h = M.h, tiles = new Array(w * h).fill(WALL), rooms = [];
    for (let i = 0; i < 3; i++) {
      const r = { id: i, x: i * M.cellW + 2, y: M.cellH + 2, w: 6, h: 4 };
      rooms.push(r);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = FLOOR;
      if (i) for (let x = rooms[i - 1].x + 6; x < r.x; x++) tiles[(r.y + 1) * w + x] = CORR;
    }
    return finishFloor(floor, rng, { w, h, tiles, rooms });
  }

  // 10階：小さな前室と、守護者のいる大広間
  function generateBossFloor(rng) {
    const M = D.MAP, w = M.w, h = M.h;
    const tiles = new Array(w * h).fill(WALL);
    const rooms = [
      { id: 0, x: 2, y: 9, w: 5, h: 5 },
      { id: 1, x: 13, y: 4, w: 15, h: 15 },
    ];
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = FLOOR;
    const cy = 11;
    for (let x = 7; x < 13; x++) tiles[cy * w + x] = CORR;
    const map = { w, h, tiles, rooms, boss: true };
    return { map, start: { x: 3, y: 11 }, stairs: null, returnPoint: null, startRoom: 0, bossPos: { x: 22, y: 11 } };
  }

  function randomRoomTile(rng, room) {
    return { x: room.x + R.int(rng, 0, room.w - 1), y: room.y + R.int(rng, 0, room.h - 1) };
  }

  function same(a, b) { return a && b && a.x === b.x && a.y === b.y; }

  // 部屋の中で、指定の座標と重ならないマス
  function freeTile(map, rng, avoid, room) {
    for (let tries = 0; tries < 200; tries++) {
      const r = room || R.pick(rng, map.rooms);
      const p = randomRoomTile(rng, r);
      if (!avoid.some((a) => same(a, p))) return p;
      room = null;
    }
    // 念のため全探索
    for (const r of map.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const p = { x, y };
      if (!avoid.some((a) => same(a, p))) return p;
    }
    return null;
  }

  function passable(map, x, y) {
    return x >= 0 && y >= 0 && x < map.w && y < map.h && map.tiles[y * map.w + x] !== WALL;
  }

  function roomAt(map, x, y) {
    for (const r of map.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    return null;
  }

  // 4方向で到達できる距離（BFS）。到達不能は -1
  function distances(map, sx, sy) {
    const dist = new Array(map.w * map.h).fill(-1);
    const q = [sy * map.w + sx];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % map.w, y = (c / map.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!passable(map, nx, ny)) continue;
        const k = ny * map.w + nx;
        if (dist[k] < 0) { dist[k] = dist[c] + 1; q.push(k); }
      }
    }
    return dist;
  }

  TS.Dungeon = { WALL, FLOOR, CORR, generate, freeTile, passable, roomAt, distances, randomRoomTile, same };
})(globalThis.TS = globalThis.TS || {});
