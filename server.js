// server.js
const { readFileSync, existsSync } = require('fs');
const { createServer } = require('https');
const next = require('next');
const { parse } = require('url');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const PORT = dev ? 3051 : 3000;

// 👇 綁 0.0.0.0 讓手機也能連，實際 IP 用瀏覽器打 https://172.30.10.16:3000
const HOST = '0.0.0.0';

const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = path.resolve(process.cwd(), './https_certs');

// ✅ 建議 cert.crt 是 fullchain（包含中繼憑證）
const httpsOptions = {
  key:  readFileSync(path.join(certDir, 'cert.key')),
  cert: readFileSync(path.join(certDir, 'cert.crt')),
  // 如果你的 cert.crt 不是 fullchain，請加上 ca：
  // ca: readFileSync(path.join(certDir, 'ca.crt')),
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(PORT, HOST, err => {
    if (err) throw err;

    // 顯示你實際可用的對外位址（直接用你的 IP）
    console.log(`> Ready on https://172.30.10.16:${PORT}  (dev=${dev})`);

    // 快速檢查 cert 檔案是否存在
    ['cert.key','cert.crt'].forEach(f => {
      const p = path.join(certDir, f);
      if (!existsSync(p)) console.warn(`[warn] Missing ${p}`);
    });
  });
});
