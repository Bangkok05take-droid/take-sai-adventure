// GitHub Pages 相当のサブパス /take-sai-adventure/ で配信する簡易サーバー
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), BASE = '/take-sai-adventure/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function start(port) {
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (!u.startsWith(BASE)) { res.writeHead(404); res.end('not under base path'); return; }
    u = u.slice(BASE.length) || 'index.html';
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}
module.exports = { start, BASE };
if (require.main === module) start(+process.argv[2] || 8080).then(() => console.log('http://localhost:' + (process.argv[2] || 8080) + BASE));
