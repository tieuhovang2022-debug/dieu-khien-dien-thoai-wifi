// verify-stage2.js — Kiem chung vong kin Giai doan 2 (server v2 + fake agent v2).
// Chay: node verify-stage2.js   (tu khoi dong server tam tren cong 18787/18080,
// chay fake agent nhieu che do, kiem tra API, roi don dep).
'use strict';
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const TCP_PORT = 18787;
const HTTP_PORT = 18080;
const BASE = 'http://127.0.0.1:' + HTTP_PORT;
const SERVER_DIR = path.join(__dirname, 'server');
const APK = path.join(__dirname, 'agent', 'agent.apk');
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
      try { const r = await req('GET', '/api/info'); return r.json && r.json.ok; } catch (e) { return false; }
    }, 10000, 'server len');
    check('server khoi dong, /api/info ok', true);

    // ---------- 1. Fake agent mac dinh: online + flags ----------
    console.log('== Fake agent (mac dinh: chua Device Owner, co Tro nang) ==');
    fake = startFake({});
    const dev = await waitFor(async () => {
      const r = await req('GET', '/api/devices');
      const d = (r.json.devices || []).find((x) => x.id === FAKE_ID);
      return d && d.online ? d : false;
    }, 10000, 'fake agent online');
    check('may ao online', true, dev.label + ' / ' + dev.model);
    check('deviceOwner=false (mac dinh)', dev.deviceOwner === false);
    check('accessibility=true (mac dinh)', dev.accessibility === true);
    check('agentVersion 3.0-fake', dev.agentVersion === '3.0-fake', dev.agentVersion);

    // ---------- 2. Lenh thao tac man hinh ----------
    console.log('== Lenh tap / swipe / input_text / key ==');
    let r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap', args: { x: 100, y: 200 } });
    check('tap -> ok', r.json && r.json.ok === true, JSON.stringify(r.json && r.json.data));
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'swipe', args: { x1: 500, y1: 800, x2: 500, y2: 300, durationMs: 300 } });
    check('swipe -> ok', r.json && r.json.ok === true);
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'input_text', args: { text: 'xin chao' } });
    check('input_text -> ok', r.json && r.json.ok === true);
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'key', args: { key: 'back' } });
    check('key back -> ok', r.json && r.json.ok === true);
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'status', args: {} });
    check('status (lenh cu) van ok', r.json && r.json.ok === true && r.json.data.deviceOwner === false && r.json.data.accessibility === true);

    // ---------- 3. factory_reset khi chua Device Owner ----------
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'factory_reset', args: {} });
    check('factory_reset -> loi not_device_owner', r.json && r.json.ok === false && r.json.error === 'not_device_owner', JSON.stringify(r.json));

    // ---------- 4. Kho Gmail ----------
    console.log('== Kho Gmail ==');
    r = await req('POST', '/api/gmail/import', { text: 'a1@gmail.com|pass1\n\na2@gmail.com:pass2\na3@gmail.com|pass3\na1@gmail.com|pass1\ndong-khong-hop-le' });
    check('import: added=3', r.json && r.json.added === 3, JSON.stringify(r.json));
    r = await req('GET', '/api/gmail');
    check('list: 3 tai khoan, ready=3', r.json && r.json.accounts.length === 3 && r.json.ready === 3);
    check('list: mat khau da che, khong lo pass that', r.text.indexOf('pass1') < 0 && r.text.indexOf('pass2') < 0 && r.text.indexOf('pass3') < 0 && r.text.indexOf('********') >= 0);

    // ---------- 5. Pipeline cap-may-moi: dung o buoc manual ----------
    console.log('== Pipeline cap-may-moi ==');
    r = await req('POST', '/api/pipeline/start', { pipelineId: 'cap-may-moi', deviceIds: [FAKE_ID], params: {} });
    check('pipeline start ok', r.json && r.json.ok === true, r.json && r.json.runId);
    const runId = r.json.runId;
    const drWait = await waitFor(async () => {
      const rr = await req('GET', '/api/pipeline/runs');
      const run = (rr.json.runs || []).find((x) => x.id === runId);
      if (!run) return false;
      const d = run.devices.find((x) => x.deviceId === FAKE_ID);
      return d && d.status === 'waiting_manual' ? d : false;
    }, 20000, 'pipeline dung o waiting_manual');
    check('pipeline dung o buoc manual (waiting_manual)', true);
    const st = drWait.steps.map((s) => s.status).join(',');
    check('thu tu buoc: done,skipped,skipped,done,waiting_manual', st === 'done,skipped,skipped,done,waiting_manual', st);
    r = await req('GET', '/api/gmail');
    const a1 = r.json.accounts.find((a) => a.email === 'a1@gmail.com');
    check('assign_gmail trong pipeline da cap a1 cho may', !!a1 && a1.status === 'assigned' && a1.deviceId === FAKE_ID);
    r = await req('POST', '/api/pipeline/resume', { runId: runId, deviceId: FAKE_ID });
    check('resume ok', r.json && r.json.ok === true);
    const drDone = await waitFor(async () => {
      const rr = await req('GET', '/api/pipeline/runs');
      const run = (rr.json.runs || []).find((x) => x.id === runId);
      if (!run) return false;
      const d = run.devices.find((x) => x.deviceId === FAKE_ID);
      return d && d.status === 'done' ? d : false;
    }, 10000, 'pipeline hoan thanh');
    check('pipeline hoan thanh (done)', true, drDone.steps.map((s) => s.status).join(','));

    // ---------- 6. Assign + signin-assist ----------
    console.log('== Assign + signin-assist ==');
    r = await req('POST', '/api/gmail/assign', { deviceId: FAKE_ID });
    check('assign tiep theo -> a2', r.json && r.json.ok === true && r.json.account.email === 'a2@gmail.com', JSON.stringify(r.json && r.json.account));
    check('assign response khong lo password', r.text.indexOf('pass2') < 0);
    r = await req('POST', '/api/gmail/signin-assist', { deviceId: FAKE_ID });
    check('signin-assist ok (2 buoc input_text)', r.json && r.json.ok === true && (r.json.steps || []).length === 2 && r.json.steps.every((s) => s.ok), JSON.stringify(r.json && r.json.steps));
    check('signin-assist response khong lo password', r.text.indexOf('pass2') < 0 && r.json.passwordMasked === '********');
    r = await req('POST', '/api/gmail/mark-die', { email: 'a3@gmail.com' });
    check('mark-die a3', r.json && r.json.ok === true && r.json.account.status === 'die');
    r = await req('POST', '/api/gmail/delete', { email: 'a3@gmail.com' });
    check('delete a3', r.json && r.json.ok === true);
    r = await req('GET', '/api/gmail');
    check('kho con 2 tai khoan', r.json && r.json.accounts.length === 2);

    // ---------- 7. QR provisioning + checksum ----------
    console.log('== QR provisioning ==');
    r = await req('GET', '/api/provision/qr');
    const payload = r.json;
    check('QR endpoint tra JSON parse duoc', !!payload && typeof payload === 'object');
    const comp = payload && payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME'];
    check('component name dung AdminReceiver', comp === 'vn.duongashita.farmagent/vn.duongashita.farmagent.AdminReceiver', comp);
    const loc = payload && payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION'];
    check('download location dung IP LAN + /apks/agent.apk', loc === 'http://192.168.1.50:' + HTTP_PORT + '/apks/agent.apk', loc);
    check('co skip-encryption + leave-system-apps', payload && payload['android.app.extra.PROVISIONING_SKIP_ENCRYPTION'] === true && payload['android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED'] === true);
    // checksum doc lap tu APK that
    const certOut = execFileSync(path.join(process.env.HOME, 'workspace/tools/android-sdk/build-tools/30.0.3/apksigner'),
      ['verify', '--print-certs', APK], { env: Object.assign({}, process.env, { JAVA_HOME: path.join(process.env.HOME, 'workspace/tools/jdk'), PATH: path.join(process.env.HOME, 'workspace/tools/jdk/bin') + ':' + process.env.PATH }) }).toString();
    const m = certOut.match(/SHA-256 digest:\s*([0-9a-f]+)/i);
    const expected = Buffer.from(m[1], 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const got = payload && payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM'];
    check('checksum khop APK that (doc lap tu apksigner)', got === expected, 'endpoint=' + got + ' expected=' + expected);

    // ---------- 8. factory_reset duong ok (Device Owner) ----------
    console.log('== Fake agent (FAKE_DEVICE_OWNER=1) ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_DEVICE_OWNER: '1' });
    const dev2 = await waitFor(async () => {
      const rr = await req('GET', '/api/devices');
      const d = (rr.json.devices || []).find((x) => x.id === FAKE_ID);
      return d && d.online && d.deviceOwner === true ? d : false;
    }, 10000, 'fake owner online');
    check('deviceOwner=true khi FAKE_DEVICE_OWNER=1', !!dev2);
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'factory_reset', args: {} });
    check('factory_reset -> ok khi la Device Owner', r.json && r.json.ok === true && r.json.data && r.json.data.wiping === true, JSON.stringify(r.json));

    // ---------- 9. input_text loi no_focus ----------
    console.log('== Fake agent (FAKE_NO_FOCUS=1) ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_NO_FOCUS: '1' });
    await waitFor(async () => {
      const rr = await req('GET', '/api/devices');
      const d = (rr.json.devices || []).find((x) => x.id === FAKE_ID);
      return d && d.online ? d : false;
    }, 10000, 'fake no-focus online');
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'input_text', args: { text: 'x' } });
    check('input_text -> loi no_focus', r.json && r.json.ok === false && r.json.error === 'no_focus', JSON.stringify(r.json));

    // ---------- 10. Chua bat Tro nang ----------
    console.log('== Fake agent (FAKE_ACCESSIBILITY=0) ==');
    fake.kill(); fake = null;
    await sleep(800);
    fake = startFake({ FAKE_ACCESSIBILITY: '0' });
    const dev3 = await waitFor(async () => {
      const rr = await req('GET', '/api/devices');
      const d = (rr.json.devices || []).find((x) => x.id === FAKE_ID);
      return d && d.online && d.accessibility === false ? d : false;
    }, 10000, 'fake no-a11y online');
    check('accessibility=false bao dung', !!dev3);
    r = await req('POST', '/api/cmd', { deviceId: FAKE_ID, cmd: 'tap', args: { x: 1, y: 2 } });
    check('tap -> loi no_accessibility', r.json && r.json.ok === false && r.json.error === 'no_accessibility', JSON.stringify(r.json));

    // ---------- 11. Dashboard ----------
    r = await req('GET', '/');
    check('dashboard HTTP 200 + co panel Giai doan 2', r.status === 200 && r.text.indexOf('Kho Gmail') >= 0 && r.text.indexOf('Pipeline') >= 0);
  } catch (e) {
    failed++;
    console.log('  FAIL  ngoai le: ' + e.message);
  } finally {
    if (fake) try { fake.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    // Don dep pool test de kho ve trang thai sach
    try { fs.unlinkSync(path.join(SERVER_DIR, 'data', 'gmail-pool.json')); } catch (e) {}
  }
  console.log('\n== KET QUA: ' + passed + ' PASS, ' + failed + ' FAIL ==');
  process.exit(failed ? 1 : 0);
}

main();
