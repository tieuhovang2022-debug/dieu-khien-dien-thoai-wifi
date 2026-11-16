// Farm Control - Server Giai đoạn 3.1
// TCP 8787: agent ket noi (JSON theo dong). HTTP 8080: dashboard + API.
// Chi dung module co san cua Node (net/http/fs/path/os/crypto). Khong can npm install.
//
// Giai doan 2 them:
// - Trang thai deviceOwner / accessibility cua tung may.
// - Kho Gmail luu server-side (data/gmail-pool.json), mat khau LUON che khi tra qua API.
// - Pipeline chay theo buoc cho tung may / nhom may (kem buoc "manual" cho cham tay).
// - Endpoint QR ghi danh Device Owner: GET /api/provision/qr.
//
// Giai doan 3 them:
// - Cau hinh flow trong data/flow-config.json: chu danh dau (marker) cho man
//   hinh chao cua TikTok Lite + chu bao check-in thanh cong. Thieu/hong file
//   thi tu dung gia tri mac dinh ben duoi (va tu tao file mac dinh khi khoi dong).
// - Pipeline them buoc tap_text / wait_text / open_url / swipe_up / watch_game
//   va 2 flow co san: "dang-ky-tiktok-lite" (dang ky ban tu dong — xac minh
//   SDT/email + CAPTCHA van cham tay) va "quet-game-xem-video" (quet game,
//   xem video heo, tu phat hien check-in thanh cong qua dump_ui).
// - Watch manager: vong xem game chay nen theo tung may (API /api/watch),
//   su kien check-in thanh cong ghi vao GET /api/events de dashboard hien.
//
// Giai doan 3.1 them:
// - Lenh agent moi "open_google_signin": mo thang man hinh them tai khoan
//   Google cua Android.
// - Flow "cap-gmail-tu-dong": bam "Cap Gmail" la may TU mo man hinh dang
//   nhap Google, TU nhap email tu kho, bam Tiep theo, TU nhap mat khau va
//   dang nhap — khong can cham tay, TRU khi Google bat xac minh (CAPTCHA /
//   ma dien thoai / 2 buoc): luc do flow dung o "Cho cham tay"
//   (waiting_manual) dung co che cua pipeline. Cac dau chu nhan dien man
//   hinh dang nhap Google nam trong muc "signin" cua flow-config.json.
// - Pipeline "cap-may-moi": buoc cap Gmail chay luon trinh tu dang nhap tu
//   dong tren (chi dung Cho cham tay khi Google bat xac minh).
// - POST /api/gmail/signin-assist uy quyen cho trinh tu dang nhap tu dong
//   nay (van giu nguyen dang response cu).
// - AN TOAN: mat khau that CHI di qua kenh lenh TCP toi agent; moi log /
//   su kien / response API deu chi hien "********".
'use strict';
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TCP_PORT = process.env.FARM_TCP_PORT ? parseInt(process.env.FARM_TCP_PORT, 10) : 8787;
const HTTP_PORT = process.env.FARM_HTTP_PORT ? parseInt(process.env.FARM_HTTP_PORT, 10) : 8080;
const OFFLINE_AFTER_MS = 90 * 1000;
const CMD_TIMEOUT_MS = 30 * 1000;
const APK_DIR = path.join(__dirname, 'public-apks');
const DATA_DIR = path.join(__dirname, 'data');
const POOL_FILE = path.join(DATA_DIR, 'gmail-pool.json');
const PROVISION_FILE = path.join(__dirname, 'provisioning.json');

const devices = new Map(); // androidId -> device object
let cmdCounter = 0;

function nowIso() { return new Date().toISOString(); }

function publicDevice(d) {
  return {
    id: d.id,
    label: d.label || '',
    model: d.model || '',
    manufacturer: d.manufacturer || '',
    android: d.android || '',
    sdk: d.sdk || 0,
    battery: (d.battery === undefined ? null : d.battery),
    charging: !!d.charging,
    network: d.network || 'none',
    screenOn: !!d.screenOn,
    online: !!d.online,
    lastSeen: d.lastSeen || null,
    agentVersion: d.agentVersion || '',
    deviceOwner: !!d.deviceOwner,
    accessibility: !!d.accessibility,
    watch: (typeof watches !== 'undefined' && watches.has(d.id)) ? publicWatch(watches.get(d.id)) : null
  };
}

function handleAgentMessage(dev, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'hello') {
    dev.label = msg.label || dev.label || '';
    dev.model = msg.model || '';
    dev.manufacturer = msg.manufacturer || '';
    dev.android = msg.android || '';
    dev.sdk = msg.sdk || 0;
    dev.battery = (msg.battery === undefined ? dev.battery : msg.battery);
    dev.agentVersion = msg.agentVersion || '';
    if (msg.deviceOwner !== undefined) dev.deviceOwner = !!msg.deviceOwner;
    if (msg.accessibility !== undefined) dev.accessibility = !!msg.accessibility;
    dev.online = true;
    dev.lastSeen = Date.now();
    console.log('[hello] ' + dev.id + ' label=' + dev.label + ' model=' + dev.model + ' android=' + dev.android + ' deviceOwner=' + dev.deviceOwner + ' accessibility=' + dev.accessibility);
  } else if (msg.type === 'status') {
    if (msg.battery !== undefined) dev.battery = msg.battery;
    if (msg.charging !== undefined) dev.charging = !!msg.charging;
    if (msg.network !== undefined) dev.network = msg.network;
    if (msg.screenOn !== undefined) dev.screenOn = !!msg.screenOn;
    if (msg.deviceOwner !== undefined) dev.deviceOwner = !!msg.deviceOwner;
    if (msg.accessibility !== undefined) dev.accessibility = !!msg.accessibility;
    dev.online = true;
    dev.lastSeen = Date.now();
  } else if (msg.type === 'result') {
    dev.lastSeen = Date.now();
    const p = dev.pending.get(msg.id);
    if (p) {
      dev.pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }
}

const tcpServer = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let buffer = '';
  let dev = null;
  console.log('[tcp] ket noi moi tu ' + socket.remoteAddress + ':' + socket.remotePort);

  socket.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (!dev) {
        // Tin nhan dau tien phai co androidId (hello)
        const id = msg.androidId || msg.id;
        if (!id) continue;
        let existing = devices.get(id);
        if (!existing) {
          existing = {
            id: id, label: '', model: '', manufacturer: '', android: '', sdk: 0,
            battery: null, charging: false, network: 'none', screenOn: false,
            online: false, lastSeen: null, agentVersion: '',
            deviceOwner: false, accessibility: false,
            socket: null, pending: new Map()
          };
          devices.set(id, existing);
        }
        dev = existing;
        // Neu thiet bi ket noi lai, dong ket noi cu
        if (dev.socket && dev.socket !== socket) {
          try { dev.socket.destroy(); } catch (e) {}
        }
        dev.socket = socket;
        dev.online = true;
        dev.lastSeen = Date.now();
      }
      handleAgentMessage(dev, msg);
    }
  });

  function onGone() {
    if (dev && dev.socket === socket) {
      dev.socket = null;
      dev.online = false;
      for (const [cid, p] of dev.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('device_disconnected'));
        dev.pending.delete(cid);
      }
      console.log('[tcp] thiet bi ngat ket noi: ' + dev.id);
    }
  }
  socket.on('close', onGone);
  socket.on('error', onGone);
});

// Danh dau offline neu khong co heartbeat qua 90 giay
setInterval(() => {
  const t = Date.now();
  for (const d of devices.values()) {
    if (d.online && d.lastSeen && (t - d.lastSeen > OFFLINE_AFTER_MS)) {
      d.online = false;
      console.log('[offline] ' + d.id + ' (' + (d.label || '') + ')');
    }
  }
}, 5000);

function sendCommand(deviceId, cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const dev = devices.get(deviceId);
    if (!dev) { reject(new Error('device_not_found')); return; }
    if (!dev.online || !dev.socket) { reject(new Error('device_offline')); return; }
    const id = 'c' + (++cmdCounter) + '-' + Date.now();
    const timer = setTimeout(() => {
      dev.pending.delete(id);
      reject(new Error('cmd_timeout'));
    }, timeoutMs || CMD_TIMEOUT_MS);
    dev.pending.set(id, { resolve: resolve, reject: reject, timer: timer });
    const payload = JSON.stringify({ id: id, cmd: cmd, args: args || {} }) + '\n';
    dev.socket.write(payload, 'utf8', (err) => {
      if (err) {
        dev.pending.delete(id);
        clearTimeout(timer);
        reject(new Error('send_failed'));
      }
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) { req.destroy(); reject(new Error('body_too_large')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function jsonRes(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body) return {};
  return JSON.parse(body);
}

// ================= Kho Gmail (server-side) =================
// File data/gmail-pool.json: { accounts: [{id, email, password, status, deviceId, assignedAt, createdAt}] }
// status: ready | assigned | die
// QUY TAC AN TOAN: password KHONG bao gio tra ve qua API/dashboard — chi gui
// thang qua kenh lenh TCP toi agent khi chay "signin-assist" (input_text).
let pool = { accounts: [] };
let acctCounter = 0;

function loadPool() {
  try {
    const raw = fs.readFileSync(POOL_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.accounts)) pool = j;
  } catch (e) {
    pool = { accounts: [] };
  }
  acctCounter = pool.accounts.length;
}
function savePool() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2), 'utf8');
  } catch (e) {
    console.error('[gmail] khong ghi duoc pool:', e.message);
  }
}
loadPool();

function publicAccount(a) {
  return {
    id: a.id,
    email: a.email,
    passwordMasked: '********',
    status: a.status,
    deviceId: a.deviceId || null,
    assignedAt: a.assignedAt || null,
    createdAt: a.createdAt || null
  };
}

function parseImportLines(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let sep = -1;
    if (line.indexOf('|') >= 0) sep = line.indexOf('|');
    else if (line.indexOf(':') >= 0) sep = line.indexOf(':');
    else if (/\s/.test(line)) sep = line.search(/\s/);
    if (sep < 0) continue;
    const email = line.slice(0, sep).trim();
    const password = line.slice(sep + 1).trim().replace(/^\s+/, '');
    if (!email || email.indexOf('@') < 0 || !password) continue;
    out.push({ email: email, password: password });
  }
  return out;
}

function importAccounts(text) {
  const parsed = parseImportLines(text);
  let added = 0, skipped = 0;
  for (const p of parsed) {
    if (pool.accounts.some((a) => a.email.toLowerCase() === p.email.toLowerCase())) { skipped++; continue; }
    pool.accounts.push({
      id: 'g' + (++acctCounter) + '-' + Date.now().toString(36),
      email: p.email,
      password: p.password,
      status: 'ready',
      deviceId: null,
      assignedAt: null,
      createdAt: nowIso()
    });
    added++;
  }
  if (added > 0) savePool();
  return { added: added, skipped: skipped, total: pool.accounts.length };
}

/** Cap tai khoan ready tiep theo cho mot may. Tra {account} hoac {error}. */
function assignGmail(deviceId) {
  const a = pool.accounts.find((x) => x.status === 'ready');
  if (!a) return { error: 'pool_empty' };
  a.status = 'assigned';
  a.deviceId = deviceId;
  a.assignedAt = nowIso();
  savePool();
  return { account: a };
}

function findAccountForDevice(deviceId) {
  return pool.accounts.find((x) => x.status === 'assigned' && x.deviceId === deviceId) || null;
}

// ================= Cau hinh flow (Giai doan 3) =================
// File data/flow-config.json — nguoi dung tu sua duoc:
//   onboardingMarkers: cac chu (tieng Nhat) co the xuat hien o man hinh chao /
//     man hinh dau cua TikTok Lite ma flow dang ky se thu cham vao (dung sai:
//     khong thay thi bo qua). Day la gia tri MAC DINH tot nhat co the — can
//     HIEU CHUAN lai theo chu that tren may that (xem HUONG-DAN muc Hieu chuan).
//   checkinSuccessMarkers: cac chu bao hieu "heo da nhay / check-in thanh
//     cong" — vong xem game quet dump_ui, thay mot trong cac chu nay la bao
//     thanh cong. Cung can hieu chuan theo man hinh that.
//   signin (Giai doan 3.1): cac dau chu nhan dien man hinh DANG NHAP GOOGLE
//     cho flow cap Gmail tu dong — emailScreen (man hinh nhap email),
//     nextButton (nut Tiep theo), passwordScreen (man hinh nhap mat khau),
//     agreeButton (nut dong y dieu khoan neu co), verifyMarkers (cac chu
//     bao Google dang bat XAC MINH: CAPTCHA / ma dien thoai / 2 buoc — thay
//     la dung Cho cham tay). Mac dinh theo tieng Nhat truoc, kem tieng Anh;
//     cung can hieu chuan theo man hinh dang nhap that tren may that.
// File thieu hoac hong -> dung mac dinh, server khong chet.
const FLOW_CONFIG_FILE = path.join(DATA_DIR, 'flow-config.json');
const FLOW_DEFAULTS = {
  onboardingMarkers: ['同意する', '許可する', 'スキップ', '次へ', '登録', 'ログイン'],
  checkinSuccessMarkers: ['チェックイン完了', 'チェックイン成功', 'ポイントを獲得しました', '付与されました'],
  signin: {
    emailScreen: ['メールアドレスまたは電話番号', 'メールアドレス', 'Email or phone'],
    nextButton: ['次へ', 'Next'],
    passwordScreen: ['パスワード', 'Password'],
    agreeButton: ['同意します', 'I agree'],
    verifyMarkers: ['本人確認', '確認コード', 'セキュリティコード', '電話番号を入力', 'ロボットではありません', '2段階認証']
  }
};

function sanitizeMarkers(v, fallback) {
  if (!Array.isArray(v)) return fallback.slice();
  const out = v.filter((x) => typeof x === 'string' && x.trim().length > 0);
  return out.length ? out : fallback.slice();
}

function sanitizeSignin(v) {
  const d = FLOW_DEFAULTS.signin;
  const s = (v && typeof v === 'object') ? v : {};
  return {
    emailScreen: sanitizeMarkers(s.emailScreen, d.emailScreen),
    nextButton: sanitizeMarkers(s.nextButton, d.nextButton),
    passwordScreen: sanitizeMarkers(s.passwordScreen, d.passwordScreen),
    agreeButton: sanitizeMarkers(s.agreeButton, d.agreeButton),
    verifyMarkers: sanitizeMarkers(s.verifyMarkers, d.verifyMarkers)
  };
}

function loadFlowConfig() {
  try {
    const raw = fs.readFileSync(FLOW_CONFIG_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') throw new Error('bad config');
    return {
      onboardingMarkers: sanitizeMarkers(j.onboardingMarkers, FLOW_DEFAULTS.onboardingMarkers),
      checkinSuccessMarkers: sanitizeMarkers(j.checkinSuccessMarkers, FLOW_DEFAULTS.checkinSuccessMarkers),
      signin: sanitizeSignin(j.signin)
    };
  } catch (e) {
    return {
      onboardingMarkers: FLOW_DEFAULTS.onboardingMarkers.slice(),
      checkinSuccessMarkers: FLOW_DEFAULTS.checkinSuccessMarkers.slice(),
      signin: sanitizeSignin(null)
    };
  }
}

function ensureFlowConfig() {
  try {
    if (!fs.existsSync(FLOW_CONFIG_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FLOW_CONFIG_FILE, JSON.stringify(FLOW_DEFAULTS, null, 2), 'utf8');
      console.log('[flow-config] da tao file mac dinh: ' + FLOW_CONFIG_FILE);
    }
  } catch (e) {
    console.error('[flow-config] khong tao duoc file mac dinh:', e.message);
  }
}
ensureFlowConfig();

// ================= Su kien cho dashboard (Giai doan 3) =================
// Watch/pipeline ghi su kien vao day; dashboard doc qua GET /api/events va
// hien vao nhat ky. Su kien quan trong nhat: type "checkin_success".
const events = [];
let eventCounter = 0;
let checkinSuccessTotal = 0;

function addEvent(type, deviceId, message) {
  const ev = {
    id: ++eventCounter,
    ts: nowIso(),
    type: type,
    deviceId: deviceId || null,
    label: deviceId ? ((devices.get(deviceId) || {}).label || deviceId) : '',
    message: message || ''
  };
  events.push(ev);
  while (events.length > 200) events.shift();
  if (type === 'checkin_success') checkinSuccessTotal++;
  console.log('[event] ' + type + ' ' + (ev.label || '') + ' — ' + ev.message);
  return ev;
}

// ================= Trinh tu DANG NHAP GOOGLE TU DONG (Giai doan 3.1) =================
// Dung chung cho flow "cap-gmail-tu-dong", buoc cap Gmail cua pipeline
// "cap-may-moi" va endpoint /api/gmail/signin-assist.
// Trinh tu: mo man hinh dang nhap Google (open_google_signin) -> cho man
// hinh email (quet dump_ui) -> cham o EditText + nhap email -> bam Tiep
// theo -> cho man hinh mat khau -> cham o EditText + nhap mat khau -> bam
// Tiep theo -> cham nut Dong y neu co -> quet lai: con chu XAC MINH thi
// dung Cho cham tay, khong con thi xong.
// hooks.park(note): neu duoc cung cap (boi pipeline) thi ham se dung o
// trang thai waiting_manual cho den khi nguoi dung bam Resume; neu khong
// co hooks.park thi gap xac minh se tra outcome 'verify' ngay.
// AN TOAN: acct.password chi nam trong lenh input_text gui qua kenh TCP
// toi agent; moi log/su kien/ghi chu deu che "********".
const SIGNIN_VERIFY_NOTE = 'Máy đang ở bước xác minh của Google — xử lý chạm tay trên máy rồi bấm Chạy tiếp';

/** Tim marker dau tien xuat hien trong text/desc cua bat ky node nao. */
function dumpHasAny(nodes, markers) {
  for (const n of nodes) {
    const hay = ((n.text || '') + '\n' + (n.desc || ''));
    for (const m of markers) {
      if (m && hay.indexOf(m) >= 0) return m;
    }
  }
  return null;
}

/** Node o nhap dau tien (className chua "EditText" — khop ca AppCompatEditText). */
function firstEditText(nodes) {
  for (const n of nodes) {
    if (n.className && n.className.indexOf('EditText') >= 0 &&
        Array.isArray(n.bounds) && n.bounds.length === 4) return n;
  }
  return null;
}

async function dumpUiNodes(deviceId) {
  try {
    const res = await sendCommand(deviceId, 'dump_ui', {}, 20000);
    if (res && res.ok && res.data && Array.isArray(res.data.nodes)) return res.data.nodes;
  } catch (e) { /* tra null — vong poll se thu lai */ }
  return null;
}

/** Poll dump_ui moi ~1,5 giay cho den khi pred(nodes) tra ve gia tri khac null, hoac het timeoutMs. */
async function pollDumpUntil(deviceId, pred, timeoutMs) {
  const t0 = Date.now();
  while (true) {
    const nodes = await dumpUiNodes(deviceId);
    if (nodes) {
      const hit = pred(nodes);
      if (hit) return { nodes: nodes, hit: hit };
    }
    if (Date.now() - t0 >= timeoutMs) return null;
    await sleepMs(1500);
  }
}

/** Cham vao tam o EditText dau tien trong dump. Tra true neu cham duoc. */
async function tapFirstEditText(deviceId, nodes) {
  const et = firstEditText(nodes);
  if (!et) return false;
  const x = Math.round((et.bounds[0] + et.bounds[2]) / 2);
  const y = Math.round((et.bounds[1] + et.bounds[3]) / 2);
  try {
    const res = await sendCommand(deviceId, 'tap', { x: x, y: y }, 15000);
    return !!(res && res.ok);
  } catch (e) {
    return false;
  }
}

/** Thu cham lan luot cac marker (tap_text contains); tra marker cham duoc hoac null. */
async function tapFirstMarker(deviceId, markers) {
  for (const m of markers) {
    try {
      const res = await sendCommand(deviceId, 'tap_text', { text: m, match: 'contains' }, 20000);
      if (res && res.ok) return m;
    } catch (e) { /* thu marker tiep theo */ }
  }
  return null;
}

/**
 * Cua so ~8 giay sau khi bam Tiep theo o man hinh mat khau: neu thay nut
 * Dong y (dieu khoan) thi cham (dung sai — khong thay cung khong sao).
 * Thoat som neu qua >= 3 giay ma man hinh khong con bat ky dau chu dang
 * nhap nao (da qua khoi cac man hinh dang nhap).
 */
async function agreeWatch(deviceId, cfg, log) {
  const windowMs = 8000;
  const t0 = Date.now();
  while (Date.now() - t0 < windowMs) {
    const nodes = await dumpUiNodes(deviceId);
    if (nodes) {
      const agree = dumpHasAny(nodes, cfg.agreeButton);
      if (agree) {
        const tapped = await tapFirstMarker(deviceId, [agree]);
        if (tapped) {
          log('Đã bấm nút đồng ý "' + tapped + '"');
          await sleepMs(1500);
          return;
        }
      }
      const anySignin = dumpHasAny(nodes, cfg.emailScreen) || dumpHasAny(nodes, cfg.passwordScreen) ||
        dumpHasAny(nodes, cfg.verifyMarkers) || dumpHasAny(nodes, cfg.agreeButton);
      if (!anySignin && (Date.now() - t0) >= 3000) return;
    }
    await sleepMs(1200);
  }
}

/**
 * Chay toan bo trinh tu dang nhap Google cho mot may bang tai khoan acct
 * (acct.password chi di qua kenh agent). Tra ve:
 *   { outcome: 'done' | 'verify' | 'stopped' | 'error', note, emailTyped, passwordTyped }
 */
async function gmailSigninSequence(deviceId, acct, hooks) {
  hooks = hooks || {};
  const log = (msg) => {
    addEvent('gmail_signin', deviceId, msg);
    if (hooks.log) hooks.log(msg);
  };
  const cfg = loadFlowConfig().signin;
  const out = { outcome: 'error', note: '', emailTyped: false, passwordTyped: false };
  let res = null;

  // Buoc 2: mo man hinh dang nhap Google
  try {
    res = await sendCommand(deviceId, 'open_google_signin', {}, CMD_TIMEOUT_MS);
  } catch (e) {
    out.note = 'Không gửi được lệnh mở màn hình đăng nhập Google: ' + (e && e.message || e);
    return out;
  }
  if (!res || !res.ok) {
    out.note = 'Không mở được màn hình đăng nhập Google: ' + ((res && res.error) || 'unknown');
    return out;
  }
  log('Cấp Gmail tự động: đã mở màn hình đăng nhập Google, chờ ô nhập email...');

  // Buoc 3: cho man hinh nhap email xuat hien (toi da ~25 giay)
  const emailDump = await pollDumpUntil(deviceId,
    (nodes) => dumpHasAny(nodes, cfg.emailScreen), 25000);
  if (!emailDump) {
    out.note = 'Không thấy màn hình nhập email của Google sau 25 giây (kiểm tra máy / dấu chữ signin.emailScreen trong flow-config.json)';
    return out;
  }

  // Buoc 4: cham o email + nhap email
  if (!await tapFirstEditText(deviceId, emailDump.nodes)) {
    out.note = 'Không chạm được ô nhập email trên màn hình đăng nhập Google';
    return out;
  }
  await sleepMs(400);
  try {
    res = await sendCommand(deviceId, 'input_text', { text: acct.email }, CMD_TIMEOUT_MS);
  } catch (e) {
    out.note = 'Không nhập được email: ' + (e && e.message || e);
    return out;
  }
  if (!res || !res.ok) {
    out.note = 'Không nhập được email: ' + ((res && res.error) || 'unknown');
    return out;
  }
  out.emailTyped = true;
  log('Đã nhập email ' + acct.email);

  // Buoc 5: bam Tiep theo
  const nb1 = await tapFirstMarker(deviceId, cfg.nextButton);
  if (!nb1) {
    out.note = 'Không thấy nút Tiếp theo ở màn hình nhập email';
    return out;
  }
  log('Đã bấm "' + nb1 + '", chờ màn hình nhập mật khẩu...');

  // Buoc 6: cho man hinh mat khau — hoac man hinh XAC MINH (dung Cho cham tay)
  let pwDump = null;
  let resumed6 = false;
  while (!pwDump) {
    const r = await pollDumpUntil(deviceId, (nodes) => {
      if (dumpHasAny(nodes, cfg.verifyMarkers)) return 'verify';
      if (dumpHasAny(nodes, cfg.passwordScreen) || firstEditText(nodes)) return 'password';
      return null;
    }, 25000);
    if (r && r.hit === 'password') { pwDump = r; break; }
    if (r && r.hit === 'verify') {
      log('Google yêu cầu xác minh — dừng chờ chạm tay');
      if (!hooks.park) { out.outcome = 'verify'; out.note = SIGNIN_VERIFY_NOTE; return out; }
      const how = await hooks.park(SIGNIN_VERIFY_NOTE);
      if (how === 'stopped') { out.outcome = 'stopped'; return out; }
      resumed6 = true;
      continue;
    }
    // Het 25 giay ma khong thay ca hai:
    if (resumed6) break; // nguoi dung da xu ly tay xong (co the da dang nhap xong) -> sang kiem tra cuoi
    out.note = 'Không thấy màn hình nhập mật khẩu sau 25 giây';
    return out;
  }

  if (pwDump) {
    // Buoc 7: cham o mat khau + nhap mat khau (CHI qua kenh agent)
    if (!await tapFirstEditText(deviceId, pwDump.nodes)) {
      out.note = 'Không chạm được ô nhập mật khẩu';
      return out;
    }
    await sleepMs(400);
    try {
      res = await sendCommand(deviceId, 'input_text', { text: acct.password }, CMD_TIMEOUT_MS);
    } catch (e) {
      out.note = 'Không nhập được mật khẩu: ' + (e && e.message || e);
      return out;
    }
    if (!res || !res.ok) {
      out.note = 'Không nhập được mật khẩu: ' + ((res && res.error) || 'unknown');
      return out;
    }
    out.passwordTyped = true;
    log('Đã nhập mật khẩu ********');

    // Buoc 8: bam Tiep theo
    const nb2 = await tapFirstMarker(deviceId, cfg.nextButton);
    if (!nb2) {
      out.note = 'Không thấy nút Tiếp theo ở màn hình nhập mật khẩu';
      return out;
    }
    log('Đã bấm "' + nb2 + '", chờ Google xử lý...');
  }

  // Buoc 9+10: vong kiem tra cuoi — cham nut Dong y neu co, quet chu xac
  // minh; con xac minh thi dung Cho cham tay, Resume thi chay lai vong nay.
  while (true) {
    await agreeWatch(deviceId, cfg, log);
    const nodes = await dumpUiNodes(deviceId);
    const v = nodes ? dumpHasAny(nodes, cfg.verifyMarkers) : null;
    if (!v) {
      out.outcome = 'done';
      log('✅ Đăng nhập Gmail hoàn tất: ' + acct.email);
      return out;
    }
    log('Google vẫn yêu cầu xác minh (thấy chữ "' + v + '") — dừng chờ chạm tay');
    if (!hooks.park) { out.outcome = 'verify'; out.note = SIGNIN_VERIFY_NOTE; return out; }
    const how = await hooks.park(SIGNIN_VERIFY_NOTE);
    if (how === 'stopped') { out.outcome = 'stopped'; return out; }
  }
}

/**
 * Tao ham park() cho mot buoc pipeline: dat buoc + may vao waiting_manual
 * va cho POST /api/pipeline/resume (dung lai co che cua buoc "manual").
 */
function makePipelinePark(run, dr, step) {
  return async function (note) {
    step.status = 'waiting_manual';
    step.note = note;
    dr.status = 'waiting_manual';
    console.log('[pipeline] ' + run.id + ' ' + dr.deviceId + ' CHO CHAM TAY (gmail): ' + note);
    const how = await new Promise((resolve) => { dr._resumeResolve = resolve; });
    dr._resumeResolve = null;
    if (run.stopped || how === 'stopped') return 'stopped';
    dr.status = 'running';
    step.status = 'running';
    step.note = '';
    return 'resumed';
  };
}

// ================= Pipeline engine =================
// Buoc (step) co cac loai: command | wait | manual | assign_gmail
// Moi may chay tuan tu cac buoc cua minh; cac may chay song song.
// Buoc "manual": may dung o trang thai waiting_manual cho den khi
// POST /api/pipeline/resume duoc goi (buoc "Cho cham tay" — CAPTCHA/xac minh).
const TIKTOK_PKG = 'com.zhiliaoapp.musically.go';

const PIPELINES = [
  {
    // Giai doan 3.1: buoc cap Gmail (withSignin) chay luon trinh tu dang
    // nhap Google TU DONG bang tai khoan vua cap — chi dung "Cho cham
    // tay" ngay trong buoc do khi Google bat xac minh. Buoc manual cuoi
    // van giu: nguoi dung mo may kiem tra lai + dang nhap TikTok Lite.
    id: 'cap-may-moi',
    name: 'Cấp máy mới (Gmail → LINE → TikTok Lite)',
    steps: [
      { type: 'assign_gmail', withSignin: true, name: 'Cấp Gmail từ kho + tự đăng nhập Google' },
      { type: 'command', cmd: 'install_url', paramKey: 'lineApkUrl', name: 'Cài LINE' },
      { type: 'command', cmd: 'install_url', paramKey: 'tiktokApkUrl', name: 'Cài TikTok Lite' },
      { type: 'command', cmd: 'open_app', args: { 'package': 'com.zhiliaoapp.musically.go' }, name: 'Mở TikTok Lite' },
      { type: 'manual', name: 'Kiểm tra trên máy: đăng nhập TikTok Lite / xử lý CAPTCHA nếu còn (chạm tay)' }
    ]
  },
  {
    // Cap Gmail TU DONG (Giai doan 3.1) — dung cho nut "Cap Gmail" tren
    // the may: cap tai khoan tu kho (may da co tai khoan duoc cap thi
    // dung lai, khong ton them tai khoan moi) roi TU dang nhap Google
    // theo trinh tu gmailSigninSequence. Chi dung Cho cham tay khi
    // Google bat xac minh (CAPTCHA / ma dien thoai / 2 buoc).
    id: 'cap-gmail-tu-dong',
    name: 'Cấp Gmail tự động (tự đăng nhập Google)',
    steps: [
      { type: 'assign_gmail', reuseAssigned: true, name: 'Cấp Gmail từ kho cho máy' },
      { type: 'gmail_signin', name: 'Tự đăng nhập Google bằng Gmail vừa cấp' }
    ]
  },
  {
    // Dang ky TikTok Lite BAN TU DONG: agent tu cham qua cac man hinh chao
    // (nut dong y / bo qua / tiep theo...) theo marker trong flow-config,
    // nhung buoc nhap so dien thoai/email + ma xac minh + CAPTCHA thi dung
    // o buoc manual cho nguoi dung lam tay — Google/TikTok khong cho tu
    // dong hoa cac buoc xac minh nay.
    // LUU Y: cac marker chi la mac dinh "doan tot nhat" — phai hieu chuan
    // theo chu that tren may that sau lan chay dau (xem HUONG-DAN).
    id: 'dang-ky-tiktok-lite',
    name: 'Đăng ký TikTok Lite (bán tự động)',
    genSteps: function (params, cfg) {
      const steps = [
        { type: 'command', cmd: 'open_app', args: { 'package': TIKTOK_PKG }, name: 'Mở TikTok Lite' },
        { type: 'wait', seconds: 5, name: 'Chờ app mở (5 giây)' }
      ];
      for (const m of cfg.onboardingMarkers) {
        steps.push({ type: 'tap_text', text: m, match: 'contains', tolerant: true, name: 'Chạm "' + m + '" nếu có' });
        steps.push({ type: 'wait', seconds: 1, name: 'Chờ 1 giây' });
      }
      steps.push({ type: 'manual', name: 'Đăng nhập: nhập số điện thoại/email, mã xác minh và CAPTCHA trên máy' });
      // Sau khi nguoi dung dang nhap xong va bam Resume: thu cham cac nut
      // xac nhan con lai (dang ky / tiep theo) — dung sai nhu tren.
      const tail = [];
      for (const m of cfg.onboardingMarkers) {
        if (m === '登録' || m === '次へ') tail.push(m);
      }
      for (const m of ['登録', '次へ']) if (tail.indexOf(m) < 0) tail.push(m);
      for (const m of tail) {
        steps.push({ type: 'tap_text', text: m, match: 'contains', tolerant: true, name: 'Sau đăng nhập: chạm "' + m + '" nếu có' });
        steps.push({ type: 'wait', seconds: 1, name: 'Chờ 1 giây' });
      }
      return steps;
    }
  },
  {
    // Quet game + xem video heo: buoc watch_game bat vong xem chay nen o
    // watch manager (vuot video moi 25-40 giay, quet dump_ui tim chu bao
    // check-in thanh cong). Pipeline chi bat vong xem roi hoan thanh —
    // theo doi ket qua o the may / nhat ky su kien / o dem check-in.
    id: 'quet-game-xem-video',
    name: 'Quét game & xem video heo (tự báo check-in)',
    genSteps: function (params, cfg) {
      const minutes = Math.max(1, Math.min(240, parseInt(params && params.minutes, 10) || 30));
      const gameUrl = (params && params.gameUrl) || '';
      const steps = [];
      if (gameUrl) {
        steps.push({ type: 'open_url', url: gameUrl, name: 'Mở link game' });
      } else {
        steps.push({ type: 'command', cmd: 'open_app', args: { 'package': TIKTOK_PKG }, name: 'Mở TikTok Lite' });
      }
      steps.push({ type: 'wait', seconds: 3, name: 'Chờ game/app tải (3 giây)' });
      steps.push({ type: 'watch_game', minutes: minutes, gameUrl: gameUrl, name: 'Bật vòng quét game & xem video (' + minutes + ' phút)' });
      return steps;
    }
  }
];

const runs = new Map(); // runId -> run
let runCounter = 0;

function buildSteps(pipeline, params) {
  const defs = (typeof pipeline.genSteps === 'function')
    ? pipeline.genSteps(params || {}, loadFlowConfig())
    : pipeline.steps;
  return defs.map((s) => {
    const st = {
      type: s.type, name: s.name, status: 'pending', note: '', at: null
    };
    if (s.type === 'command') {
      st.cmd = s.cmd;
      if (s.paramKey) {
        const url = (params && params[s.paramKey]) || '';
        st.args = { url: url };
        if (!url) { st.status = 'skipped'; st.note = 'Chưa nhập URL APK — bỏ qua'; }
      } else {
        st.args = s.args || {};
      }
    }
    if (s.type === 'wait') st.seconds = s.seconds || 5;
    if (s.type === 'tap_text') {
      st.text = s.text || '';
      st.match = s.match || 'contains';
      st.tolerant = !!s.tolerant;
    }
    if (s.type === 'wait_text') {
      st.text = s.text || '';
      st.timeoutMs = Math.min(s.timeoutMs || 10000, 30000);
      st.tolerant = !!s.tolerant;
    }
    if (s.type === 'open_url') st.url = s.url || '';
    if (s.type === 'watch_game') {
      st.minutes = s.minutes || 30;
      st.gameUrl = s.gameUrl || '';
    }
    if (s.type === 'assign_gmail') {
      st.withSignin = !!s.withSignin;
      st.reuseAssigned = !!s.reuseAssigned;
    }
    return st;
  });
}

function publicRun(run) {
  return {
    id: run.id,
    pipelineId: run.pipelineId,
    pipelineName: run.pipelineName,
    startedAt: run.startedAt,
    stopped: !!run.stopped,
    devices: Array.from(run.devices.values()).map((dr) => ({
      deviceId: dr.deviceId,
      status: dr.status,
      currentStep: dr.currentStep,
      steps: dr.steps.map((s) => ({
        type: s.type, name: s.name, status: s.status, note: s.note || '', at: s.at || null,
        cmd: s.cmd || null
      }))
    }))
  };
}

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runDevicePipeline(run, dr) {
  const devLabel = dr.deviceId;
  for (let i = 0; i < dr.steps.length; i++) {
    if (run.stopped) { dr.status = 'stopped'; return; }
    const step = dr.steps[i];
    if (step.status === 'skipped') continue;
    dr.currentStep = i;
    step.at = nowIso();
    try {
      if (step.type === 'assign_gmail') {
        step.status = 'running';
        // reuseAssigned (flow cap-gmail-tu-dong): may da co tai khoan
        // duoc cap thi dung lai tai khoan do, khong cap them tai khoan moi.
        let acct = step.reuseAssigned ? findAccountForDevice(dr.deviceId) : null;
        if (acct) {
          step.note = 'Dùng Gmail đã cấp cho máy: ' + acct.email;
        } else {
          const res = assignGmail(dr.deviceId);
          if (res.error) {
            step.status = 'error';
            step.note = 'Kho Gmail hết tài khoản sẵn sàng (pool_empty)';
            dr.status = 'error';
            console.log('[pipeline] ' + run.id + ' ' + devLabel + ' assign_gmail: pool_empty');
            return;
          }
          acct = res.account;
          step.note = 'Đã cấp: ' + acct.email;
        }
        dr._gmailAccount = acct;
        step.status = 'done';
        // withSignin (pipeline cap-may-moi): chay luon trinh tu dang nhap
        // Google tu dong bang tai khoan vua cap, ngay trong buoc nay.
        if (step.withSignin) {
          step.status = 'running';
          const out = await gmailSigninSequence(dr.deviceId, acct, { park: makePipelinePark(run, dr, step) });
          if (out.outcome === 'stopped') {
            step.status = 'stopped';
            dr.status = 'stopped';
            return;
          }
          if (out.outcome !== 'done') {
            step.status = 'error';
            step.note = (step.note ? step.note + ' · ' : '') + 'Tự đăng nhập Google chưa xong: ' + (out.note || out.outcome);
            dr.status = 'error';
            console.log('[pipeline] ' + run.id + ' ' + devLabel + ' assign_gmail+signin: ' + step.note);
            return;
          }
          step.status = 'done';
          step.note = (step.note ? step.note + ' · ' : '') + 'Đã tự đăng nhập Google';
        }
      } else if (step.type === 'gmail_signin') {
        // Trinh tu dang nhap Google tu dong bang tai khoan da cap cho may
        // (buoc assign_gmail truoc do, hoac tai khoan da cap tu truoc).
        step.status = 'running';
        const acct = dr._gmailAccount || findAccountForDevice(dr.deviceId);
        if (!acct) {
          step.status = 'error';
          step.note = 'Máy chưa được cấp Gmail — chạy bước cấp Gmail trước';
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' gmail_signin: chua co tai khoan');
          return;
        }
        const out = await gmailSigninSequence(dr.deviceId, acct, { park: makePipelinePark(run, dr, step) });
        if (out.outcome === 'stopped') {
          step.status = 'stopped';
          dr.status = 'stopped';
          return;
        }
        if (out.outcome !== 'done') {
          step.status = 'error';
          step.note = 'Tự đăng nhập Google chưa xong: ' + (out.note || out.outcome);
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' gmail_signin: ' + step.note);
          return;
        }
        step.status = 'done';
        step.note = 'Đã tự đăng nhập Google: ' + acct.email;
      } else if (step.type === 'command') {
        step.status = 'running';
        const timeout = (step.cmd === 'install_url') ? 120000 : CMD_TIMEOUT_MS;
        const result = await sendCommand(dr.deviceId, step.cmd, step.args || {}, timeout);
        if (result && result.ok) {
          step.status = 'done';
        } else {
          step.status = 'error';
          step.note = 'Agent báo lỗi: ' + ((result && result.error) || 'unknown');
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' buoc ' + step.name + ': ' + step.note);
          return;
        }
      } else if (step.type === 'wait') {
        step.status = 'running';
        await sleepMs((step.seconds || 5) * 1000);
        step.status = 'done';
      } else if (step.type === 'manual') {
        step.status = 'waiting_manual';
        dr.status = 'waiting_manual';
        console.log('[pipeline] ' + run.id + ' ' + devLabel + ' CHO CHAM TAY: ' + step.name);
        const how = await new Promise((resolve) => { dr._resumeResolve = resolve; });
        dr._resumeResolve = null;
        if (run.stopped || how === 'stopped') {
          step.status = 'stopped';
          dr.status = 'stopped';
          return;
        }
        step.status = 'done';
        step.note = 'Đã xử lý tay';
        dr.status = 'running';
      } else if (step.type === 'tap_text') {
        // Cham vao nut co chu cho truoc. tolerant=true: khong thay nut thi
        // ghi chu va di tiep (man hinh chao moi may moi khac) — khong fail.
        step.status = 'running';
        try {
          const result = await sendCommand(dr.deviceId, 'tap_text', { text: step.text, match: step.match || 'contains' }, 40000);
          if (result && result.ok) {
            step.status = 'done';
            step.note = 'Đã chạm: "' + ((result.data && result.data.text) || step.text) + '"';
          } else if (step.tolerant) {
            step.status = 'done';
            step.note = 'Không thấy "' + step.text + '" (' + ((result && result.error) || '?') + ') — bỏ qua (dung sai)';
          } else {
            step.status = 'error';
            step.note = 'Không chạm được "' + step.text + '": ' + ((result && result.error) || 'unknown');
            dr.status = 'error';
            return;
          }
        } catch (e) {
          if (step.tolerant) {
            step.status = 'done';
            step.note = 'Không chạm được "' + step.text + '" (' + (e && e.message || e) + ') — bỏ qua (dung sai)';
          } else {
            throw e;
          }
        }
      } else if (step.type === 'wait_text') {
        // Cho chu xuat hien tren man hinh (agent tu poll, toi da 30 giay).
        step.status = 'running';
        const tmo = Math.min(step.timeoutMs || 10000, 30000);
        try {
          const result = await sendCommand(dr.deviceId, 'wait_text', { text: step.text, timeoutMs: tmo }, tmo + 15000);
          const found = !!(result && result.ok && result.data && result.data.found);
          if (found) {
            step.status = 'done';
            step.note = 'Đã thấy "' + step.text + '"';
          } else if (step.tolerant) {
            step.status = 'done';
            step.note = 'Chưa thấy "' + step.text + '" sau ' + Math.round(tmo / 1000) + 's — đi tiếp (dung sai)';
          } else {
            step.status = 'error';
            step.note = 'Không thấy "' + step.text + '" sau ' + Math.round(tmo / 1000) + 's';
            dr.status = 'error';
            return;
          }
        } catch (e) {
          if (step.tolerant) {
            step.status = 'done';
            step.note = 'Lỗi chờ chữ "' + step.text + '" (' + (e && e.message || e) + ') — đi tiếp (dung sai)';
          } else {
            throw e;
          }
        }
      } else if (step.type === 'open_url') {
        step.status = 'running';
        const result = await sendCommand(dr.deviceId, 'open_url', { url: step.url }, CMD_TIMEOUT_MS);
        if (result && result.ok) {
          step.status = 'done';
          step.note = 'Đã mở: ' + step.url;
        } else {
          step.status = 'error';
          step.note = 'Mở URL lỗi: ' + ((result && result.error) || 'unknown');
          dr.status = 'error';
          return;
        }
      } else if (step.type === 'swipe_up') {
        // Vuot len de xem video tiep: toa do tuong doi theo man hinh.
        // Lay kich thuoc tu status neu may co bao, khong thi mac dinh
        // 1080x2400 (do phan giai pho bien cua dan may).
        step.status = 'running';
        await swipeUp(dr.deviceId);
        step.status = 'done';
      } else if (step.type === 'watch_game') {
        // Bat vong xem game chay nen o watch manager roi hoan thanh ngay —
        // vong xem tu chay (va tu bao check-in) doc lap voi pipeline.
        step.status = 'running';
        const w = await startWatch(dr.deviceId, { minutes: step.minutes || 30, gameUrl: step.gameUrl || '' });
        if (w && w.error) {
          step.status = 'error';
          step.note = 'Không bật được vòng xem: ' + w.error;
          dr.status = 'error';
          return;
        }
        step.status = 'done';
        step.note = 'Đã bật vòng quét game & xem video — theo dõi ở thẻ máy / nhật ký sự kiện';
      }
    } catch (e) {
      step.status = 'error';
      step.note = 'Lỗi: ' + (e && e.message || e);
      dr.status = 'error';
      console.log('[pipeline] ' + run.id + ' ' + devLabel + ' buoc ' + step.name + ': ' + step.note);
      return;
    }
  }
  dr.status = 'done';
  dr.currentStep = dr.steps.length;
  console.log('[pipeline] ' + run.id + ' ' + devLabel + ' HOAN THANH');
}

function startPipeline(pipelineId, deviceIds, params) {
  const pipeline = PIPELINES.find((p) => p.id === pipelineId);
  if (!pipeline) return { error: 'pipeline_not_found' };
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return { error: 'no_devices' };
  const run = {
    id: 'run-' + (++runCounter) + '-' + Date.now().toString(36),
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    startedAt: nowIso(),
    stopped: false,
    devices: new Map()
  };
  for (const deviceId of deviceIds) {
    const dr = {
      deviceId: deviceId,
      status: 'running',
      currentStep: 0,
      steps: buildSteps(pipeline, params || {}),
      _resumeResolve: null
    };
    run.devices.set(deviceId, dr);
  }
  runs.set(run.id, run);
  for (const dr of run.devices.values()) {
    runDevicePipeline(run, dr).catch((e) => console.error('[pipeline] loi chay:', e));
  }
  console.log('[pipeline] bat dau ' + run.id + ' (' + pipeline.id + ') cho ' + deviceIds.length + ' may');
  return { run: run };
}

// ================= Watch manager: quet game & xem video (Giai doan 3) =================
// Moi may dang xem co mot vong lap rieng chay nen tren server:
//   dump_ui -> quet chu bao check-in thanh cong (flow-config) ->
//   vuot len xem video tiep -> ngu ngau nhien 25-40 giay -> lap lai,
// cho den het gio (mac dinh 30 phut) hoac bi dung tay.
// Thay chu thanh cong: ghi su kien "checkin_success" (dashboard hien noi
// bat + tang o dem), danh dau may la "da_checkin" va dung vong cua may do.
// Nguong nghi giua cac lan vuot mac dinh 25-40s; chi de test vong kin moi
// ghi de bang bien moi truong FARM_WATCH_MIN_SEC / FARM_WATCH_MAX_SEC.
const WATCH_MIN_SEC = Math.max(1, parseInt(process.env.FARM_WATCH_MIN_SEC || '25', 10) || 25);
const WATCH_MAX_SEC = Math.max(WATCH_MIN_SEC, parseInt(process.env.FARM_WATCH_MAX_SEC || '40', 10) || 40);
const watches = new Map(); // deviceId -> watch state

function publicWatch(w) {
  if (!w) return null;
  return {
    deviceId: w.deviceId,
    label: w.label || '',
    status: w.status, // starting | watching | da_checkin | stopped | error
    startedAt: w.startedAt || null,
    endsAt: w.endsAt || null,
    minutes: w.minutes || 30,
    gameUrl: w.gameUrl || '',
    rounds: w.rounds || 0,
    matchedMarker: w.matchedMarker || null,
    lastError: w.lastError || null,
    note: w.note || ''
  };
}

/** Vuot len xem video tiep theo: toa do tuong doi theo kich thuoc man hinh. */
async function swipeUp(deviceId) {
  // Lay kich thuoc man hinh tu mot lenh status truoc do neu may co bao;
  // agent hien chua bao width/height nen mac dinh 1080x2400.
  const dev = devices.get(deviceId);
  let w = (dev && dev.screenW) || 0;
  let h = (dev && dev.screenH) || 0;
  if (!w || !h) {
    try {
      const st = await sendCommand(deviceId, 'status', {}, 10000);
      if (st && st.ok && st.data && st.data.width && st.data.height) {
        w = st.data.width; h = st.data.height;
        if (dev) { dev.screenW = w; dev.screenH = h; }
      }
    } catch (e) { /* bo qua — dung mac dinh */ }
  }
  if (!w || !h) { w = 1080; h = 2400; }
  const cx = Math.round(w / 2);
  return sendCommand(deviceId, 'swipe', {
    x1: cx, y1: Math.round(h * 0.75),
    x2: cx, y2: Math.round(h * 0.30),
    durationMs: 350
  }, 15000);
}

function sleepInterruptible(w, ms) {
  return new Promise((resolve) => {
    const step = 500;
    let waited = 0;
    const iv = setInterval(() => {
      waited += step;
      if (w.stopRequested || waited >= ms || Date.now() > w.endsAtMs) {
        clearInterval(iv);
        resolve();
      }
    }, step);
  });
}

async function watchLoop(w) {
  let errStreak = 0;
  while (!w.stopRequested) {
    if (Date.now() > w.endsAtMs) {
      w.status = 'stopped';
      w.note = 'Hết ' + w.minutes + ' phút — tự dừng';
      addEvent('watch_stop', w.deviceId, 'Vòng xem game tự dừng: hết ' + w.minutes + ' phút');
      return;
    }
    // 1) Quet man hinh hien tai tim chu bao check-in thanh cong
    try {
      const res = await sendCommand(w.deviceId, 'dump_ui', {}, 20000);
      if (res && res.ok && res.data && Array.isArray(res.data.nodes)) {
        errStreak = 0;
        const cfg = loadFlowConfig();
        let matched = null;
        for (const node of res.data.nodes) {
          const hay = ((node.text || '') + '\n' + (node.desc || ''));
          for (const m of cfg.checkinSuccessMarkers) {
            if (hay.indexOf(m) >= 0) { matched = m; break; }
          }
          if (matched) break;
        }
        if (matched) {
          w.status = 'da_checkin';
          w.matchedMarker = matched;
          w.note = 'Thấy chữ "' + matched + '" trên màn hình';
          addEvent('checkin_success', w.deviceId,
            '🐷 Heo đã nhảy / check-in thành công! (thấy chữ "' + matched + '")');
          return;
        }
      } else {
        errStreak++;
        w.lastError = 'dump_ui: ' + ((res && res.error) || 'no_response');
      }
    } catch (e) {
      errStreak++;
      w.lastError = 'dump_ui: ' + (e && e.message || e);
    }
    if (errStreak >= 3) {
      w.status = 'error';
      w.note = 'Dừng vòng xem: dump_ui lỗi 3 lần liên tiếp (' + (w.lastError || '') + ')';
      addEvent('watch_error', w.deviceId, w.note);
      return;
    }
    if (w.stopRequested) break;
    // 2) Vuot len xem video tiep
    try {
      await swipeUp(w.deviceId);
      w.rounds++;
    } catch (e) {
      w.lastError = 'swipe: ' + (e && e.message || e);
    }
    // 3) Nghi ngau nhien giua cac vong
    const waitSec = WATCH_MIN_SEC + Math.random() * (WATCH_MAX_SEC - WATCH_MIN_SEC);
    await sleepInterruptible(w, Math.round(waitSec * 1000));
  }
  if (w.status === 'watching' || w.status === 'starting') {
    w.status = 'stopped';
    w.note = 'Đã dừng tay';
  }
}

/**
 * Bat vong xem game cho mot may: mo app TikTok Lite (hoac mo thang link
 * game neu co), roi chay vong xem nen. Tra {watch} hoac {error}.
 */
async function startWatch(deviceId, opts) {
  opts = opts || {};
  const dev = devices.get(deviceId);
  if (!dev) return { error: 'device_not_found' };
  if (!dev.online) return { error: 'device_offline' };
  const existing = watches.get(deviceId);
  if (existing && (existing.status === 'watching' || existing.status === 'starting')) {
    return { watch: existing };
  }
  const minutes = Math.max(1, Math.min(240, parseInt(opts.minutes, 10) || 30));
  const w = {
    deviceId: deviceId,
    label: dev.label || deviceId,
    status: 'starting',
    startedAt: nowIso(),
    endsAt: new Date(Date.now() + minutes * 60000).toISOString(),
    endsAtMs: Date.now() + minutes * 60000,
    minutes: minutes,
    gameUrl: opts.gameUrl || '',
    rounds: 0,
    matchedMarker: null,
    lastError: null,
    note: '',
    stopRequested: false
  };
  watches.set(deviceId, w);
  try {
    let res;
    if (w.gameUrl) {
      res = await sendCommand(deviceId, 'open_url', { url: w.gameUrl }, CMD_TIMEOUT_MS);
    } else {
      res = await sendCommand(deviceId, 'open_app', { 'package': TIKTOK_PKG }, CMD_TIMEOUT_MS);
    }
    if (!res || !res.ok) {
      w.status = 'error';
      w.note = 'Không mở được ' + (w.gameUrl ? 'link game' : 'TikTok Lite') + ': ' + ((res && res.error) || 'unknown');
      addEvent('watch_error', deviceId, w.note);
      return { watch: w };
    }
  } catch (e) {
    w.status = 'error';
    w.note = 'Không mở được app/link: ' + (e && e.message || e);
    addEvent('watch_error', deviceId, w.note);
    return { watch: w };
  }
  w.status = 'watching';
  addEvent('watch_start', deviceId, 'Bắt đầu vòng quét game & xem video (' + minutes + ' phút)' + (w.gameUrl ? ' — link game: ' + w.gameUrl : ''));
  watchLoop(w).catch((e) => {
    w.status = 'error';
    w.note = 'Lỗi vòng xem: ' + (e && e.message || e);
    addEvent('watch_error', deviceId, w.note);
  });
  return { watch: w };
}

function stopWatch(deviceId) {
  const w = watches.get(deviceId);
  if (!w) return { error: 'not_watching' };
  if (w.status === 'watching' || w.status === 'starting') {
    w.stopRequested = true;
    w.status = 'stopped';
    w.note = 'Đã dừng tay';
    addEvent('watch_stop', deviceId, 'Đã dừng vòng xem game');
  }
  return { watch: w };
}

// ================= QR ghi danh Device Owner =================
let provisionCfg = { checksum: '', component: 'vn.duongashita.farmagent/vn.duongashita.farmagent.AdminReceiver' };
try {
  const raw = fs.readFileSync(PROVISION_FILE, 'utf8');
  const j = JSON.parse(raw);
  if (j && j.checksum) provisionCfg.checksum = j.checksum;
  if (j && j.component) provisionCfg.component = j.component;
} catch (e) { /* chua co file — endpoint se bao loi checksum_not_configured */ }
if (process.env.PROVISIONING_CHECKSUM) provisionCfg.checksum = process.env.PROVISIONING_CHECKSUM;
if (process.env.PROVISIONING_COMPONENT) provisionCfg.component = process.env.PROVISIONING_COMPONENT;

function lanIp(req) {
  if (process.env.SERVER_LAN_IP) return process.env.SERVER_LAN_IP;
  const host = ((req && req.headers && req.headers.host) || '').split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return host;
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of (ifs[name] || [])) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

function provisioningPayload(req) {
  const ip = lanIp(req);
  const payload = {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': provisionCfg.component,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': 'http://' + ip + ':' + HTTP_PORT + '/apks/agent.apk',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': provisionCfg.checksum,
    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true
  };
  if (process.env.PROVISIONING_WIFI_SSID) {
    payload['android.app.extra.PROVISIONING_WIFI_SSID'] = process.env.PROVISIONING_WIFI_SSID;
    if (process.env.PROVISIONING_WIFI_PASSWORD) {
      payload['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = 'WPA';
      payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = process.env.PROVISIONING_WIFI_PASSWORD;
    }
  }
  return payload;
}

// ================= HTTP server =================
const httpServer = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && u.pathname === '/') {
      const html = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/info') {
      jsonRes(res, 200, {
        ok: true, tcpPort: TCP_PORT, httpPort: HTTP_PORT,
        lanIp: lanIp(req), serverTime: nowIso(), agentVersionExpected: '3.0'
      });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/devices') {
      const list = Array.from(devices.values()).map(publicDevice);
      list.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
      jsonRes(res, 200, { ok: true, devices: list, serverTime: nowIso() });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/cmd') {
      let j;
      try { j = await readJsonBody(req); } catch (e) {
        jsonRes(res, 400, { ok: false, error: 'bad_json' });
        return;
      }
      if (!j.deviceId || !j.cmd) {
        jsonRes(res, 400, { ok: false, error: 'missing_deviceId_or_cmd' });
        return;
      }
      try {
        const result = await sendCommand(j.deviceId, j.cmd, j.args || {});
        jsonRes(res, 200, result);
      } catch (e) {
        const code = (e.message === 'device_not_found') ? 404 : 503;
        jsonRes(res, code, { ok: false, error: e.message });
      }
      return;
    }

    // ---- Gmail pool ----
    if (req.method === 'GET' && u.pathname === '/api/gmail') {
      jsonRes(res, 200, {
        ok: true,
        accounts: pool.accounts.map(publicAccount),
        ready: pool.accounts.filter((a) => a.status === 'ready').length
      });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/gmail/import') {
      const body = await readBody(req);
      let text = body;
      try {
        const j = JSON.parse(body);
        if (j && typeof j.text === 'string') text = j.text;
      } catch (e) { /* body la text tho */ }
      const r = importAccounts(text);
      jsonRes(res, 200, { ok: true, added: r.added, skipped: r.skipped, total: r.total });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/gmail/assign') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      const r = assignGmail(j.deviceId);
      if (r.error) { jsonRes(res, 200, { ok: false, error: r.error }); return; }
      jsonRes(res, 200, { ok: true, account: publicAccount(r.account) });
      return;
    }
    if (req.method === 'POST' && (u.pathname === '/api/gmail/mark-die' || u.pathname === '/api/gmail/delete')) {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const idx = pool.accounts.findIndex((a) =>
        (j.id && a.id === j.id) || (j.email && a.email.toLowerCase() === String(j.email).toLowerCase()));
      if (idx < 0) { jsonRes(res, 200, { ok: false, error: 'account_not_found' }); return; }
      if (u.pathname === '/api/gmail/mark-die') {
        pool.accounts[idx].status = 'die';
        savePool();
        jsonRes(res, 200, { ok: true, account: publicAccount(pool.accounts[idx]) });
      } else {
        const removed = pool.accounts.splice(idx, 1)[0];
        savePool();
        jsonRes(res, 200, { ok: true, removed: publicAccount(removed) });
      }
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/gmail/signin-assist') {
      // Giai doan 3.1: endpoint nay UY QUYEN cho trinh tu dang nhap Google
      // TU DONG (gmailSigninSequence): tu mo man hinh dang nhap, tu nhap
      // email + mat khau qua kenh lenh TCP toi agent, tu bam Tiep theo.
      // Dang response van giu nguyen nhu Giai doan 2:
      // {ok, email, passwordMasked, deviceId, steps:[{step:'email'},{step:'password'}]}
      // — password that khong bao gio nam trong response HTTP / dashboard.
      // Khac biet: neu Google bat XAC MINH (CAPTCHA/SDT/2 buoc) thi endpoint
      // khong the dung cho (no la request dong bo) — tra ok=false,
      // outcome='verify'; khi do hay dung nut "Cap Gmail" tren the may /
      // pipeline "cap-gmail-tu-dong" de dung o Cho cham tay roi chay tiep.
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      let acct = findAccountForDevice(j.deviceId);
      if (!acct) {
        const r = assignGmail(j.deviceId);
        if (r.error) { jsonRes(res, 200, { ok: false, error: r.error }); return; }
        acct = r.account;
      }
      const out = await gmailSigninSequence(j.deviceId, acct, {});
      const steps = [
        { step: 'email', ok: !!out.emailTyped, error: out.emailTyped ? null : (out.note || 'not_typed') },
        { step: 'password', ok: !!out.passwordTyped, error: out.passwordTyped ? null : (out.note || 'not_typed') }
      ];
      jsonRes(res, 200, {
        ok: out.outcome === 'done',
        outcome: out.outcome,
        email: acct.email,
        passwordMasked: '********',
        deviceId: j.deviceId,
        steps: steps,
        note: out.outcome === 'done'
          ? 'Đã tự đăng nhập Google xong: máy tự mở màn hình đăng nhập, nhập email + mật khẩu và bấm Tiếp theo.'
          : (out.note || '')
      });
      return;
    }

    // ---- Pipeline ----
    if (req.method === 'GET' && u.pathname === '/api/pipelines') {
      jsonRes(res, 200, {
        ok: true,
        pipelines: PIPELINES.map((p) => ({
          id: p.id, name: p.name,
          steps: ((typeof p.genSteps === 'function') ? p.genSteps({}, loadFlowConfig()) : p.steps)
            .map((s) => ({ type: s.type, name: s.name }))
        }))
      });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/pipeline/start') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const r = startPipeline(j.pipelineId, j.deviceIds, j.params || {});
      if (r.error) { jsonRes(res, 200, { ok: false, error: r.error }); return; }
      jsonRes(res, 200, { ok: true, runId: r.run.id, run: publicRun(r.run) });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/pipeline/runs') {
      const list = Array.from(runs.values()).map(publicRun);
      list.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
      jsonRes(res, 200, { ok: true, runs: list });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/pipeline/resume') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const run = runs.get(j.runId);
      if (!run) { jsonRes(res, 200, { ok: false, error: 'run_not_found' }); return; }
      const dr = run.devices.get(j.deviceId);
      if (!dr || dr.status !== 'waiting_manual' || !dr._resumeResolve) {
        jsonRes(res, 200, { ok: false, error: 'not_waiting_manual' });
        return;
      }
      const resolve = dr._resumeResolve;
      dr._resumeResolve = null;
      resolve('resumed');
      jsonRes(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/pipeline/stop') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const run = runs.get(j.runId);
      if (!run) { jsonRes(res, 200, { ok: false, error: 'run_not_found' }); return; }
      run.stopped = true;
      for (const dr of run.devices.values()) {
        if (dr._resumeResolve) {
          const resolve = dr._resumeResolve;
          dr._resumeResolve = null;
          resolve('stopped');
        }
        if (dr.status === 'running' || dr.status === 'waiting_manual') dr.status = 'stopped';
      }
      jsonRes(res, 200, { ok: true });
      return;
    }

    // ---- Watch: quet game & xem video (Giai doan 3) ----
    if (req.method === 'GET' && u.pathname === '/api/watch') {
      const list = Array.from(watches.values()).map(publicWatch);
      list.sort((a, b) => (a.label || a.deviceId).localeCompare(b.label || b.deviceId));
      jsonRes(res, 200, { ok: true, watches: list, checkinSuccess: checkinSuccessTotal });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/watch/start') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!Array.isArray(j.deviceIds) || j.deviceIds.length === 0) {
        jsonRes(res, 400, { ok: false, error: 'no_devices' });
        return;
      }
      const out = [];
      for (const deviceId of j.deviceIds) {
        const r = await startWatch(deviceId, { minutes: j.minutes, gameUrl: j.gameUrl || '' });
        if (r.error) out.push({ deviceId: deviceId, ok: false, error: r.error });
        else out.push({ deviceId: deviceId, ok: r.watch.status !== 'error', watch: publicWatch(r.watch) });
      }
      jsonRes(res, 200, { ok: out.some((x) => x.ok), results: out });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/watch/stop') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const ids = (Array.isArray(j.deviceIds) && j.deviceIds.length)
        ? j.deviceIds
        : Array.from(watches.keys());
      const out = [];
      for (const deviceId of ids) {
        const r = stopWatch(deviceId);
        if (r.error) out.push({ deviceId: deviceId, ok: false, error: r.error });
        else out.push({ deviceId: deviceId, ok: true, watch: publicWatch(r.watch) });
      }
      jsonRes(res, 200, { ok: true, results: out });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/events') {
      const since = parseInt(u.searchParams.get('since') || '0', 10) || 0;
      jsonRes(res, 200, {
        ok: true,
        events: events.filter((e) => e.id > since),
        lastEventId: eventCounter,
        checkinSuccess: checkinSuccessTotal
      });
      return;
    }

    // ---- QR ghi danh Device Owner ----
    if (req.method === 'GET' && u.pathname === '/api/provision/qr') {
      if (!provisionCfg.checksum) {
        jsonRes(res, 500, { ok: false, error: 'checksum_not_configured', detail: 'Thiếu provisioning.json hoặc biến PROVISIONING_CHECKSUM' });
        return;
      }
      jsonRes(res, 200, provisioningPayload(req));
      return;
    }

    if (req.method === 'GET' && u.pathname.startsWith('/apks/')) {
      const name = decodeURIComponent(u.pathname.slice('/apks/'.length));
      if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        res.writeHead(400); res.end('bad name'); return;
      }
      const fp = path.join(APK_DIR, name);
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': fs.statSync(fp).size
      });
      fs.createReadStream(fp).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (e) {
    jsonRes(res, 500, { ok: false, error: 'server_error', detail: String(e && e.message || e) });
  }
});

tcpServer.listen(TCP_PORT, () => {
  console.log('Farm Control TCP (agent) dang nghe tai cong ' + TCP_PORT);
});
httpServer.listen(HTTP_PORT, () => {
  console.log('Farm Control Dashboard: http://localhost:' + HTTP_PORT);
});
