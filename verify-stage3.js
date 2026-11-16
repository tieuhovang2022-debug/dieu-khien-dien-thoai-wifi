// verify-stage3.js — Kiem chung vong kin Giai doan 3 (server v3 + fake agent v3).
// Chay: node verify-stage3.js   (tu khoi dong server tam tren cong 19787/19080
// voi vong xem game duoc rut ngan qua FARM_WATCH_MIN/MAX_SEC=1/2, chay fake
// agent voi FAKE_CHECKIN_AFTER=2, kiem tra cac lenh/flow moi + cac duong
// chinh cua Giai doan 2, roi don dep).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 19787;
const HTTP_PORT = 19080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const FAKE_ID = 'fake-device-001';

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

async function getRunDevice(runId) {
  const rr = await req('GET', '/api/pipeline/runs');
  const run = (rr.json.runs || []).find((x) => x.id === runId);
  if (!run) return null;
  return run.devices.find((x) => x.deviceId === FAKE_ID) || null;
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
    const info = await waitFor(async () => {
      try { const r = await req('GET', '/api/info'); return r.json && r.json.ok ? r.json : false; } catch (e) { return false; }
    }, 10000, 'server len');
    check('server khoi dong, /api/info ok', true);
    check('agentVersionExpected = 3.0', info.agentVersionExpected === '3.0', info.agentVersionExpected);

    // ---------- 1. Fake agent online ----------
    console.log('== Fake agent v3 (FAKE_CHECKIN_AFTER=2) ==');
    fake = startFake({ FAKE_CHECKIN_AFTER: '2' });
    const dev = await waitFor(async () => {
      const r = await req('GET', '/api/devices');
      const d = (r.json.devices || []).find((x) => x.id === FAKE_ID);
      return d && d.online ? d : false;
    }, 10000, 'fake agent online');
    check('may ao online', true, dev.label + ' / ' + dev.model);
    check('agentVersion 3.0-fake', dev.agentVersion === '3.0-fake', dev.agentVersion);
    check('accessibility=true', dev.accessibility === true);

    // ---------- 2. Lenh moi Giai doan 3 ----------
    console.log('== Lenh dump_ui / tap_text / wait_text / open_url ==');
    let r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'dump_ui', args: {} });
    check('dump_ui -> ok', r.json && r.json.ok === true);
    const nodes = (r.json && r.json.data && r.json.data.nodes) || [];
    check('dump_ui co node that (co nut 次へ)', nodes.length >= 3 && nodes.some((n) => n.text === '次へ'), nodes.length + ' node');
    check('dump_ui lan 1 chua co chu check-in', !nodes.some((n) => (n.text || '').indexOf('チェックイン完了') >= 0));

    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap_text', args: { text: '次へ' } });
    check('tap_text "次へ" (contains) -> ok', r.json && r.json.ok === true && r.json.data && r.json.data.tapped === true, JSON.stringify(r.json && r.json.data));
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap_text', args: { text: '次', match: 'exact' } });
    check('tap_text "次" (exact) -> text_not_found', r.json && r.json.ok === false && r.json.error === 'text_not_found', JSON.stringify(r.json));
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap_text', args: { text: 'KHONG-CO-CHU-NAY' } });
    check('tap_text chu khong co -> text_not_found', r.json && r.json.ok === false && r.json.error === 'text_not_found');

    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'wait_text', args: { text: '次へ', timeoutMs: 3000 } });
    check('wait_text "次へ" -> found=true', r.json && r.json.ok === true && r.json.data && r.json.data.found === true, JSON.stringify(r.json && r.json.data));
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'wait_text', args: { text: 'KHONG-CO-CHU-NAY', timeoutMs: 1000 } });
    check('wait_text chu khong co -> found=false (van ok)', r.json && r.json.ok === true && r.json.data && r.json.data.found === false);

    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'open_url', args: { url: 'https://example.com/game-heo' } });
    check('open_url https -> ok', r.json && r.json.ok === true && r.json.data && r.json.data.opened === 'https://example.com/game-heo', JSON.stringify(r.json));
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'open_url', args: { url: 'khong-phai-url' } });
    check('open_url sai dinh dang -> bad_url', r.json && r.json.ok === false && r.json.error === 'bad_url', JSON.stringify(r.json));

    // ---------- 3. Kho Gmail (hoi quy Giai doan 2) ----------
    console.log('== Kho Gmail (duong chinh Giai doan 2) ==');
    r = await req('POST', '/api/gmail/import', { text: 's3a@gmail.com|matkhau-a\ns3b@gmail.com|matkhau-b' });
    check('gmail import added=2', r.json && r.json.added === 2, JSON.stringify(r.json));
    r = await req('GET', '/api/gmail');
    check('gmail list: mat khau che, khong lo pass that',
      r.json && r.json.accounts.length === 2 && r.text.indexOf('matkhau-a') < 0 && r.text.indexOf('matkhau-b') < 0 && r.text.indexOf('********') >= 0);

    // ---------- 4. Pipeline cap-may-moi (hoi quy) ----------
    console.log('== Pipeline cap-may-moi (hoi quy Giai doan 2) ==');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-may-moi', deviceIds: [FAKE_ID], params: {} });
    check('cap-may-moi start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const capRunId = r.json.runId;
    await waitFor(async () => {
      const d = await getRunDevice(capRunId);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 20000, 'cap-may-moi dung o waiting_manual');
    check('cap-may-moi dung o waiting_manual', true);
    r = await req('POST', '/api/pipeline/resume', { runId: capRunId, deviceId: FAKE_ID });
    check('cap-may-moi resume ok', r.json && r.json.ok === true);
    const capDone = await waitFor(async () => {
      const d = await getRunDevice(capRunId);
      return d && d.status === 'done' ? d : false;
    }, 10000, 'cap-may-moi done');
    check('cap-may-moi hoan thanh (done)', true, capDone.steps.map((s) => s.status).join(','));

    // ---------- 5. Flow dang ky TikTok Lite ----------
    console.log('== Flow dang-ky-tiktok-lite ==');
    r = await req('GET', '/api/pipelines');
    const pipeIds = (r.json.pipelines || []).map((p) => p.id).join(',');
    check('co du 3 flow: cap-may-moi, dang-ky-tiktok-lite, quet-game-xem-video',
      pipeIds.indexOf('cap-may-moi') >= 0 && pipeIds.indexOf('dang-ky-tiktok-lite') >= 0 && pipeIds.indexOf('quet-game-xem-video') >= 0, pipeIds);
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'dang-ky-tiktok-lite', deviceIds: [FAKE_ID], params: {} });
    check('dang-ky start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const regRunId = r.json.runId;
    const regWait = await waitFor(async () => {
      const d = await getRunDevice(regRunId);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 40000, 'dang-ky dung o waiting_manual');
    check('dang-ky dung o buoc manual (waiting_manual)', true);
    const tapSteps = regWait.steps.slice(0, regWait.currentStep).filter((s) => s.type === 'tap_text');
    check('cac buoc tap_text truoc manual deu done (dung sai)', tapSteps.length >= 6 && tapSteps.every((s) => s.status === 'done'),
      tapSteps.map((s) => s.status).join(','));
    check('co buoc tap_text bi bo qua dung sai (khong thay marker)', tapSteps.some((s) => (s.note || '').indexOf('bỏ qua') >= 0),
      tapSteps.map((s) => s.note).join(' | '));
    const manualStep = regWait.steps[regWait.currentStep];
    check('buoc manual dung ten buoc dang nhap', !!manualStep && manualStep.type === 'manual' && manualStep.name.indexOf('Đăng nhập:') === 0, manualStep && manualStep.name);
    r = await req('POST', '/api/pipeline/resume', { runId: regRunId, deviceId: FAKE_ID });
    check('dang-ky resume ok', r.json && r.json.ok === true);
    const regDone = await waitFor(async () => {
      const d = await getRunDevice(regRunId);
      return d && d.status === 'done' ? d : false;
    }, 30000, 'dang-ky done');
    check('dang-ky hoan thanh sau resume (done)', true, regDone.steps.map((s) => s.status).join(','));

    // ---------- 6. Watch: quet game & phat hien check-in ----------
    console.log('== Watch quet-game-xem-video (API truc tiep) ==');
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap_text', args: { text: 'チェックイン完了' } });
    check('truoc khi xem: chu check-in chua xuat hien', r.json && r.json.ok === false && r.json.error === 'text_not_found');
    r = await req('POST', '/api/watch/start', { deviceIds: [FAKE_ID], minutes: 5 });
    check('watch start ok', r.json && r.json.ok === true && (r.json.results || []).length === 1 && r.json.results[0].ok === true, JSON.stringify(r.json));
    const watchDone = await waitFor(async () => {
      const rr = await req('GET', '/api/watch');
      const w = (rr.json.watches || []).find((x) => x.deviceId === FAKE_ID);
      return w && w.status === 'da_checkin' ? { w: w, total: rr.json.checkinSuccess } : false;
    }, 45000, 'watch phat hien check-in');
    check('watch phat hien check-in -> trang thai da_checkin', true, 'marker=' + watchDone.w.matchedMarker + ', rounds=' + watchDone.w.rounds);
    check('matchedMarker dung chu チェックイン完了', watchDone.w.matchedMarker === 'チェックイン完了', watchDone.w.matchedMarker);
    check('o dem check-in thanh cong >= 1', watchDone.total >= 1, 'total=' + watchDone.total);
    r = await req('GET', '/api/events');
    const evHit = (r.json.events || []).find((e) => e.type === 'checkin_success' && e.deviceId === FAKE_ID);
    check('co su kien checkin_success trong /api/events', !!evHit, evHit && evHit.message);
    r = await req('GET', '/api/devices');
    const devW = (r.json.devices || []).find((x) => x.id === FAKE_ID);
    check('the may (api/devices) hien watch da_checkin', !!devW && !!devW.watch && devW.watch.status === 'da_checkin');
    // Vong xem cua may da dung: cho 3 giay, so vong khong tang nua
    const rounds1 = watchDone.w.rounds;
    await sleep(3000);
    r = await req('GET', '/api/watch');
    const wAfter = (r.json.watches || []).find((x) => x.deviceId === FAKE_ID);
    check('vong xem da dung sau check-in (rounds khong tang)', !!wAfter && wAfter.status === 'da_checkin' && wAfter.rounds === rounds1,
      'rounds ' + rounds1 + ' -> ' + (wAfter && wAfter.rounds));

    // ---------- 7. Flow quet game qua panel pipeline ----------
    console.log('== Flow quet-game-xem-video qua pipeline ==');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'quet-game-xem-video', deviceIds: [FAKE_ID], params: { minutes: 5 } });
    check('quet-game pipeline start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const watchRunId = r.json.runId;
    const watchRunDone = await waitFor(async () => {
      const d = await getRunDevice(watchRunId);
      return d && d.status === 'done' ? d : false;
    }, 20000, 'quet-game pipeline done');
    check('quet-game pipeline hoan thanh (watch da bat)', true, watchRunDone.steps.map((s) => s.type + ':' + s.status).join(','));
    r = await req('POST', '/api/watch/stop', { deviceIds: [FAKE_ID] });
    check('watch stop ok', r.json && r.json.ok === true);

    // ---------- 8. Dashboard ----------
    r = await req('GET', '/');
    check('dashboard HTTP 200 + co o dem Check-in thanh cong + flow moi',
      r.status === 200 && r.text.indexOf('Check-in thành công') >= 0 && r.text.indexOf('watchMinutes') >= 0);
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
