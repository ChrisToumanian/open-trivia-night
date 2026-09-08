const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { createApp } = require('./app');

const port = process.env.PORT || 8080;
const { app, db } = createApp(process.env.DATA_DIR ? { dbPath: path.resolve(process.env.DATA_DIR, 'quiz.db') } : {});
const key = '/etc/letsencrypt/live/zipfx.net/privkey.pem';
const cert = '/etc/letsencrypt/live/zipfx.net/fullchain.pem';
const secure = fs.existsSync(key) && fs.existsSync(cert);
const listener = secure ? https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, app) : require('node:http').createServer(app);
const server = listener.listen(port, '0.0.0.0', () => console.log(`Open Trivia Night running at ${secure ? 'https' : 'http'}://localhost:${port}`));
server.on('error', error => { console.error(error); db.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
