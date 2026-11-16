// verify-stage322.js — Kiem chung vong kin Hotfix 3.2.2 (o nhap chua
// kip focus — input_text tra no_focus o nhung lan dau, loi may that
// Sony SOV37 khi chay ban 3.2.1).
// Chay: node verify-stage322.js   (tu khoi dong server tam tren cong
// 23787/23080 + fake agent, kiem tra:
//  (a) voi FAKE_NO_FOCUS_FIRST=2: flow cap-gmail-tu-dong van chay den
//      done nho helper inputTextWithRetry; cmdLog thay ro 2 lan
//      "input_text:no_focus" roi moi nhap duoc, thu tu lenh dung:
//      open_google_signin -> input_text:no_focus x2 ->
//      input_text(email) -> tap_text(次へ) ->
//      input_text(password):******** -> tap_text(次へ);
//      su kien cho-doi "Ô nhập chưa sẵn sàng (no_focus)" chi ghi 1 lan.
//  (b) voi FAKE_NO_FOCUS_FIRST=99: flow that bai gon voi ghi chu
//      no_focus (khong treo, khong crash), helper thu dung 6 lan
//      (6 dong "input_text:no_focus" trong cmdLog).
//  (c) mat khau that KHONG xuat hien trong bat ky response API / su
//      kien nao cua ca phien.
// Don dep pool test sau khi chay (giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 23787;
const HTTP_PORT = 23080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const EMAIL_A = 's322a@gmail.com';
const PASS_A = 'MatKhau322A-xq';
const EMAIL_B = 's322b@gmail.com';
const PASS_B = 'MatKhau322B-xq';
const EXPECTED_SEQ_A = [
  'open_google_signin',
  'input_text:no_focus',
  'input_text:no_focus',
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

async function getCmdLog() {
  const rs = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
  return (rs.json && rs.json.data && rs.json.data.cmdLog) || [];
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

    // ---------- 1. Fake agent FAKE_NO_FOCUS_FIRST=2 + kho Gmail ----------
    console.log('== Fake agent (FAKE_NO_FOCUS_FIRST=2) + nhap kho Gmail ==');
    fake = startFake({ FAKE_NO_FOCUS_FIRST: '2' });
    const dev = await waitDeviceOnline();
    check('may ao (no_focus_first=2) online', true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A + '\n' + EMAIL_B + '|' + PASS_B });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));

    // ---------- 2. Flow voi 2 lan no_focus dau: van done nho thu lai ----------
    console.log('== Flow cap-gmail-tu-dong voi FAKE_NO_FOCUS_FIRST=2 ==');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
    check('(a) start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const runIdA = r.json.runId;
    const drA = await waitFor(async () => {
      const d = await getRunDevice(runIdA);
      return d && d.status === 'done' ? d : false;
    }, 120000, '(a) flow done');
    check('(a) flow hoan thanh (done) du 2 lan no_focus dau', true,
      drA.steps.map((s) => s.type + ':' + s.status).join(','));
    check('(a) buoc gmail_signin done + ghi da dang nhap',
      drA.steps[1].status === 'done' && (drA.steps[1].note || '').indexOf('Đã tự đăng nhập Google') >= 0,
      drA.steps[1].note);

    const cmdLogA = await getCmdLog();
    const fromA = Math.max(0, cmdLogA.lastIndexOf('open_google_signin'));
    const seqA = cmdLogA.slice(fromA).filter((e) => e === 'open_google_signin' || e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
    check('(a) dung thu tu lenh (2 lan no_focus -> nhap email -> ... -> nhap mat khau)',
      JSON.stringify(seqA) === JSON.stringify(EXPECTED_SEQ_A), 'nhan duoc: ' + JSON.stringify(seqA));

    r = await req('GET', '/api/events');
    const waitEvents = ((r.json && r.json.events) || []).filter((ev) => (ev.message || '').indexOf('chưa sẵn sàng (no_focus)') >= 0);
    check('(a) su kien cho-doi no_focus chi ghi dung 1 lan', waitEvents.length === 1,
      'so su kien: ' + waitEvents.length);

    // ---------- 3. FAKE_NO_FOCUS_FIRST=99: that bai gon voi no_focus ----------
    console.log('== Fake agent (FAKE_NO_FOCUS_FIRST=99) — loi vinh vien ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_NO_FOCUS_FIRST: '99' });
    await waitDeviceOnline();
    check('may ao (no_focus_first=99) online', true);

    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
    check('(b) start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const runIdB = r.json.runId;
    const drB = await waitFor(async () => {
      const d = await getRunDevice(runIdB);
      return d && d.status === 'error' ? d : false;
    }, 120000, '(b) flow error (khong treo)');
    check('(b) flow dung o trang thai error (khong treo, khong crash)', true, drB.status);
    const signinStep = drB.steps.find((s) => s.type === 'gmail_signin');
    check('(b) ghi chu buoc dang nhap chua loi no_focus',
      !!signinStep && signinStep.status === 'error' && (signinStep.note || '').indexOf('no_focus') >= 0,
      signinStep && signinStep.note);
    const cmdLogB = await getCmdLog();
    const noFocusCount = cmdLogB.filter((e) => e === 'input_text:no_focus').length;
    check('(b) helper thu dung 6 lan input_text (6 dong no_focus)', noFocusCount === 6,
      'dem duoc: ' + noFocusCount);

    // ---------- 4. Quet ro ri mat khau ----------
    console.log('== Quet ro ri mat khau ==');
    check('(c) PASS_A khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_A) < 0);
    check('(c) PASS_B khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_B) < 0);
    r = await req('GET', '/api/events');
    check('(c) nhat ky su kien khong chua mat khau that',
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
