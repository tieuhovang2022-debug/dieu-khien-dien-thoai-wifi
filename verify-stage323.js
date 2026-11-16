// verify-stage323.js — Kiem chung vong kin Hotfix 3.2.3 (nhan nham
// man hinh email la man hinh mat khau — mat khau bi go vao o email,
// loi may that Sony SOV37 khi chay ban 3.2.2, anh chup 2026-11-16
// ~22:07: kho Gmail dung (LilyCreightonwugwb@alazlyc.org, Da cap),
// nhung o email tren dien thoai chua mat khau cua tai khoan) +
// ban DIEU CHINH theo yeu cau nguoi dung: thay co che "dung ngay
// khi khong khop" bang VONG LAP THU LAI cho tung buoc nhap — chua
// chuyen trang thi nghi ~5 giay roi nhap lai ca buoc (toi da ~5
// phut/buoc); thay chu xac minh thi van dung Cho cham tay ngay.
// Chay: node verify-stage323.js   (tu khoi dong server tam tren cong
// 24787/24080 + fake agent, kiem tra:
//  (a) voi FAKE_SIGNIN_BOTH_MARKERS=1 (dump o man hinh email chua
//      them node an "パスワード" nhu DOM WebView tren may that):
//      flow cap-gmail-tu-dong van chay den done; cmdLog chung minh
//      input_text DAU TIEN mang EMAIL (khong phai mat khau) va mat
//      khau chi duoc go sau khi da sang man hinh mat khau — nho phan
//      loai nghiem ngat (emailScreen thang passwordScreen); duong
//      vui chi co dung 1 vong nhap (khong co su kien thu-lai).
//  (b) khong dat env: flow van done nhu truoc, dung thu tu lenh.
//  (d) voi FAKE_DROP_FIRST_INPUT=1 (lan nhap email thanh cong dau
//      tien bi "rot" — o van trong): flow PHAI nhap lai email (it
//      nhat 2 lan input_text(email) trong cmdLog), co su kien thu
//      lai, va van chay den done nho vong lap thu lai.
//  (c) mat khau that KHONG xuat hien trong bat ky response API / su
//      kien nao cua ca phien.
// Don dep pool test sau khi chay (giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 24787;
const HTTP_PORT = 24080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const EMAIL_A = 's323a@gmail.com';
const PASS_A = 'MatKhau323A-xq';
const EMAIL_B = 's323b@gmail.com';
const PASS_B = 'MatKhau323B-xq';
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

async function getCmdLog() {
  const rs = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
  return (rs.json && rs.json.data && rs.json.data.cmdLog) || [];
}

function signinSeq(cmdLog) {
  const from = Math.max(0, cmdLog.lastIndexOf('open_google_signin'));
  return cmdLog.slice(from).filter((e) => e === 'open_google_signin' || e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
}

async function countRetryEvents() {
  const r = await req('GET', '/api/events');
  return ((r.json && r.json.events) || []).filter((ev) => (ev.message || '').indexOf('thử nhập lại email') >= 0).length;
}

async function runGmailFlow(label) {
  const r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: [FAKE_ID], params: {} });
  check(label + ': start ok', r.json && r.json.ok === true, r.json && r.json.runId);
  const dr = await waitFor(async () => {
    const d = await getRunDevice(r.json.runId);
    return d && d.status === 'done' ? d : false;
  }, 180000, label + ': flow done');
  check(label + ': flow hoan thanh (done)', true,
    dr.steps.map((s) => s.type + ':' + s.status).join(','));
  check(label + ': buoc gmail_signin done + ghi da dang nhap',
    dr.steps[1].status === 'done' && (dr.steps[1].note || '').indexOf('Đã tự đăng nhập Google') >= 0,
    dr.steps[1].note);
  return dr;
}

async function main() {
  // Don pool test con sot tu lan chay truoc (neu co) — de import
  // dem dung va tai khoan A duoc cap dau tien.
  try { fs.unlinkSync(path.join(SERVER_DIR, 'data', 'gmail-pool.json')); } catch (e) {}
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

    // ---------- 1. FAKE_SIGNIN_BOTH_MARKERS=1 + kho Gmail ----------
    console.log('== Fake agent (FAKE_SIGNIN_BOTH_MARKERS=1) + nhap kho Gmail ==');
    fake = startFake({ FAKE_SIGNIN_BOTH_MARKERS: '1' });
    const dev = await waitDeviceOnline();
    check('may ao (both-markers) online', true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A + '\n' + EMAIL_B + '|' + PASS_B });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));

    // ---------- 2. Flow voi ca hai marker tren man hinh email ----------
    console.log('== Flow cap-gmail-tu-dong voi FAKE_SIGNIN_BOTH_MARKERS=1 ==');
    await runGmailFlow('(a)');
    const cmdLogA = await getCmdLog();
    const seqA = signinSeq(cmdLogA);
    check('(a) dung thu tu lenh dang nhap (email truoc, mat khau sau khi sang man hinh mat khau)',
      JSON.stringify(seqA) === JSON.stringify(EXPECTED_SEQ), 'nhan duoc: ' + JSON.stringify(seqA));
    const firstInput = seqA.find((e) => e.indexOf('input_text') === 0);
    check('(a) input_text DAU TIEN mang email (khong phai mat khau — het loi go sai truong)',
      firstInput === 'input_text(email):' + EMAIL_A, 'nhan duoc: ' + firstInput);
    const passIdx = seqA.indexOf('input_text(password):********');
    const nextIdx = seqA.indexOf('tap_text:次へ');
    check('(a) mat khau chi duoc go SAU lan bam Tiep theo dau tien (da qua man hinh mat khau)',
      passIdx > nextIdx && nextIdx >= 0, 'passIdx=' + passIdx + ', nextIdx=' + nextIdx);
    check('(a) duong vui khong co su kien thu-lai nao (chi 1 vong nhap)',
      (await countRetryEvents()) === 0);

    // ---------- 3. Khong env: flow chay nhu truoc ----------
    console.log('== Fake agent (khong env) — chay lai flow ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({});
    await waitDeviceOnline();
    check('may ao (thuong) online', true);
    await runGmailFlow('(b)');
    const cmdLogB = await getCmdLog();
    const seqB = signinSeq(cmdLogB);
    check('(b) dung thu tu lenh dang nhap nhu truoc',
      JSON.stringify(seqB) === JSON.stringify(EXPECTED_SEQ), 'nhan duoc: ' + JSON.stringify(seqB));

    // ---------- 4. FAKE_DROP_FIRST_INPUT=1: nhap rot -> tu nhap lai ----------
    console.log('== Fake agent (FAKE_DROP_FIRST_INPUT=1) — lan nhap email dau bi rot ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_DROP_FIRST_INPUT: '1' });
    await waitDeviceOnline();
    check('may ao (drop-first-input) online', true);
    await runGmailFlow('(d)');
    const cmdLogD = await getCmdLog();
    const seqD = signinSeq(cmdLogD);
    const emailInputs = seqD.filter((e) => e === 'input_text(email):' + EMAIL_A).length;
    check('(d) email duoc nhap lai it nhat 2 lan (vong lap thu lai da cuu lan nhap rot)',
      emailInputs >= 2, 'so lan nhap email: ' + emailInputs + ', seq: ' + JSON.stringify(seqD));
    check('(d) input_text dau tien van mang email, mat khau van chi go o man hinh mat khau',
      seqD[1] === 'input_text(email):' + EMAIL_A &&
      seqD.indexOf('input_text(password):********') > seqD.indexOf('tap_text:次へ'),
      'seq: ' + JSON.stringify(seqD));
    check('(d) co su kien thu-lai cua buoc email', (await countRetryEvents()) >= 1);

    // ---------- 5. Quet ro ri mat khau ----------
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
