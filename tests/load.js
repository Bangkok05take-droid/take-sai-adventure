// Node.js でゲームの処理部分（表示以外）を読み込む
const path = require('path');
for (const f of ['data', 'story', 'rng', 'dungeon', 'game', 'bossai', 'save']) require(path.join(__dirname, '..', 'js', f + '.js'));
module.exports = globalThis.TS;
