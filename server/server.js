// Farm Control - Server Giai đoạn 5
// TCP 8787: agent ket noi (JSON theo dong). HTTP 8080: dashboard + API.
// Chi dung module co san cua Node (net/http/fs/path/os/crypto) + module
// qrcode.js tu viet trong cung thu muc (sinh ma QR SVG offline).
//
// Giai doan 5 them (4 nang cap hoc tu Tokium, agent len v5):
// - GHEP NOI BANG QR (kieu Tokium): dashboard tao ma ghep noi song 300
//   giay (POST /api/pairing/new, GET /api/pairing tra payload + anh SVG);
//   agent v5 quet ma ngay trong app (camera + ZXing) hoac mo lien ket
//   farmpair:// thi tu dien IP/cong + gui pairCode trong hello. Server
//   kiem tra ma: dung + chua dung + chua het han -> chap nhan (gui
//   {"type":"pair_result","ok":true}); sai thi gui "pair_rejected" kem
//   ly do expired/used/unknown roi dong ket noi. May da cau hinh san
//   (khong gui pairCode) van ket noi nhu cu — tuong thich nguoc.
// - GMAIL CLAIM TICKET + CACHE 12 GIO: buoc cap Gmail trong pipeline
//   khong "cap dut" ngay ma GIU (claim) mot tai khoan bang ticket
//   ngau nhien trong 12 gio: may do chay lai trong 12 gio thi dung
//   lai DUNG tai khoan + ticket do (khong ton tai khoan moi); may
//   khac khong rut duoc tai khoan dang bi giu. Dang nhap Google xong
//   -> claim chuyen thanh "Da cap" (assigned). Flow loi / dung /
//   xoa may / danh dau die / het han -> claim duoc nha ve 'ready'.
//   Cho cham tay (park) thi claim VAN GIU. Het han duoc quet (sweep)
//   khi khoi dong + moi lan doc kho / rut tai khoan. Xem
//   GET /api/gmail/claims.
// - TIEP SUC SAU KHI SERVER/PHONE KHOI DONG LAI: pipeline runs duoc
//   luu xuong data/pipeline-runs.json sau moi lan chuyen trang thai;
//   server mo lai thi khoi phuc: run dang Cho cham tay -> ve dung
//   waiting_manual, bam "Chay tiep" la chay tiep tu buoc sau; run
//   dang chay do -> trang thai 'interrupted', bam "Chay tiep" la
//   chay lai tu buoc dang do. Vong xem (watch) cung luu xuong
//   data/watch-state.json; khoi phuc thi danh dau 'interrupted',
//   KHONG tu chay lai (nguoi dung tu bam Bat dau xem khi can).
// - Flow DANG KY LINE (Singapore + Google) — pipeline "dang-ky-line":
//   claim Gmail + dang nhap Google (tai dung trinh tu 3.1) -> buoc
//   CHAM TAY go cac tai khoan Google khac (xoa tai khoan khong tu
//   dong hoa duoc) -> mo LINE -> trinh tu dang ky: bam bat dau ->
//   "Googleで続ける" -> chon quoc gia Singapore (シンガポール/+65)
//   o man hinh nhap so dien thoai -> dong y/tiep theo -> thanh cong
//   khi thay chu chao/man hinh home cua LINE (ghi data/line-state.json,
//   the may hien badge "LINE ✔"). Gap man hinh xac minh/SMS thi dung
//   Cho cham tay. Dau chu trong muc "lineRegister" cua flow-config.
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
//
// Giai doan 3.2 them:
// - Kho tai khoan XEM HEO chua dang nhap (data/heo-pool.json) — API
//   /api/heo giong het kho Gmail: import (username|mat khau), assign-next,
//   mark-die, delete; mat khau LUON che qua API, chi di qua kenh agent.
// - Flow "dang-nhap-tiktok-lite": cap tai khoan heo tu kho roi TU dang
//   nhap TikTok Lite (mo app -> bam nut dang nhap -> nhap username -> nhap
//   mat khau -> bam dang nhap) theo dau chu trong muc "tiktokLogin" cua
//   flow-config.json; gap xac minh (CAPTCHA/ma) thi dung Cho cham tay.
// - Flow "diem-danh" (diem danh 14 ngay): mo TikTok Lite, vao muc diem
//   danh theo dau chu muc "checkin" cua flow-config, bam nut diem danh,
//   thay chu thanh cong thi ghi ngay hom nay (Asia/Tokyo) vao
//   data/checkin-state.json. API GET /api/checkin + POST /api/checkin/reset.
// - Dashboard viet lai: 4 tab (Dan may / Kho du lieu / Tac vu / Hanh dong),
//   tong tim. Agent KHONG doi (van v3.1).
//
// Giai doan 3.3 them (chi server + dashboard, agent van v3.1):
// - XOA MAY: POST /api/devices/delete {deviceId} — xoa ho so may khoi danh
//   sach; tai khoan Gmail + TK heo da cap cho may do duoc TRA VE KHO
//   (status 'ready', xoa deviceId/assignedAt), xoa trang thai diem danh
//   va vong xem cua may; ghi su kien 'device_delete'. May ket noi lai
//   sau nay se hien lai nhu mot may moi.
// - RESET MAY: POST /api/devices/reset {deviceId} — gui lenh agent
//   'factory_reset' (co tu Giai doan 2); thanh cong ghi su kien 'reset';
//   may chua Device Owner thi tra loi 'not_device_owner' kem thong diep
//   ro rang. Reset KHONG dong vao ho so may / tai khoan da cap (giu lien
//   tuc theo doi); sau reset, quet QR ghi danh (muc Them may) la agent
//   tu cai lai + nhan quyen chu may.
// - Muc THEM MAY o tab Dan may: gom panel QR ghi danh + link tai
//   /apks/agent.apk + 2 danh sach buoc (may moi/vua reset — quet QR;
//   may dang dung san — cai APK truc tiep).
'use strict';
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('./qrcode');

const TCP_PORT = process.env.FARM_TCP_PORT ? parseInt(process.env.FARM_TCP_PORT, 10) : 8787;
const HTTP_PORT = process.env.FARM_HTTP_PORT ? parseInt(process.env.FARM_HTTP_PORT, 10) : 8080;
const OFFLINE_AFTER_MS = 90 * 1000;
const CMD_TIMEOUT_MS = 30 * 1000;
const APK_DIR = path.join(__dirname, 'public-apks');
const DATA_DIR = path.join(__dirname, 'data');
const POOL_FILE = path.join(DATA_DIR, 'gmail-pool.json');
const HEO_FILE = path.join(DATA_DIR, 'heo-pool.json');
const CHECKIN_FILE = path.join(DATA_DIR, 'checkin-state.json');
const GAME_LINK_FILE = path.join(DATA_DIR, 'game-link.json');
const RUNS_FILE = path.join(DATA_DIR, 'pipeline-runs.json');
const WATCH_FILE = path.join(DATA_DIR, 'watch-state.json');
const LINE_FILE = path.join(DATA_DIR, 'line-state.json');
const PROVISION_FILE = path.join(__dirname, 'provisioning.json');
// Ma ghep noi QR song 300 giay (kieu Tokium). PAIRING_TTL_MS chi de
// kiem chung tu dong dung thoi gian song ngan — chay that dung 300s.
const PAIRING_TTL_MS = Math.max(1000, parseInt(process.env.PAIRING_TTL_MS || '300000', 10) || 300000);
// Claim Gmail song 12 gio (cache kieu Tokium /email-claim).
const CLAIM_TTL_MS = 12 * 3600 * 1000;

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
    screenW: d.screenW || 0,
    screenH: d.screenH || 0,
    gmailAssigned: (typeof pool !== 'undefined')
      ? ((pool.accounts.find((a) => a.status === 'assigned' && a.deviceId === d.id) || {}).email || null)
      : null,
    gmailClaimed: (typeof pool !== 'undefined')
      ? ((pool.accounts.find((a) => a.status === 'ready' && a.claimedByDeviceId === d.id && isClaimLive(a)) || {}).email || null)
      : null,
    pairedViaQr: !!d.pairedViaQr,
    pairedAt: d.pairedAt || null,
    line: (typeof lineState !== 'undefined') ? publicLine(d.id) : null,
    heoAssigned: (typeof heoPool !== 'undefined')
      ? ((heoPool.accounts.find((a) => a.status === 'assigned' && a.deviceId === d.id) || {}).username || null)
      : null,
    checkin: (typeof checkinState !== 'undefined') ? publicCheckin(d.id) : null,
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
    if (msg.width && msg.height) { dev.screenW = msg.width; dev.screenH = msg.height; }
    dev.online = true;
    dev.lastSeen = Date.now();
    console.log('[hello] ' + dev.id + ' label=' + dev.label + ' model=' + dev.model + ' android=' + dev.android + ' deviceOwner=' + dev.deviceOwner + ' accessibility=' + dev.accessibility);
  } else if (msg.type === 'status') {
    if (msg.battery !== undefined) dev.battery = msg.battery;
    if (msg.charging !== undefined) dev.charging = !!msg.charging;
    if (msg.network !== undefined) dev.network = msg.network;
    if (msg.screenOn !== undefined) dev.screenOn = !!msg.screenOn;
    if (msg.width && msg.height) { dev.screenW = msg.width; dev.screenH = msg.height; }
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

// ================= Ghep noi bang QR (Giai doan 5) =================
// Dashboard tao mot phien ghep noi: ma ngau nhien song PAIRING_TTL_MS
// (mac dinh 300 giay nhu Tokium). Payload QR la URI:
//   farmpair://pair?h=<IP-LAN>&p=<cong TCP>&c=<ma>
// Agent v5 quet ma trong app (camera) hoac bat ky app camera/Lens nao
// mo URI nay deu dan vao Farm Agent (intent-filter farmpair://).
// Agent gui kem "pairCode" trong hello; server kiem tra o day:
//   - khong co phien -> 'unknown'
//   - qua han        -> 'expired' (xoa phien)
//   - da dung boi MAY KHAC -> 'used'
//   - hop le (hoac chinh may do ket noi lai trong thoi han) -> ok,
//     danh dau usedBy = deviceId (mot ma chi ghep mot may; may do
//     gui lai ma cua chinh minh khi ket noi lai van duoc chap nhan
//     de tranh ket khi rot mang ngay luc vua ghep xong).
// Bi tu choi: server gui {"type":"pair_rejected","reason":...} roi
// dong ket noi; agent hien thong bao tieng Viet va dung tu ket noi lai.
// May KHONG gui pairCode (da cau hinh san tu truoc) -> bo qua hoan
// toan, ket noi nhu cu (tuong thich nguoc).
const pairingSessions = new Map(); // code -> {code, createdAt, expiresAt, usedBy}

function newPairCode() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'pair0000';
}

function createPairingSession() {
  // Don cac phien da het han / da dung lau — chi giu toi da vai phien.
  const t = Date.now();
  for (const [code, s] of pairingSessions) {
    if (t > s.expiresAt) pairingSessions.delete(code);
  }
  while (pairingSessions.size >= 5) {
    pairingSessions.delete(pairingSessions.keys().next().value);
  }
  const code = newPairCode();
  const s = { code: code, createdAt: nowIso(), expiresAt: new Date(t + PAIRING_TTL_MS).toISOString(), usedBy: null };
  pairingSessions.set(code, s);
  return s;
}

function pairingPayload(session, req) {
  return 'farmpair://pair?h=' + encodeURIComponent(lanIp(req)) +
    '&p=' + TCP_PORT + '&c=' + encodeURIComponent(session.code);
}

function publicPairing(session, req) {
  const payload = pairingPayload(session, req);
  let svg = '';
  try { svg = qrcode.svg(payload); } catch (e) { svg = ''; }
  return {
    ok: true,
    code: session.code,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    ttlSeconds: Math.round(PAIRING_TTL_MS / 1000),
    payload: payload,
    svg: svg,
    usedBy: session.usedBy || null
  };
}

/** Kiem tra ma ghep noi cho mot may. Tra {ok:true} hoac {ok:false, reason}. */
function validatePairCode(code, deviceId) {
  const s = pairingSessions.get(code);
  if (!s) return { ok: false, reason: 'unknown' };
  if (Date.now() > Date.parse(s.expiresAt)) {
    pairingSessions.delete(code);
    return { ok: false, reason: 'expired' };
  }
  if (s.usedBy && s.usedBy !== deviceId) return { ok: false, reason: 'used' };
  s.usedBy = deviceId;
  return { ok: true, session: s };
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
        // Giai doan 5: hello co pairCode -> kiem tra ma ghep noi QR
        // TRUOC khi chap nhan may. Sai ma: gui pair_rejected + dong
        // ket noi, khong dang ky may.
        let pairJustAccepted = false;
        if (msg.type === 'hello' && msg.pairCode) {
          const verdict = validatePairCode(String(msg.pairCode), id);
          if (!verdict.ok) {
            console.log('[pairing] tu choi ma ghep noi (' + verdict.reason + ') cho may ' + id);
            try {
              socket.write(JSON.stringify({ type: 'pair_rejected', reason: verdict.reason }) + '\n', 'utf8',
                () => { try { socket.destroy(); } catch (e) {} });
            } catch (e) { try { socket.destroy(); } catch (e2) {} }
            return;
          }
          pairJustAccepted = true;
        }
        let existing = devices.get(id);
        if (!existing) {
          existing = {
            id: id, label: '', model: '', manufacturer: '', android: '', sdk: 0,
            battery: null, charging: false, network: 'none', screenOn: false,
            online: false, lastSeen: null, agentVersion: '',
            deviceOwner: false, accessibility: false,
            pairedViaQr: false, pairedAt: null,
            screenW: 0, screenH: 0,
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
        if (pairJustAccepted) {
          dev.pairedViaQr = true;
          dev.pairedAt = nowIso();
          try { socket.write(JSON.stringify({ type: 'pair_result', ok: true }) + '\n', 'utf8'); } catch (e) {}
          console.log('[pairing] ghep noi QR thanh cong cho may ' + id);
        }
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
sweepExpiredClaims(); // Giai doan 5: don claim het han ngay khi khoi dong

function publicAccount(a) {
  return {
    id: a.id,
    email: a.email,
    passwordMasked: '********',
    status: a.status,
    deviceId: a.deviceId || null,
    assignedAt: a.assignedAt || null,
    createdAt: a.createdAt || null,
    // Giai doan 5: claim con song (neu co) — dashboard hien rieng
    // "Dang giu boi May X · het han HH:MM", khac han voi "Da cap".
    claim: isClaimLive(a) ? {
      deviceId: a.claimedByDeviceId,
      claimedAt: a.claimedAt || null,
      expiresAt: a.claimExpiresAt || null
    } : null
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
  sweepExpiredClaims();
  // Bo qua tai khoan dang bi MAY KHAC giu (claim con song) — tai
  // khoan do vo hinh voi moi lan rut khac cho den khi claim het han
  // hoac duoc nha. Tai khoan chinh may nay dang giu thi cap dut luon
  // (chuyen claim thanh Da cap).
  const a = pool.accounts.find((x) => x.status === 'ready' &&
    (!isClaimLive(x) || x.claimedByDeviceId === deviceId));
  if (!a) return { error: 'pool_empty' };
  clearClaimFields(a);
  a.status = 'assigned';
  a.deviceId = deviceId;
  a.assignedAt = nowIso();
  savePool();
  return { account: a };
}

function findAccountForDevice(deviceId) {
  return pool.accounts.find((x) => x.status === 'assigned' && x.deviceId === deviceId) || null;
}

/**
 * Tai khoan may dang GIU CLAIM (chua chuyen assigned) — can cho cac
 * buoc chay lai sau khi server khoi dong lai: _gmailAccount chi ton
 * tai trong bo nho cua lan chay truoc, con claim thi nam o pool.
 */
function findClaimForDevice(deviceId) {
  sweepExpiredClaims();
  return pool.accounts.find((x) => x.status === 'ready' &&
    x.claimedByDeviceId === deviceId && isClaimLive(x)) || null;
}

// ================= Gmail CLAIM ticket + cache 12 gio (Giai doan 5) =================
// Hoc mo hinh /email-ticket -> /email-claim cua Tokium: truoc khi
// dang nhap, flow "giu" (claim) mot tai khoan bang ticket ngau nhien
// trong CLAIM_TTL_MS (12 gio). Trong thoi gian giu:
//   - chi may dang giu moi thay/duoc dung tai khoan do; may khac rut
//     kho thi tai khoan nay "vo hinh" (het tai khoan khac -> pool_empty);
//   - may dang giu chay lai flow thi nhan lai DUNG tai khoan + ticket
//     do (cache 12 gio — khong ton them tai khoan moi).
// Dang nhap Google thanh cong -> claim chuyen thanh assigned.
// Flow loi/dung, xoa may, danh dau die, het han -> claim nha ve ready.
// Dung Cho cham tay (park) thi claim VAN GIU (nguoi dung xu ly tay
// xong chay tiep bang chinh tai khoan do).
// Truong claim tren entry: claimTicket, claimedByDeviceId, claimedAt,
// claimExpiresAt (null khi khong co claim). Mat khau van che moi noi.

function isClaimLive(a) {
  return !!(a && a.claimTicket && a.claimExpiresAt && Date.parse(a.claimExpiresAt) > Date.now());
}

function clearClaimFields(a) {
  a.claimTicket = null;
  a.claimedByDeviceId = null;
  a.claimedAt = null;
  a.claimExpiresAt = null;
}

/** Quet cac claim da het han -> nha ve ready. Tra so claim da nha. */
function sweepExpiredClaims() {
  let n = 0;
  for (const a of pool.accounts) {
    if (a.claimTicket && !isClaimLive(a)) {
      clearClaimFields(a);
      n++;
    }
  }
  if (n > 0) {
    savePool();
    console.log('[gmail-claim] da nha ' + n + ' claim het han ve kho');
  }
  return n;
}

/** Claim con song ma mot may dang giu (neu co). */
function findClaimForDevice(deviceId) {
  return pool.accounts.find((x) => x.status === 'ready' && x.claimedByDeviceId === deviceId && isClaimLive(x)) || null;
}

/**
 * Lay tai khoan cho mot may theo co che claim:
 *  - may da co assigned -> { account, source:'assigned' }
 *  - may dang giu claim con song -> { account, source:'claim', ticket } (ticket CU)
 *  - nguoc lai rut tai khoan ready chua ai giu, danh dau claim moi
 *    -> { account, source:'new_claim', ticket }
 *  - het -> { error:'pool_empty' }
 */
function claimGmail(deviceId) {
  sweepExpiredClaims();
  const assigned = findAccountForDevice(deviceId);
  if (assigned) return { account: assigned, source: 'assigned' };
  const held = findClaimForDevice(deviceId);
  if (held) return { account: held, source: 'claim', ticket: held.claimTicket };
  const a = pool.accounts.find((x) => x.status === 'ready' && !isClaimLive(x));
  if (!a) return { error: 'pool_empty' };
  a.claimTicket = 'ct-' + crypto.randomBytes(9).toString('hex');
  a.claimedByDeviceId = deviceId;
  a.claimedAt = nowIso();
  a.claimExpiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
  savePool();
  console.log('[gmail-claim] may ' + deviceId + ' giu tai khoan ' + a.email + ' (ticket ' + a.claimTicket + ', het han ' + a.claimExpiresAt + ')');
  return { account: a, source: 'new_claim', ticket: a.claimTicket };
}

/** Dang nhap xong: claim cua may chuyen thanh assigned. Tra account hoac null. */
function convertClaimToAssignment(deviceId) {
  const a = findClaimForDevice(deviceId);
  if (!a) return findAccountForDevice(deviceId);
  clearClaimFields(a);
  a.status = 'assigned';
  a.deviceId = deviceId;
  a.assignedAt = nowIso();
  savePool();
  console.log('[gmail-claim] claim cua may ' + deviceId + ' chuyen thanh Da cap: ' + a.email);
  return a;
}

/** Nha claim cua mot may ve ready (flow loi/dung, xoa may...). */
function releaseGmailClaim(deviceId, why) {
  const a = pool.accounts.find((x) => x.claimedByDeviceId === deviceId && x.claimTicket);
  if (!a) return null;
  const email = a.email;
  clearClaimFields(a);
  if (a.status !== 'assigned') a.status = 'ready';
  savePool();
  console.log('[gmail-claim] nha claim ' + email + ' cua may ' + deviceId + (why ? ' (' + why + ')' : ''));
  return email;
}

// ================= Kho tai khoan XEM HEO chua dang nhap (Giai doan 3.2) =================
// File data/heo-pool.json: { accounts: [{id, username, password, status,
// deviceId, assignedAt, loggedInAt, createdAt}] }
// status: ready | assigned | die
// Day la cac tai khoan TikTok Lite dung de xem heo, CHUA dang nhap vao may
// nao. Flow "dang-nhap-tiktok-lite" cap tai khoan tu kho nay roi tu dang
// nhap vao may. QUY TAC AN TOAN giong kho Gmail: password KHONG bao gio
// tra ve qua API/dashboard — chi gui thang qua kenh lenh TCP toi agent.
let heoPool = { accounts: [] };
let heoCounter = 0;

function loadHeoPool() {
  try {
    const raw = fs.readFileSync(HEO_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.accounts)) heoPool = j;
  } catch (e) {
    heoPool = { accounts: [] };
  }
  heoCounter = heoPool.accounts.length;
}
function saveHeoPool() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HEO_FILE, JSON.stringify(heoPool, null, 2), 'utf8');
  } catch (e) {
    console.error('[heo] khong ghi duoc pool:', e.message);
  }
}
loadHeoPool();
if (!fs.existsSync(HEO_FILE)) saveHeoPool(); // tu tao file rong lan dau

function publicHeoAccount(a) {
  return {
    id: a.id,
    username: a.username,
    passwordMasked: '********',
    status: a.status,
    deviceId: a.deviceId || null,
    assignedAt: a.assignedAt || null,
    loggedInAt: a.loggedInAt || null,
    createdAt: a.createdAt || null
  };
}

function parseHeoImportLines(text) {
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
    const username = line.slice(0, sep).trim();
    const password = line.slice(sep + 1).trim().replace(/^\s+/, '');
    if (!username || !password) continue;
    out.push({ username: username, password: password });
  }
  return out;
}

function importHeoAccounts(text) {
  const parsed = parseHeoImportLines(text);
  let added = 0, skipped = 0;
  for (const p of parsed) {
    if (heoPool.accounts.some((a) => a.username.toLowerCase() === p.username.toLowerCase())) { skipped++; continue; }
    heoPool.accounts.push({
      id: 'h' + (++heoCounter) + '-' + Date.now().toString(36),
      username: p.username,
      password: p.password,
      status: 'ready',
      deviceId: null,
      assignedAt: null,
      loggedInAt: null,
      createdAt: nowIso()
    });
    added++;
  }
  if (added > 0) saveHeoPool();
  return { added: added, skipped: skipped, total: heoPool.accounts.length };
}

/** Cap tai khoan heo ready tiep theo cho mot may. Tra {account} hoac {error}. */
function assignHeo(deviceId) {
  const a = heoPool.accounts.find((x) => x.status === 'ready');
  if (!a) return { error: 'pool_empty' };
  a.status = 'assigned';
  a.deviceId = deviceId;
  a.assignedAt = nowIso();
  saveHeoPool();
  return { account: a };
}

function findHeoForDevice(deviceId) {
  return heoPool.accounts.find((x) => x.status === 'assigned' && x.deviceId === deviceId) || null;
}

// ================= Trang thai DIEM DANH 14 NGAY (Giai doan 3.2) =================
// File data/checkin-state.json: { <deviceId>: { dates: ['yyyy-mm-dd', ...],
// cycleStart: 'yyyy-mm-dd' } } — ngay tinh theo gio Asia/Tokyo.
// Du 14 ngay khac nhau trong dates = hoan thanh 1 chu ky diem danh.
let checkinState = {};

function loadCheckinState() {
  try {
    const raw = fs.readFileSync(CHECKIN_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && !Array.isArray(j)) checkinState = j;
  } catch (e) {
    checkinState = {};
  }
}
function saveCheckinState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CHECKIN_FILE, JSON.stringify(checkinState, null, 2), 'utf8');
  } catch (e) {
    console.error('[checkin] khong ghi duoc state:', e.message);
  }
}
loadCheckinState();
if (!fs.existsSync(CHECKIN_FILE)) saveCheckinState(); // tu tao file rong lan dau

/** Ngay hom nay theo gio Tokyo, dinh dang yyyy-mm-dd. */
function todayTokyo() {
  try {
    const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch (e) { /* roi xuong cach thu cong */ }
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function getCheckinState(deviceId) {
  const st = checkinState[deviceId];
  if (st && Array.isArray(st.dates)) return st;
  return { dates: [], cycleStart: null };
}

function publicCheckin(deviceId) {
  const st = getCheckinState(deviceId);
  const today = todayTokyo();
  return {
    count: st.dates.length,
    dates: st.dates.slice(),
    todayDone: st.dates.indexOf(today) >= 0,
    complete: st.dates.length >= 14,
    cycleStart: st.cycleStart || null
  };
}

/** Ghi nhan diem danh hom nay cho may (neu chua ghi). Tra publicCheckin. */
function recordCheckin(deviceId) {
  const today = todayTokyo();
  let st = checkinState[deviceId];
  if (!st || !Array.isArray(st.dates)) {
    st = { dates: [], cycleStart: today };
    checkinState[deviceId] = st;
  }
  if (!st.cycleStart) st.cycleStart = st.dates.length ? st.dates[0] : today;
  if (st.dates.indexOf(today) < 0) {
    st.dates.push(today);
    st.dates.sort();
    saveCheckinState();
  }
  return publicCheckin(deviceId);
}

// ================= Trang thai DANG KY LINE (Giai doan 5) =================
// File data/line-state.json: { <deviceId>: { doneAt, email } } — ghi
// khi flow "dang-ky-line" thay dau thanh cong tren LINE. The may hien
// badge "LINE ✔" tu trang thai nay (song sot qua cac lan khoi dong).
let lineState = {};

function loadLineState() {
  try {
    const j = JSON.parse(fs.readFileSync(LINE_FILE, 'utf8'));
    if (j && typeof j === 'object' && !Array.isArray(j)) lineState = j;
  } catch (e) { lineState = {}; }
}
function saveLineState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LINE_FILE, JSON.stringify(lineState, null, 2), 'utf8');
  } catch (e) {
    console.error('[line] khong ghi duoc state:', e.message);
  }
}
loadLineState();

function publicLine(deviceId) {
  const st = lineState[deviceId];
  if (!st || !st.doneAt) return { done: false, doneAt: null };
  return { done: true, doneAt: st.doneAt };
}

function recordLineDone(deviceId, email) {
  lineState[deviceId] = { doneAt: nowIso(), email: email || null };
  saveLineState();
  return publicLine(deviceId);
}

// ================= Link game chuyen dung (Giai doan 3.2) =================
// File data/game-link.json: { url, updatedAt } — link game chuyen dung
// (hoac noi dung ma QR) ma cac Nik xem heo PHAI mo de xem thi ben Link
// moi duoc ghi nhan thanh cong. Luu server-side de khoi dan lai moi
// ngay; dashboard tu tai + tu luu qua /api/game-link.
let gameLink = { url: '', updatedAt: null };
function loadGameLink() {
  try {
    const j = JSON.parse(fs.readFileSync(GAME_LINK_FILE, 'utf8'));
    if (j && typeof j.url === 'string') gameLink = { url: j.url, updatedAt: j.updatedAt || null };
  } catch (e) { /* chua co file — giu rong */ }
}
function saveGameLink() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GAME_LINK_FILE, JSON.stringify(gameLink, null, 2), 'utf8');
  } catch (e) {
    console.error('[game-link] khong ghi duoc file:', e.message);
  }
}
loadGameLink();

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
  },
  // Giai doan 3.2: dau chu nhan dien man hinh DANG NHAP TIKTOK LITE cho
  // flow "dang-nhap-tiktok-lite" — loginEntry (nut vao dang nhap),
  // usernameScreen (man hinh nhap username/email), passwordScreen (man
  // hinh nhap mat khau), loginButton (nut dang nhap / tiep theo),
  // verifyMarkers (chu bao TikTok bat XAC MINH: ma xac nhan / CAPTCHA —
  // thay la dung Cho cham tay). Mac dinh tieng Nhat truoc, can hieu chuan.
  tiktokLogin: {
    loginEntry: ['ログイン', 'ログインする', 'Log in'],
    usernameScreen: ['ユーザー名', 'メールアドレス', '電話番号', 'Username', 'Email or phone'],
    passwordScreen: ['パスワード', 'Password'],
    loginButton: ['ログイン', 'Log in', '次へ', 'Next'],
    verifyMarkers: ['本人確認', '確認コード', '認証コード', 'セキュリティコード', '電話番号を入力', 'ロボットではありません']
  },
  // Giai doan 3.2: dau chu cho flow "diem-danh" — entryMarkers (muc diem
  // danh / bonus tren man hinh), buttonMarkers (nut bam diem danh),
  // successMarkers (chu bao diem danh thanh cong — mac dinh giong
  // checkinSuccessMarkers).
  checkin: {
    entryMarkers: ['チェックイン', 'ボーナス', 'ポイント'],
    buttonMarkers: ['チェックインする', 'チェックイン'],
    successMarkers: ['チェックイン完了', 'チェックイン成功', 'ポイントを獲得しました', '付与されました']
  },
  // Giai doan 5: dau chu cho flow "dang-ky-line" (dang ky LINE bang
  // Google, quoc gia Singapore — hoc job cua Tokium):
  //   startMarkers: nut bat dau dang ky tren man hinh chao LINE;
  //   googleContinue: nut tiep tuc bang Google;
  //   countryMarkers: chu nhan dien muc chon quoc gia Singapore
  //     (ten quoc gia / ma +65) — dung ca de tim o tim kiem lan dong
  //     da chon trong man hinh nhap so dien thoai;
  //   countrySearchText: chu go vao o tim kiem quoc gia;
  //   agreeMarkers: nut dong y / tiep theo o buoc cuoi;
  //   verifyMarkers: chu bao LINE bat XAC MINH (SMS/ma) -> Cho cham tay;
  //   successMarkers: chu bao da vao LINE (chao/home).
  // Mac dinh tieng Nhat — CAN HIEU CHUAN theo man hinh LINE that o
  // lan chay dau, giong cac flow TikTok (xem HUONG-DAN).
  lineRegister: {
    startMarkers: ['新規登録', '登録', 'はじめる'],
    googleContinue: ['Googleで続ける', 'Googleでログイン'],
    countryMarkers: ['シンガポール', 'Singapore', '+65'],
    countrySearchText: 'シンガポール',
    agreeMarkers: ['同意する', '次へ'],
    // LUU Y: '電話番号を入力' KHONG nam o day — do la tieu de man
    // hinh NHAP SO DIEN THOAI (co o chon quoc gia, xu ly duoc), dua
    // vao day se lam flow dung Cho cham tay ngay o buoc nhap so.
    verifyMarkers: ['本人確認', '確認コード', '認証コード', 'セキュリティコード', 'ロボットではありません'],
    successMarkers: ['ようこそ', 'LINEへようこそ', 'ホーム']
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

function sanitizeTiktokLogin(v) {
  const d = FLOW_DEFAULTS.tiktokLogin;
  const s = (v && typeof v === 'object') ? v : {};
  return {
    loginEntry: sanitizeMarkers(s.loginEntry, d.loginEntry),
    usernameScreen: sanitizeMarkers(s.usernameScreen, d.usernameScreen),
    passwordScreen: sanitizeMarkers(s.passwordScreen, d.passwordScreen),
    loginButton: sanitizeMarkers(s.loginButton, d.loginButton),
    verifyMarkers: sanitizeMarkers(s.verifyMarkers, d.verifyMarkers)
  };
}

function sanitizeCheckin(v) {
  const d = FLOW_DEFAULTS.checkin;
  const s = (v && typeof v === 'object') ? v : {};
  return {
    entryMarkers: sanitizeMarkers(s.entryMarkers, d.entryMarkers),
    buttonMarkers: sanitizeMarkers(s.buttonMarkers, d.buttonMarkers),
    successMarkers: sanitizeMarkers(s.successMarkers, d.successMarkers)
  };
}

function sanitizeLineRegister(v) {
  const d = FLOW_DEFAULTS.lineRegister;
  const s = (v && typeof v === 'object') ? v : {};
  return {
    startMarkers: sanitizeMarkers(s.startMarkers, d.startMarkers),
    googleContinue: sanitizeMarkers(s.googleContinue, d.googleContinue),
    countryMarkers: sanitizeMarkers(s.countryMarkers, d.countryMarkers),
    countrySearchText: (typeof s.countrySearchText === 'string' && s.countrySearchText.trim())
      ? s.countrySearchText : d.countrySearchText,
    agreeMarkers: sanitizeMarkers(s.agreeMarkers, d.agreeMarkers),
    verifyMarkers: sanitizeMarkers(s.verifyMarkers, d.verifyMarkers),
    successMarkers: sanitizeMarkers(s.successMarkers, d.successMarkers)
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
      signin: sanitizeSignin(j.signin),
      tiktokLogin: sanitizeTiktokLogin(j.tiktokLogin),
      checkin: sanitizeCheckin(j.checkin),
      lineRegister: sanitizeLineRegister(j.lineRegister)
    };
  } catch (e) {
    return {
      onboardingMarkers: FLOW_DEFAULTS.onboardingMarkers.slice(),
      checkinSuccessMarkers: FLOW_DEFAULTS.checkinSuccessMarkers.slice(),
      signin: sanitizeSignin(null),
      tiktokLogin: sanitizeTiktokLogin(null),
      checkin: sanitizeCheckin(null),
      lineRegister: sanitizeLineRegister(null)
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

/**
 * Hotfix 3.2.3 — phan loai man hinh dang nhap GOOGLE mot cach NGHIEM
 * NGAT. Bang chung may that (Sony SOV37, 2026-11-16 ~22:07): kho
 * Gmail dung (email day du, trang thai Da cap cho may), nhung o EMAIL
 * tren man hinh dang nhap Google lai chua MAT KHAU cua tai khoan —
 * flow da go mat khau vao o email. Nguyen nhan: man hinh dang nhap
 * Google la WebView/DOM, cay dump_ui co the chua san chu cua buoc
 * mat khau (vd "パスワード" trong DOM an) ngay ca khi dang o buoc
 * email; cach nhan dien cu ("co chu passwordScreen HOAC co bat ky o
 * EditText nao" thi coi la man hinh mat khau) khien nhanh mat khau
 * thang, va input_text (SET_TEXT) ghi mat khau de len o nhap duy
 * nhat dang hien — chinh la o email.
 * QUY TAC MOI: thay bat ky marker emailScreen nao -> man hinh EMAIL
 * (uu tien tuyet doi); chi khi KHONG co marker email ma co marker
 * passwordScreen moi la man hinh MAT KHAU.
 */
function classifySigninScreen(nodes, cfg) {
  if (!nodes) return null;
  if (dumpHasAny(nodes, cfg.emailScreen)) return 'email';
  if (dumpHasAny(nodes, cfg.passwordScreen)) return 'password';
  return null;
}

/** Tuong tu cho dang nhap TikTok Lite: usernameScreen thang passwordScreen. */
function classifyTiktokScreen(nodes, cfg) {
  if (!nodes) return null;
  if (dumpHasAny(nodes, cfg.usernameScreen)) return 'username';
  if (dumpHasAny(nodes, cfg.passwordScreen)) return 'password';
  return null;
}

/** Chuoi co xuat hien trong text/desc cua bat ky node nao khong. */
function dumpContainsText(nodes, text) {
  if (!nodes || !text) return false;
  for (const n of nodes) {
    if (((n.text || '') + '\n' + (n.desc || '')).indexOf(text) >= 0) return true;
  }
  return false;
}

/**
 * Co o EditText nao dang chua text (text that cua node — khong tinh
 * desc/goi y) khong. Dung de xac minh sau khi nhap mat khau ma KHONG
 * ghi lai noi dung da nhap.
 */
function anyEditTextHasText(nodes) {
  if (!nodes) return false;
  for (const n of nodes) {
    if (n.className && n.className.indexOf('EditText') >= 0 &&
        (n.text || '').trim().length > 0) return true;
  }
  return false;
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
 * Hotfix 3.2.1 — cham marker kieu CHO + THU LAI (polling tap).
 * Quet dump_ui lien tuc (moi intervalMs, toi da timeoutMs):
 *  - thay chu XAC MINH (opts.verifyMarkers) thi dung ngay, tra
 *    { status: 'verify', marker };
 *  - thay node chua mot marker (trong text hoac desc, co bounds hop le)
 *    thi cham vao tam bounds bang lenh 'tap', tra
 *    { status: 'tapped', marker };
 *  - het gio van chua thay thi tra { status: 'not_found' }.
 * Ly do: tren may that (Sony SOV37, chay that 2026-11-16) nut 次へ hien
 * ro tren man hinh dang nhap Google va email da duoc tu nhap, nhung mot
 * lan tap_text DUY NHAT van truot — cay accessibility o thoi diem do
 * chua kip lo node nut (ban phim dang mo / man hinh dang chuyen / o
 * nhap dang xac thuc). Cho va quet lai vai lan la het truot.
 */
async function tapMarkerWithRetry(deviceId, markers, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || 15000;
  const intervalMs = opts.intervalMs || 1200;
  const verifyMarkers = opts.verifyMarkers || null;
  const tag = opts.logTag || 'tap-marker';
  const t0 = Date.now();
  let scans = 0;
  while (true) {
    scans++;
    const nodes = await dumpUiNodes(deviceId);
    if (nodes) {
      if (verifyMarkers) {
        const v = dumpHasAny(nodes, verifyMarkers);
        if (v) {
          console.log('[tap-retry] ' + tag + ': thay chu xac minh "' + v + '" sau ' + scans + ' lan quet');
          return { status: 'verify', marker: v };
        }
      }
      let hitNode = null;
      let hitMarker = null;
      for (const m of markers) {
        if (!m) continue;
        for (const n of nodes) {
          const hay = ((n.text || '') + '\n' + (n.desc || ''));
          if (hay.indexOf(m) >= 0 && Array.isArray(n.bounds) && n.bounds.length === 4) {
            hitNode = n; hitMarker = m; break;
          }
        }
        if (hitNode) break;
      }
      if (hitNode) {
        const x = Math.round((hitNode.bounds[0] + hitNode.bounds[2]) / 2);
        const y = Math.round((hitNode.bounds[1] + hitNode.bounds[3]) / 2);
        try {
          const res = await sendCommand(deviceId, 'tap', { x: x, y: y }, 15000);
          if (res && res.ok) {
            if (scans > 1) console.log('[tap-retry] ' + tag + ': cham duoc "' + hitMarker + '" sau ' + scans + ' lan quet');
            return { status: 'tapped', marker: hitMarker };
          }
        } catch (e) { /* cham loi — vong quet sau thu lai */ }
      }
    }
    if (Date.now() - t0 >= timeoutMs) return { status: 'not_found' };
    await sleepMs(intervalMs);
  }
}

/**
 * Hotfix 3.2.2 — nhap text kieu THU LAI khi o chua kip focus (no_focus).
 * Tren may that (Sony SOV37, chay that 2026-11-16 voi ban 3.2.1): man
 * hinh dang nhap Google mo va nhan dien duoc, server cham vao o
 * EditText nhung lenh input_text tra loi no_focus — o chua kip nhan
 * input-focus tai thoi diem do (tre focus/IME sau lan cham), trong
 * khi mot lan chay cham hon (nhip tay) thi nhap duoc binh thuong.
 * no_focus la loi TAM THOI: cho intervalMs roi thu lai, toi da
 * attempts lan; loi khac thi tra ve ngay. Tra { ok, error, attempts }.
 * Qua opts.log chi ghi MOT su kien cho doi (tranh spam su kien).
 * AN TOAN: text (co the la mat khau) CHI di qua lenh input_text tren
 * kenh agent; su kien cho doi KHONG chua text.
 */
async function inputTextWithRetry(deviceId, text, opts) {
  opts = opts || {};
  const attempts = opts.attempts || 6;
  const intervalMs = opts.intervalMs || 1500;
  const log = opts.log || null;
  let loggedWaiting = false;
  let lastError = 'unknown';
  for (let i = 1; i <= attempts; i++) {
    let res = null;
    try {
      res = await sendCommand(deviceId, 'input_text', { text: text }, CMD_TIMEOUT_MS);
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e), attempts: i };
    }
    if (res && res.ok) return { ok: true, res: res, attempts: i };
    lastError = (res && res.error) || 'unknown';
    if (lastError !== 'no_focus') return { ok: false, error: lastError, attempts: i };
    if (i < attempts) {
      if (log && !loggedWaiting) {
        log('Ô nhập chưa sẵn sàng (no_focus) — chờ ô nhập focus rồi nhập lại...');
        loggedWaiting = true;
      }
      await sleepMs(intervalMs);
    }
  }
  return { ok: false, error: lastError, attempts: attempts };
}

/**
 * Hotfix 3.2.4 — TAT BAN PHIM truoc khi bam nut chuyen buoc.
 * Chan doan cua nguoi dung khi xem may that (Sony SOV37, 2026-11-16
 * ~22:40, sau khi ban 3.2.3 van khong bam duoc nut Tiep theo): sau
 * khi nhap, ban phim IME tieng Nhat van MO va cay accessibility bao
 * toa do (bounds) cua nut 次へ LECH khoi vi tri that, nen moi lan
 * cham theo bounds do (ke ca cac lan thu lai cua vong lap 3.2.3)
 * deu cham sai cho va trang khong bao gio chuyen. Cach sua: ngay
 * sau khi nhap + xac minh xong, trong CUNG mot vong lap cua buoc,
 * gui lenh key 'back' de dong ban phim (luc do ban phim chac chan
 * dang mo vi vua nhap xong — Back chi dong ban phim, khong roi
 * khoi man hinh dang nhap), nghi ~800ms cho bo cuc on dinh, roi
 * moi cham nut bang tapMarkerWithRetry (helper do quet dump lai
 * tung lan nen doc duoc bounds DUNG sau khi ban phim da dong).
 * Lenh key loi thi ghi log roi van thu bam nut nhu thuong.
 * CHI goi helper nay ngay sau mot lan nhap thanh cong trong cung
 * vong lap cua buoc nhap — khong goi o bat ky diem nao khac, de
 * phim Back khong bao gio lam roi khoi flow dang nhap.
 */
async function dismissKeyboard(deviceId, log) {
  try {
    const res = await sendCommand(deviceId, 'key', { key: 'back' }, 15000);
    if (res && res.ok) {
      if (log) log('Đã tắt bàn phím trước khi bấm nút (để máy nhận diện đúng vị trí nút)');
    } else {
      console.log('[keyboard] lenh key back tra loi ' + ((res && res.error) || 'unknown') + ' — van thu bam nut tiep');
    }
  } catch (e) {
    console.log('[keyboard] khong gui duoc lenh key back: ' + (e && e.message || e) + ' — van thu bam nut tiep');
  }
  await sleepMs(800);
}

// ===== Vong lap THU LAI theo buoc nhap (Hotfix 3.2.3, ban dieu chinh) =====
// Moi buoc nhap thong tin dang nhap (email / mat khau Google, tai
// khoan / mat khau TikTok) chay theo vong lap: phan loai lai man
// hinh -> cham o -> nghi ngan -> nhap lai -> xac minh gia tri da
// nhap -> bam nut chuyen buoc -> kiem tra trang da chuyen chua.
// Chua chuyen thi nghi ~5 giay roi lam lai CA BUOC (nhap lai an
// toan vi input_text ghi de noi dung o). Gioi han ~5 phut/buoc;
// het gio thi buoc loi voi ghi chu ro rang duoi day. Thay chu XAC
// MINH o bat ky dau thi dung Cho cham tay NGAY — vong lap khong
// bao gio co vuot qua xac minh. Run bi Stop (hooks.isStopped) thi
// thoat ngay voi outcome 'stopped'.
const STEP_RETRY_WAIT_MS = 5000;
const STEP_CAP_MS = 5 * 60 * 1000;
const STEP_CAP_NOTE = 'Đã thử nhập lại nhiều lần trong 5 phút nhưng trang chưa chuyển — kiểm tra máy/mạng';

/** Run pipeline chua buoc nay co dang bi Stop khong (hooks.isStopped). */
function seqIsStopped(hooks) {
  return !!(hooks && hooks.isStopped && hooks.isStopped());
}

/**
 * Ngu ~ms nhung thuc day som khi run bi Stop (kiem tra moi 500ms).
 * Tra true neu ngu du, false neu bi Stop giua chung.
 */
async function sleepUnlessStopped(ms, hooks) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (seqIsStopped(hooks)) return false;
    await sleepMs(Math.min(500, ms - (Date.now() - t0)));
  }
  return !seqIsStopped(hooks);
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

  // ===== Hotfix 3.2.3 (ban dieu chinh): VONG LAP THU LAI cho tung
  // buoc nhap — thay co che "dung ngay khi khong khop" cua ban 3.2.3
  // dau. Moi buoc (email, mat khau) la mot vong lap: phan loai lai
  // man hinh -> cham o -> nghi ~800ms -> nhap (helper 3.2.2 thu lai
  // khi no_focus) -> XAC MINH gia tri vua nhap tren man hinh -> bam
  // Tiep theo (helper 3.2.1) -> kiem tra trang da chuyen buoc chua.
  // Chua chuyen thi nghi ~5 giay roi lam lai ca buoc, toi da ~5
  // phut/buoc (het gio: loi voi STEP_CAP_NOTE). Phan loai NGHIEM
  // NGAT van giu nguyen: marker email thang tuyet doi, mat khau CHI
  // duoc go khi man hinh phan loai la 'password' (canh gac nam ngay
  // trong vong mat khau — dump cua vong do phai la 'password').
  // Thay chu XAC MINH o bat ky dau -> dung Cho cham tay NGAY.
  // Loi nhap den tu helper inputTextWithRetry (vd no_focus vinh
  // vien sau 6 lan thu) giu nguyen cach xu ly cua 3.2.2: buoc loi
  // voi ghi chu loi nhap — vi luc do o khong nhan duoc focus, lam
  // lai ca buoc cung khong khac gi.
  let resumedFlag = false; // da co lan Resume tu Cho cham tay trong sequence nay

  // Dung Cho cham tay vi Google bat xac minh. Tra 'resumed' |
  // 'stopped' | 'verify' (hai gia tri sau: out da duoc dat ket thuc).
  async function parkVerify() {
    log('Google yêu cầu xác minh — dừng chờ chạm tay');
    if (!hooks.park) { out.outcome = 'verify'; out.note = SIGNIN_VERIFY_NOTE; return 'verify'; }
    const how = await hooks.park(SIGNIN_VERIFY_NOTE);
    if (how === 'stopped') { out.outcome = 'stopped'; return 'stopped'; }
    resumedFlag = true;
    return 'resumed';
  }

  // --- Buoc nhap EMAIL: lap cho toi khi man hinh chuyen sang buoc
  // mat khau. Tra 'password' | 'final' | 'terminal' (out da dat). ---
  async function emailStep() {
    const deadline = Date.now() + STEP_CAP_MS;
    let cycle = 0;
    let typedLogged = false;
    while (true) {
      if (seqIsStopped(hooks)) { out.outcome = 'stopped'; return 'terminal'; }
      if (Date.now() >= deadline) {
        out.note = STEP_CAP_NOTE;
        log('⚠️ Hết ~5 phút ở bước nhập email: ' + STEP_CAP_NOTE);
        return 'terminal';
      }
      let waitMs = 1500; // dang cho man hinh dang nhap xuat hien — quet lai nhanh
      const nodes = await dumpUiNodes(deviceId);
      if (nodes) {
        if (dumpHasAny(nodes, cfg.verifyMarkers)) {
          const p = await parkVerify();
          if (p !== 'resumed') return 'terminal';
          continue;
        }
        const cls = classifySigninScreen(nodes, cfg);
        if (cls === 'password') return 'password';
        if (cls === null && resumedFlag) return 'final'; // nguoi dung da dang nhap tay xong
        if (cls === 'email') {
          cycle++;
          let cycleFailed = false;
          if (!await tapFirstEditText(deviceId, nodes)) {
            cycleFailed = true;
          } else {
            await sleepMs(800);
            const inp = await inputTextWithRetry(deviceId, acct.email, { log: log });
            if (!inp.ok) { out.note = 'Không nhập được email: ' + inp.error; return 'terminal'; }
            out.emailTyped = true;
            if (!typedLogged) { log('Đã nhập email ' + acct.email); typedLogged = true; }
            // Xac minh sau khi nhap (3.2.3): email phai thay duoc
            // tren man hinh — khong thay tuc la nhap "rot" (o van
            // trong), vong sau nhap lai thay vi dung han.
            const seen = await pollDumpUntil(deviceId,
              (n2) => dumpContainsText(n2, acct.email) ? 'seen' : null, 6000);
            if (!seen) {
              cycleFailed = true;
            } else {
              // Hotfix 3.2.4: tat ban phim truoc khi bam Tiep theo —
              // ban phim con mo thi bounds nut bi bao lech, cham
              // theo toa do do se truot (chan doan may that).
              await dismissKeyboard(deviceId, log);
              const nb = await tapMarkerWithRetry(deviceId, cfg.nextButton, {
                verifyMarkers: cfg.verifyMarkers, logTag: 'gmail-next-email'
              });
              if (nb.status === 'verify') {
                const p = await parkVerify();
                if (p !== 'resumed') return 'terminal';
              } else if (nb.status === 'tapped') {
                log('Đã bấm "' + nb.marker + '", chờ màn hình nhập mật khẩu...');
                // Kiem tra chuyen trang (~10 giay)
                const trans = await pollDumpUntil(deviceId, (n2) => {
                  if (dumpHasAny(n2, cfg.verifyMarkers)) return 'verify';
                  if (classifySigninScreen(n2, cfg) === 'password') return 'password';
                  return null;
                }, 10000);
                if (trans && trans.hit === 'password') return 'password';
                if (trans && trans.hit === 'verify') {
                  const p = await parkVerify();
                  if (p !== 'resumed') return 'terminal';
                } else if (!trans) {
                  cycleFailed = true; // van o man hinh email — lam lai ca buoc
                }
              } else {
                cycleFailed = true; // not_found — chua thay nut Tiep theo
              }
            }
          }
          if (cycleFailed) {
            log('Trang chưa chuyển sang bước mật khẩu — chờ ~5 giây rồi thử nhập lại email (lần ' + (cycle + 1) + ')');
            waitMs = STEP_RETRY_WAIT_MS;
          }
        }
      }
      if (!await sleepUnlessStopped(waitMs, hooks)) { out.outcome = 'stopped'; return 'terminal'; }
    }
  }

  // --- Buoc nhap MAT KHAU: lap cho toi khi roi khoi man hinh mat
  // khau. Tra 'final' | 'email' (bi day ve) | 'terminal'. ---
  async function passwordStep() {
    const deadline = Date.now() + STEP_CAP_MS;
    let cycle = 0;
    let typedLogged = false;
    while (true) {
      if (seqIsStopped(hooks)) { out.outcome = 'stopped'; return 'terminal'; }
      if (Date.now() >= deadline) {
        out.note = STEP_CAP_NOTE;
        log('⚠️ Hết ~5 phút ở bước nhập mật khẩu: ' + STEP_CAP_NOTE);
        return 'terminal';
      }
      let waitMs = 1500;
      const nodes = await dumpUiNodes(deviceId);
      if (nodes) {
        if (dumpHasAny(nodes, cfg.verifyMarkers)) {
          const p = await parkVerify();
          if (p !== 'resumed') return 'terminal';
          continue;
        }
        const cls = classifySigninScreen(nodes, cfg);
        if (cls === 'email') return 'email'; // Google day ve buoc email — lam lai buoc email
        if (cls === null && resumedFlag) return 'final'; // nguoi dung da dang nhap tay xong
        if (cls === 'password') {
          cycle++;
          let cycleFailed = false;
          // CANH GAC (3.2.3) nam ngay tai day: dump cua vong nay
          // phan loai dung 'password' thi moi duoc go mat khau.
          if (!await tapFirstEditText(deviceId, nodes)) {
            cycleFailed = true;
          } else {
            await sleepMs(800);
            const inp = await inputTextWithRetry(deviceId, acct.password, { log: log });
            if (!inp.ok) { out.note = 'Không nhập được mật khẩu: ' + inp.error; return 'terminal'; }
            out.passwordTyped = true;
            if (!typedLogged) { log('Đã nhập mật khẩu ********'); typedLogged = true; }
            // Xac minh sau khi nhap: o mat khau phai co noi dung
            // (chi kiem tra co/khong — KHONG ghi lai noi dung).
            const chk = await dumpUiNodes(deviceId);
            if (!chk || !anyEditTextHasText(chk)) {
              cycleFailed = true; // nhap "rot" — o van trong, vong sau nhap lai
            } else {
              // Hotfix 3.2.4: tat ban phim truoc khi bam Tiep theo
              // (nhu buoc email — bounds nut bi lech khi ban phim mo).
              await dismissKeyboard(deviceId, log);
              const nb = await tapMarkerWithRetry(deviceId, cfg.nextButton, {
                verifyMarkers: cfg.verifyMarkers, logTag: 'gmail-next-password'
              });
              if (nb.status === 'verify') {
                const p = await parkVerify();
                if (p !== 'resumed') return 'terminal';
              } else if (nb.status === 'tapped') {
                log('Đã bấm "' + nb.marker + '", chờ Google xử lý...');
                // Kiem tra chuyen trang (~10 giay)
                const trans = await pollDumpUntil(deviceId, (n2) => {
                  if (dumpHasAny(n2, cfg.verifyMarkers)) return 'verify';
                  const c2 = classifySigninScreen(n2, cfg);
                  if (c2 === 'password') return null;
                  return c2 === 'email' ? 'email' : 'gone';
                }, 10000);
                if (trans && trans.hit === 'verify') {
                  const p = await parkVerify();
                  if (p !== 'resumed') return 'terminal';
                } else if (trans && trans.hit === 'email') {
                  return 'email';
                } else if (trans && trans.hit === 'gone') {
                  return 'final';
                } else {
                  cycleFailed = true; // van o man hinh mat khau — lam lai ca buoc
                }
              } else {
                cycleFailed = true; // not_found
              }
            }
          }
          if (cycleFailed) {
            log('Trang chưa chuyển sau khi nhập mật khẩu — chờ ~5 giây rồi thử nhập lại (lần ' + (cycle + 1) + ')');
            waitMs = STEP_RETRY_WAIT_MS;
          }
        }
      }
      if (!await sleepUnlessStopped(waitMs, hooks)) { out.outcome = 'stopped'; return 'terminal'; }
    }
  }

  // Chay hai buoc nhap; Google day qua lai giua hai buoc thi lam
  // lai buoc tuong ung (toi da 4 lan qua lai — tranh lap vo han).
  let stage = 'email';
  let alternations = 0;
  while (true) {
    const r = stage === 'email' ? await emailStep() : await passwordStep();
    if (r === 'terminal') return out;
    if (r === 'final') break;
    if (r === 'password') { stage = 'password'; continue; }
    // r === 'email' (tu buoc mat khau bi day ve buoc email)
    if (++alternations > 4) { out.note = STEP_CAP_NOTE; return out; }
    stage = 'email';
  }

  // Buoc cuoi: vong kiem tra — cham nut Dong y neu co, quet chu xac
  // minh; con xac minh thi dung Cho cham tay, Resume thi chay lai.
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


// ================= Trinh tu DANG NHAP TIKTOK LITE TU DONG (Giai doan 3.2) =================
// Dung cho flow "dang-nhap-tiktok-lite": mo TikTok Lite -> tim nut dang
// nhap (loginEntry) -> cham vao -> cho man hinh nhap username -> cham o
// EditText + nhap username -> bam nut dang nhap/tiep theo -> cho man hinh
// mat khau -> cham o EditText + nhap mat khau -> bam dang nhap -> quet
// lai: con chu XAC MINH thi dung Cho cham tay, khong con dau chu man
// hinh dang nhap thi xong (ghi loggedInAt cho tai khoan trong kho heo).
// Cung mau voi gmailSigninSequence: poll dump_ui moi ~1,5s, timeout ~25s,
// su kien tung tieu buoc (type "tiktok_login"), mat khau luon "********"
// trong log — mat khau that CHI di qua lenh input_text tren kenh agent.
const TT_VERIFY_NOTE = 'Máy đang ở bước xác minh của TikTok — xử lý chạm tay trên máy rồi bấm Chạy tiếp';

async function tiktokLoginSequence(deviceId, acct, hooks) {
  hooks = hooks || {};
  const log = (msg) => {
    addEvent('tiktok_login', deviceId, msg);
    if (hooks.log) hooks.log(msg);
  };
  const cfg = loadFlowConfig().tiktokLogin;
  const out = { outcome: 'error', note: '', usernameTyped: false, passwordTyped: false };
  let res = null;

  // Buoc 1: mo TikTok Lite
  try {
    res = await sendCommand(deviceId, 'open_app', { 'package': TIKTOK_PKG }, CMD_TIMEOUT_MS);
  } catch (e) {
    out.note = 'Không gửi được lệnh mở TikTok Lite: ' + (e && e.message || e);
    return out;
  }
  if (!res || !res.ok) {
    out.note = 'Không mở được TikTok Lite: ' + ((res && res.error) || 'unknown') +
      ((res && res.error === 'app_not_installed') ? ' (máy chưa cài TikTok Lite — chạy tác vụ Tải TikTok Lite trước)' : '');
    return out;
  }
  log('Đăng nhập TikTok Lite: đã mở app, tìm màn hình đăng nhập...');
  await sleepMs(3000);

  // Buoc 2: dieu huong toi man hinh nhap username — thay nut dang nhap
  // thi bam vao roi quet tiep; thay chu XAC MINH thi dung Cho cham tay.
  let userDump = null;
  let entryTaps = 0;
  while (!userDump) {
    const r = await pollDumpUntil(deviceId, (nodes) => {
      if (dumpHasAny(nodes, cfg.verifyMarkers)) return 'verify';
      // Hotfix 3.2.3: phan loai nghiem ngat nhu dang nhap Google —
      // usernameScreen uu tien tuyet doi truoc passwordScreen, bo
      // dieu kien "hoac co bat ky o EditText nao" cua ban cu.
      if (classifyTiktokScreen(nodes, cfg) === 'username') return 'username';
      if (dumpHasAny(nodes, cfg.loginEntry)) return 'entry';
      return null;
    }, 25000);
    if (!r) {
      out.note = 'Không thấy màn hình đăng nhập TikTok Lite sau 25 giây (kiểm tra máy / dấu chữ tiktokLogin trong flow-config.json)';
      return out;
    }
    if (r.hit === 'username') { userDump = r; break; }
    if (r.hit === 'entry') {
      if (++entryTaps > 3) {
        out.note = 'Đã bấm nút đăng nhập nhiều lần nhưng chưa thấy màn hình nhập tài khoản';
        return out;
      }
      // Helper CHO + THU LAI (hotfix 3.2.1) thay cho mot lan tap_text:
      // nut dang nhap co the chua kip lo trong cay accessibility.
      const t = await tapMarkerWithRetry(deviceId, cfg.loginEntry, {
        verifyMarkers: cfg.verifyMarkers, logTag: 'tiktok-login-entry'
      });
      if (t.status === 'not_found') {
        out.note = 'Không bấm được nút đăng nhập của TikTok Lite';
        return out;
      }
      if (t.status === 'verify') {
        log('TikTok yêu cầu xác minh — dừng chờ chạm tay');
        if (!hooks.park) { out.outcome = 'verify'; out.note = TT_VERIFY_NOTE; return out; }
        const howE = await hooks.park(TT_VERIFY_NOTE);
        if (howE === 'stopped') { out.outcome = 'stopped'; return out; }
        continue;
      }
      log('Đã bấm "' + t.marker + '", chờ màn hình nhập tài khoản...');
      await sleepMs(1500);
      continue;
    }
    // r.hit === 'verify'
    log('TikTok yêu cầu xác minh — dừng chờ chạm tay');
    if (!hooks.park) { out.outcome = 'verify'; out.note = TT_VERIFY_NOTE; return out; }
    const how = await hooks.park(TT_VERIFY_NOTE);
    if (how === 'stopped') { out.outcome = 'stopped'; return out; }
  }

  // ===== Hotfix 3.2.3 (ban dieu chinh): VONG LAP THU LAI cho hai
  // buoc nhap TAI KHOAN / MAT KHAU — cung mau voi dang nhap Google:
  // phan loai lai man hinh -> cham o -> nghi ~800ms -> nhap (helper
  // 3.2.2) -> xac minh gia tri vua nhap -> bam nut dang nhap (helper
  // 3.2.1) -> kiem tra chuyen trang; chua chuyen thi nghi ~5 giay
  // lam lai ca buoc, toi da ~5 phut/buoc. Phan loai nghiem ngat
  // (usernameScreen thang passwordScreen) van giu — mat khau chi
  // duoc go khi dump cua vong phan loai la 'password'. Thay chu XAC
  // MINH o bat ky dau -> dung Cho cham tay NGAY. =====
  let resumedFlag = false; // da co lan Resume tu Cho cham tay trong sequence nay

  // Dung Cho cham tay vi TikTok bat xac minh. Tra 'resumed' |
  // 'stopped' | 'verify' (hai gia tri sau: out da duoc dat ket thuc).
  async function parkVerify() {
    log('TikTok yêu cầu xác minh — dừng chờ chạm tay');
    if (!hooks.park) { out.outcome = 'verify'; out.note = TT_VERIFY_NOTE; return 'verify'; }
    const how = await hooks.park(TT_VERIFY_NOTE);
    if (how === 'stopped') { out.outcome = 'stopped'; return 'stopped'; }
    resumedFlag = true;
    return 'resumed';
  }

  // --- Buoc nhap TAI KHOAN: lap cho toi khi sang buoc mat khau.
  // Tra 'password' | 'final' | 'terminal' (out da dat). ---
  async function usernameStep() {
    const deadline = Date.now() + STEP_CAP_MS;
    let cycle = 0;
    let typedLogged = false;
    while (true) {
      if (seqIsStopped(hooks)) { out.outcome = 'stopped'; return 'terminal'; }
      if (Date.now() >= deadline) {
        out.note = STEP_CAP_NOTE;
        log('⚠️ Hết ~5 phút ở bước nhập tài khoản: ' + STEP_CAP_NOTE);
        return 'terminal';
      }
      let waitMs = 1500;
      const nodes = await dumpUiNodes(deviceId);
      if (nodes) {
        if (dumpHasAny(nodes, cfg.verifyMarkers)) {
          const p = await parkVerify();
          if (p !== 'resumed') return 'terminal';
          continue;
        }
        const cls = classifyTiktokScreen(nodes, cfg);
        if (cls === 'password') return 'password';
        if (cls === null && resumedFlag) return 'final'; // nguoi dung da dang nhap tay xong
        if (cls === 'username') {
          cycle++;
          let cycleFailed = false;
          if (!await tapFirstEditText(deviceId, nodes)) {
            cycleFailed = true;
          } else {
            await sleepMs(800);
            const inp = await inputTextWithRetry(deviceId, acct.username, { log: log });
            if (!inp.ok) { out.note = 'Không nhập được tài khoản: ' + inp.error; return 'terminal'; }
            out.usernameTyped = true;
            if (!typedLogged) { log('Đã nhập tài khoản ' + acct.username); typedLogged = true; }
            // Xac minh sau khi nhap: username phai thay tren man hinh
            const seen = await pollDumpUntil(deviceId,
              (n2) => dumpContainsText(n2, acct.username) ? 'seen' : null, 6000);
            if (!seen) {
              cycleFailed = true; // nhap "rot" — vong sau nhap lai
            } else {
              // Hotfix 3.2.4: tat ban phim truoc khi bam nut dang
              // nhap/tiep theo (nhu dang nhap Google).
              await dismissKeyboard(deviceId, log);
              const lb = await tapMarkerWithRetry(deviceId, cfg.loginButton, {
                verifyMarkers: cfg.verifyMarkers, logTag: 'tiktok-login-user-next'
              });
              if (lb.status === 'verify') {
                const p = await parkVerify();
                if (p !== 'resumed') return 'terminal';
              } else if (lb.status === 'tapped') {
                log('Đã bấm "' + lb.marker + '", chờ màn hình nhập mật khẩu...');
                const trans = await pollDumpUntil(deviceId, (n2) => {
                  if (dumpHasAny(n2, cfg.verifyMarkers)) return 'verify';
                  if (classifyTiktokScreen(n2, cfg) === 'password') return 'password';
                  return null;
                }, 10000);
                if (trans && trans.hit === 'password') return 'password';
                if (trans && trans.hit === 'verify') {
                  const p = await parkVerify();
                  if (p !== 'resumed') return 'terminal';
                } else if (!trans) {
                  cycleFailed = true; // van o man hinh tai khoan — lam lai ca buoc
                }
              } else {
                cycleFailed = true; // not_found
              }
            }
          }
          if (cycleFailed) {
            log('Trang chưa chuyển sang bước mật khẩu — chờ ~5 giây rồi thử nhập lại tài khoản (lần ' + (cycle + 1) + ')');
            waitMs = STEP_RETRY_WAIT_MS;
          }
        }
      }
      if (!await sleepUnlessStopped(waitMs, hooks)) { out.outcome = 'stopped'; return 'terminal'; }
    }
  }

  // --- Buoc nhap MAT KHAU: lap cho toi khi roi khoi man hinh mat
  // khau. Tra 'final' | 'username' (bi day ve) | 'terminal'. ---
  async function passwordStep() {
    const deadline = Date.now() + STEP_CAP_MS;
    let cycle = 0;
    let typedLogged = false;
    while (true) {
      if (seqIsStopped(hooks)) { out.outcome = 'stopped'; return 'terminal'; }
      if (Date.now() >= deadline) {
        out.note = STEP_CAP_NOTE;
        log('⚠️ Hết ~5 phút ở bước nhập mật khẩu: ' + STEP_CAP_NOTE);
        return 'terminal';
      }
      let waitMs = 1500;
      const nodes = await dumpUiNodes(deviceId);
      if (nodes) {
        if (dumpHasAny(nodes, cfg.verifyMarkers)) {
          const p = await parkVerify();
          if (p !== 'resumed') return 'terminal';
          continue;
        }
        const cls = classifyTiktokScreen(nodes, cfg);
        if (cls === 'username') return 'username'; // bi day ve buoc tai khoan
        if (cls === null && resumedFlag) return 'final'; // nguoi dung da dang nhap tay xong
        if (cls === 'password') {
          cycle++;
          let cycleFailed = false;
          // CANH GAC (3.2.3): dump cua vong phan loai dung 'password'
          // thi moi duoc go mat khau.
          if (!await tapFirstEditText(deviceId, nodes)) {
            cycleFailed = true;
          } else {
            await sleepMs(800);
            const inp = await inputTextWithRetry(deviceId, acct.password, { log: log });
            if (!inp.ok) { out.note = 'Không nhập được mật khẩu: ' + inp.error; return 'terminal'; }
            out.passwordTyped = true;
            if (!typedLogged) { log('Đã nhập mật khẩu ********'); typedLogged = true; }
            // Xac minh sau khi nhap: o mat khau phai co noi dung
            // (chi kiem tra co/khong — KHONG ghi lai noi dung).
            const chk = await dumpUiNodes(deviceId);
            if (!chk || !anyEditTextHasText(chk)) {
              cycleFailed = true; // nhap "rot" — vong sau nhap lai
            } else {
              // Hotfix 3.2.4: tat ban phim truoc khi bam nut dang
              // nhap (nhu buoc tai khoan — bounds nut bi lech khi
              // ban phim con mo).
              await dismissKeyboard(deviceId, log);
              const lb = await tapMarkerWithRetry(deviceId, cfg.loginButton, {
                verifyMarkers: cfg.verifyMarkers, logTag: 'tiktok-login-pass-next'
              });
              if (lb.status === 'verify') {
                const p = await parkVerify();
                if (p !== 'resumed') return 'terminal';
              } else if (lb.status === 'tapped') {
                log('Đã bấm "' + lb.marker + '", chờ TikTok xử lý...');
                const trans = await pollDumpUntil(deviceId, (n2) => {
                  if (dumpHasAny(n2, cfg.verifyMarkers)) return 'verify';
                  const c2 = classifyTiktokScreen(n2, cfg);
                  if (c2 === 'password') return null;
                  return c2 === 'username' ? 'username' : 'gone';
                }, 10000);
                if (trans && trans.hit === 'verify') {
                  const p = await parkVerify();
                  if (p !== 'resumed') return 'terminal';
                } else if (trans && trans.hit === 'username') {
                  return 'username';
                } else if (trans && trans.hit === 'gone') {
                  return 'final';
                } else {
                  cycleFailed = true; // van o man hinh mat khau — lam lai ca buoc
                }
              } else {
                cycleFailed = true; // not_found
              }
            }
          }
          if (cycleFailed) {
            log('Trang chưa chuyển sau khi nhập mật khẩu — chờ ~5 giây rồi thử nhập lại (lần ' + (cycle + 1) + ')');
            waitMs = STEP_RETRY_WAIT_MS;
          }
        }
      }
      if (!await sleepUnlessStopped(waitMs, hooks)) { out.outcome = 'stopped'; return 'terminal'; }
    }
  }

  // Chay hai buoc nhap; TikTok day qua lai giua hai buoc thi lam
  // lai buoc tuong ung (toi da 4 lan qua lai — tranh lap vo han).
  let stage = 'username';
  let alternations = 0;
  while (true) {
    const r = stage === 'username' ? await usernameStep() : await passwordStep();
    if (r === 'terminal') return out;
    if (r === 'final') break;
    if (r === 'password') { stage = 'password'; continue; }
    // r === 'username' (tu buoc mat khau bi day ve buoc tai khoan)
    if (++alternations > 4) { out.note = STEP_CAP_NOTE; return out; }
    stage = 'username';
  }

  // Buoc 8: kiem tra cuoi — con chu xac minh thi Cho cham tay (Resume
  // thi quet lai); het dau chu man hinh dang nhap thi xong; van con o
  // man hinh nhap username/mat khau sau ~8 giay thi bao chua xong.
  while (true) {
    let sawVerify = false;
    let sawLoginScreen = true;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const nodes = await dumpUiNodes(deviceId);
      if (nodes) {
        if (dumpHasAny(nodes, cfg.verifyMarkers)) { sawVerify = true; break; }
        sawLoginScreen = classifyTiktokScreen(nodes, cfg) !== null;
        if (!sawLoginScreen) break;
      }
      await sleepMs(1200);
    }
    if (sawVerify) {
      log('TikTok vẫn yêu cầu xác minh — dừng chờ chạm tay');
      if (!hooks.park) { out.outcome = 'verify'; out.note = TT_VERIFY_NOTE; return out; }
      const how = await hooks.park(TT_VERIFY_NOTE);
      if (how === 'stopped') { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (sawLoginScreen) {
      out.note = 'Vẫn ở màn hình đăng nhập TikTok Lite sau khi nhập mật khẩu (sai tài khoản/mật khẩu, hoặc app cần thêm bước nữa)';
      return out;
    }
    acct.loggedInAt = nowIso();
    saveHeoPool();
    out.outcome = 'done';
    log('✅ Đăng nhập TikTok Lite hoàn tất: ' + acct.username);
    return out;
  }
}

// ================= Trinh tu DIEM DANH (Giai doan 3.2) =================
// Mo san TikTok Lite (buoc pipeline truoc do) -> quet dump_ui tim muc
// diem danh: thay chu thanh cong thi xong ngay; thay nut diem danh thi
// bam; thay muc diem danh (entry) thi bam vao roi tim nut. Thay chu
// thanh cong (muc "checkin" cua flow-config) -> tra outcome 'success'
// de buoc pipeline ghi nhan ngay hom nay vao checkin-state.json.
async function checkinSequence(deviceId, hooks) {
  hooks = hooks || {};
  const log = (msg) => {
    addEvent('checkin_day', deviceId, msg);
    if (hooks.log) hooks.log(msg);
  };
  const cfg = loadFlowConfig().checkin;
  const scan = (wantButton) => (nodes) => {
    if (dumpHasAny(nodes, cfg.successMarkers)) return 'success';
    if (dumpHasAny(nodes, cfg.buttonMarkers)) return 'button';
    if (!wantButton && dumpHasAny(nodes, cfg.entryMarkers)) return 'entry';
    return null;
  };
  let r = await pollDumpUntil(deviceId, scan(false), 25000);
  if (!r) {
    return { outcome: 'not_found', note: 'Không thấy mục điểm danh trên TikTok Lite sau 25 giây (kiểm tra máy / dấu chữ checkin trong flow-config.json)' };
  }
  if (r.hit === 'success') return { outcome: 'success', already: true };
  if (r.hit === 'entry') {
    const t = await tapFirstMarker(deviceId, cfg.entryMarkers);
    if (!t) return { outcome: 'not_found', note: 'Không bấm được vào mục điểm danh' };
    log('Đã vào mục điểm danh ("' + t + '"), tìm nút điểm danh...');
    await sleepMs(1500);
    r = await pollDumpUntil(deviceId, scan(true), 15000);
    if (!r) return { outcome: 'not_found', note: 'Đã vào mục điểm danh nhưng không thấy nút điểm danh' };
    if (r.hit === 'success') return { outcome: 'success', already: true };
  }
  // r.hit === 'button'
  const bt = await tapFirstMarker(deviceId, cfg.buttonMarkers);
  if (!bt) return { outcome: 'not_found', note: 'Không bấm được nút điểm danh' };
  log('Đã bấm nút điểm danh "' + bt + '", chờ xác nhận...');
  const r2 = await pollDumpUntil(deviceId,
    (nodes) => dumpHasAny(nodes, cfg.successMarkers), 15000);
  if (!r2) {
    return { outcome: 'no_success', note: 'Đã bấm nút điểm danh nhưng chưa thấy chữ báo thành công sau 15 giây' };
  }
  return { outcome: 'success', already: false };
}

// ================= Trinh tu DANG KY LINE (Giai doan 5) =================
// Mo hinh theo job "Register LINE with Singapore + Google" cua Tokium
// nhung chi trong gioi han Tro nang lam duoc mot cach trung thuc:
// pipeline da mo LINE o buoc truoc; trinh tu nay dieu huong dang ky:
//   man hinh chao -> bam bat dau (startMarkers) -> "Googleで続ける"
//   -> man hinh nhap so dien thoai: chon quoc gia Singapore
//      (cham o quoc gia -> tim/cham シンガポール trong danh sach)
//   -> bam dong y / tiep theo -> thay chu thanh cong thi xong.
// Gap chu XAC MINH (SMS/ma) -> dung Cho cham tay (hooks.park).
// Khong tu chon duoc quoc gia Singapore -> dung Cho cham tay kem
// ghi chu ro rang thay vi doan bua. Xoa tai khoan Google khac la
// buoc "manual" rieng trong pipeline — KHONG tu dong hoa.
// Dau chu nam o muc "lineRegister" cua flow-config.json (tieng Nhat,
// can hieu chuan theo man hinh LINE that o lan chay dau).
const LINE_PKG = 'jp.naver.line.android';
const LINE_VERIFY_NOTE = 'Máy đang ở bước xác minh của LINE (SMS/mã xác nhận) — xử lý chạm tay trên máy rồi bấm Chạy tiếp';
const LINE_COUNTRY_NOTE = 'Không tự chọn được quốc gia Singapore trên màn hình LINE — chọn tay シンガポール (+65) trên máy rồi bấm Chạy tiếp';

/** Phan loai man hinh LINE theo dau chu — thu tu uu tien co chu dich. */
function classifyLineScreen(nodes, cfg) {
  if (!nodes) return 'unknown';
  if (dumpHasAny(nodes, cfg.successMarkers)) return 'success';
  if (dumpHasAny(nodes, cfg.verifyMarkers)) return 'verify';
  if (dumpHasAny(nodes, cfg.googleContinue)) return 'google';
  const hasSg = !!dumpHasAny(nodes, cfg.countryMarkers);
  const hasJp = !!dumpHasAny(nodes, ['日本', '+81']);
  const hasEdit = !!firstEditText(nodes);
  const phoneish = !!dumpHasAny(nodes, ['電話番号', '電話', '+81', '日本']);
  if (hasSg && hasJp && hasEdit) return 'countryList'; // danh sach quoc gia (co o tim kiem + nhieu dong)
  if (hasSg && hasJp && !phoneish) return 'countryList';
  if (hasSg && phoneish) return 'phoneReady'; // da o man hinh nhap so, quoc gia = Singapore
  if (hasSg && dumpHasAny(nodes, cfg.agreeMarkers)) return 'phoneReady';
  if (hasSg) return 'countryList';
  if (phoneish && hasEdit) return 'phoneEntry'; // man hinh nhap so, quoc gia CHUA phai Singapore
  if (dumpHasAny(nodes, cfg.startMarkers)) return 'start';
  if (dumpHasAny(nodes, cfg.agreeMarkers)) return 'agree';
  return 'unknown';
}

/** Tim node dau tien chua mot trong cac marker (co bounds hop le). */
function findNodeWithAny(nodes, markers) {
  for (const m of markers) {
    if (!m) continue;
    for (const n of nodes) {
      const hay = ((n.text || '') + '\n' + (n.desc || ''));
      if (hay.indexOf(m) >= 0 && Array.isArray(n.bounds) && n.bounds.length === 4) return n;
    }
  }
  return null;
}

/** Cham vao tam mot node theo bounds cua no. */
async function tapNodeCenter(deviceId, node) {
  if (!node) return false;
  const x = Math.round((node.bounds[0] + node.bounds[2]) / 2);
  const y = Math.round((node.bounds[1] + node.bounds[3]) / 2);
  try {
    const res = await sendCommand(deviceId, 'tap', { x: x, y: y }, 15000);
    return !!(res && res.ok);
  } catch (e) {
    return false;
  }
}

/** Vai chu dau tien thay duoc tren man hinh — lam "snippet" bao loi. */
function dumpSnippet(nodes, max) {
  const texts = [];
  for (const n of (nodes || [])) {
    const t = (n.text || n.desc || '').trim();
    if (t) texts.push(t);
    if (texts.length >= (max || 6)) break;
  }
  return texts.join(' / ');
}

async function lineRegisterSequence(deviceId, hooks) {
  hooks = hooks || {};
  const log = (msg) => {
    addEvent('line_register', deviceId, msg);
    if (hooks.log) hooks.log(msg);
  };
  const cfg = loadFlowConfig().lineRegister;
  const out = { outcome: 'error', note: '' };
  const deadline = Date.now() + 4 * 60 * 1000;
  let actions = 0;
  let countryAttempts = 0;
  let unknownSince = 0;
  let lastNodes = null;

  async function parkWith(note, what) {
    log(what + ' — dừng chờ chạm tay');
    if (!hooks.park) { out.outcome = 'verify'; out.note = note; return 'verify'; }
    const how = await hooks.park(note);
    if (how === 'stopped') { out.outcome = 'stopped'; return 'stopped'; }
    return 'resumed';
  }

  log('Đăng ký LINE: bắt đầu điều hướng màn hình đăng ký (quốc gia Singapore)...');
  while (true) {
    if (seqIsStopped(hooks)) { out.outcome = 'stopped'; return out; }
    if (Date.now() >= deadline) {
      out.note = 'Hết 4 phút điều hướng đăng ký LINE mà chưa xong' +
        (lastNodes ? ' — màn hình cuối: ' + dumpSnippet(lastNodes) : '');
      return out;
    }
    const nodes = await dumpUiNodes(deviceId);
    if (!nodes) {
      if (!await sleepUnlessStopped(1500, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    lastNodes = nodes;
    const cls = classifyLineScreen(nodes, cfg);
    if (cls !== 'unknown') unknownSince = 0;

    if (cls === 'success') {
      out.outcome = 'done';
      log('✅ Đăng ký LINE hoàn tất (đã vào màn hình chính của LINE)');
      return out;
    }
    if (cls === 'verify') {
      const p = await parkWith(LINE_VERIFY_NOTE, 'LINE yêu cầu xác minh');
      if (p !== 'resumed') return out;
      continue;
    }
    if (actions > 14) {
      out.note = 'Đã thực hiện quá nhiều thao tác mà LINE chưa vào màn hình chính — kiểm tra máy / dấu chữ lineRegister trong flow-config.json' +
        ' — màn hình cuối: ' + dumpSnippet(nodes);
      return out;
    }
    if (cls === 'google') {
      const t = await tapFirstMarker(deviceId, cfg.googleContinue);
      if (t) { actions++; log('Đã bấm "' + t + '" (tiếp tục bằng Google), chờ màn hình tiếp...'); }
      if (!await sleepUnlessStopped(2000, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (cls === 'start') {
      const t = await tapFirstMarker(deviceId, cfg.startMarkers);
      if (t) { actions++; log('Đã bấm bắt đầu đăng ký ("' + t + '")'); }
      if (!await sleepUnlessStopped(2000, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (cls === 'countryList') {
      // Danh sach quoc gia dang mo: neu o tim kiem con trong thi go
      // ten Singapore truoc (dung sai — danh sach co san thi cham luon).
      const sgNode = findNodeWithAny(nodes, cfg.countryMarkers.filter((m) => m !== '+65'));
      if (sgNode) {
        if (await tapNodeCenter(deviceId, sgNode)) {
          actions++;
          log('Đã chọn quốc gia Singapore trong danh sách');
        }
      } else {
        const et = firstEditText(nodes);
        if (et && !anyEditTextHasText(nodes)) {
          await tapNodeCenter(deviceId, et);
          await sleepMs(600);
          await inputTextWithRetry(deviceId, cfg.countrySearchText, { log: log });
          actions++;
          log('Đã gõ "' + cfg.countrySearchText + '" vào ô tìm quốc gia');
        }
      }
      if (!await sleepUnlessStopped(1500, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (cls === 'phoneReady') {
      const t = await tapFirstMarker(deviceId, cfg.agreeMarkers);
      if (t) { actions++; log('Quốc gia đã là Singapore — đã bấm "' + t + '", chờ LINE xử lý...'); }
      if (!await sleepUnlessStopped(2500, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (cls === 'phoneEntry') {
      // Man hinh nhap so nhung quoc gia chua phai Singapore: cham
      // vao o quoc gia (node chua 日本/+81) de mo danh sach chon.
      countryAttempts++;
      if (countryAttempts > 2) {
        const p = await parkWith(LINE_COUNTRY_NOTE, 'Không tự chọn được quốc gia Singapore');
        if (p !== 'resumed') return out;
        countryAttempts = 0;
        continue;
      }
      const field = findNodeWithAny(nodes, ['+81', '日本']);
      if (field && await tapNodeCenter(deviceId, field)) {
        actions++;
        log('Đã mở danh sách chọn quốc gia (lần ' + countryAttempts + ')');
      } else {
        const p = await parkWith(LINE_COUNTRY_NOTE, 'Không thấy ô chọn quốc gia trên màn hình nhập số');
        if (p !== 'resumed') return out;
        countryAttempts = 0;
      }
      if (!await sleepUnlessStopped(1500, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    if (cls === 'agree') {
      const t = await tapFirstMarker(deviceId, cfg.agreeMarkers);
      if (t) { actions++; log('Đã bấm "' + t + '"'); }
      if (!await sleepUnlessStopped(2500, hooks)) { out.outcome = 'stopped'; return out; }
      continue;
    }
    // unknown: cho man hinh on dinh; lau qua thi bao loi kem snippet
    if (!unknownSince) unknownSince = Date.now();
    if (Date.now() - unknownSince > 25000) {
      out.note = 'Không nhận diện được màn hình LINE sau 25 giây (kiểm tra máy / dấu chữ lineRegister trong flow-config.json) — màn hình: ' + dumpSnippet(nodes);
      return out;
    }
    if (!await sleepUnlessStopped(1500, hooks)) { out.outcome = 'stopped'; return out; }
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
    saveRuns(); // Giai doan 5: luu ca trang thai Cho cham tay trong trinh tu
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
    // Giai doan 3.2: cap tai khoan XEM HEO tu kho heo (may da co tai
    // khoan duoc cap thi dung lai) roi TU dang nhap TikTok Lite bang
    // tiktokLoginSequence — chi dung Cho cham tay khi TikTok bat xac
    // minh (ma xac nhan / CAPTCHA).
    id: 'dang-nhap-tiktok-lite',
    name: 'Đăng nhập TikTok Lite bằng TK trong kho',
    steps: [
      { type: 'assign_heo', reuseAssigned: true, name: 'Cấp tài khoản heo từ kho cho máy' },
      { type: 'tiktok_login', name: 'Tự đăng nhập TikTok Lite bằng tài khoản vừa cấp' }
    ]
  },
  {
    // Giai doan 5: dang ky LINE bang Google voi quoc gia Singapore —
    // hoc job "Register LINE with Singapore + Google" cua Tokium:
    //   1) claim Gmail (co che ticket/cache 12 gio) cho may;
    //   2) tu dang nhap Google bang Gmail do (trinh tu 3.1 — dung
    //      Cho cham tay khi Google bat xac minh);
    //   3) buoc CHAM TAY: go cac tai khoan Google KHAC khoi may —
    //      Tokium cung yeu cau "Remove existing Google accounts
    //      first"; xoa tai khoan KHONG tu dong hoa duoc nen day la
    //      buoc manual, tuyet doi khong co agent tu xoa;
    //   4) mo LINE (chua cai -> loi app_not_installed ro rang);
    //   5) trinh tu dang ky LINE (lineRegisterSequence): chon Google,
    //      chon quoc gia Singapore, dong y — gap xac minh/SMS thi
    //      dung Cho cham tay; thanh cong thi ghi line-state.json.
    id: 'dang-ky-line',
    name: 'Đăng ký LINE (Singapore + Google)',
    steps: [
      { type: 'assign_gmail', reuseAssigned: true, name: 'Cấp Gmail từ kho cho máy' },
      { type: 'gmail_signin', name: 'Đăng nhập Google bằng Gmail vừa cấp' },
      { type: 'manual', name: 'Gỡ các tài khoản Google KHÁC khỏi máy (Cài đặt → Tài khoản → chọn tài khoản khác → Xoá tài khoản), chỉ giữ Gmail vừa cấp — xoá tài khoản không tự động hoá được' },
      { type: 'command', cmd: 'open_app', args: { 'package': 'jp.naver.line.android' }, name: 'Mở LINE' },
      { type: 'line_register', name: 'Đăng ký LINE bằng Google (quốc gia Singapore)' }
    ]
  },
  {
    // Giai doan 3.2: diem danh 14 ngay — mo TikTok Lite, vao muc diem
    // danh va bam nut diem danh (checkinSequence). Thay chu thanh cong
    // thi ghi ngay hom nay vao checkin-state.json; hom nay da ghi roi
    // thi buoc checkin bao "da diem danh" va xong ngay.
    id: 'diem-danh',
    name: 'Điểm danh 14 ngày',
    genSteps: function (params, cfg) {
      return [
        { type: 'command', cmd: 'open_app', args: { 'package': TIKTOK_PKG }, name: 'Mở TikTok Lite' },
        { type: 'wait', seconds: 3, name: 'Chờ app mở (3 giây)' },
        { type: 'checkin', name: 'Điểm danh hôm nay' }
      ];
    }
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
    if (s.type === 'assign_heo') {
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
      restored: !!dr._restored,
      currentStep: dr.currentStep,
      steps: dr.steps.map((s) => ({
        type: s.type, name: s.name, status: s.status, note: s.note || '', at: s.at || null,
        cmd: s.cmd || null
      }))
    }))
  };
}

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runDevicePipelineInner(run, dr, startAt) {
  const devLabel = dr.deviceId;
  for (let i = (startAt || 0); i < dr.steps.length; i++) {
    if (run.stopped) { dr.status = 'stopped'; return; }
    const step = dr.steps[i];
    if (step.status === 'skipped') continue;
    dr.currentStep = i;
    step.at = nowIso();
    saveRuns(); // Giai doan 5: luu trang thai truoc khi chay buoc
    try {
      if (step.type === 'assign_gmail') {
        step.status = 'running';
        // reuseAssigned (flow cap-gmail-tu-dong): may da co tai khoan
        // duoc cap thi dung lai tai khoan do, khong cap them tai khoan moi.
        // Giai doan 5: chua co assigned thi dung co che CLAIM (ticket
        // + cache 12 gio): may dang giu claim thi nhan lai dung tai
        // khoan do; chua giu thi giu mot tai khoan moi. Claim chuyen
        // thanh assigned khi dang nhap Google xong (buoc gmail_signin
        // / nhanh withSignin ben duoi); flow loi/dung thi claim duoc
        // nha o lop boc runDevicePipeline.
        let acct = step.reuseAssigned ? findAccountForDevice(dr.deviceId) : null;
        if (acct) {
          step.note = 'Dùng Gmail đã cấp cho máy: ' + acct.email;
        } else {
          const res = claimGmail(dr.deviceId);
          if (res.error) {
            step.status = 'error';
            step.note = 'Kho Gmail hết tài khoản sẵn sàng (pool_empty)';
            dr.status = 'error';
            console.log('[pipeline] ' + run.id + ' ' + devLabel + ' assign_gmail: pool_empty');
            return;
          }
          acct = res.account;
          step.note = res.source === 'claim'
            ? 'Dùng lại Gmail đang giữ cho máy (cache 12 giờ): ' + acct.email
            : 'Đã giữ Gmail cho máy (claim 12 giờ): ' + acct.email;
        }
        dr._gmailAccount = acct;
        step.status = 'done';
        // withSignin (pipeline cap-may-moi): chay luon trinh tu dang nhap
        // Google tu dong bang tai khoan vua cap, ngay trong buoc nay.
        if (step.withSignin) {
          step.status = 'running';
          const out = await gmailSigninSequence(dr.deviceId, acct, { park: makePipelinePark(run, dr, step), isStopped: () => !!run.stopped });
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
          convertClaimToAssignment(dr.deviceId); // Giai doan 5: claim -> Da cap
          step.status = 'done';
          step.note = (step.note ? step.note + ' · ' : '') + 'Đã tự đăng nhập Google';
        }
      } else if (step.type === 'gmail_signin') {
        // Trinh tu dang nhap Google tu dong bang tai khoan da cap cho may
        // (buoc assign_gmail truoc do, hoac tai khoan da cap tu truoc).
        step.status = 'running';
        // _gmailAccount (bo nho) -> assigned (pool) -> claim dang giu
        // (pool; truong hop chay lai buoc nay sau khi server khoi
        // dong lai, luc tai khoan moi o trang thai claim).
        const acct = dr._gmailAccount || findAccountForDevice(dr.deviceId) || findClaimForDevice(dr.deviceId);
        if (!acct) {
          step.status = 'error';
          step.note = 'Máy chưa được cấp Gmail — chạy bước cấp Gmail trước';
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' gmail_signin: chua co tai khoan');
          return;
        }
        const out = await gmailSigninSequence(dr.deviceId, acct, { park: makePipelinePark(run, dr, step), isStopped: () => !!run.stopped });
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
        convertClaimToAssignment(dr.deviceId); // Giai doan 5: claim -> Da cap
        step.status = 'done';
        step.note = 'Đã tự đăng nhập Google: ' + acct.email;
      } else if (step.type === 'assign_heo') {
        // Giai doan 3.2: cap tai khoan xem heo tu kho heo — cung mau voi
        // assign_gmail (reuseAssigned: may da co thi dung lai).
        step.status = 'running';
        let hacct = step.reuseAssigned ? findHeoForDevice(dr.deviceId) : null;
        if (hacct) {
          step.note = 'Dùng tài khoản heo đã cấp cho máy: ' + hacct.username;
        } else {
          const res = assignHeo(dr.deviceId);
          if (res.error) {
            step.status = 'error';
            step.note = 'Kho tài khoản heo hết tài khoản sẵn sàng (pool_empty)';
            dr.status = 'error';
            console.log('[pipeline] ' + run.id + ' ' + devLabel + ' assign_heo: pool_empty');
            return;
          }
          hacct = res.account;
          step.note = 'Đã cấp: ' + hacct.username;
        }
        dr._heoAccount = hacct;
        step.status = 'done';
      } else if (step.type === 'tiktok_login') {
        // Giai doan 3.2: tu dang nhap TikTok Lite bang tai khoan heo da
        // cap cho may (buoc assign_heo truoc do, hoac da cap tu truoc).
        step.status = 'running';
        const hacct2 = dr._heoAccount || findHeoForDevice(dr.deviceId);
        if (!hacct2) {
          step.status = 'error';
          step.note = 'Máy chưa được cấp tài khoản heo — chạy bước cấp tài khoản trước';
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' tiktok_login: chua co tai khoan');
          return;
        }
        const out2 = await tiktokLoginSequence(dr.deviceId, hacct2, { park: makePipelinePark(run, dr, step), isStopped: () => !!run.stopped });
        if (out2.outcome === 'stopped') {
          step.status = 'stopped';
          dr.status = 'stopped';
          return;
        }
        if (out2.outcome !== 'done') {
          step.status = 'error';
          step.note = 'Đăng nhập TikTok Lite chưa xong: ' + (out2.note || out2.outcome);
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' tiktok_login: ' + step.note);
          return;
        }
        step.status = 'done';
        step.note = 'Đã đăng nhập TikTok Lite: ' + hacct2.username;
      } else if (step.type === 'checkin') {
        // Giai doan 3.2: diem danh 14 ngay. Hom nay da ghi roi thi xong
        // ngay, khong can mo app lai.
        step.status = 'running';
        const today = todayTokyo();
        const stc = getCheckinState(dr.deviceId);
        if (stc.dates.indexOf(today) >= 0) {
          step.status = 'done';
          step.note = 'Hôm nay đã điểm danh rồi — ngày ' + stc.dates.length + '/14';
        } else {
          const out3 = await checkinSequence(dr.deviceId, {});
          if (out3.outcome === 'success') {
            const rec = recordCheckin(dr.deviceId);
            step.status = 'done';
            step.note = 'Đã điểm danh ngày ' + rec.count + '/14' + (rec.complete ? ' — 🎉 ĐỦ 14 NGÀY!' : '');
            addEvent('checkin_success', dr.deviceId,
              '📅 Điểm danh 14 ngày: đã điểm danh ngày ' + rec.count + '/14' + (out3.already ? ' (màn hình đã báo điểm danh sẵn)' : ''));
          } else {
            step.status = 'error';
            step.note = 'Điểm danh chưa xong: ' + (out3.note || out3.outcome);
            dr.status = 'error';
            console.log('[pipeline] ' + run.id + ' ' + devLabel + ' checkin: ' + step.note);
            return;
          }
        }
      } else if (step.type === 'line_register') {
        // Giai doan 5: trinh tu dang ky LINE (Singapore + Google) —
        // LINE da duoc mo o buoc command truoc do; gap xac minh/SMS
        // thi dung Cho cham tay qua makePipelinePark nhu cac trinh tu
        // dang nhap. Thanh cong -> ghi line-state.json (badge LINE ✔).
        step.status = 'running';
        const outL = await lineRegisterSequence(dr.deviceId, { park: makePipelinePark(run, dr, step), isStopped: () => !!run.stopped });
        if (outL.outcome === 'stopped') {
          step.status = 'stopped';
          dr.status = 'stopped';
          return;
        }
        if (outL.outcome !== 'done') {
          step.status = 'error';
          step.note = 'Đăng ký LINE chưa xong: ' + (outL.note || outL.outcome);
          dr.status = 'error';
          console.log('[pipeline] ' + run.id + ' ' + devLabel + ' line_register: ' + step.note);
          return;
        }
        const gmailAcct = dr._gmailAccount || findAccountForDevice(dr.deviceId) || findClaimForDevice(dr.deviceId);
        recordLineDone(dr.deviceId, gmailAcct ? gmailAcct.email : null);
        addEvent('line_register', dr.deviceId, '💚 Đã đăng ký LINE xong (Singapore + Google)');
        step.status = 'done';
        step.note = 'Đã đăng ký LINE (Singapore + Google)';
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
        saveRuns(); // Giai doan 5: luu ca trang thai Cho cham tay
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

/**
 * Lop boc chay pipeline (Giai doan 5): chay runDevicePipelineInner
 * roi, du ket cuc the nao, cung (a) nha claim Gmail neu flow ket
 * thuc loi/dung (claim cua flow xong tot da chuyen assigned o buoc
 * dang nhap nen khong con gi de nha) va (b) luu runs xuong dia.
 * startAt > 0 dung khi chay tiep run duoc khoi phuc sau khoi dong lai.
 */
async function runDevicePipeline(run, dr, startAt) {
  try {
    await runDevicePipelineInner(run, dr, startAt || 0);
  } finally {
    if (dr.status === 'error' || dr.status === 'stopped') {
      releaseGmailClaim(dr.deviceId, 'pipeline ' + run.pipelineId + ' ket thuc ' + dr.status);
    }
    saveRuns();
  }
}

// ================= Luu/khoi phuc pipeline runs (Giai doan 5) =================
// Runs duoc ghi xuong data/pipeline-runs.json sau moi lan chuyen
// trang thai (bat dau run, vao moi buoc, dung Cho cham tay, ket
// thuc). Server khoi dong lai -> restoreRuns() nap lai:
//   - may dang 'waiting_manual' -> giu nguyen waiting_manual va
//     danh dau _restored: bam "Chay tiep" (POST /api/pipeline/resume)
//     se coi buoc cham tay da xu ly xong va chay tiep tu buoc sau
//     (khong the chay lai giua chung mot trinh tu dang dung);
//   - may dang 'running' (server chet giua buoc) -> 'interrupted':
//     bam "Chay tiep" se chay lai tu buoc dang do (buoc do duoc
//     phat lai tu dau — cac buoc cua engine deu chiu duoc viec phat
//     lai: cap/dang nhap co co che dung lai tai khoan + thu lai).
// Giu toi da RUNS_KEEP run gan nhat trong file.
const RUNS_KEEP = 20;
let restoredRunCount = 0;

function saveRuns() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = Array.from(runs.values())
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, RUNS_KEEP)
      .map((run) => ({
        id: run.id,
        pipelineId: run.pipelineId,
        pipelineName: run.pipelineName,
        startedAt: run.startedAt,
        stopped: !!run.stopped,
        updatedAt: nowIso(),
        devices: Array.from(run.devices.values()).map((dr) => ({
          deviceId: dr.deviceId,
          status: dr.status,
          currentStep: dr.currentStep,
          steps: dr.steps
        }))
      }));
    fs.writeFileSync(RUNS_FILE, JSON.stringify({ runs: list }, null, 2), 'utf8');
  } catch (e) {
    console.error('[runs] khong ghi duoc pipeline-runs.json:', e.message);
  }
}

function restoreRuns() {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8')); } catch (e) { return; }
  if (!data || !Array.isArray(data.runs)) return;
  for (const pr of data.runs) {
    if (!pr || !pr.id || runs.has(pr.id)) continue;
    const run = {
      id: pr.id,
      pipelineId: pr.pipelineId,
      pipelineName: pr.pipelineName,
      startedAt: pr.startedAt,
      stopped: !!pr.stopped,
      devices: new Map()
    };
    let needsAttention = false;
    for (const pd of (pr.devices || [])) {
      const dr = {
        deviceId: pd.deviceId,
        status: pd.status,
        currentStep: pd.currentStep || 0,
        steps: Array.isArray(pd.steps) ? pd.steps : [],
        _resumeResolve: null,
        _restored: false
      };
      if (dr.status === 'running') {
        dr.status = 'interrupted';
        dr._restored = true;
        needsAttention = true;
      } else if (dr.status === 'waiting_manual') {
        dr._restored = true;
        needsAttention = true;
      }
      run.devices.set(pd.deviceId, dr);
    }
    runs.set(run.id, run);
    const m = /^run-(\d+)-/.exec(run.id);
    if (m) runCounter = Math.max(runCounter, parseInt(m[1], 10));
    if (needsAttention) restoredRunCount++;
  }
  if (restoredRunCount > 0) {
    console.log('[runs] da khoi phuc ' + restoredRunCount + ' run can chay tiep sau khi khoi dong lai');
  }
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
  saveRuns(); // Giai doan 5: luu ngay tu luc bat dau
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
    detect: w.detect !== false,
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
  try {
    await watchLoopInner(w);
  } finally {
    saveWatchState(); // Giai doan 5: luu trang thai vong xem khi vong ket thuc
  }
}

async function watchLoopInner(w) {
  let errStreak = 0;
  while (!w.stopRequested) {
    if (Date.now() > w.endsAtMs) {
      w.status = 'stopped';
      w.note = 'Hết ' + w.minutes + ' phút — tự dừng';
      addEvent('watch_stop', w.deviceId, 'Vòng xem game tự dừng: hết ' + w.minutes + ' phút');
      return;
    }
    // 1) Quet man hinh hien tai tim chu bao check-in thanh cong
    // (chi khi w.detect — vong "Check heo"; vong xem video thuong bo qua)
    if (w.detect === false) {
      // Xem video thuong: khong quet thanh cong, chi vuot + nghi ben duoi
    } else try {
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
    detect: opts.detect !== false,
    rounds: 0,
    matchedMarker: null,
    lastError: null,
    note: '',
    stopRequested: false
  };
  watches.set(deviceId, w);
  saveWatchState(); // Giai doan 5
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
      saveWatchState();
      return { watch: w };
    }
  } catch (e) {
    w.status = 'error';
    w.note = 'Không mở được app/link: ' + (e && e.message || e);
    addEvent('watch_error', deviceId, w.note);
    saveWatchState();
    return { watch: w };
  }
  w.status = 'watching';
  saveWatchState();
  addEvent('watch_start', deviceId, 'Bắt đầu vòng quét game & xem video (' + minutes + ' phút)' + (w.gameUrl ? ' — link game: ' + w.gameUrl : ''));
  watchLoop(w).catch((e) => {
    w.status = 'error';
    w.note = 'Lỗi vòng xem: ' + (e && e.message || e);
    addEvent('watch_error', deviceId, w.note);
    saveWatchState();
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
  saveWatchState();
  return { watch: w };
}

// ================= Luu/khoi phuc vong xem (Giai doan 5) =================
// Vong xem duoc ghi xuong data/watch-state.json moi khi bat/dung/
// ket thuc. Server khoi dong lai: vong dang chay do duoc nap lai
// voi trang thai 'interrupted' va KHONG tu chay lai — nguoi dung
// tu bam "Bat dau xem" khi can (tranh may tu xem ngoai y muon sau
// mot lan server sap).
let restoredWatchCount = 0;

function saveWatchState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = Array.from(watches.values()).map((w) => ({
      deviceId: w.deviceId,
      label: w.label || '',
      status: w.status,
      startedAt: w.startedAt || null,
      endsAt: w.endsAt || null,
      minutes: w.minutes || 30,
      gameUrl: w.gameUrl || '',
      detect: w.detect !== false,
      rounds: w.rounds || 0,
      matchedMarker: w.matchedMarker || null,
      lastError: w.lastError || null,
      note: w.note || ''
    }));
    fs.writeFileSync(WATCH_FILE, JSON.stringify({ watches: list }, null, 2), 'utf8');
  } catch (e) {
    console.error('[watch] khong ghi duoc watch-state.json:', e.message);
  }
}

function restoreWatchState() {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(WATCH_FILE, 'utf8')); } catch (e) { return; }
  if (!data || !Array.isArray(data.watches)) return;
  for (const pw of data.watches) {
    if (!pw || !pw.deviceId || watches.has(pw.deviceId)) continue;
    const w = {
      deviceId: pw.deviceId,
      label: pw.label || pw.deviceId,
      status: pw.status || 'stopped',
      startedAt: pw.startedAt || null,
      endsAt: pw.endsAt || null,
      endsAtMs: Date.parse(pw.endsAt || '') || Date.now(),
      minutes: pw.minutes || 30,
      gameUrl: pw.gameUrl || '',
      detect: pw.detect !== false,
      rounds: pw.rounds || 0,
      matchedMarker: pw.matchedMarker || null,
      lastError: pw.lastError || null,
      note: pw.note || '',
      stopRequested: true
    };
    if (w.status === 'watching' || w.status === 'starting') {
      w.status = 'interrupted';
      w.note = 'Server khởi động lại — vòng xem KHÔNG tự chạy lại; bấm Bắt đầu xem để chạy tiếp';
      restoredWatchCount++;
    }
    watches.set(pw.deviceId, w);
  }
  if (restoredWatchCount > 0) {
    console.log('[watch] da khoi phuc ' + restoredWatchCount + ' vong xem dang do (interrupted)');
  }
}

// ================= Xoa may / Reset may (Giai doan 3.3) =================
/** Tra tai khoan Gmail + TK heo da cap cho may ve kho (status 'ready'). */
function releaseDeviceAccounts(deviceId) {
  const released = { gmail: null, heo: null };
  const ga = pool.accounts.find((a) => a.status === 'assigned' && a.deviceId === deviceId);
  if (ga) {
    released.gmail = ga.email;
    ga.status = 'ready';
    ga.deviceId = null;
    ga.assignedAt = null;
    savePool();
  }
  // Giai doan 5: may bi xoa ma dang giu claim Gmail -> nha claim luon
  const claimedEmail = releaseGmailClaim(deviceId, 'xoa may');
  if (claimedEmail && !released.gmail) released.gmail = claimedEmail;
  const ha = heoPool.accounts.find((a) => a.status === 'assigned' && a.deviceId === deviceId);
  if (ha) {
    released.heo = ha.username;
    ha.status = 'ready';
    ha.deviceId = null;
    ha.assignedAt = null;
    ha.loggedInAt = null;
    saveHeoPool();
  }
  return released;
}

/**
 * Xoa ho so may khoi danh sach server: tra tai khoan da cap ve kho, xoa
 * trang thai diem danh + vong xem, dong ket noi agent, ghi su kien
 * 'device_delete'. May ket noi lai sau nay hien lai nhu may moi.
 * Tra {ok, released} hoac {error:'device_not_found'}.
 */
function deleteDevice(deviceId) {
  const dev = devices.get(deviceId);
  if (!dev) return { error: 'device_not_found' };
  const released = releaseDeviceAccounts(deviceId);
  if (checkinState[deviceId]) {
    delete checkinState[deviceId];
    saveCheckinState();
  }
  const w = watches.get(deviceId);
  if (w) {
    w.stopRequested = true;
    watches.delete(deviceId);
  }
  // Ghi su kien TRUOC khi xoa khoi Map de nhan may (label) van con.
  const parts = [];
  if (released.gmail) parts.push('Gmail ' + released.gmail + ' đã trả về kho');
  if (released.heo) parts.push('TK heo ' + released.heo + ' đã trả về kho');
  addEvent('device_delete', deviceId,
    'Đã xoá máy khỏi danh sách' + (parts.length ? ' — ' + parts.join('; ') : ''));
  for (const [cid, p] of dev.pending) {
    clearTimeout(p.timer);
    p.reject(new Error('device_deleted'));
    dev.pending.delete(cid);
  }
  if (dev.socket) {
    try { dev.socket.destroy(); } catch (e) {}
    dev.socket = null;
  }
  devices.delete(deviceId);
  console.log('[device] da xoa may ' + deviceId);
  return { ok: true, released: released };
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

// ================= Phan chieu man hinh + phat thao tac dong loat (Giai doan 3.4) =================
// Trang /mirror hien man hinh tung may (quay vong lenh screenshot)
// va cho thao tac tung may hoac DONG LOAT nhieu may (mo hinh dieu
// khien nhom): moi thao tac tren trang deu di qua toa do TUONG DOI
// (0..1), server doi sang toa do TUYET DOI theo kich thuoc man hinh
// cua TUNG may roi gui song song.
//
// Kich thuoc man hinh cua may lay theo thu tu: (1) so da nho trong
// ho so may (hello/status co bao width/height, hoac da hoc tuoc
// truoc do); (2) hoi lenh 'status' — data.width/height neu agent
// co bao; (3) suy tu dump_ui: bounds lon nhat cua cac node trong
// cay accessibility (bounds la toa do man hinh that, node goc
// thuong trai khap man hinh); (4) mac dinh 1080x2400 nhu cac flow
// truoc van dung. Ket qua hoc duoc se nho lai trong ho so may.
async function ensureScreenSize(deviceId) {
  const dev = devices.get(deviceId);
  if (dev && dev.screenW > 0 && dev.screenH > 0) {
    return { width: dev.screenW, height: dev.screenH, source: 'cache' };
  }
  try {
    const st = await sendCommand(deviceId, 'status', {}, 8000);
    if (st && st.ok && st.data && st.data.width && st.data.height) {
      if (dev) { dev.screenW = st.data.width; dev.screenH = st.data.height; }
      return { width: st.data.width, height: st.data.height, source: 'status' };
    }
  } catch (e) { /* thu cach khac */ }
  try {
    const du = await sendCommand(deviceId, 'dump_ui', {}, 10000);
    const nodes = (du && du.ok && du.data && Array.isArray(du.data.nodes)) ? du.data.nodes : [];
    let mw = 0, mh = 0;
    for (const n of nodes) {
      if (Array.isArray(n.bounds) && n.bounds.length === 4) {
        if (n.bounds[2] > mw) mw = n.bounds[2];
        if (n.bounds[3] > mh) mh = n.bounds[3];
      }
    }
    if (mw >= 320 && mh >= 320) {
      if (dev) { dev.screenW = mw; dev.screenH = mh; }
      return { width: mw, height: mh, source: 'dump_ui' };
    }
  } catch (e) { /* dung mac dinh */ }
  return { width: 1080, height: 2400, source: 'default' };
}

function clamp01(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Gui MOT thao tac (theo toa do tuong doi) toi mot may, doi sang
 * toa do tuyet doi cua may do. Tra { deviceId, ok, error? , x?, y? }.
 * Loi cua tung may (khong thay may, offline, agent bao loi) chi
 * nam trong ket qua cua may do — khong lam hong cac may khac.
 */
async function broadcastOne(deviceId, j) {
  const dev = devices.get(deviceId);
  if (!dev) return { deviceId: deviceId, ok: false, error: 'device_not_found' };
  try {
    let result;
    if (j.action === 'tap') {
      const sz = await ensureScreenSize(deviceId);
      const x = Math.round(clamp01(j.rel && j.rel.x) * sz.width);
      const y = Math.round(clamp01(j.rel && j.rel.y) * sz.height);
      result = await sendCommand(deviceId, 'tap', { x: x, y: y }, 15000);
      if (result && result.ok) return { deviceId: deviceId, ok: true, x: x, y: y };
      return { deviceId: deviceId, ok: false, error: (result && result.error) || 'unknown', x: x, y: y };
    }
    if (j.action === 'swipe') {
      const sz = await ensureScreenSize(deviceId);
      const rel = j.rel || {};
      const args = {
        x1: Math.round(clamp01(rel.x1) * sz.width),
        y1: Math.round(clamp01(rel.y1) * sz.height),
        x2: Math.round(clamp01(rel.x2) * sz.width),
        y2: Math.round(clamp01(rel.y2) * sz.height),
        durationMs: (typeof j.durationMs === 'number' && j.durationMs > 0) ? Math.min(j.durationMs, 5000) : 300
      };
      result = await sendCommand(deviceId, 'swipe', args, 15000);
      if (result && result.ok) return Object.assign({ deviceId: deviceId, ok: true }, args);
      return { deviceId: deviceId, ok: false, error: (result && result.error) || 'unknown' };
    }
    if (j.action === 'key') {
      result = await sendCommand(deviceId, 'key', { key: String(j.key || '') }, 15000);
    } else if (j.action === 'input_text') {
      result = await sendCommand(deviceId, 'input_text', { text: String(j.text || '') }, 15000);
    } else if (j.action === 'open_app') {
      result = await sendCommand(deviceId, 'open_app', { 'package': String(j.package || '') }, 15000);
    } else {
      return { deviceId: deviceId, ok: false, error: 'bad_action' };
    }
    if (result && result.ok) return { deviceId: deviceId, ok: true };
    return { deviceId: deviceId, ok: false, error: (result && result.error) || 'unknown' };
  } catch (e) {
    return { deviceId: deviceId, ok: false, error: e.message || 'send_failed' };
  }
}

// ================= Khoi phuc sau khi server khoi dong lai (Giai doan 5) ====
restoreRuns();
restoreWatchState();
if (restoredRunCount > 0 || restoredWatchCount > 0) {
  addEvent('server_restore', null,
    'Đã khôi phục ' + restoredRunCount + ' tác vụ' +
    (restoredWatchCount > 0 ? ' và ' + restoredWatchCount + ' vòng xem' : '') +
    ' sau khi server khởi động lại — mở tab ⚙ Tác vụ để chạy tiếp các tác vụ đang dở');
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
    // Trang phan chieu & dieu khien dan may (Giai doan 3.4)
    if (req.method === 'GET' && u.pathname === '/mirror') {
      const html = fs.readFileSync(path.join(__dirname, 'mirror.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/info') {
      jsonRes(res, 200, {
        ok: true, tcpPort: TCP_PORT, httpPort: HTTP_PORT,
        lanIp: lanIp(req), serverTime: nowIso(), agentVersionExpected: '3.0',
        restoredRuns: restoredRunCount, restoredWatches: restoredWatchCount
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

    // ---- Phat thao tac dong loat (Giai doan 3.4) ----
    // { deviceIds:[...], action:'tap'|'swipe'|'key'|'input_text'|'open_app',
    //   rel:{x,y} hoac {x1,y1,x2,y2} (0..1), key, text, package, durationMs }
    // Server doi toa do tuong doi -> tuyet doi theo man hinh tung may,
    // gui SONG SONG, tra ket qua tung may (may loi khong keo cac may khac).
    if (req.method === 'POST' && u.pathname === '/api/broadcast') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!Array.isArray(j.deviceIds) || j.deviceIds.length === 0) {
        jsonRes(res, 400, { ok: false, error: 'no_devices' });
        return;
      }
      if (['tap', 'swipe', 'key', 'input_text', 'open_app'].indexOf(j.action) < 0) {
        jsonRes(res, 400, { ok: false, error: 'bad_action' });
        return;
      }
      const ids = Array.from(new Set(j.deviceIds.map(String)));
      const results = await Promise.all(ids.map((id) => broadcastOne(id, j)));
      jsonRes(res, 200, { ok: results.some((r) => r.ok), results: results });
      return;
    }

    // ---- Xoa may / Reset may (Giai doan 3.3) ----
    if (req.method === 'POST' && u.pathname === '/api/devices/delete') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      const r = deleteDevice(j.deviceId);
      if (r.error) { jsonRes(res, 404, { ok: false, error: r.error }); return; }
      jsonRes(res, 200, { ok: true, released: r.released });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/devices/reset') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      if (!devices.get(j.deviceId)) { jsonRes(res, 404, { ok: false, error: 'device_not_found' }); return; }
      let result;
      try {
        result = await sendCommand(j.deviceId, 'factory_reset', {});
      } catch (e) {
        // device_offline / cmd_timeout / send_failed...
        jsonRes(res, 200, { ok: false, error: e.message });
        return;
      }
      if (result && result.ok) {
        addEvent('reset', j.deviceId,
          'Đã gửi lệnh reset nhà máy — máy sẽ xoá sạch và khởi động lại; quét QR ở màn hình cài đặt để cài lại agent');
        jsonRes(res, 200, { ok: true, wiping: !!(result.data && result.data.wiping) });
      } else {
        const err = (result && result.error) || 'unknown';
        jsonRes(res, 200, {
          ok: false,
          error: err,
          message: err === 'not_device_owner'
            ? 'Máy chưa phải Device Owner — cần cấp quyền chủ máy bằng QR trước khi reset từ xa'
            : err
        });
      }
      return;
    }

    // ---- Gmail pool ----
    if (req.method === 'GET' && u.pathname === '/api/gmail') {
      sweepExpiredClaims();
      jsonRes(res, 200, {
        ok: true,
        accounts: pool.accounts.map(publicAccount),
        // 'ready' = so tai khoan RUT DUOC ngay (ready va khong bi
        // may khac giu claim) — khop voi dieu kien pool_empty cua flow.
        ready: pool.accounts.filter((a) => a.status === 'ready' && !isClaimLive(a)).length
      });
      return;
    }
    // Giai doan 5: danh sach claim Gmail dang song (ticket + may giu
    // + han) — ticket khong phai mat khau, chi la ma giu cho.
    if (req.method === 'GET' && u.pathname === '/api/gmail/claims') {
      sweepExpiredClaims();
      const claims = pool.accounts.filter(isClaimLive).map((a) => ({
        accountId: a.id,
        email: a.email,
        deviceId: a.claimedByDeviceId,
        ticket: a.claimTicket,
        claimedAt: a.claimedAt || null,
        expiresAt: a.claimExpiresAt || null
      }));
      jsonRes(res, 200, { ok: true, claims: claims });
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
        clearClaimFields(pool.accounts[idx]); // Giai doan 5: die thi nha claim
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
      // Giai doan 5: dung co che CLAIM nhu pipeline — may da co
      // assigned thi dung lai; chua co thi giu claim 12 gio, dang
      // nhap xong chuyen thanh assigned; loi thi nha claim; gap xac
      // minh (outcome 'verify', endpoint khong dung cho duoc) thi
      // claim VAN GIU de lan chay tiep dung dung tai khoan do.
      let acct = findAccountForDevice(j.deviceId);
      if (!acct) {
        const r = claimGmail(j.deviceId);
        if (r.error) { jsonRes(res, 200, { ok: false, error: r.error }); return; }
        acct = r.account;
      }
      const out = await gmailSigninSequence(j.deviceId, acct, {});
      if (out.outcome === 'done') convertClaimToAssignment(j.deviceId);
      else if (out.outcome === 'error' || out.outcome === 'stopped') {
        releaseGmailClaim(j.deviceId, 'signin-assist ' + out.outcome);
      }
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

    // ---- Kho tai khoan xem heo (Giai doan 3.2) ----
    if (req.method === 'GET' && u.pathname === '/api/heo') {
      jsonRes(res, 200, {
        ok: true,
        accounts: heoPool.accounts.map(publicHeoAccount),
        ready: heoPool.accounts.filter((a) => a.status === 'ready').length
      });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/heo/import') {
      const body = await readBody(req);
      let text = body;
      try {
        const j = JSON.parse(body);
        if (j && typeof j.text === 'string') text = j.text;
      } catch (e) { /* body la text tho */ }
      const r = importHeoAccounts(text);
      jsonRes(res, 200, { ok: true, added: r.added, skipped: r.skipped, total: r.total });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/heo/assign-next') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      const r = assignHeo(j.deviceId);
      if (r.error) { jsonRes(res, 200, { ok: false, error: r.error }); return; }
      jsonRes(res, 200, { ok: true, account: publicHeoAccount(r.account) });
      return;
    }
    if (req.method === 'POST' && (u.pathname === '/api/heo/mark-die' || u.pathname === '/api/heo/delete')) {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const idx = heoPool.accounts.findIndex((a) =>
        (j.id && a.id === j.id) || (j.username && a.username.toLowerCase() === String(j.username).toLowerCase()));
      if (idx < 0) { jsonRes(res, 200, { ok: false, error: 'account_not_found' }); return; }
      if (u.pathname === '/api/heo/mark-die') {
        heoPool.accounts[idx].status = 'die';
        saveHeoPool();
        jsonRes(res, 200, { ok: true, account: publicHeoAccount(heoPool.accounts[idx]) });
      } else {
        const removed = heoPool.accounts.splice(idx, 1)[0];
        saveHeoPool();
        jsonRes(res, 200, { ok: true, removed: publicHeoAccount(removed) });
      }
      return;
    }

    // ---- Diem danh 14 ngay (Giai doan 3.2) ----
    if (req.method === 'GET' && u.pathname === '/api/checkin') {
      const list = Object.keys(checkinState).map((deviceId) => {
        const pc = publicCheckin(deviceId);
        const dev = devices.get(deviceId);
        return {
          deviceId: deviceId,
          label: dev ? (dev.label || deviceId) : deviceId,
          count: pc.count,
          dates: pc.dates,
          todayDone: pc.todayDone,
          complete: pc.complete,
          cycleStart: pc.cycleStart
        };
      });
      list.sort((a, b) => (a.label || a.deviceId).localeCompare(b.label || b.deviceId));
      jsonRes(res, 200, { ok: true, today: todayTokyo(), devices: list });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/checkin/reset') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      if (!j.deviceId) { jsonRes(res, 400, { ok: false, error: 'missing_deviceId' }); return; }
      checkinState[j.deviceId] = { dates: [], cycleStart: todayTokyo() };
      saveCheckinState();
      addEvent('checkin_day', j.deviceId, 'Đã bắt đầu chu kỳ điểm danh 14 ngày mới');
      jsonRes(res, 200, { ok: true, checkin: publicCheckin(j.deviceId) });
      return;
    }

    // ---- Link game chuyen dung (Giai doan 3.2) ----
    if (req.method === 'GET' && u.pathname === '/api/game-link') {
      jsonRes(res, 200, { ok: true, url: gameLink.url, updatedAt: gameLink.updatedAt });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/game-link') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      gameLink = { url: String(j.url || '').trim(), updatedAt: nowIso() };
      saveGameLink();
      jsonRes(res, 200, { ok: true, url: gameLink.url, updatedAt: gameLink.updatedAt });
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
      jsonRes(res, 200, { ok: true, runs: list, restored: restoredRunCount });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/pipeline/resume') {
      let j;
      try { j = await readJsonBody(req); } catch (e) { jsonRes(res, 400, { ok: false, error: 'bad_json' }); return; }
      const run = runs.get(j.runId);
      if (!run) { jsonRes(res, 200, { ok: false, error: 'run_not_found' }); return; }
      const dr = run.devices.get(j.deviceId);
      if (!dr) { jsonRes(res, 200, { ok: false, error: 'not_waiting_manual' }); return; }
      // Duong 1 (nhu cu): run dang song, may dang dung Cho cham tay
      // that su (co promise dang cho) -> danh thuc promise do.
      if (dr._resumeResolve) {
        const resolve = dr._resumeResolve;
        dr._resumeResolve = null;
        resolve('resumed');
        jsonRes(res, 200, { ok: true });
        return;
      }
      // Duong 2 (Giai doan 5): run duoc KHOI PHUC sau khi server
      // khoi dong lai, khong con promise nao dang cho:
      //  - waiting_manual: coi buoc cham tay da xu ly xong, danh dau
      //    buoc do 'done' va chay tiep tu buoc sau;
      //  - interrupted (server chet giua buoc): chay lai tu buoc
      //    dang do (buoc duoc phat lai tu dau).
      if (dr._restored && dr.status === 'waiting_manual') {
        const idx = dr.currentStep;
        if (dr.steps[idx]) {
          dr.steps[idx].status = 'done';
          dr.steps[idx].note = 'Đã xử lý tay (run khôi phục sau khi server khởi động lại)';
        }
        // Nguoi dung bao "da xu ly" = buoc dang nhap/xac minh da xong
        // bang tay -> claim Gmail (neu con) chuyen thanh Da cap.
        convertClaimToAssignment(dr.deviceId);
        dr.status = 'running';
        dr._restored = false;
        saveRuns();
        runDevicePipeline(run, dr, idx + 1).catch((e) => console.error('[pipeline] loi chay tiep run khoi phuc:', e));
        jsonRes(res, 200, { ok: true, restored: true });
        return;
      }
      if (dr._restored && dr.status === 'interrupted') {
        dr.status = 'running';
        dr._restored = false;
        saveRuns();
        runDevicePipeline(run, dr, dr.currentStep).catch((e) => console.error('[pipeline] loi chay tiep run khoi phuc:', e));
        jsonRes(res, 200, { ok: true, restored: true });
        return;
      }
      jsonRes(res, 200, { ok: false, error: 'not_waiting_manual' });
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
        if (dr.status === 'running' || dr.status === 'waiting_manual' || dr.status === 'interrupted') {
          dr.status = 'stopped';
          dr._restored = false;
          // Run khoi phuc khong co promise nao chay nen lop boc
          // khong chay — nha claim ngay tai day cho chac.
          releaseGmailClaim(dr.deviceId, 'pipeline bi dung (run khoi phuc)');
        }
      }
      saveRuns();
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
        const r = await startWatch(deviceId, { minutes: j.minutes, gameUrl: j.gameUrl || '', detect: j.detect });
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

    // ---- Ghep noi bang QR (Giai doan 5) ----
    // POST /api/pairing/new: tao phien ghep noi moi (ma song 300s).
    // GET  /api/pairing: phien moi nhat con han (payload + anh SVG)
    // de dashboard ve ma QR; chua co phien nao con han -> active:false.
    if (req.method === 'POST' && u.pathname === '/api/pairing/new') {
      const s = createPairingSession();
      jsonRes(res, 200, publicPairing(s, req));
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/pairing') {
      const t = Date.now();
      let latest = null;
      for (const s of pairingSessions.values()) {
        if (t <= Date.parse(s.expiresAt)) latest = s;
      }
      if (!latest) { jsonRes(res, 200, { ok: true, active: false }); return; }
      const out = publicPairing(latest, req);
      out.active = true;
      jsonRes(res, 200, out);
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
