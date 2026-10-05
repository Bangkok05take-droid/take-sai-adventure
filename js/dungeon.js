/* ダンジョン生成。3x3の区画に部屋（または通路の分岐点）を置き、
 * 全域木＋追加の通路でつなぐので、すべての部屋は必ず到達可能。 */
(function (TS) {
  'use strict';
  const D = TS.Data, R = TS.RNG;
  const WALL = 0, FLOOR = 1, CORR = 2;

  function generate(floor, rng) {
    if (floor === D.MAX_FLOOR) return generateBossFloor(rng);
    const M = D.MAP, w = M.w, h = M.h;
    const tiles = new Array(w * h).fill(WALL);
    const set = (x, y, v) => { if (tiles[y * w + x] === WALL || v === FLOOR) tiles[y * w + x] = v; };

    // 部屋を置く区画を決める（最低5部屋）
    const n = M.cols * M.rows;
    const isRoom = new Array(n).fill(true);
    const hubCount = R.int(rng, 0, 3);
    const order = R.shuffle(rng, [...Array(n).keys()]);
    for (let i = 0; i < hubCount; i++) isRoom[order[i]] = false;

    const rooms = [];
    const cells = [];
    for (let cy = 0; cy < M.rows; cy++) {
      for (let cx = 0; cx < M.cols; cx++) {
        const idx = cy * M.cols + cx;
        const ox = cx * M.cellW, oy = cy * M.cellH;
        let r;
        if (isRoom[idx]) {
          const rw = R.int(rng, 4, M.cellW - 3);
          const rh = R.int(rng, 3, M.cellH - 3);
          const rx = ox + 1 + R.int(rng, 0, M.cellW - 3 - rw);
          const ry = oy + 1 + R.int(rng, 0, M.cellH - 3 - rh);
          r = { id: rooms.length, x: rx, y: ry, w: rw, h: rh };
          rooms.push(r);
          for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) tiles[y * w + x] = FLOOR;
        } else {
          const hx = ox + R.int(rng, 2, M.cellW - 3), hy = oy + R.int(rng, 2, M.cellH - 3);
          r = { hub: true, x: hx, y: hy, w: 1, h: 1 };
          tiles[hy * w + hx] = CORR;
        }
        cells.push(r);
      }
    }

    // 区画どうしをつなぐ（ランダムDFSの全域木 + 追加の通路）
    const edges = [];
    const visited = new Array(n).fill(false);
    const stack = [R.int(rng, 0, n - 1)];
    visited[stack[0]] = true;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const nb = neighbors(c).filter((k) => !visited[k]);
      if (!nb.length) { stack.pop(); continue; }
      const k = R.pick(rng, nb);
      visited[k] = true; edges.push([c, k]); stack.push(k);
    }
    const extra = R.int(rng, 1, 3);
    for (let i = 0; i < extra; i++) {
      const c = R.int(rng, 0, n - 1);
      const k = R.pick(rng, neighbors(c));
      if (!edges.some((e) => (e[0] === c && e[1] === k) || (e[0] === k && e[1] === c))) edges.push([c, k]);
    }
    for (const [a, b] of edges) carve(cells[Math.min(a, b)], cells[Math.max(a, b)], Math.abs(a - b) === 1);

    function neighbors(c) {
      const cx = c % M.cols, cy = Math.floor(c / M.cols), out = [];
      if (cx > 0) out.push(c - 1);
      if (cx < M.cols - 1) out.push(c + 1);
      if (cy > 0) out.push(c - M.cols);
      if (cy < M.rows - 1) out.push(c + M.cols);
      return out;
    }
    function carve(A, B, horizontal) {
      if (horizontal) { // A が左、B が右
        const ya = A.y + R.int(rng, 0, A.h - 1), yb = B.y + R.int(rng, 0, B.h - 1);
        const sx = A.x + A.w, ex = B.x - 1;
        const mx = R.int(rng, Math.min(sx, ex), Math.max(sx, ex));
        for (let x = Math.min(sx, mx); x <= Math.max(sx, mx); x++) set(x, ya, CORR);
        for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) set(mx, y, CORR);
        for (let x = Math.min(mx, ex); x <= Math.max(mx, ex); x++) set(x, yb, CORR);
      } else { // A が上、B が下
        const xa = A.x + R.int(rng, 0, A.w - 1), xb = B.x + R.int(rng, 0, B.w - 1);
        const sy = A.y + A.h, ey = B.y - 1;
        const my = R.int(rng, Math.min(sy, ey), Math.max(sy, ey));
        for (let y = Math.min(sy, my); y <= Math.max(sy, my); y++) set(xa, y, CORR);
        for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) set(x, my, CORR);
        for (let y = Math.min(my, ey); y <= Math.max(my, ey); y++) set(xb, y, CORR);
      }
    }

    const map = { w, h, tiles, rooms };
    // 入口と階段は別の部屋に
    const ri = R.shuffle(rng, rooms.map((r) => r.id));
    const start = randomRoomTile(rng, rooms[ri[0]]);
    const stairs = randomRoomTile(rng, rooms[ri[1 % ri.length]]);
    let returnPoint = null;
    if (D.RETURN_POINT_FLOORS.includes(floor)) {
      returnPoint = freeTile(map, rng, [start, stairs], rooms[ri[2 % ri.length]]);
    }
    return { map, start, stairs, returnPoint, startRoom: ri[0] };
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
