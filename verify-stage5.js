// verify-stage5.js — Kiem chung vong kin Giai doan 5 (4 nang cap hoc
// tu Tokium) cho he thong Farm:
//  1. GHEP NOI QR: POST /api/pairing/new tao ma 300s + payload
//     farmpair:// + anh SVG; fake gui pairCode trong hello -> pair
//     thanh cong (pairedViaQr); ma dung lai cho may KHAC -> bi tu
//     choi 'used' (may khong bao gio online); ma het han (TTL ngan
//     qua env) -> 'expired'; ma la -> 'unknown'; may KHONG gui ma
//     van ket noi nhu cu (tuong thich nguoc).
//  2. CLAIM GMAIL (ticket + cache 12 gio): flow dung Cho cham tay
//     thi claim VAN SONG va chan may khac rut (pool_empty); goi lai
//     cho cung mot may (signin-assist) tra DUNG ticket cu, khong
//     rut them; dang nhap xong -> claim chuyen thanh assigned; het
//     han (back ngay claimExpiresAt trong file + khoi dong lai
//     server) -> tai khoan duoc giai phong cho may khac; xoa may ->
//     nha claim; flow loi (LINE chua cai) -> nha claim.
//  3. TAI KHOI DONG LAI: runs ghi xuong data/pipeline-runs.json sau
//     moi chuyen trang thai; server bi SIGKILL luc run dang Cho
//     cham tay -> khoi dong lai thay run 'waiting_manual' kem co
//     restored, resume -> chay xong, khong trung run; SIGKILL giua
//     buoc -> run 'interrupted', resume -> chay lai tu buoc do ->
//     xong; vong xem dang chay -> 'interrupted' va KHONG tu chay lai.
//  4. DANG KY LINE (Singapore + Google): pipeline dang-ky-line chay
//     dung thu tu claim Gmail -> dang nhap Google -> buoc cham tay
//     go tai khoan khac -> mo LINE -> chon Google -> chon quoc gia
//     Singapore -> xong; line-state.json + badge tren the may; bien
//     the xac minh -> dung Cho cham tay o buoc line_register, nhap
//     ma + resume -> xong; LINE chua cai -> loi app_not_installed.
// Chay: node verify-stage5.js (server tam TCP 26787 / HTTP 26080,
// nhieu lan khoi dong lai server trong cung mot script).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 26787;
const HTTP_PORT = 26080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const DATA_DIR = path.join(SERVER_DIR, 'data');

const EMAIL_A = 'stage5a@example.com', PASS_A = 'Stage5PassA!1';
const EMAIL_B = 'stage5b@example.com', PASS_B = 'Stage5PassB!2';
const EMAIL_C = 'stage5c@example.com', PASS_C = 'Stage5PassC!3';
const EMAIL_D = 'stage5d@example.com', PASS_D = 'Stage5PassD!4';
const EMAIL_F = 'stage5f@example.com', PASS_F = 'Stage5PassF!6';
const EMAIL_G = 'stage5g@example.com', PASS_G = 'Stage5PassG!7';
const EMAIL_H = 'stage5h@example.com', PASS_H = 'Stage5PassH!8';
const EMAIL_I = 'stage5i@example.com', PASS_I = 'Stage5PassI!9';
const ALL_PASS = [PASS_A, PASS_B, PASS_C, PASS_D, PASS_F, PASS_G, PASS_H, PASS_I];

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
        allResponses += s + '\n';
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

function startServer(extraEnv) {
  const child = spawn('node', [path.join(SERVER_DIR, 'server.js')], {
    env: Object.assign({}, process.env, {
      FARM_TCP_PORT: String(TCP_PORT),
      FARM_HTTP_PORT: String(HTTP_PORT),
      SERVER_LAN_IP: '127.0.0.1'
    }, extraEnv || {}),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // PHAI doc het stdout cua server (console.log) — khong doc thi
  // buffer pipe day 64KB la server bi treo giua dong ghi log.
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  return child;
}

async function waitServerUp() {
  return waitFor(async () => {
    try { const r = await req('GET', '/api/info'); return r.json && r.json.ok ? r.json : false; } catch (e) { return false; }
  }, 15000, 'server len');
}

async function killServer(child, signal) {
  if (!child) return;
  const exited = new Promise((r) => child.once('exit', r));
  try { child.kill(signal || 'SIGKILL'); } catch (e) {}
  await Promise.race([exited, sleep(5000)]);
  await sleep(300);
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
function killFake(child) { if (child) { try { child.kill(); } catch (e) {} } }

async function getDevice(id) {
  const r = await req('GET', '/api/devices');
  return ((r.json && r.json.devices) || []).find((x) => x.id === id) || null;
}
async function waitOnline(id) {
  return waitFor(async () => {
    const d = await getDevice(id);
    return d && d.online ? d : false;
  }, 15000, 'may ' + id + ' online');
}
async function getRunDevice(runId, deviceId) {
  const rr = await req('GET', '/api/pipeline/runs');
  const run = ((rr.json && rr.json.runs) || []).find((x) => x.id === runId);
  if (!run) return null;
  return run.devices.find((x) => x.deviceId === deviceId) || null;
}
async function waitRunStatus(runId, deviceId, status, timeoutMs) {
  return waitFor(async () => {
    const d = await getRunDevice(runId, deviceId);
    return d && d.status === status ? d : false;
  }, timeoutMs || 120000, 'run ' + runId + ' may ' + deviceId + ' -> ' + status);
}
async function getClaims() {
  const r = await req('GET', '/api/gmail/claims');
  return (r.json && r.json.claims) || [];
}
async function getGmailAccount(email) {
  const r = await req('GET', '/api/gmail');
  return ((r.json && r.json.accounts) || []).find((a) => a.email === email) || null;
}
async function getStatusData(id) {
  const r = await req('POST', '/api/cmd', { deviceId: id, cmd: 'status' });
  return (r.json && r.json.data) || {};
}

function cleanData() {
  for (const f of ['gmail-pool.json', 'heo-pool.json', 'checkin-state.json',
    'pipeline-runs.json', 'watch-state.json', 'line-state.json']) {
    try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (e) {}
  }
}

async function main() {
  cleanData();
  let server = null;
  const fakes = [];
  const F = (env) => { const c = startFake(env); fakes.push(c); return c; };
  try {
    // ================= GIAI DOAN 5.1 — GHEP NOI QR =================
    console.log('== Khoi dong server S1 ==');
    server = startServer({});
    await waitServerUp();
    check('server khoi dong, /api/info ok', true);

    console.log('== 1. Ghep noi bang QR ==');
    let r = await req('POST', '/api/pairing/new');
    check('POST /api/pairing/new -> ok + code + han 300s',
      !!(r.json && r.json.ok && r.json.code && r.json.ttlSeconds === 300), JSON.stringify(r.json && { code: r.json.code, ttlSeconds: r.json.ttlSeconds }));
    const pairCode = r.json.code;
    check('payload farmpair:// chua host + cong agent + ma',
      r.json.payload === 'farmpair://pair?h=127.0.0.1&p=' + TCP_PORT + '&c=' + pairCode, r.json.payload);
    check('co anh QR dang SVG', typeof r.json.svg === 'string' && r.json.svg.indexOf('<svg') >= 0);
    r = await req('GET', '/api/pairing');
    check('GET /api/pairing -> phien dang song, cung ma',
      !!(r.json && r.json.active === true && r.json.code === pairCode));

    F({ FAKE_ANDROID_ID: 's5-pair-1', FAKE_PAIR_CODE: pairCode });
    const dPair1 = await waitOnline('s5-pair-1');
    check('may quet ma -> online + pairedViaQr=true', dPair1.pairedViaQr === true);
    r = await req('GET', '/api/pairing');
    check('phien ghep noi danh dau usedBy = may vua quet', r.json && r.json.usedBy === 's5-pair-1', r.json && r.json.usedBy);

    const fakeUsed = F({ FAKE_ANDROID_ID: 's5-pair-2', FAKE_PAIR_CODE: pairCode });
    await sleep(4000);
    const dUsed = await getDevice('s5-pair-2');
    check("ma da dung cho may khac -> bi tu choi 'used', may khong online", !dUsed || !dUsed.online);
    check('fake bi tu choi (used) tu dong ngat ket noi', fakeUsed.exitCode !== null || fakeUsed.killed);

    const fakeBogus = F({ FAKE_ANDROID_ID: 's5-pair-3', FAKE_PAIR_CODE: 'ma-khong-ton-tai-123' });
    await sleep(4000);
    const dBogus = await getDevice('s5-pair-3');
    check("ma la -> bi tu choi 'unknown', may khong online", !dBogus || !dBogus.online);
    check('fake bi tu choi (unknown) tu dong ngat ket noi', fakeBogus.exitCode !== null || fakeBogus.killed);

    F({ FAKE_ANDROID_ID: 's5-pair-4' });
    const dNoCode = await waitOnline('s5-pair-4');
    check('may KHONG gui pairCode van ket noi nhu cu (tuong thich nguoc)', dNoCode.online === true && !dNoCode.pairedViaQr);

    // ---- Ma het han: server rieng voi TTL 1.5 giay ----
    console.log('== 1b. Ma ghep noi het han (TTL ngan) ==');
    await killServer(server);
    server = startServer({ PAIRING_TTL_MS: '1500' });
    await waitServerUp();
    r = await req('POST', '/api/pairing/new');
    const shortCode = r.json.code;
    check('tao ma TTL ngan ok', !!shortCode);
    await sleep(2200);
    const fakeExp = F({ FAKE_ANDROID_ID: 's5-pair-5', FAKE_PAIR_CODE: shortCode });
    await sleep(4000);
    const dExp = await getDevice('s5-pair-5');
    check("ma het han -> bi tu choi 'expired', may khong online", !dExp || !dExp.online);
    check('fake bi tu choi (expired) tu dong ngat ket noi', fakeExp.exitCode !== null || fakeExp.killed);
    await killServer(server);
    server = startServer({});
    await waitServerUp();
    check('server S2 (TTL mac dinh) khoi dong lai ok', true);

    // ================= GIAI DOAN 5.2 — CLAIM GMAIL =================
    console.log('== 2. Claim Gmail: ticket + cache 12 gio ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_A + '|' + PASS_A });
    check('gmail import added=1', r.json && r.json.added === 1, JSON.stringify(r.json));

    F({ FAKE_ANDROID_ID: 's5-c1', FAKE_VERIFY: '1' });
    await waitOnline('s5-c1');
    F({ FAKE_ANDROID_ID: 's5-c2' });
    await waitOnline('s5-c2');

    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-c1'], params: {} });
    const c1Run = r.json.runId;
    check('C1: chay cap-gmail-tu-dong ok', !!(r.json && r.json.ok && c1Run));
    const c1Parked = await waitRunStatus(c1Run, 's5-c1', 'waiting_manual');
    check('C1: dung Cho cham tay khi Google bat xac minh (FAKE_VERIFY=1)', true,
      c1Parked.steps.map((s) => s.type + ':' + s.status).join(','));

    let claims = await getClaims();
    check('C1 dang giu 1 claim Gmail (ticket + may giu + han 12 gio)',
      claims.length === 1 && claims[0].deviceId === 's5-c1' && !!claims[0].ticket &&
      claims[0].email === EMAIL_A && !!claims[0].expiresAt, JSON.stringify(claims));
    const ticket1 = claims[0].ticket;
    r = await req('GET', '/api/gmail');
    check("tai khoan bi giu: van 'ready' nhung ready-rut-duoc = 0, account.claim hien dung may",
      r.json.ready === 0 && r.json.accounts[0].claim && r.json.accounts[0].claim.deviceId === 's5-c1');

    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-c2'], params: {} });
    const c2Run = r.json.runId;
    const c2Err = await waitRunStatus(c2Run, 's5-c2', 'error');
    check('C2: kho chi con tai khoan dang bi C1 giu -> pool_empty, run loi o buoc cap',
      (c2Err.steps[0].note || '').indexOf('pool_empty') >= 0, c2Err.steps[0].note);

    // Cache 12 gio: goi lai cho CHINH may dang giu (signin-assist) ->
    // dung lai dung tai khoan + dung ticket, khong rut them.
    r = await req('POST', '/api/gmail/signin-assist', { deviceId: 's5-c1' });
    check("signin-assist tren may dang giu claim -> outcome 'verify' (van bi xac minh), claim khong bi nha",
      !!(r.json && r.json.outcome === 'verify' && r.json.email === EMAIL_A), JSON.stringify(r.json && { outcome: r.json.outcome, email: r.json.email }));
    claims = await getClaims();
    check('cache 12 gio: van dung ticket cu, van chi 1 claim, khong rut them tai khoan',
      claims.length === 1 && claims[0].ticket === ticket1, JSON.stringify(claims));

    // Nguoi dung xu ly xac minh xong (mo lai app khac cho man hinh
    // dang nhap bien mat) -> resume -> dang nhap xong -> claim
    // chuyen thanh assigned.
    r = await req('POST', '/api/cmd', { deviceId: 's5-c1', cmd: 'open_app', args: { 'package': 'com.zhiliaoapp.musically.go' } });
    check('mo phong xu ly tay xong xac minh (open_app)', !!(r.json && r.json.ok));
    r = await req('POST', '/api/pipeline/resume', { runId: c1Run, deviceId: 's5-c1' });
    check('resume run C1 ok', !!(r.json && r.json.ok));
    await waitRunStatus(c1Run, 's5-c1', 'done');
    check('C1: run hoan thanh sau resume', true);
    claims = await getClaims();
    const acctA = await getGmailAccount(EMAIL_A);
    check('claim chuyen thanh assigned cho C1 khi dang nhap xong',
      claims.length === 0 && acctA && acctA.status === 'assigned' && acctA.deviceId === 's5-c1',
      JSON.stringify(acctA && { status: acctA.status, deviceId: acctA.deviceId }));

    // ---- Het han claim: back ngay trong file + khoi dong lai ----
    console.log('== 2b. Claim het han -> giai phong cho may khac ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_B + '|' + PASS_B });
    check('gmail import them EMAIL_B', r.json && r.json.added === 1);
    F({ FAKE_ANDROID_ID: 's5-c5', FAKE_VERIFY: '1' });
    await waitOnline('s5-c5');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-c5'], params: {} });
    const c5Run = r.json.runId;
    await waitRunStatus(c5Run, 's5-c5', 'waiting_manual');
    claims = await getClaims();
    check('C5 dang giu claim EMAIL_B', claims.length === 1 && claims[0].email === EMAIL_B && claims[0].deviceId === 's5-c5');

    const poolFile = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'gmail-pool.json'), 'utf8'));
    const acctBFile = poolFile.accounts.find((a) => a.email === EMAIL_B);
    acctBFile.claimExpiresAt = new Date(Date.now() - 60000).toISOString();
    fs.writeFileSync(path.join(DATA_DIR, 'gmail-pool.json'), JSON.stringify(poolFile, null, 2));
    check('da back ngay claimExpiresAt cua EMAIL_B ve qua khu trong file pool', true);

    await killServer(server);
    server = startServer({});
    const infoAfterExpiry = await waitServerUp();
    claims = await getClaims();
    check('server khoi dong lai: sweep het han -> claim EMAIL_B da duoc nha',
      claims.length === 0, JSON.stringify(claims));
    const c5Restored = await getRunDevice(c5Run, 's5-c5');
    check('run cua C5 (dang Cho cham tay luc server sap) duoc khoi phuc waiting_manual + restored',
      !!c5Restored && c5Restored.status === 'waiting_manual' && c5Restored.restored === true,
      c5Restored && c5Restored.status);
    check('/api/info bao so run da khoi phuc >= 1', (infoAfterExpiry.restoredRuns || 0) >= 1,
      'restoredRuns=' + infoAfterExpiry.restoredRuns);
    r = await req('POST', '/api/pipeline/stop', { runId: c5Run });
    check('stop run khoi phuc ok', !!(r.json && r.json.ok));
    await waitRunStatus(c5Run, 's5-c5', 'stopped');
    check('run khoi phuc dung han (stopped)', true);

    F({ FAKE_ANDROID_ID: 's5-c2' });
    await waitOnline('s5-c2');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-c2'], params: {} });
    const c2Run2 = r.json.runId;
    await waitRunStatus(c2Run2, 's5-c2', 'done');
    const acctB = await getGmailAccount(EMAIL_B);
    check('EMAIL_B het han claim -> may khac (C2) rut duoc va dang nhap xong -> assigned',
      !!acctB && acctB.status === 'assigned' && acctB.deviceId === 's5-c2',
      JSON.stringify(acctB && { status: acctB.status, deviceId: acctB.deviceId }));

    // ================= GIAI DOAN 5.3 — SONG SOT QUA KHOI DONG LAI =================
    console.log('== 3a. Khoi phuc run Cho cham tay -> resume -> xong, khong trung run ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_C + '|' + PASS_C });
    check('gmail import them EMAIL_C', r.json && r.json.added === 1);
    F({ FAKE_ANDROID_ID: 's5-r1', FAKE_VERIFY: '1' });
    await waitOnline('s5-r1');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-r1'], params: {} });
    const r1Run = r.json.runId;
    await waitRunStatus(r1Run, 's5-r1', 'waiting_manual');
    const runsFile1 = fs.readFileSync(path.join(DATA_DIR, 'pipeline-runs.json'), 'utf8');
    check('pipeline-runs.json tren dia co run + trang thai waiting_manual',
      runsFile1.indexOf(r1Run) >= 0 && runsFile1.indexOf('waiting_manual') >= 0);
    await killServer(server);
    server = startServer({});
    await waitServerUp();
    const r1Restored = await getRunDevice(r1Run, 's5-r1');
    check('sau khoi dong lai: run van waiting_manual + restored=true',
      !!r1Restored && r1Restored.status === 'waiting_manual' && r1Restored.restored === true);
    r = await req('GET', '/api/pipeline/runs');
    const sameRuns = (r.json.runs || []).filter((x) => x.id === r1Run);
    check('khong bi trung run sau khoi phuc (dung 1 ban ghi)', sameRuns.length === 1, 'count=' + sameRuns.length);
    F({ FAKE_ANDROID_ID: 's5-r1', FAKE_VERIFY: '1' });
    await waitOnline('s5-r1');
    r = await req('POST', '/api/pipeline/resume', { runId: r1Run, deviceId: 's5-r1' });
    check('resume run khoi phuc -> ok + restored:true', !!(r.json && r.json.ok && r.json.restored === true), JSON.stringify(r.json));
    await waitRunStatus(r1Run, 's5-r1', 'done');
    check('run khoi phuc chay tiep den done', true);
    const acctC = await getGmailAccount(EMAIL_C);
    check('resume run khoi phuc: claim EMAIL_C chuyen thanh assigned cho R1',
      !!acctC && acctC.status === 'assigned' && acctC.deviceId === 's5-r1');

    console.log('== 3b. Server sap giua buoc -> interrupted -> resume chay lai tu buoc do ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_D + '|' + PASS_D });
    check('gmail import them EMAIL_D', r.json && r.json.added === 1);
    F({ FAKE_ANDROID_ID: 's5-r2' });
    await waitOnline('s5-r2');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-r2'], params: {} });
    const r2Run = r.json.runId;
    check('R2: bat dau run', !!r2Run);
    await sleep(400); // server sap ngay khi run dang o giua buoc dang nhap
    await killServer(server);
    server = startServer({});
    await waitServerUp();
    const r2Restored = await getRunDevice(r2Run, 's5-r2');
    check("run dang do -> khoi phuc voi trang thai 'interrupted'",
      !!r2Restored && r2Restored.status === 'interrupted', r2Restored && r2Restored.status);
    F({ FAKE_ANDROID_ID: 's5-r2' });
    await waitOnline('s5-r2');
    r = await req('POST', '/api/pipeline/resume', { runId: r2Run, deviceId: 's5-r2' });
    check('resume run interrupted -> ok + restored:true', !!(r.json && r.json.ok && r.json.restored === true));
    await waitRunStatus(r2Run, 's5-r2', 'done', 180000);
    check('run interrupted chay lai tu buoc do -> done', true);
    const acctD = await getGmailAccount(EMAIL_D);
    check('EMAIL_D assigned cho R2 sau khi chay lai',
      !!acctD && acctD.status === 'assigned' && acctD.deviceId === 's5-r2');

    console.log('== 3c. Vong xem dang chay -> interrupted, khong tu chay lai ==');
    F({ FAKE_ANDROID_ID: 's5-r3' });
    await waitOnline('s5-r3');
    r = await req('POST', '/api/watch/start', { deviceIds: ['s5-r3'], minutes: 5 });
    check('bat dau vong xem ok', !!(r.json && r.json.ok !== false), JSON.stringify(r.json).slice(0, 120));
    await waitFor(async () => {
      const d = await getDevice('s5-r3');
      return d && d.watch && d.watch.status === 'watching' ? d : false;
    }, 30000, 'vong xem dang watching');
    check('vong xem dang watching truoc khi server sap', true);
    await killServer(server);
    server = startServer({});
    await waitServerUp();
    // Ban ghi may chi ton tai trong bo nho server (tao khi hello) —
    // may ket noi lai thi the may moi gan lai duoc vong xem da khoi phuc.
    F({ FAKE_ANDROID_ID: 's5-r3' });
    await waitOnline('s5-r3');
    const dR3 = await getDevice('s5-r3');
    check("vong xem khoi phuc voi trang thai 'interrupted'",
      !!dR3 && !!dR3.watch && dR3.watch.status === 'interrupted', dR3 && dR3.watch && dR3.watch.status);
    await sleep(3000);
    const dR3b = await getDevice('s5-r3');
    check('vong xem KHONG tu chay lai sau khoi dong lai',
      !!dR3b && !!dR3b.watch && dR3b.watch.status === 'interrupted');

    // ================= GIAI DOAN 5.4 — DANG KY LINE =================
    console.log('== 4. Dang ky LINE (Singapore + Google) ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_F + '|' + PASS_F + '\n' + EMAIL_G + '|' + PASS_G + '\n' + EMAIL_H + '|' + PASS_H });
    check('gmail import them F/G/H', r.json && r.json.added === 3, JSON.stringify(r.json));
    r = await req('GET', '/api/pipelines');
    const pipeIds = (r.json.pipelines || []).map((p) => p.id).join(',');
    check("co pipeline 'dang-ky-line' trong /api/pipelines", pipeIds.indexOf('dang-ky-line') >= 0, pipeIds);

    // ---- Duong binh thuong ----
    F({ FAKE_ANDROID_ID: 's5-l1' });
    await waitOnline('s5-l1');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-ky-line', deviceIds: ['s5-l1'], params: {} });
    const l1Run = r.json.runId;
    check('L1: chay dang-ky-line ok', !!(r.json && r.json.ok && l1Run));
    const l1Manual = await waitRunStatus(l1Run, 's5-l1', 'waiting_manual', 180000);
    check('L1: dung o buoc cham tay go tai khoan Google khac (buoc 3)',
      l1Manual.currentStep === 2 && l1Manual.steps[2].type === 'manual',
      'currentStep=' + l1Manual.currentStep + ' steps=' + l1Manual.steps.map((s) => s.type + ':' + s.status).join(','));
    check('L1: thu tu buoc — cap Gmail + dang nhap Google xong TRUOC buoc cham tay',
      l1Manual.steps[0].type === 'assign_gmail' && l1Manual.steps[0].status === 'done' &&
      l1Manual.steps[1].type === 'gmail_signin' && l1Manual.steps[1].status === 'done');
    r = await req('POST', '/api/pipeline/resume', { runId: l1Run, deviceId: 's5-l1' });
    check('L1: resume buoc cham tay ok', !!(r.json && r.json.ok));
    const l1Done = await waitRunStatus(l1Run, 's5-l1', 'done', 180000);
    check('L1: dang ky LINE hoan thanh (mo LINE -> Google -> Singapore -> home)',
      l1Done.steps.every((s) => s.status === 'done'),
      l1Done.steps.map((s) => s.type + ':' + s.status).join(','));
    const l1Status = await getStatusData('s5-l1');
    check('L1: openAppLog chi mo LINE (jp.naver.line.android) sau khi da co Gmail',
      Array.isArray(l1Status.openAppLog) && l1Status.openAppLog.indexOf('jp.naver.line.android') >= 0,
      JSON.stringify(l1Status.openAppLog));
    const dL1 = await getDevice('s5-l1');
    check('L1: the may co trang thai LINE done (badge)', !!(dL1 && dL1.line && dL1.line.done === true), JSON.stringify(dL1 && dL1.line));
    const lineFile = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'line-state.json'), 'utf8'));
    check('line-state.json tren dia ghi nhan L1 (doneAt + email Gmail da cap)',
      !!(lineFile['s5-l1'] && !!lineFile['s5-l1'].doneAt && lineFile['s5-l1'].email === EMAIL_F),
      JSON.stringify(lineFile['s5-l1']));
    const acctF = await getGmailAccount(EMAIL_F);
    check('L1: claim EMAIL_F da chuyen thanh assigned',
      !!acctF && acctF.status === 'assigned' && acctF.deviceId === 's5-l1');

    // ---- Bien the xac minh: dung Cho cham tay o buoc line_register ----
    F({ FAKE_ANDROID_ID: 's5-l2', FAKE_LINE_VERIFY: '1' });
    await waitOnline('s5-l2');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-ky-line', deviceIds: ['s5-l2'], params: {} });
    const l2Run = r.json.runId;
    const l2Manual = await waitRunStatus(l2Run, 's5-l2', 'waiting_manual', 180000);
    check('L2: dung buoc cham tay go tai khoan (buoc 3)', l2Manual.currentStep === 2);
    r = await req('POST', '/api/pipeline/resume', { runId: l2Run, deviceId: 's5-l2' });
    check('L2: resume buoc cham tay ok', !!(r.json && r.json.ok));
    const l2Parked = await waitFor(async () => {
      const d = await getRunDevice(l2Run, 's5-l2');
      return d && d.status === 'waiting_manual' && d.currentStep === 4 ? d : false;
    }, 180000, 'L2 dung Cho cham tay o buoc line_register');
    check('L2: LINE bat xac minh -> dung Cho cham tay o buoc line_register (buoc 5)',
      l2Parked.steps[4].type === 'line_register' && l2Parked.steps[4].status === 'waiting_manual',
      l2Parked.steps[4].note);
    // Nguoi dung nhap ma xac minh tren may (mo phong bang lenh truc tiep)
    r = await req('POST', '/api/cmd', { deviceId: 's5-l2', cmd: 'input_text', args: { text: '654321' } });
    check('L2: nhap ma xac minh (lenh truc tiep) ok', !!(r.json && r.json.ok));
    r = await req('POST', '/api/cmd', { deviceId: 's5-l2', cmd: 'tap_text', args: { text: '次へ' } });
    check('L2: bam Tiep theo sau khi nhap ma ok', !!(r.json && r.json.ok));
    r = await req('POST', '/api/pipeline/resume', { runId: l2Run, deviceId: 's5-l2' });
    check('L2: resume sau xac minh ok', !!(r.json && r.json.ok));
    await waitRunStatus(l2Run, 's5-l2', 'done', 180000);
    check('L2: dang ky LINE hoan thanh sau xac minh', true);
    const dL2 = await getDevice('s5-l2');
    check('L2: badge LINE done tren the may', !!(dL2 && dL2.line && dL2.line.done === true));

    // ---- LINE chua cai: loi app_not_installed + nha claim ----
    F({ FAKE_ANDROID_ID: 's5-l3', FAKE_LINE_NOT_INSTALLED: '1' });
    await waitOnline('s5-l3');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-ky-line', deviceIds: ['s5-l3'], params: {} });
    const l3Run = r.json.runId;
    const l3Manual = await waitRunStatus(l3Run, 's5-l3', 'waiting_manual', 180000);
    check('L3: dung buoc cham tay (buoc 3) nhu binh thuong', l3Manual.currentStep === 2);
    // Den buoc cham tay thi dang nhap Google da xong: claim EMAIL_H
    // da chuyen thanh assigned (dung thiet ke — claim chi song tu
    // luc rut den luc dang nhap xong).
    const acctH0 = await getGmailAccount(EMAIL_H);
    claims = await getClaims();
    check('L3: claim EMAIL_H da chuyen assigned cho L3 truoc buoc cham tay',
      !!acctH0 && acctH0.status === 'assigned' && acctH0.deviceId === 's5-l3' &&
      !claims.some((c) => c.deviceId === 's5-l3'),
      JSON.stringify(acctH0 && { status: acctH0.status, deviceId: acctH0.deviceId }));
    r = await req('POST', '/api/pipeline/resume', { runId: l3Run, deviceId: 's5-l3' });
    const l3Err = await waitRunStatus(l3Run, 's5-l3', 'error', 120000);
    check('L3: buoc mo LINE loi app_not_installed ro rang',
      l3Err.steps[3].status === 'error' && (l3Err.steps[3].note || '').indexOf('app_not_installed') >= 0,
      l3Err.steps[3].note);
    const acctH1 = await getGmailAccount(EMAIL_H);
    check('L3: flow loi o buoc sau dang nhap -> assigned GIU NGUYEN (chi claim song moi bi nha)',
      !!acctH1 && acctH1.status === 'assigned' && acctH1.deviceId === 's5-l3');

    // ================= FLOW LOI + XOA MAY -> NHA CLAIM =================
    console.log('== 5. Flow loi giua chung + xoa may -> nha claim dang song ==');
    r = await req('POST', '/api/gmail/import', { text: EMAIL_I + '|' + PASS_I });
    check('gmail import them EMAIL_I', r.json && r.json.added === 1);
    // May khong online: buoc cap giu claim xong buoc dang nhap loi
    // ngay (khong gui duoc lenh) -> claim phai duoc nha.
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-off0'], params: {} });
    const d0Run = r.json.runId;
    check('D0 (may offline): chay pipeline ok', !!(r.json && r.json.ok && d0Run));
    await waitRunStatus(d0Run, 's5-off0', 'error', 60000);
    check('D0: run loi vi may offline', true);
    claims = await getClaims();
    const acctI0 = await getGmailAccount(EMAIL_I);
    check('D0: flow loi -> claim EMAIL_I duoc nha, tai khoan quay ve san sang',
      !claims.some((c) => c.deviceId === 's5-off0') && !!acctI0 && acctI0.status === 'ready',
      JSON.stringify(acctI0 && { status: acctI0.status }));

    F({ FAKE_ANDROID_ID: 's5-d1', FAKE_VERIFY: '1' });
    await waitOnline('s5-d1');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-gmail-tu-dong', deviceIds: ['s5-d1'], params: {} });
    const d1Run = r.json.runId;
    await waitRunStatus(d1Run, 's5-d1', 'waiting_manual');
    claims = await getClaims();
    check('D1 dang giu claim EMAIL_I', claims.some((c) => c.deviceId === 's5-d1' && c.email === EMAIL_I));
    r = await req('POST', '/api/devices/delete', { deviceId: 's5-d1' });
    check('xoa may D1 ok', !!(r.json && r.json.ok));
    claims = await getClaims();
    const acctI = await getGmailAccount(EMAIL_I);
    check('xoa may -> claim duoc nha, EMAIL_I quay ve san sang',
      !claims.some((c) => c.deviceId === 's5-d1') && !!acctI && acctI.status === 'ready',
      JSON.stringify(acctI && { status: acctI.status }));

    // ================= DASHBOARD + RO RI MAT KHAU =================
    console.log('== 6. Dashboard + quet ro ri mat khau ==');
    r = await req('GET', '/');
    check('dashboard co khoi Ghep noi bang QR (pairNew + /api/pairing/new)',
      r.status === 200 && r.text.indexOf('Ghép nối bằng QR') >= 0 && r.text.indexOf('pairNew') >= 0 && r.text.indexOf('/api/pairing/new') >= 0);
    check('dashboard co the tac vu Dang ky LINE + nut taskLineReg',
      r.text.indexOf('Đăng ký LINE (Singapore + Google)') >= 0 && r.text.indexOf('taskLineReg') >= 0 && r.text.indexOf('dang-ky-line') >= 0);
    check('dashboard hien trang thai claim Gmail + badge LINE',
      r.text.indexOf('Đang giữ bởi') >= 0 && r.text.indexOf('LINE ✔') >= 0);
    for (const p of ALL_PASS) {
      check('mat khau ' + p.slice(0, 10) + '... khong lo trong bat ky response nao', allResponses.indexOf(p) < 0);
    }
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    for (const f of fakes) killFake(f);
    try { if (server) server.kill('SIGKILL'); } catch (e) {}
    cleanData();
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
