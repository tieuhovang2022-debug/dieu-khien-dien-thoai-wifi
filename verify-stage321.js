// verify-stage321.js — Kiem chung vong kin Hotfix 3.2.1 (nut Tiep theo
// xuat hien tre trong cay accessibility — loi may that Sony SOV37).
// Chay: node verify-stage321.js   (tu khoi dong server tam tren cong
// 22787/22080 + fake agent, kiem tra:
//  (a) voi FAKE_DELAY_NEXT=2: dump_ui 2 lan dau o man hinh email KHONG
//      co node nut 次へ, tu lan dump thu 3 nut moi xuat hien (kiem tra
//      truc tiep qua /api/cmd dump_ui),
//  (b) voi FAKE_DELAY_NEXT=2: flow cap-gmail-tu-dong van chay den done
//      nho helper tapMarkerWithRetry quet lai, va thu tu lenh agent
//      nhan duoc van dung: open_google_signin -> input_text(email) ->
//      tap_text(次へ) -> input_text(password) -> tap_text(次へ)
//      (helper cham bang lenh 'tap' theo toa do; fake agent ghi hieu
//      ung cham nut vao cmdLog dang "tap_text:<chu>"),
//  (c) KHONG dat FAKE_DELAY_NEXT: flow van chay den done nhu truoc
//      (khong hoi quy duong binh thuong),
//  (d) mat khau that KHONG xuat hien trong bat ky response API / su
//      kien nao cua ca phien.
// Don dep pool test sau khi chay (giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 22787;
const HTTP_PORT = 22080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const EMAIL_A = 's321a@gmail.com';
const PASS_A = 'MatKhau321A-xq';
const EMAIL_B = 's321b@gmail.com';
const PASS_B = 'MatKhau321B-xq';
const EXPECTED_SEQ = [
  'open_google_signin',
  'input_text(email):' + EMAIL_A,
  'tap_text:次へ',
  'input_text(password):********',
  'tap_text:次へ'
];

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

async function getRunDevice(runId) {
  const rr = await req('GET', '/api/pipeline/runs');
  const run = (rr.json.runs || []).find((x) => x.id === runId);
  if (!run) return null;
  return run.devices.find((x) => x.deviceId === FAKE_ID) || null;
}

async function waitDeviceOnline() {
  return waitFor(async () => {
    const r = await req('GET', '/api/devices');
    const d = (r.json.devices || []).find((x) => x.id === FAKE_ID);
    return d && d.online ? d : false;
  }, 10000, 'fake agent online');
}

async function runGmailFlow(label) {
  const r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
  check(label + ': start ok', r.json && r.json.ok === true, r.json && r.json.runId);
  const runId = r.json.runId;
  const dr = await waitFor(async () => {
    const d = await getRunDevice(runId);
    return d && d.status === 'done' ? d : false;
  }, 120000, label + ': flow done');
  check(label + ': (done) flow hoan thanh', true, dr.steps.map((s) => s.type + ':' + s.status).join(','));
  check(label + ': buoc gmail_signin done + ghi da dang nhap',
    dr.steps[1].status === 'done' && (dr.steps[1].note || '').indexOf('Đã tự đăng nhập Google') >= 0, dr.steps[1].note);
  const rs = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
  const cmdLog = (rs.json && rs.json.data && rs.json.data.cmdLog) || [];
  // Chi xet tu lan open_google_signin CUOI (cua chinh flow nay) — phan
  // kiem tra dump truc tiep o muc 2 cung da goi open_google_signin 1 lan.
  const from = Math.max(0, cmdLog.lastIndexOf('open_google_signin'));
  const seq = cmdLog.slice(from).filter((e) => e === 'open_google_signin' || e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
  check(label + ': dung thu tu lenh dang nhap', JSON.stringify(seq) === JSON.stringify(EXPECTED_SEQ),
    'nhan duoc: ' + JSON.stringify(seq));
}

async function main() {
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

    // ---------- 1. Fake agent FAKE_DELAY_NEXT=2 + kho Gmail ----------
    console.log('== Fake agent (FAKE_DELAY_NEXT=2) + nhap kho Gmail ==');
    fake = startFake({ FAKE_DELAY_NEXT: '2' });
    const dev = await waitDeviceOnline();
    check('may ao (delay) online', true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A + '\n' + EMAIL_B + '|' + PASS_B });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));

    // ---------- 2. Kiem tra truc tiep: nut 次へ bi an 2 lan dump dau ----------
    console.log('== dump_ui truc tiep: nut Tiep theo xuat hien tre ==');
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'open_google_signin', args: {} });
    check('lenh open_google_signin -> ok', r.json && r.json.ok === true, JSON.stringify(r.json && r.json.data));
    const hasNext = (j) => !!j && !!j.data && Array.isArray(j.data.nodes) &&
      j.data.nodes.some((n) => (n.text || '') === '次へ');
    const d1 = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'dump_ui', args: {} });
    const d2 = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'dump_ui', args: {} });
    check('(a) dump 1-2 o man hinh email: CHUA co node nut 次へ', !hasNext(d1.json) && !hasNext(d2.json),
      'dump1 nodes=' + ((d1.json.data || {}).count) + ', dump2 nodes=' + ((d2.json.data || {}).count));
    const d3 = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'dump_ui', args: {} });
    check('(a) dump 3: nut 次へ da xuat hien', hasNext(d3.json), 'dump3 nodes=' + ((d3.json.data || {}).count));

    // ---------- 3. Flow voi nut tre: van done nho helper quet lai ----------
    console.log('== Flow cap-gmail-tu-dong voi FAKE_DELAY_NEXT=2 ==');
    await runGmailFlow('(b) delay=2');

    // ---------- 4. Khong delay: van done nhu truoc ----------
    console.log('== Fake agent (khong delay) — duong binh thuong ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({});
    await waitDeviceOnline();
    check('may ao (khong delay) online', true);
    await runGmailFlow('(c) khong delay');

    // ---------- 5. Quet ro ri mat khau ----------
    console.log('== Quet ro ri mat khau ==');
    check('(d) PASS_A khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_A) < 0);
    check('(d) PASS_B khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_B) < 0);
    r = await req('GET', '/api/events');
    check('(d) nhat ky su kien khong chua mat khau that',
      r.text.indexOf(PASS_A) < 0 && r.text.indexOf(PASS_B) < 0);
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    if (fake) try { fake.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { fs.unlinkSync(path.join(SERVER_DIR, 'data', 'gmail-pool.json')); } catch (e) {}
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
