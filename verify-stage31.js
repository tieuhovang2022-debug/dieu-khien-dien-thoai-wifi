// verify-stage31.js — Kiem chung vong kin Giai doan 3.1 (Cap Gmail TU DONG).
// Chay: node verify-stage31.js   (tu khoi dong server tam tren cong
// 20787/20080 + fake agent co may trang thai dang nhap Google, kiem tra:
//  (a) flow cap-gmail-tu-dong chay den done,
//  (b) fake agent nhan dung thu tu lenh: open_google_signin ->
//      input_text(email) -> tap_text(次へ) -> input_text(password) ->
//      tap_text(次へ)   (doc qua data.cmdLog cua lenh status),
//  (c) mat khau that KHONG xuat hien trong BAT KY response API nao va
//      BAT KY su kien nao trong nhat ky,
//  (d) voi FAKE_VERIFY=1, flow dung o waiting_manual voi dung ghi chu
//      xac minh; Resume thi chay lai kiem tra cuoi va dung lai; Stop thi dut.
// Don dep pool test sau khi chay (giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 20787;
const HTTP_PORT = 20080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const EMAIL_A = 's31a@gmail.com';
const PASS_A = 'MatKhau31A-xq';
const EMAIL_B = 's31b@gmail.com';
const PASS_B = 'MatKhau31B-xq';
const VERIFY_NOTE = 'Máy đang ở bước xác minh của Google — xử lý chạm tay trên máy rồi bấm Chạy tiếp';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Gom toan bo than response API de quet ro ri mat khau o cuoi phien
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

    // ---------- 1. Fake agent + kho Gmail ----------
    console.log('== Fake agent (mac dinh) + nhap kho Gmail ==');
    fake = startFake({});
    const dev = await waitDeviceOnline();
    check('may ao online', true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A + '\n' + EMAIL_B + '|' + PASS_B });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));
    r = await req('GET', '/api/gmail');
    check('gmail list: mat khau che, khong lo pass that',
      r.json && r.json.accounts.length === 2 && r.text.indexOf(PASS_A) < 0 && r.text.indexOf(PASS_B) < 0);

    r = await req('GET', '/api/pipelines');
    const pipeIds = (r.json.pipelines || []).map((p) => p.id).join(',');
    check('co flow cap-gmail-tu-dong trong /api/pipelines', pipeIds.indexOf('cap-gmail-tu-dong') >= 0, pipeIds);

    // ---------- 2. Flow cap-gmail-tu-dong chay den done ----------
    console.log('== Flow cap-gmail-tu-dong (duong binh thuong) ==');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
    check('cap-gmail-tu-dong start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const runId = r.json.runId;
    const drDone = await waitFor(async () => {
      const d = await getRunDevice(runId);
      return d && d.status === 'done' ? d : false;
    }, 90000, 'cap-gmail-tu-dong done');
    check('(a) flow hoan thanh (done)', true, drDone.steps.map((s) => s.type + ':' + s.status).join(','));
    check('buoc assign_gmail done + ghi email duoc cap',
      drDone.steps[0].status === 'done' && (drDone.steps[0].note || '').indexOf(EMAIL_A) >= 0, drDone.steps[0].note);
    check('buoc gmail_signin done + ghi da dang nhap',
      drDone.steps[1].status === 'done' && (drDone.steps[1].note || '').indexOf('Đã tự đăng nhập Google') >= 0, drDone.steps[1].note);

    // ---------- 3. Thu tu lenh agent nhan duoc ----------
    console.log('== Thu tu lenh (cmdLog qua lenh status) ==');
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
    const cmdLog = (r.json && r.json.data && r.json.data.cmdLog) || [];
    const seq = cmdLog.filter((e) => e === 'open_google_signin' || e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
    const expected = [
      'open_google_signin',
      'input_text(email):' + EMAIL_A,
      'tap_text:次へ',
      'input_text(password):********',
      'tap_text:次へ'
    ];
    check('(b) dung thu tu lenh dang nhap', JSON.stringify(seq) === JSON.stringify(expected),
      'nhan duoc: ' + JSON.stringify(seq));

    // ---------- 4. Su kien: email thay duoc, mat khau khong ----------
    console.log('== Nhat ky su kien ==');
    r = await req('GET', '/api/events');
    const signinEvents = (r.json.events || []).filter((e) => e.type === 'gmail_signin');
    check('co su kien gmail_signin trong /api/events', signinEvents.length >= 4, signinEvents.length + ' su kien');
    check('su kien ghi email ( thay duoc tien trinh )', signinEvents.some((e) => (e.message || '').indexOf(EMAIL_A) >= 0));
    check('su kien ghi hoan tat dang nhap', signinEvents.some((e) => (e.message || '').indexOf('hoàn tất') >= 0),
      signinEvents.map((e) => e.message).join(' | '));

    // ---------- 5. FAKE_VERIFY=1: dung Cho cham tay ----------
    console.log('== Fake agent (FAKE_VERIFY=1) — Google bat xac minh ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_VERIFY: '1' });
    await waitDeviceOnline();
    check('fake verify online', true);
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
    check('cap-gmail-tu-dong (verify) start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const vRunId = r.json.runId;
    const drWait = await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 90000, 'flow dung o waiting_manual khi bi xac minh');
    check('(d) flow dung o waiting_manual khi Google bat xac minh', true);
    const curStep = drWait.steps[drWait.currentStep];
    check('ghi chu dung noi dung xac minh', !!curStep && curStep.note === VERIFY_NOTE, curStep && curStep.note);
    check('buoc assign van done (dung lai tai khoan da cap)',
      drWait.steps[0].status === 'done' && (drWait.steps[0].note || '').indexOf(EMAIL_A) >= 0, drWait.steps[0].note);
    r = await req('GET', '/api/events');
    const parkEv = (r.json.events || []).find((e) => e.type === 'gmail_signin' && (e.message || '').indexOf('xác minh') >= 0);
    check('co su kien bao dung xac minh', !!parkEv, parkEv && parkEv.message);

    // Resume -> chay lai kiem tra cuoi -> van con xac minh -> dung lai.
    // Cho run roi khoi waiting_manual truoc (tranh doc lai trang thai cu),
    // roi moi cho no dung lai.
    r = await req('POST', '/api/pipeline/resume', { runId: vRunId, deviceId: FAKE_ID });
    check('resume ok', r.json && r.json.ok === true);
    await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'running' ? d : false;
    }, 15000, 'run chay tiep sau resume');
    check('run da chay tiep sau resume', true);
    const drWait2 = await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 90000, 'flow dung lai o waiting_manual sau resume (van con xac minh)');
    check('(d) resume -> kiem tra lai -> dung lai waiting_manual', true,
      drWait2.steps[drWait2.currentStep] && drWait2.steps[drWait2.currentStep].note);
    r = await req('POST', '/api/pipeline/stop', { runId: vRunId });
    check('stop ok', r.json && r.json.ok === true);
    const drStopped = await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'stopped' ? d : false;
    }, 15000, 'run dung han sau stop');
    check('run dung han (stopped)', true, drStopped.status);

    // ---------- 6. Lenh open_google_signin truc tiep ----------
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'open_google_signin', args: {} });
    check('lenh open_google_signin -> ok', r.json && r.json.ok === true && r.json.data && r.json.data.opened === 'google_signin', JSON.stringify(r.json));

    // ---------- 7. Dashboard ----------
    r = await req('GET', '/');
    check('dashboard HTTP 200 + co nut Cap Gmail tren the may + flow moi',
      r.status === 200 && r.text.indexOf('cap-gmail-tu-dong') >= 0 && r.text.indexOf('Cấp Gmail') >= 0);

    // ---------- 8. Quet ro ri mat khau tren toan bo response ----------
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
    // Don dep pool test; GIU flow-config.json (file cau hinh mac dinh giao kem goi)
    try { fs.unlinkSync(path.join(SERVER_DIR, 'data', 'gmail-pool.json')); } catch (e) {}
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
