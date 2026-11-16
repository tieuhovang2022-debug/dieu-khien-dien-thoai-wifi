// verify-stage324.js — Kiem chung vong kin Hotfix 3.2.4 (bam khong
// duoc nut Tiep theo tren may that du vong lap 3.2.3 cu cham lai
// dung cho do — chan doan cua NGUOI DUNG khi xem may that Sony
// SOV37, 2026-11-16 ~22:40: sau khi nhap, ban phim IME tieng Nhat
// van MO va cay accessibility bao bounds cua nut 次へ LECH khoi vi
// tri that, nen moi lan cham theo bounds do deu cham sai cho va
// trang khong bao gio chuyen).
// Ban sua (chi server): trong moi buoc nhap (email + mat khau
// Google, tai khoan + mat khau TikTok), ngay sau khi nhap + xac
// minh xong va TRUOC khi bam nut chuyen buoc, server gui lenh key
// 'back' de tat ban phim, nghi ~800ms cho bo cuc on dinh, roi moi
// cham nut bang tapMarkerWithRetry (quet dump lai tung lan nen doc
// duoc bounds DUNG sau khi ban phim dong).
// Chay: node verify-stage324.js   (tu khoi dong server tam tren
// cong 24787/24080 + fake agent, kiem tra:
//  (a) voi FAKE_KEYBOARD_SHIFT=1 (sau input_text, dump_ui bao
//      bounds nut 次へ lech +600px; cham theo toa do lech thi
//      truot — chi key 'back' dong ban phim moi bao lai bounds
//      dung): flow cap-gmail-tu-dong van chay den done ngay vong
//      nhap dau tien (khong su kien thu-lai); cmdLog chung minh co
//      'key:back' nam giua input_text(email) va lan bam 次へ thanh
//      cong, va tuong tu o buoc mat khau.
//  (b) khong dat env: flow van done, thu tu lenh dang nhap (loc bo
//      'key:back') dung nhu cac ban truoc.
//  (c) mat khau that KHONG xuat hien trong bat ky response API /
//      su kien nao cua ca phien.
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
const EMAIL_A = 's324a@gmail.com';
const PASS_A = 'MatKhau324A-xq';
const EMAIL_B = 's324b@gmail.com';
const PASS_B = 'MatKhau324B-xq';
// Thu tu lenh dang nhap ky vong KHI CO buoc tat ban phim (3.2.4):
// 'key:back' phai nam giua moi lan nhap va lan bam nut thanh cong.
const EXPECTED_SEQ_KB = [
  'open_google_signin',
  'input_text(email):' + EMAIL_A,
  'key:back',
  'tap_text:次へ',
  'input_text(password):********',
  'key:back',
  'tap_text:次へ'
];
// Thu tu lenh dang nhap cua cac ban truoc (loc bo 'key:back').
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

// Trich doan dang nhap tu cmdLog, GIU 'key:back' (buoc tat ban phim
// 3.2.4) — dung cho truong hop (a).
function signinSeqKb(cmdLog) {
  const from = Math.max(0, cmdLog.lastIndexOf('open_google_signin'));
  return cmdLog.slice(from).filter((e) => e === 'open_google_signin' || e === 'key:back' ||
    e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
}

// Trich doan dang nhap theo kieu cac ban truoc (khong co 'key:back')
// — dung cho truong hop (b).
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

    // ---------- 1. FAKE_KEYBOARD_SHIFT=1 + kho Gmail ----------
    console.log('== Fake agent (FAKE_KEYBOARD_SHIFT=1) + nhap kho Gmail ==');
    fake = startFake({ FAKE_KEYBOARD_SHIFT: '1' });
    const dev = await waitDeviceOnline();
    check('may ao (keyboard-shift) online', true, dev.label + ' / ' + dev.model);

    let r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A + '\n' + EMAIL_B + '|' + PASS_B });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));

    // ---------- 2. Flow voi ban phim mo lam lech bounds nut ----------
    console.log('== Flow cap-gmail-tu-dong voi FAKE_KEYBOARD_SHIFT=1 ==');
    await runGmailFlow('(a)');
    const cmdLogA = await getCmdLog();
    const seqKb = signinSeqKb(cmdLogA);
    check('(a) dung thu tu lenh: nhap email -> key:back -> bam Tiep theo -> nhap mat khau -> key:back -> bam Tiep theo',
      JSON.stringify(seqKb) === JSON.stringify(EXPECTED_SEQ_KB), 'nhan duoc: ' + JSON.stringify(seqKb));
    const kbIdx = seqKb.indexOf('key:back');
    const emailIdx = seqKb.indexOf('input_text(email):' + EMAIL_A);
    const nextIdx = seqKb.indexOf('tap_text:次へ');
    check('(a) key:back nam giua input_text(email) va lan bam Tiep theo thanh cong',
      kbIdx > emailIdx && kbIdx < nextIdx && emailIdx >= 0,
      'emailIdx=' + emailIdx + ', keyBackIdx=' + kbIdx + ', nextIdx=' + nextIdx);
    const kbCount = seqKb.filter((e) => e === 'key:back').length;
    check('(a) ca hai buoc nhap deu co key:back (email + mat khau)', kbCount === 2, 'so key:back: ' + kbCount);
    check('(a) duong vui khong co su kien thu-lai nao (tat ban phim xong la qua trang ngay vong dau)',
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
    check('(b) dung thu tu lenh dang nhap nhu truoc (loc bo key:back)',
      JSON.stringify(seqB) === JSON.stringify(EXPECTED_SEQ), 'nhan duoc: ' + JSON.stringify(seqB));

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
