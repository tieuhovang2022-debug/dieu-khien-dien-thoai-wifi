// verify-stage33.js — Kiem chung vong kin Giai doan 3.3 (chi
// server + dashboard; agent van v3.1):
//  1. XOA MAY — POST /api/devices/delete: cap Gmail + TK heo cho may
//     ao, ghi 1 ngay diem danh (chay flow diem-danh), roi xoa may:
//     may bien khoi /api/devices; ca 2 tai khoan ve 'ready' va xoa
//     deviceId/assignedAt; trang thai diem danh cua may bi xoa; co su
//     kien 'device_delete'; xoa id khong ton tai -> HTTP 404.
//  2. RESET MAY — POST /api/devices/reset: fake la Device Owner
//     (FAKE_DEVICE_OWNER=1) -> ok + su kien 'reset' + ho so may va
//     tai khoan da cap VAN NGUYEN (lien tuc theo doi); fake khong
//     phai Device Owner -> ok:false, error 'not_device_owner' kem
//     thong diep ro rang.
//  3. Dashboard: co muc "Them may" (2 danh sach buoc A/B + link
//     /apks/agent.apk), moi the may co nut 'Xoa may' + 'Reset may'
//     va chu xac nhan 2 buoc 'Bam lan nua de XAC NHAN reset'.
//  4. Mat khau that khong xuat hien trong bat ky response API nao.
// Chay: node verify-stage33.js  (tu khoi dong server tam tren cong
// 25787/25080 + fake agent; don dep pool/state test sau khi chay,
// giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 25787;
const HTTP_PORT = 25080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const EMAIL = 's33@gmail.com';
const PASS = 'MatKhau33-xq';
const HEO_USER = 'nikheo33';
const HEO_PASS = 'MatKhauHeo33-xq';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let allResponses = '';
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
        allResponses += '\n' + s;
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

async function getDevice() {
  const r = await req('GET', '/api/devices');
  return (r.json.devices || []).find((x) => x.id === FAKE_ID) || null;
}
async function waitDeviceOnline() {
  return waitFor(async () => {
    const d = await getDevice();
    return d && d.online ? d : false;
  }, 10000, 'fake agent online');
}
async function waitDeviceGone() {
  return waitFor(async () => {
    const d = await getDevice();
    return !d ? true : false;
  }, 10000, 'may bien khoi danh sach');
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
  let fake = null;
  try {
    await waitFor(async () => {
      try { const r = await req('GET', '/api/info'); return r.json && r.json.ok ? r.json : false; } catch (e) { return false; }
    }, 10000, 'server len');
    check('server khoi dong, /api/info ok', true);

    // ---------- 1. Fake (Device Owner) + cap tai khoan + diem danh ----------
    console.log('== Fake agent (FAKE_DEVICE_OWNER=1) + cap Gmail/TK heo + diem danh ==');
    fake = startFake({ FAKE_DEVICE_OWNER: '1' });
    const dev = await waitDeviceOnline();
    check('may ao online + bao Device Owner', dev.deviceOwner === true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL + '|' + PASS });
    check('gmail import added=1', r.json && r.json.added === 1, JSON.stringify(r.json));
    r = await req('POST', '/api/gmail/assign', { deviceId: FAKE_ID });
    check('cap Gmail cho may ok', r.json && r.json.ok === true && r.json.account.email === EMAIL, JSON.stringify(r.json));

    r = await req('POST', '/api/heo/import', { text: HEO_USER + '|' + HEO_PASS });
    check('heo import added=1', r.json && r.json.added === 1, JSON.stringify(r.json));
    r = await req('POST', '/api/heo/assign-next', { deviceId: FAKE_ID });
    check('cap TK heo cho may ok', r.json && r.json.ok === true && r.json.account.username === HEO_USER, JSON.stringify(r.json));

    r = await req('POST', '/api/pipeline/start', { pipelineId: 'diem-danh', deviceIds: [FAKE_ID], params: {} });
    check('diem-danh start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const runId = r.json.runId;
    await waitFor(async () => {
      const rr = await req('GET', '/api/pipeline/runs');
      const run = (rr.json.runs || []).find((x) => x.id === runId);
      if (!run) return false;
      const dr = run.devices.find((x) => x.deviceId === FAKE_ID);
      return dr && dr.status === 'done' ? dr : false;
    }, 60000, 'diem-danh done');
    check('diem-danh hoan thanh (done)', true);
    r = await req('GET', '/api/checkin');
    const ckEntry = (r.json.devices || []).find((x) => x.deviceId === FAKE_ID);
    check('/api/checkin: may co 1 ngay diem danh', !!ckEntry && ckEntry.count === 1,
      ckEntry ? 'count=' + ckEntry.count : 'khong co entry');

    // ---------- 2. Reset may khi la Device Owner ----------
    console.log('== POST /api/devices/reset (Device Owner) ==');
    r = await req('POST', '/api/devices/reset', { deviceId: FAKE_ID });
    check('reset tra ok:true', r.json && r.json.ok === true, JSON.stringify(r.json));
    r = await req('GET', '/api/events');
    check("co su kien 'reset' cho may", ((r.json && r.json.events) || [])
      .some((ev) => ev.type === 'reset' && ev.deviceId === FAKE_ID));
    const devAfterReset = await getDevice();
    check('sau reset: ho so may VAN con (lien tuc theo doi)', !!devAfterReset);
    check('sau reset: Gmail van con cap cho may (khong bi tra kho)',
      !!devAfterReset && devAfterReset.gmailAssigned === EMAIL,
      devAfterReset && devAfterReset.gmailAssigned);
    r = await req('GET', '/api/gmail');
    const gAfter = (r.json.accounts || []).find((a) => a.email === EMAIL);
    check('sau reset: pool van assigned/deviceId nguyen', !!gAfter && gAfter.status === 'assigned' && gAfter.deviceId === FAKE_ID);

    // ---------- 3. Reset may khi KHONG phai Device Owner ----------
    console.log('== Fake agent (FAKE_DEVICE_OWNER=0) + reset lai ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_DEVICE_OWNER: '0' });
    const dev2 = await waitDeviceOnline();
    check('may ao (khong Device Owner) online lai', dev2.deviceOwner === false);
    r = await req('POST', '/api/devices/reset', { deviceId: FAKE_ID });
    check('reset tra ok:false + error not_device_owner',
      r.json && r.json.ok === false && r.json.error === 'not_device_owner', JSON.stringify(r.json));
    check('reset kem thong diep ro rang ve Device Owner / QR',
      !!r.json && typeof r.json.message === 'string' && r.json.message.indexOf('Device Owner') >= 0,
      r.json && r.json.message);

    // ---------- 4. Xoa may ----------
    console.log('== POST /api/devices/delete ==');
    r = await req('POST', '/api/devices/delete', { deviceId: FAKE_ID });
    check('delete tra ok:true + released dung 2 tai khoan',
      r.json && r.json.ok === true && r.json.released && r.json.released.gmail === EMAIL && r.json.released.heo === HEO_USER,
      JSON.stringify(r.json));
    await waitDeviceGone();
    check('may bien khoi /api/devices', true);
    r = await req('GET', '/api/gmail');
    const gRel = (r.json.accounts || []).find((a) => a.email === EMAIL);
    check('Gmail da tra ve kho: status ready + deviceId null + assignedAt null',
      !!gRel && gRel.status === 'ready' && gRel.deviceId === null && gRel.assignedAt === null,
      JSON.stringify(gRel));
    r = await req('GET', '/api/heo');
    const hRel = (r.json.accounts || []).find((a) => a.username === HEO_USER);
    check('TK heo da tra ve kho: status ready + deviceId null + assignedAt null',
      !!hRel && hRel.status === 'ready' && hRel.deviceId === null && hRel.assignedAt === null,
      JSON.stringify(hRel));
    r = await req('GET', '/api/checkin');
    check('trang thai diem danh cua may da bi xoa',
      !((r.json.devices || []).some((x) => x.deviceId === FAKE_ID)));
    r = await req('GET', '/api/events');
    check("co su kien 'device_delete' cho may", ((r.json && r.json.events) || [])
      .some((ev) => ev.type === 'device_delete' && ev.deviceId === FAKE_ID));

    // ---------- 5. Xoa may khong ton tai ----------
    r = await req('POST', '/api/devices/delete', { deviceId: 'may-khong-ton-tai-33' });
    check('delete id khong ton tai -> HTTP 404 + ok:false',
      r.status === 404 && r.json && r.json.ok === false, 'status=' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/api/devices/reset', { deviceId: 'may-khong-ton-tai-33' });
    check('reset id khong ton tai -> HTTP 404 + ok:false',
      r.status === 404 && r.json && r.json.ok === false, 'status=' + r.status);

    // ---------- 6. Dashboard ----------
    console.log('== Dashboard HTML ==');
    r = await req('GET', '/');
    const html = r.text || '';
    check('dashboard la trang HTML', r.status === 200 && html.indexOf('<html') >= 0, 'status=' + r.status);
    check("co muc '➕ Thêm máy'", html.indexOf('Thêm máy') >= 0);
    check('co link tai /apks/agent.apk', html.indexOf('/apks/agent.apk') >= 0);
    check("buoc A: 'chạm 6 lần' mo quet QR", html.indexOf('chạm 6 lần') >= 0);
    check("buoc B: 'Máy đang dùng sẵn'", html.indexOf('Máy đang dùng sẵn') >= 0);
    check("buoc nhap IP/nhan + 'Lưu & Kết nối'", html.indexOf('Lưu & Kết nối') >= 0 || html.indexOf('Lưu &amp; Kết nối') >= 0);
    check("the may co nut 'Xoá máy'", html.indexOf('Xoá máy') >= 0);
    check("the may co nut 'Reset máy'", html.indexOf('Reset máy') >= 0);
    check("co chu xac nhan 2 buoc 'Bấm lần nữa để XÁC NHẬN reset'", html.indexOf('Bấm lần nữa để XÁC NHẬN reset') >= 0);
    check('dashboard van mo tab Dan may mac dinh', html.indexOf('id="panel-danmay"') >= 0 && html.indexOf('panelpage active') >= 0);

    // ---------- 7. Quet ro ri mat khau ----------
    console.log('== Quet ro ri mat khau ==');
    check('PASS Gmail khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS) < 0);
    check('PASS heo khong xuat hien trong bat ky response API nao', allResponses.indexOf(HEO_PASS) < 0);
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    if (fake) try { fake.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    cleanData();
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
