// verify-stage32.js — Kiem chung vong kin Giai doan 3.2 (kho heo + dang
// nhap TikTok Lite tu dong + diem danh 14 ngay + check heo bang link
// game chuyen dung + dashboard 4 tab).
// Chay: node verify-stage32.js   (tu khoi dong server tam tren cong
// 21787/21080 + fake agent co may trang thai dang nhap TikTok Lite,
// kiem tra:
//  (a) kho heo: import trung/hong, list luon che mat khau, assign-next,
//      mark-die/delete,
//  (b) flow dang-nhap-tiktok-lite chay den done, fake agent nhan dung
//      thu tu lenh: open_app -> tap_text(ログイン) -> input_text(ttuser)
//      -> tap_text(次へ) -> input_text(password) -> tap_text(ログイン),
//      tai khoan duoc ghi loggedInAt,
//  (c) mat khau heo KHONG xuat hien trong BAT KY response API / su kien
//      nao (quet toan phien nhu Giai doan 3.1),
//  (d) FAKE_TT_VERIFY=1: flow dung waiting_manual voi dung ghi chu xac
//      minh cua TikTok,
//  (e) diem-danh: ghi ngay 1, chay lai bao "da diem danh roi", trang
//      thai luu trong checkin-state.json, reset duoc,
//  (f) /api/game-link luu + doc lai link game chuyen dung; check heo
//      (watch + detect) phat hien thanh cong qua link; xem video thuong
//      (detect:false) KHONG phat hien thanh cong,
//  (g) dashboard: 4 tab dung thu tu, Dan may la mac dinh.
// Don dep du lieu test sau khi chay (giu flow-config.json).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 21787;
const HTTP_PORT = 21080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';
const USER_A = 'nikheo_a1';
const PASS_A = 'HeoPass32A-xq';
const USER_B = 'nikheo_b2';
const PASS_B = 'HeoPass32B-xq';
const USER_C = 'nikheo_c3';
const PASS_C = 'HeoPass32C-xq';
const GAME_URL = 'https://example.com/game-heo-chuyen-dung';
const TT_VERIFY_NOTE = 'Máy đang ở bước xác minh của TikTok — xử lý chạm tay trên máy rồi bấm Chạy tiếp';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function todayTokyo() {
  try {
    const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch (e) {}
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

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
      SERVER_LAN_IP: '192.168.1.50',
      FARM_WATCH_MIN_SEC: '1',
      FARM_WATCH_MAX_SEC: '2'
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

    // ---------- 1. Fake agent + kho heo ----------
    console.log('== Fake agent + kho tai khoan xem heo ==');
    fake = startFake({});
    const dev = await waitDeviceOnline();
    check('may ao online', true, dev.label + ' / ' + dev.model);
    check('the may chua co TK heo + diem danh 0/14',
      dev.heoAssigned === null && !!dev.checkin && dev.checkin.count === 0);

    let r = await req('POST', '/api/heo/import', {
      text: USER_A + '|' + PASS_A + '\n' + USER_B + ':' + PASS_B + '\n' + USER_A + '|' + PASS_A + '\ndonghongkhongcodauchia'
    });
    check('(a) heo import added=2, skipped=1 (1 trung, 1 hong)', r.json && r.json.added === 2 && r.json.skipped === 1, JSON.stringify(r.json));
    r = await req('GET', '/api/heo');
    check('(a) heo list: 2 tai khoan, mat khau che, khong lo pass that',
      r.json && r.json.accounts.length === 2 && r.json.ready === 2 &&
      r.text.indexOf(PASS_A) < 0 && r.text.indexOf(PASS_B) < 0 && r.text.indexOf('********') >= 0);

    r = await req('POST', '/api/heo/assign-next', { deviceId: FAKE_ID });
    check('(a) assign-next ok + dung tai khoan dau kho',
      r.json && r.json.ok === true && r.json.account && r.json.account.username === USER_A && r.json.account.passwordMasked === '********',
      JSON.stringify(r.json && r.json.account));
    r = await req('GET', '/api/devices');
    const dev2 = (r.json.devices || []).find((x) => x.id === FAKE_ID);
    check('(a) the may hien TK heo da cap', !!dev2 && dev2.heoAssigned === USER_A, dev2 && dev2.heoAssigned);

    // mark-die + delete tren tai khoan C
    r = await req('POST', '/api/heo/import', { text: USER_C + '|' + PASS_C });
    check('(a) import them C added=1', r.json && r.json.added === 1);
    r = await req('GET', '/api/heo');
    const acctC = (r.json.accounts || []).find((a) => a.username === USER_C);
    r = await req('POST', '/api/heo/mark-die', { id: acctC.id });
    check('(a) mark-die C ok', r.json && r.json.ok === true && r.json.account.status === 'die');
    r = await req('POST', '/api/heo/delete', { id: acctC.id });
    check('(a) delete C ok', r.json && r.json.ok === true);
    r = await req('GET', '/api/heo');
    check('(a) kho con 2 tai khoan sau delete', r.json && r.json.accounts.length === 2);

    // ---------- 2. Link game chuyen dung ----------
    console.log('== Link game chuyen dung (/api/game-link) ==');
    r = await req('GET', '/api/game-link');
    check('(f) game-link ban dau rong', r.json && r.json.ok === true && r.json.url === '', JSON.stringify(r.json));
    r = await req('POST', '/api/game-link', { url: GAME_URL });
    check('(f) luu game-link ok', r.json && r.json.ok === true && r.json.url === GAME_URL);
    r = await req('GET', '/api/game-link');
    check('(f) doc lai game-link dung', r.json && r.json.url === GAME_URL);
    const glFile = path.join(SERVER_DIR, 'data', 'game-link.json');
    check('(f) file game-link.json da luu tren dia',
      fs.existsSync(glFile) && fs.readFileSync(glFile, 'utf8').indexOf(GAME_URL) >= 0);

    // ---------- 3. Flow dang nhap TikTok Lite ----------
    console.log('== Flow dang-nhap-tiktok-lite (duong binh thuong) ==');
    r = await req('GET', '/api/pipelines');
    const pipeIds = (r.json.pipelines || []).map((p) => p.id).join(',');
    check('co flow dang-nhap-tiktok-lite + diem-danh trong /api/pipelines',
      pipeIds.indexOf('dang-nhap-tiktok-lite') >= 0 && pipeIds.indexOf('diem-danh') >= 0, pipeIds);
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-nhap-tiktok-lite', deviceIds: [FAKE_ID], params: {} });
    check('dang-nhap-tiktok-lite start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const loginRunId = r.json.runId;
    const drLogin = await waitFor(async () => {
      const d = await getRunDevice(loginRunId);
      return d && d.status === 'done' ? d : false;
    }, 90000, 'dang-nhap-tiktok-lite done');
    check('(b) flow dang nhap hoan thanh (done)', true, drLogin.steps.map((s) => s.type + ':' + s.status).join(','));
    check('(b) buoc assign_heo done + ghi username duoc cap',
      drLogin.steps[0].status === 'done' && (drLogin.steps[0].note || '').indexOf(USER_A) >= 0, drLogin.steps[0].note);
    check('(b) buoc tiktok_login done + ghi da dang nhap',
      drLogin.steps[1].status === 'done' && (drLogin.steps[1].note || '').indexOf('Đã đăng nhập TikTok Lite') >= 0, drLogin.steps[1].note);

    // ---------- 4. Thu tu lenh agent nhan duoc ----------
    console.log('== Thu tu lenh dang nhap TikTok (cmdLog) ==');
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
    const cmdLog = (r.json && r.json.data && r.json.data.cmdLog) || [];
    const seq = cmdLog.filter((e) => e === 'open_app' || e.indexOf('input_text') === 0 || e.indexOf('tap_text') === 0);
    const expected = [
      'open_app',
      'tap_text:ログイン',
      'input_text(ttuser):' + USER_A,
      'tap_text:次へ',
      'input_text(password):********',
      'tap_text:ログイン'
    ];
    check('(b) dung thu tu lenh dang nhap TikTok', JSON.stringify(seq) === JSON.stringify(expected),
      'nhan duoc: ' + JSON.stringify(seq));

    r = await req('GET', '/api/heo');
    const acctA = (r.json.accounts || []).find((a) => a.username === USER_A);
    check('(b) tai khoan A da ghi loggedInAt', !!acctA && !!acctA.loggedInAt, acctA && acctA.loggedInAt);
    r = await req('GET', '/api/events');
    const ttEvents = (r.json.events || []).filter((e) => e.type === 'tiktok_login');
    check('co su kien tiktok_login + ghi username + hoan tat',
      ttEvents.length >= 4 && ttEvents.some((e) => (e.message || '').indexOf(USER_A) >= 0) &&
      ttEvents.some((e) => (e.message || '').indexOf('hoàn tất') >= 0),
      ttEvents.map((e) => e.message).join(' | '));

    // ---------- 5. FAKE_TT_VERIFY=1: dung Cho cham tay ----------
    console.log('== Fake agent (FAKE_TT_VERIFY=1) — TikTok bat xac minh ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_TT_VERIFY: '1' });
    await waitDeviceOnline();
    check('fake tt-verify online', true);
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-nhap-tiktok-lite', deviceIds: [FAKE_ID], params: {} });
    check('dang-nhap (verify) start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const vRunId = r.json.runId;
    const drWait = await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 90000, 'flow dung o waiting_manual khi TikTok bat xac minh');
    check('(d) flow dung o waiting_manual khi TikTok bat xac minh', true);
    const curStep = drWait.steps[drWait.currentStep];
    check('(d) ghi chu dung noi dung xac minh TikTok', !!curStep && curStep.note === TT_VERIFY_NOTE, curStep && curStep.note);
    r = await req('POST', '/api/pipeline/stop', { runId: vRunId });
    check('stop ok', r.json && r.json.ok === true);
    const drStopped = await waitFor(async () => {
      const d = await getRunDevice(vRunId);
      return d && d.status === 'stopped' ? d : false;
    }, 15000, 'run dung han sau stop');
    check('run dung han (stopped)', true, drStopped.status);

    // ---------- 6. Diem danh 14 ngay ----------
    console.log('== Flow diem-danh ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({});
    await waitDeviceOnline();
    check('fake mac dinh online lai', true);
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'diem-danh', deviceIds: [FAKE_ID], params: {} });
    check('diem-danh start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const ddRunId = r.json.runId;
    const drDd = await waitFor(async () => {
      const d = await getRunDevice(ddRunId);
      return d && d.status === 'done' ? d : false;
    }, 60000, 'diem-danh done');
    check('(e) diem-danh hoan thanh (done)', true, drDd.steps.map((s) => s.type + ':' + s.status).join(','));
    const ckStep = drDd.steps.find((s) => s.type === 'checkin');
    check('(e) buoc checkin ghi "da diem danh ngay 1/14"',
      !!ckStep && (ckStep.note || '').indexOf('Đã điểm danh ngày 1/14') >= 0, ckStep && ckStep.note);
    r = await req('GET', '/api/checkin');
    const ckDev = (r.json.devices || []).find((x) => x.deviceId === FAKE_ID);
    check('(e) /api/checkin: count=1, todayDone=true, complete=false',
      !!ckDev && ckDev.count === 1 && ckDev.todayDone === true && ckDev.complete === false, JSON.stringify(ckDev));
    const ckFile = path.join(SERVER_DIR, 'data', 'checkin-state.json');
    check('(e) checkin-state.json luu ngay hom nay (Tokyo)',
      fs.existsSync(ckFile) && fs.readFileSync(ckFile, 'utf8').indexOf(todayTokyo()) >= 0, todayTokyo());

    // Chay lai lan 2 cung ngay -> bao da diem danh roi, count van 1
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'diem-danh', deviceIds: [FAKE_ID], params: {} });
    const dd2RunId = r.json.runId;
    const drDd2 = await waitFor(async () => {
      const d = await getRunDevice(dd2RunId);
      return d && d.status === 'done' ? d : false;
    }, 60000, 'diem-danh lan 2 done');
    const ckStep2 = drDd2.steps.find((s) => s.type === 'checkin');
    check('(e) chay lai cung ngay: "Hom nay da diem danh roi"',
      !!ckStep2 && (ckStep2.note || '').indexOf('Hôm nay đã điểm danh rồi') >= 0, ckStep2 && ckStep2.note);
    r = await req('GET', '/api/checkin');
    const ckDev2 = (r.json.devices || []).find((x) => x.deviceId === FAKE_ID);
    check('(e) count van 1 sau lan 2', !!ckDev2 && ckDev2.count === 1);

    r = await req('POST', '/api/checkin/reset', { deviceId: FAKE_ID });
    check('(e) reset chu ky ok', r.json && r.json.ok === true && r.json.checkin && r.json.checkin.count === 0);
    r = await req('GET', '/api/checkin');
    const ckDev3 = (r.json.devices || []).find((x) => x.deviceId === FAKE_ID);
    check('(e) sau reset count=0', !!ckDev3 && ckDev3.count === 0);

    // ---------- 7. Check heo qua link chuyen dung + xem video thuong ----------
    console.log('== Check heo (watch + link) va xem video thuong (detect:false) ==');
    r = await req('POST', '/api/watch/start', { deviceIds: [FAKE_ID], minutes: 5, gameUrl: GAME_URL, detect: true });
    check('(f) check heo start ok (mo link game)', r.json && r.json.ok === true && (r.json.results || []).length === 1 && r.json.results[0].ok === true, JSON.stringify(r.json));
    const watchDone = await waitFor(async () => {
      const rr = await req('GET', '/api/watch');
      const w = (rr.json.watches || []).find((x) => x.deviceId === FAKE_ID);
      return w && w.status === 'da_checkin' ? { w: w, total: rr.json.checkinSuccess } : false;
    }, 45000, 'check heo phat hien thanh cong');
    check('(f) check heo phat hien thanh cong -> da_checkin', true, 'marker=' + watchDone.w.matchedMarker);
    check('(f) matchedMarker dung chu チェックイン完了', watchDone.w.matchedMarker === 'チェックイン完了', watchDone.w.matchedMarker);
    check('(f) o dem check-in thanh cong >= 1', watchDone.total >= 1, 'total=' + watchDone.total);
    r = await req('GET', '/api/events');
    const evHit = (r.json.events || []).find((e) => e.type === 'checkin_success' && e.deviceId === FAKE_ID);
    check('(f) co su kien checkin_success trong /api/events', !!evHit, evHit && evHit.message);

    // Xem video thuong: man hinh van dang co chu thanh cong (fake da bam
    // diem danh) nhung detect:false thi vong xem KHONG duoc bao thanh cong
    r = await req('POST', '/api/watch/start', { deviceIds: [FAKE_ID], minutes: 5, gameUrl: '', detect: false });
    check('(f) xem video thuong start ok', r.json && (r.json.results || []).length === 1 && r.json.results[0].ok === true, JSON.stringify(r.json));
    await sleep(3500);
    r = await req('GET', '/api/watch');
    const wPlain = (r.json.watches || []).find((x) => x.deviceId === FAKE_ID);
    check('(f) xem video thuong: van watching, khong bao thanh cong',
      !!wPlain && wPlain.status === 'watching' && wPlain.detect === false, wPlain && (wPlain.status + '/detect=' + wPlain.detect));
    r = await req('POST', '/api/watch/stop', { deviceIds: [FAKE_ID] });
    check('(f) dung vong xem ok', r.json && r.json.ok === true);

    // ---------- 8. Dashboard ----------
    console.log('== Dashboard 3.2 ==');
    r = await req('GET', '/');
    const tabNames = ['📱 Dàn máy', '🗄 Kho dữ liệu', '⚙ Tác vụ', '▶ Hành động'];
    let lastIdx = -1, orderOk = r.status === 200;
    for (const t of tabNames) {
      const i = r.text.indexOf(t);
      if (i < 0 || i < lastIdx) orderOk = false;
      lastIdx = i;
    }
    check('(g) dashboard 200 + 4 tab dung thu tu (Dan may, Kho du lieu, Tac vu, Hanh dong)', orderOk);
    check('(g) tab Dan may la mac dinh (active)',
      r.text.indexOf('tabbtn active" data-tab="danmay"') >= 0 && r.text.indexOf('panelpage active" id="panel-danmay"') >= 0);
    check('(g) co kho heo + flow dang nhap TikTok + o link game chuyen dung',
      r.text.indexOf('Kho tài khoản xem heo') >= 0 && r.text.indexOf('dang-nhap-tiktok-lite') >= 0 &&
      r.text.indexOf('Link game chuyên dụng (hoặc nội dung mã QR)') >= 0 &&
      r.text.indexOf('Máy đã quét ăn game') >= 0);

    // ---------- 9. Quet ro ri mat khau ----------
    console.log('== Quet ro ri mat khau ==');
    check('(c) PASS_A khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_A) < 0);
    check('(c) PASS_B khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_B) < 0);
    check('(c) PASS_C khong xuat hien trong bat ky response API nao', allResponses.indexOf(PASS_C) < 0);
    r = await req('GET', '/api/events');
    check('(c) nhat ky su kien khong chua mat khau that',
      r.text.indexOf(PASS_A) < 0 && r.text.indexOf(PASS_B) < 0 && r.text.indexOf(PASS_C) < 0);
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    if (fake) try { fake.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    // Don dep du lieu test; GIU flow-config.json (file cau hinh giao kem goi)
    for (const f of ['gmail-pool.json', 'heo-pool.json', 'checkin-state.json', 'game-link.json']) {
      try { fs.unlinkSync(path.join(SERVER_DIR, 'data', f)); } catch (e) {}
    }
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
