// verify-stage34.js — Kiem chung vong kin Giai doan 3.4 (chi
// server; agent van v3.1): TRANG PHAN CHIEU & DIEU KHIEN DAN MAY.
//  1. GET /mirror -> 200, co 2 tab (Dan may mac dinh + Tac vu),
//     khung dieu khien (nut Back/Home/Recents/Wake, o Gui chu, Mo
//     TikTok Lite, cong tac "Ap dung dong loat"), cac nut tac vu
//     TikTok Lite (Diem danh, Xem video, Check heo + o link game,
//     Dang nhap TikTok Lite, Mo TikTok Lite), khoi "Ket noi may
//     moi" (QR + /apks/agent.apk + 2 danh sach buoc). Dashboard
//     chinh co link sang /mirror.
//  2. Duong screenshot cua trang phan chieu: POST /api/cmd
//     {cmd:'screenshot'} van tra JPEG base64 hop le.
//  3. POST /api/broadcast: HAI may ao bao kich thuoc man hinh
//     KHAC NHAU qua FAKE_SCREEN (A: 1080x2400, B: 720x1600) —
//     cham tuong doi (0.5, 0.5) phai doi thanh toa do tuyet doi
//     cua TUNG may (A: 540,1200; B: 360,800), xac nhan ca qua
//     response lan qua status.lastTap cua fake; vuot tuong doi
//     tuong tu qua lastSwipe; key back + open_app + input_text
//     toi ca 2 may (cmdLog); id khong ton tai -> loi rieng tung
//     may, khong keo cac may khac; may offline -> device_offline;
//     action sai / thieu deviceIds -> HTTP 400.
// Chay: node verify-stage34.js  (tu khoi dong server tam tren cong
// 25887/25180 + 2 fake agent; don dep pool/state test sau khi chay,
// giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 25887;
const HTTP_PORT = 25180;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const ID_A = 'fake-A';
const ID_B = 'fake-B';
const TIKTOK_PKG = 'com.zhiliaoapp.musically.go';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, {
      method: method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(s); } catch (e) { /* giu null */ }
        resolve({ status: res.statusCode, text: s, json: j });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  throw new Error('timeout cho: ' + label);
}

function startFake(env) {
  const child = spawn('node', [path.join(SERVER_DIR, 'fake-agent.js'), '127.0.0.1', String(TCP_PORT)], {
    env: Object.assign({}, process.env, env || {}),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write('[fake] ' + d));
  return child;
}

async function getDevice(id) {
  const r = await req('GET', '/api/devices');
  return ((r.json && r.json.devices) || []).find((x) => x.id === id) || null;
}
async function waitOnline(id) {
  return waitFor(async () => {
    const d = await getDevice(id);
    return d && d.online ? d : false;
  }, 10000, 'may ' + id + ' online');
}
async function getStatusData(id) {
  const r = await req('POST', '/api/cmd', { deviceId: id, cmd: 'status' });
  return (r.json && r.json.data) || {};
}

function cleanData() {
  for (const f of ['gmail-pool.json', 'heo-pool.json', 'checkin-state.json']) {
    try { fs.unlinkSync(path.join(SERVER_DIR, 'data', f)); } catch (e) {}
  }
}

async function main() {
  cleanData();
  console.log('== Khoi dong server tam (TCP ' + TCP_PORT + ', HTTP ' + HTTP_PORT + ') ==');
  const server = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env: Object.assign({}, process.env, {
      FARM_TCP_PORT: String(TCP_PORT),
      FARM_HTTP_PORT: String(HTTP_PORT),
      SERVER_LAN_IP: '192.168.1.50'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  let fakeA = null, fakeB = null;
  try {
    await waitFor(async () => {
      try { const r = await req('GET', '/api/info'); return r.json && r.json.ok ? r.json : false; } catch (e) { return false; }
    }, 10000, 'server len');
    check('server khoi dong, /api/info ok', true);

    // ---------- 1. Trang /mirror + link tu dashboard ----------
    console.log('== GET /mirror + dashboard ==');
    let r = await req('GET', '/mirror');
    const mh = r.text || '';
    check('GET /mirror -> 200 + HTML', r.status === 200 && mh.indexOf('<html') >= 0, 'status=' + r.status);
    check("mirror co tieu de 'Phản chiếu'", mh.indexOf('Phản chiếu') >= 0);
    check('mirror co 2 tab: Dan may (mac dinh) + Tac vu',
      mh.indexOf('data-tab="danmay"') >= 0 && mh.indexOf('data-tab="tacvu"') >= 0 &&
      mh.indexOf('panelpage active') >= 0 && mh.indexOf('id="panel-danmay"') >= 0);
    check('mirror co luoi man hinh + chon may (mirrorGrid/selAll/selNone)',
      mh.indexOf('id="mirrorGrid"') >= 0 && mh.indexOf('id="selAll"') >= 0 && mh.indexOf('id="selNone"') >= 0);
    check('mirror co khung dieu khien: Back/Home/Recents/Wake + Gui chu + Mo TikTok Lite',
      mh.indexOf('data-key="back"') >= 0 && mh.indexOf('data-key="home"') >= 0 &&
      mh.indexOf('data-key="recents"') >= 0 && mh.indexOf('id="ctlWake"') >= 0 &&
      mh.indexOf('id="ctlSendText"') >= 0 && mh.indexOf('id="ctlOpenTt"') >= 0);
    check("mirror co cong tac 'Áp dụng đồng loạt'", mh.indexOf('Áp dụng đồng loạt') >= 0 && mh.indexOf('id="ctlBroadcast"') >= 0);
    check('mirror tab Tac vu: Diem danh + Xem video + Check heo + Dang nhap TikTok + Mo TikTok',
      mh.indexOf('id="btnCheckin"') >= 0 && mh.indexOf('id="btnWatchStart"') >= 0 &&
      mh.indexOf('id="btnCheckHeo"') >= 0 && mh.indexOf('id="btnTtLogin"') >= 0 && mh.indexOf('id="btnOpenTt"') >= 0);
    check('mirror Check heo co o link game (gameLinkInput) + goi /api/game-link',
      mh.indexOf('id="gameLinkInput"') >= 0 && mh.indexOf('/api/game-link') >= 0);
    check("mirror co khoi 'Kết nối máy mới' (QR + /apks/agent.apk + cham 6 lan)",
      mh.indexOf('Kết nối máy mới') >= 0 && mh.indexOf('/api/provision/qr') >= 0 &&
      mh.indexOf('/apks/agent.apk') >= 0 && mh.indexOf('chạm 6 lần') >= 0);
    check('mirror dung /api/broadcast + /api/cmd screenshot + pipeline diem-danh/dang-nhap',
      mh.indexOf('/api/broadcast') >= 0 && mh.indexOf("'screenshot'") >= 0 &&
      mh.indexOf("'diem-danh'") >= 0 && mh.indexOf("'dang-nhap-tiktok-lite'") >= 0);
    r = await req('GET', '/');
    check("dashboard chinh co link 'Màn hình dàn máy' sang /mirror",
      r.status === 200 && (r.text || '').indexOf('/mirror') >= 0 && (r.text || '').indexOf('Màn hình dàn máy') >= 0);

    // ---------- 2. Hai may ao, 2 kich thuoc man hinh ----------
    console.log('== 2 fake agent: A=1080x2400, B=720x1600 ==');
    fakeA = startFake({ FAKE_ANDROID_ID: ID_A, FAKE_SCREEN: '1080x2400' });
    fakeB = startFake({ FAKE_ANDROID_ID: ID_B, FAKE_SCREEN: '720x1600' });
    const dA = await waitOnline(ID_A);
    const dB = await waitOnline(ID_B);
    check('may A online, server biet man hinh 1080x2400 (tu hello)',
      dA.screenW === 1080 && dA.screenH === 2400, dA.screenW + 'x' + dA.screenH);
    check('may B online, server biet man hinh 720x1600 (tu hello)',
      dB.screenW === 720 && dB.screenH === 1600, dB.screenW + 'x' + dB.screenH);

    // ---------- 3. Screenshot spot-check ----------
    r = await req('POST', '/api/cmd', { deviceId: ID_A, cmd: 'screenshot' });
    check('screenshot qua /api/cmd ok + JPEG base64 hop le',
      !!(r.json && r.json.ok && r.json.data && typeof r.json.data.image === 'string' && r.json.data.image.indexOf('/9j/') === 0),
      r.json && r.json.error);

    // ---------- 4. Broadcast TAP toa do tuong doi ----------
    console.log('== POST /api/broadcast: tap (0.5, 0.5) ==');
    r = await req('POST', '/api/broadcast', {
      deviceIds: [ID_A, ID_B, 'may-khong-ton-tai-34'], action: 'tap', rel: { x: 0.5, y: 0.5 }
    });
    check('broadcast tap -> HTTP 200 + ok tong true', r.status === 200 && r.json && r.json.ok === true, 'status=' + r.status);
    const resA = (r.json.results || []).find((x) => x.deviceId === ID_A) || {};
    const resB = (r.json.results || []).find((x) => x.deviceId === ID_B) || {};
    const resX = (r.json.results || []).find((x) => x.deviceId === 'may-khong-ton-tai-34') || {};
    check('may A: ok + toa do tuyet doi 540,1200', resA.ok === true && resA.x === 540 && resA.y === 1200, JSON.stringify(resA));
    check('may B: ok + toa do tuyet doi 360,800', resB.ok === true && resB.x === 360 && resB.y === 800, JSON.stringify(resB));
    check('id khong ton tai: ok:false + device_not_found (khong keo 2 may kia)',
      resX.ok === false && resX.error === 'device_not_found', JSON.stringify(resX));
    let st = await getStatusData(ID_A);
    check('fake A lastTap = 540,1200', !!st.lastTap && st.lastTap.x === 540 && st.lastTap.y === 1200, JSON.stringify(st.lastTap));
    st = await getStatusData(ID_B);
    check('fake B lastTap = 360,800', !!st.lastTap && st.lastTap.x === 360 && st.lastTap.y === 800, JSON.stringify(st.lastTap));

    // ---------- 5. Broadcast SWIPE toa do tuong doi ----------
    console.log('== POST /api/broadcast: swipe tuong doi ==');
    r = await req('POST', '/api/broadcast', {
      deviceIds: [ID_A, ID_B], action: 'swipe',
      rel: { x1: 0.5, y1: 0.75, x2: 0.5, y2: 0.3 }, durationMs: 300
    });
    check('broadcast swipe -> ok ca 2 may', r.json && r.json.ok === true &&
      (r.json.results || []).every((x) => x.ok === true), JSON.stringify(r.json && r.json.results));
    st = await getStatusData(ID_A);
    check('fake A lastSwipe = 540,1800 -> 540,720',
      !!st.lastSwipe && st.lastSwipe.x1 === 540 && st.lastSwipe.y1 === 1800 && st.lastSwipe.x2 === 540 && st.lastSwipe.y2 === 720,
      JSON.stringify(st.lastSwipe));
    st = await getStatusData(ID_B);
    check('fake B lastSwipe = 360,1200 -> 360,480',
      !!st.lastSwipe && st.lastSwipe.x1 === 360 && st.lastSwipe.y1 === 1200 && st.lastSwipe.x2 === 360 && st.lastSwipe.y2 === 480,
      JSON.stringify(st.lastSwipe));

    // ---------- 6. Broadcast key / open_app / input_text ----------
    console.log('== POST /api/broadcast: key back + open_app + input_text ==');
    r = await req('POST', '/api/broadcast', { deviceIds: [ID_A, ID_B], action: 'key', key: 'back' });
    check('broadcast key back -> ok ca 2 may', r.json && r.json.ok === true &&
      (r.json.results || []).every((x) => x.ok === true));
    r = await req('POST', '/api/broadcast', { deviceIds: [ID_A, ID_B], action: 'open_app', package: TIKTOK_PKG });
    check('broadcast open_app TikTok Lite -> ok ca 2 may', r.json && r.json.ok === true &&
      (r.json.results || []).every((x) => x.ok === true));
    r = await req('POST', '/api/broadcast', { deviceIds: [ID_A, ID_B], action: 'input_text', text: 'xin chao 34' });
    check('broadcast input_text -> ok ca 2 may', r.json && r.json.ok === true &&
      (r.json.results || []).every((x) => x.ok === true));
    st = await getStatusData(ID_A);
    check("fake A cmdLog co 'key:back' + 'open_app' + input_text",
      (st.cmdLog || []).indexOf('key:back') >= 0 && (st.cmdLog || []).indexOf('open_app') >= 0 &&
      (st.cmdLog || []).some((x) => x.indexOf('input_text') === 0), (st.cmdLog || []).slice(-8).join(' | '));
    st = await getStatusData(ID_B);
    check("fake B cmdLog co 'key:back' + 'open_app'",
      (st.cmdLog || []).indexOf('key:back') >= 0 && (st.cmdLog || []).indexOf('open_app') >= 0);

    // ---------- 7. Loi tham so ----------
    r = await req('POST', '/api/broadcast', { deviceIds: [ID_A], action: 'nhay-mua' });
    check('broadcast action sai -> HTTP 400', r.status === 400 && r.json && r.json.ok === false, 'status=' + r.status);
    r = await req('POST', '/api/broadcast', { deviceIds: [], action: 'tap', rel: { x: 0.5, y: 0.5 } });
    check('broadcast thieu deviceIds -> HTTP 400', r.status === 400 && r.json && r.json.ok === false, 'status=' + r.status);

    // ---------- 8. May offline ----------
    console.log('== Broadcast toi may offline ==');
    fakeB.kill(); fakeB = null;
    await waitFor(async () => {
      const d = await getDevice(ID_B);
      return d && !d.online ? d : false;
    }, 10000, 'may B offline');
    check('may B da offline sau khi tat fake', true);
    r = await req('POST', '/api/broadcast', { deviceIds: [ID_A, ID_B], action: 'tap', rel: { x: 0.5, y: 0.5 } });
    const resB2 = ((r.json && r.json.results) || []).find((x) => x.deviceId === ID_B) || {};
    const resA2 = ((r.json && r.json.results) || []).find((x) => x.deviceId === ID_A) || {};
    check('may B offline: ok:false + device_offline', resB2.ok === false && resB2.error === 'device_offline', JSON.stringify(resB2));
    check('may A van ok (offline cua B khong keo A)', resA2.ok === true && resA2.x === 540 && resA2.y === 1200, JSON.stringify(resA2));
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    if (fakeA) try { fakeA.kill(); } catch (e) {}
    if (fakeB) try { fakeB.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    cleanData();
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
