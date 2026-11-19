// fake-agent.js — May test ao cho Farm Control Giai doan 3.2.
// Ket noi TCP vao server nhu mot dien thoai that, gui hello + heartbeat,
// tra loi cac lenh co ban + lenh Giai doan 2 (tap/swipe/input_text/key/
// factory_reset) + lenh Giai doan 3 (dump_ui/tap_text/wait_text/open_url)
// + lenh Giai doan 3.1 (open_google_signin) kem MAY TRANG THAI man hinh
// dang nhap Google (email -> password -> done/verify) cho dump_ui.
// Dung de kiem chung server + dashboard + giao thuc ma khong can dien
// thoai that.
// Chay: node fake-agent.js [host] [port]   (mac dinh 127.0.0.1:8787)
// Bien moi truong mo phong:
//   FAKE_DEVICE_OWNER=1  -> status bao deviceOwner:true, factory_reset tra ok
//                           (mac dinh: deviceOwner:false, factory_reset tra loi not_device_owner)
//   FAKE_ACCESSIBILITY=0 -> status bao accessibility:false, lenh thao tac tra loi no_accessibility
//                           (mac dinh: accessibility:true)
//   FAKE_NO_FOCUS=1      -> input_text tra loi no_focus
//   FAKE_NO_FOCUS_FIRST=n -> (Hotfix 3.2.2) n lan input_text DAU TIEN
//                           cua phien tra loi no_focus (o chua kip
//                           focus nhu may that), tu lan thu n+1 tro
//                           di thi binh thuong. Moi lan loi ghi vao
//                           cmdLog dong "input_text:no_focus" de
//                           script kiem chung thay duoc cac lan server
//                           thu lai. FAKE_NO_FOCUS=1 van uu tien (loi
//                           toan thoi gian, giu nguyen cho test cu).
//   FAKE_CHECKIN_AFTER=n -> tu lan dump_ui MAN HINH TIKTOK thu n tro di,
//                           trong danh sach node xuat hien chu
//                           "チェックイン完了" (mo phong man hinh bao
//                           check-in thanh cong cho vong xem game). Luu y:
//                           chi dump o man hinh TikTok moi dem — dump o cac
//                           man hinh dang nhap Google khong tinh, de trinh
//                           tu dang nhap khong lam lech bo dem check-in.
//   FAKE_VERIFY=1        -> sau khi nhap mat khau + bam Tiep theo, man
//                           hinh dang nhap chuyen sang trang thai "verify"
//                           (本人確認 / 確認コード) thay vi "done" — mo phong
//                           Google bat xac minh, flow phai dung Cho cham tay.
//   FAKE_TT_VERIFY=1     -> (Giai doan 3.2) sau khi nhap mat khau TikTok
//                           Lite + bam nut dang nhap, man hinh chuyen sang
//                           "verify" (本人確認 / 確認コード) thay vi ve feed
//                           — mo phong TikTok bat xac minh, flow dang nhap
//                           phai dung Cho cham tay.
//   FAKE_DELAY_NEXT=n    -> (Hotfix 3.2.1) tren man hinh email VA mat
//                           khau cua dang nhap Google, node nut 次へ bi
//                           AN khoi n lan dump_ui dau tien cua man hinh
//                           do va chi xuat hien tu lan dump thu n+1 —
//                           mo phong dung loi may that (nut hien tren
//                           man hinh nhung cay accessibility chua kip
//                           lo node nut). Flow phai quet lai moi thay.
//   FAKE_SIGNIN_BOTH_MARKERS=1 -> (Hotfix 3.2.3) dump_ui o man hinh
//                           EMAIL cua dang nhap Google co them mot
//                           node an chua chu "パスワード" (mo phong
//                           DOM an cua WebView dang nhap Google tren
//                           may that — cay dump chua san chu cua buoc
//                           mat khau ngay ca khi dang o buoc email,
//                           khien ban cu nhan nham man hinh va go mat
//                           khau vao o email). Flow phai phan loai
//                           nghiem ngat: marker email thang tuyet doi.
//   FAKE_DROP_FIRST_INPUT=1 -> (Hotfix 3.2.3, ban dieu chinh) lan
//                           input_text THANH CONG dau tien tren man
//                           hinh EMAIL cua dang nhap Google KHONG
//                           "dinh" — o van trong, dump_ui van thay o
//                           trong (mo phong nhap "rot" tren may
//                           that). Lenh van tra ok va van ghi cmdLog
//                           binh thuong. Flow phai tu nhap LAI ca
//                           buoc email (vong lap thu lai) moi xong.
//   FAKE_SCREEN=WxH      -> (Giai doan 3.4) bao kich thuoc man hinh
//                           WxH trong hello + status (tin nhan va ket
//                           qua lenh 'status': data.width/height) —
//                           phuc vu kiem chung trang phan chieu: server
//                           doi toa do tuong doi cua thao tac dong
//                           loat sang toa do tuyet doi theo man hinh
//                           cua TUNG may. Khong dat env thi KHONG bao
//                           (hanh vi nhu cu, cac test cu khong doi).
//                           Lenh 'status' (ket qua) con bao them
//                           lastTap/lastSwipe (toa do tuyet doi cua
//                           lan cham/vuot gan nhat) de script kiem
//                           chung doi chieu.
//   FAKE_KEYBOARD_SHIFT=1 -> (Hotfix 3.2.4) mo phong dung chan doan
//                           cua nguoi dung tren may that (Sony
//                           SOV37, 2026-11-16 ~22:40): sau khi nhap,
//                           ban phim IME van mo va dump_ui bao bounds
//                           cua nut 次へ/ログイン LECH +600px theo
//                           truc y — cham theo bounds lech do thi
//                           truot (mo phong cham chi trung khi diem
//                           cham nam trong bounds THAT cua node).
//                           Nhan lenh key 'back' thi ban phim dong,
//                           dump lai bao bounds dung. Tat env (mac
//                           dinh) thi moi hanh vi dung nhu cu — cac
//                           script kiem chung cu khong thay doi.
// Mo phong o nhap (Hotfix 3.2.3): sau khi input_text thanh cong, o
// EditText cua man hinh hien tai GIU LAI noi dung da nhap trong
// dump_ui (man hinh email/username: text that; man hinh mat khau:
// chuoi dau cham "•" nhu Android that hien) — de server xac minh
// sau-khi-nhap qua dump_ui dung nhu tren may that.
// Lenh 'tap' theo toa do: neu diem cham nam trong bounds cua mot node
// thi mo phong nhu cham vao node do (chuyen man hinh giong tap_text);
// rieng cham vao nut (Button) co chu thi cmdLog ghi them dong
// "tap_text:<chu>" de script kiem chung thay duoc hieu ung cham nut
// (helper 3.2.1 cham bang 'tap' thay vi 'tap_text').
// Giai doan 3.2: feed TikTok Lite co them nut ログイン (vao may trang
// thai dang nhap TikTok: username -> password -> feed/verify) va nut
// チェックインする (bam vao la man hinh bao チェックイン完了 — phuc vu
// flow diem-danh). input_text o man hinh username TikTok ghi
// "input_text(ttuser):<username>", o man hinh mat khau ghi che nhu Gmail.
// Debug: fake ghi lai cac lenh da nhan vao cmdLog (input_text o man hinh
// email ghi "input_text(email):<email>", o man hinh mat khau ghi
// "input_text(password):********" — khong bao gio ghi mat khau that).
// Doc cmdLog qua lenh status: POST /api/cmd {cmd:"status"} -> data.cmdLog.
'use strict';
const net = require('net');

const HOST = process.argv[2] || '127.0.0.1';
const PORT = process.argv[3] ? parseInt(process.argv[3], 10) : 8787;
const ANDROID_ID = process.env.FAKE_ANDROID_ID || 'fake-device-001';
const IS_DEVICE_OWNER = process.env.FAKE_DEVICE_OWNER === '1';
const HAS_ACCESSIBILITY = process.env.FAKE_ACCESSIBILITY !== '0';
const NO_FOCUS = process.env.FAKE_NO_FOCUS === '1';
const NO_FOCUS_FIRST = process.env.FAKE_NO_FOCUS_FIRST ? parseInt(process.env.FAKE_NO_FOCUS_FIRST, 10) : 0;
// So lan input_text con phai tra no_focus theo FAKE_NO_FOCUS_FIRST.
let noFocusFirstLeft = NO_FOCUS_FIRST;
const CHECKIN_AFTER = process.env.FAKE_CHECKIN_AFTER ? parseInt(process.env.FAKE_CHECKIN_AFTER, 10) : 0;
const FAKE_VERIFY = process.env.FAKE_VERIFY === '1';
const FAKE_TT_VERIFY = process.env.FAKE_TT_VERIFY === '1';
const DELAY_NEXT = process.env.FAKE_DELAY_NEXT ? parseInt(process.env.FAKE_DELAY_NEXT, 10) : 0;
const SIGNIN_BOTH_MARKERS = process.env.FAKE_SIGNIN_BOTH_MARKERS === '1';
const DROP_FIRST_INPUT = process.env.FAKE_DROP_FIRST_INPUT === '1';
const KEYBOARD_SHIFT = process.env.FAKE_KEYBOARD_SHIFT === '1';
// Kich thuoc man hinh bao trong hello/status (Giai doan 3.4) — chi
// khi dat FAKE_SCREEN=WxH (vd 720x1600); mac dinh null = khong bao.
let SCREEN_W = 0, SCREEN_H = 0;
if (process.env.FAKE_SCREEN) {
  const m = String(process.env.FAKE_SCREEN).match(/^(\d+)x(\d+)$/);
  if (m) { SCREEN_W = parseInt(m[1], 10); SCREEN_H = parseInt(m[2], 10); }
}
// Toa do tuyet doi cua lan cham/vuot gan nhat (phuc vu kiem chung
// 3.4 qua lenh status: data.lastTap / data.lastSwipe).
let lastTap = null;
let lastSwipe = null;
// Ban phim IME dang mo (mo phong 3.2.4): mo sau input_text thanh
// cong, dong khi nhan key 'back' hoac khi doi man hinh (open_app /
// open_google_signin). Chi co tac dung khi KEYBOARD_SHIFT=1.
let keyboardOpen = false;
// So lan input_text thanh cong tren man hinh email Google con bi
// "rot" (chi dem khi FAKE_DROP_FIRST_INPUT=1).
let dropFirstInputLeft = DROP_FIRST_INPUT ? 1 : 0;
// Noi dung da nhap thanh cong vao tung o nhap (mo phong o giu text —
// hotfix 3.2.3). Man hinh mat khau chi hien dau cham trong dump.
let emailFieldText = '';
let passwordFieldText = '';
let ttUserFieldText = '';
let ttPassFieldText = '';
// So lan dump_ui da tra cho tung man hinh dang nhap Google (phuc vu
// FAKE_DELAY_NEXT) — reset khi vao lai man hinh email / mat khau.
let signinDumpCounts = { email: 0, password: 0 };
let dumpCount = 0; // chi dem dump_ui o man hinh TikTok (phuc vu FAKE_CHECKIN_AFTER)
// May trang thai man hinh dang nhap Google (Giai doan 3.1):
//   none -> (open_google_signin) -> email -> (nhap email + cham 次へ) ->
//   password -> (nhap mat khau + cham 次へ) -> done (hoac verify neu FAKE_VERIFY=1)
// open_app (mo app khac) dua trang thai ve none — nhu may that roi khoi
// man hinh dang nhap khi mo app khac.
let signinState = 'none';
// May trang thai dang nhap TikTok Lite (Giai doan 3.2):
//   none (dang o feed) -> (cham nut ログイン tren feed) -> username ->
//   (nhap username + cham 次へ) -> password -> (nhap mat khau + cham
//   ログイン) -> none/feed (hoac verify neu FAKE_TT_VERIFY=1).
// open_app dua ca signinState lan ttLoginState ve none.
let ttLoginState = 'none';
// Da bam nut チェックインする trong phien nay chua (flow diem-danh).
let ttCheckedIn = false;
// May trang thai dang ky LINE (Giai doan 5):
//   none -> (open_app jp.naver.line.android) -> entry -> (cham 新規登録)
//   -> auth -> (cham Googleで続ける) -> country (mac dinh 日本 +81)
//   -> (cham o quoc gia) -> countrylist -> (cham dong シンガポール)
//   -> country (da chon Singapore +65) -> (cham 次へ) -> home
//   (FAKE_LINE_VERIFY=1: o buoc cuoi vao 'verify' — nhap ma vao o
//   xac nhan roi cham 次へ moi ve home).
// FAKE_LINE_NOT_INSTALLED=1 -> open_app LINE tra app_not_installed.
let lineState = 'none';
let lineCountry = 'JP';
let lineCodeText = '';
const FAKE_LINE_VERIFY = process.env.FAKE_LINE_VERIFY === '1';
const FAKE_LINE_NOT_INSTALLED = process.env.FAKE_LINE_NOT_INSTALLED === '1';
const LINE_PKG = 'jp.naver.line.android';
// Nhat ky cac goi app da mo bang open_app (kiem chung thu tu buoc:
// Gmail phai duoc cap/dang nhap TRUOC khi LINE mo).
const openAppLog = [];
// Nhat ky lenh da nhan (debug cho script kiem chung) — xem ghi chu dau file.
const cmdLog = [];
function logCmd(entry) {
  cmdLog.push(entry);
  while (cmdLog.length > 500) cmdLog.shift();
}
// Anh JPEG 8x8 hop le (tao san), chi de chung minh duong truyen anh hoat dong.
const TINY_JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD02iiiu44T/9k=';

let battery = 87;
const sock = net.connect(PORT, HOST, () => {
  console.log('[fake-agent] da ket noi ' + HOST + ':' + PORT);
  const helloMsg = {
    type: 'hello',
    label: 'Máy test ảo',
    model: 'Xperia XZ2 (fake)',
    manufacturer: 'Sony',
    android: '10',
    sdk: 29,
    androidId: ANDROID_ID,
    battery: battery,
    agentVersion: '3.0-fake',
    deviceOwner: IS_DEVICE_OWNER,
    accessibility: HAS_ACCESSIBILITY,
    width: SCREEN_W || undefined,
    height: SCREEN_H || undefined
  };
  // Giai doan 5: ghep noi QR — dat FAKE_PAIR_CODE de hello mang theo
  // ma ghep noi (server se tra pair_result / pair_rejected).
  if (process.env.FAKE_PAIR_CODE) helloMsg.pairCode = process.env.FAKE_PAIR_CODE;
  send(helloMsg);
  setInterval(() => {
    battery = Math.max(80, battery - 1);
    send(statusMsg());
  }, 5000);
});

sock.setEncoding('utf8');
let buffer = '';
sock.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { continue; }
    // Giai doan 5: ket qua ghep noi QR — ghi ra STDOUT de script kiem
    // chung doc duoc (server tu dong ket noi neu ma bi tu choi).
    if (msg && msg.type === 'pair_result') {
      console.log('[fake-agent] PAIR_RESULT ok=' + (msg.ok ? 'true' : 'false'));
      continue;
    }
    if (msg && msg.type === 'pair_rejected') {
      console.log('[fake-agent] PAIR_REJECTED reason=' + (msg.reason || ''));
      continue;
    }
    if (msg && msg.cmd) handleCmd(msg);
  }
});
sock.on('error', (e) => { console.error('[fake-agent] loi:', e.message); process.exit(1); });
sock.on('close', () => { console.log('[fake-agent] server dong ket noi'); process.exit(0); });

function statusMsg() {
  return {
    type: 'status',
    battery: battery,
    charging: false,
    network: 'wifi',
    screenOn: true,
    deviceOwner: IS_DEVICE_OWNER,
    accessibility: HAS_ACCESSIBILITY,
    width: SCREEN_W || undefined,
    height: SCREEN_H || undefined
  };
}

function send(obj) {
  sock.write(JSON.stringify(obj) + '\n', 'utf8');
}

function result(id, ok, error, data) {
  const m = { type: 'result', id: id, ok: ok };
  if (error) m.error = error;
  if (data) m.data = data;
  send(m);
}

// Danh sach node gia lap cua "man hinh TikTok Lite" — dung cho dump_ui /
// tap_text / wait_text. Khi FAKE_CHECKIN_AFTER dat va so lan dump_ui o
// man hinh nay da dat nguong, node bao check-in thanh cong xuat hien
// (nhu man hinh that sau khi heo nhay).
function fakeNodes() {
  const nodes = [
    { text: 'TikTok Lite', desc: '', className: 'android.widget.TextView', bounds: [24, 80, 500, 140], clickable: false },
    { text: 'スキップ', desc: '', className: 'android.widget.TextView', bounds: [880, 60, 1056, 120], clickable: true },
    { text: '動画を見てポイントを貯めよう', desc: '', className: 'android.widget.TextView', bounds: [100, 900, 980, 980], clickable: false },
    { text: 'ログイン', desc: '', className: 'android.widget.Button', bounds: [700, 130, 1056, 210], clickable: true },
    { text: '毎日チェックイン', desc: '', className: 'android.widget.TextView', bounds: [100, 1000, 700, 1060], clickable: true },
    { text: 'チェックインする', desc: '', className: 'android.widget.Button', bounds: [700, 990, 1000, 1070], clickable: true },
    { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [140, 2100, 940, 2220], clickable: true },
    { text: '', desc: 'プロフィール', className: 'android.widget.ImageView', bounds: [940, 2200, 1060, 2340], clickable: true }
  ];
  if ((CHECKIN_AFTER > 0 && dumpCount >= CHECKIN_AFTER) || ttCheckedIn) {
    nodes.push({ text: 'チェックイン完了', desc: '', className: 'android.widget.TextView', bounds: [240, 1100, 840, 1180], clickable: false });
    nodes.push({ text: 'ポイントを獲得しました', desc: '', className: 'android.widget.TextView', bounds: [240, 1200, 840, 1280], clickable: false });
  }
  return nodes;
}

// Cac man hinh dang nhap TikTok Lite gia lap (Giai doan 3.2) — dung khi
// ttLoginState khac 'none'. Moi man hinh co dung cac dau chu trong muc
// "tiktokLogin" cua flow-config.json + mot o EditText.
function ttLoginNodes() {
  if (ttLoginState === 'username') {
    return [
      { text: 'TikTok Lite', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: 'ユーザー名またはメールアドレス', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
      { text: ttUserFieldText, desc: 'ユーザー名', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  if (ttLoginState === 'password') {
    return [
      { text: 'TikTok Lite', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: 'パスワードを入力してください', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
      { text: ttPassFieldText ? '•'.repeat(Math.min(ttPassFieldText.length, 12)) : '', desc: 'パスワード', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: 'ログイン', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  // verify: TikTok bat xac minh (ma xac nhan) — flow phai dung Cho cham tay
  return [
    { text: 'TikTok Lite', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
    { text: '本人確認', desc: '', className: 'android.widget.TextView', bounds: [80, 300, 1000, 380], clickable: false },
    { text: '確認コードを入力してください', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
    { text: '', desc: '確認コード', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
    { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
  ];
}

// Cac man hinh dang ky LINE gia lap (Giai doan 5) — dung khi
// lineState khac 'none'. Moi man hinh chua dung cac dau chu trong
// muc "lineRegister" cua flow-config.json.
function lineNodes() {
  if (lineState === 'entry') {
    return [
      { text: 'LINE', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: '新規登録', desc: '', className: 'android.widget.Button', bounds: [80, 1900, 1000, 2020], clickable: true },
      { text: 'ログイン', desc: '', className: 'android.widget.Button', bounds: [80, 2080, 1000, 2200], clickable: true }
    ];
  }
  if (lineState === 'auth') {
    return [
      { text: 'LINE', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: 'Googleで続ける', desc: '', className: 'android.widget.Button', bounds: [80, 900, 1000, 1020], clickable: true },
      { text: '電話番号でログイン', desc: '', className: 'android.widget.TextView', bounds: [80, 1100, 1000, 1180], clickable: true }
    ];
  }
  if (lineState === 'countrylist') {
    return [
      { text: '国・地域を選択', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: '', desc: '国を検索', className: 'android.widget.EditText', bounds: [80, 320, 1000, 440], clickable: true },
      { text: 'シンガポール +65', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 600], clickable: true },
      { text: '日本 +81', desc: '', className: 'android.widget.TextView', bounds: [80, 620, 1000, 720], clickable: true },
      { text: 'アメリカ +1', desc: '', className: 'android.widget.TextView', bounds: [80, 740, 1000, 840], clickable: true }
    ];
  }
  if (lineState === 'country') {
    return [
      { text: 'LINE', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: '電話番号を入力してください', desc: '', className: 'android.widget.TextView', bounds: [80, 400, 1000, 480], clickable: false },
      { text: lineCountry === 'SG' ? 'シンガポール +65' : '日本 +81', desc: '国', className: 'android.widget.TextView', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '', desc: '電話番号', className: 'android.widget.EditText', bounds: [80, 740, 1000, 860], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  if (lineState === 'verify') {
    return [
      { text: 'LINE', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: '確認コードを入力してください', desc: '', className: 'android.widget.TextView', bounds: [80, 400, 1000, 480], clickable: false },
      { text: lineCodeText ? '••••••' : '', desc: '確認コード', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  // home: dang ky xong — man hinh chinh LINE
  return [
    { text: 'LINEへようこそ', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
    { text: 'ホーム', desc: '', className: 'android.widget.TextView', bounds: [80, 400, 1000, 480], clickable: true },
    { text: 'トーク', desc: '', className: 'android.widget.TextView', bounds: [80, 520, 1000, 600], clickable: true }
  ];
}

// Cac man hinh dang nhap Google gia lap (Giai doan 3.1) — dung khi
// signinState khac 'none'. Moi man hinh co dung cac dau chu trong muc
// "signin" cua flow-config.json + mot o EditText + nut 次へ.
function signinNodes() {
  if (signinState === 'email') {
    const emailNodes = [
      { text: 'Google', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: 'ログイン', desc: '', className: 'android.widget.TextView', bounds: [80, 300, 1000, 380], clickable: false },
      { text: 'メールアドレスまたは電話番号', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
      { text: emailFieldText, desc: 'メールアドレスまたは電話番号', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
    if (SIGNIN_BOTH_MARKERS) {
      // Node DOM AN cua buoc mat khau: van nam trong cay dump ngay ca
      // khi dang o buoc email (hien tuong WebView tren may that —
      // hotfix 3.2.3). Bounds rong (node khong hien tren man hinh).
      emailNodes.push({ text: 'パスワード', desc: '', className: 'android.view.View', bounds: [0, 0, 0, 0], clickable: false });
    }
    return emailNodes;
  }
  if (signinState === 'password') {
    return [
      { text: 'Google', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: 'ようこそ', desc: '', className: 'android.widget.TextView', bounds: [80, 300, 1000, 380], clickable: false },
      { text: 'パスワード', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
      { text: passwordFieldText ? '•'.repeat(Math.min(passwordFieldText.length, 12)) : '', desc: 'パスワード', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  if (signinState === 'verify') {
    return [
      { text: 'Google', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
      { text: '本人確認', desc: '', className: 'android.widget.TextView', bounds: [80, 300, 1000, 380], clickable: false },
      { text: '確認コードを入力してください', desc: '', className: 'android.widget.TextView', bounds: [80, 500, 1000, 560], clickable: false },
      { text: '', desc: '確認コード', className: 'android.widget.EditText', bounds: [80, 580, 1000, 700], clickable: true },
      { text: '次へ', desc: '', className: 'android.widget.Button', bounds: [760, 2100, 1000, 2220], clickable: true }
    ];
  }
  // done: da dang nhap xong — man hinh "home", khong con dau chu dang nhap
  return [
    { text: 'ホーム', desc: '', className: 'android.widget.TextView', bounds: [80, 200, 1000, 280], clickable: false },
    { text: '設定', desc: '', className: 'android.widget.TextView', bounds: [80, 400, 1000, 480], clickable: true }
  ];
}

/**
 * Node dang nhap Google NHIN THAY DUOC tai thoi diem nay: voi
 * FAKE_DELAY_NEXT=n, node nut 次へ bi an khi so lan dump_ui cua man
 * hinh email/mat khau hien tai con <= n (mo phong cay accessibility
 * chua kip lo node nut nhu tren may that).
 */
function visibleSigninNodes() {
  let nodes = signinNodes();
  if (DELAY_NEXT > 0 && (signinState === 'email' || signinState === 'password') &&
      signinDumpCounts[signinState] <= DELAY_NEXT) {
    nodes = nodes.filter((n) => (n.text || '') !== '次へ');
  }
  return nodes;
}

/**
 * Bounds node se bao trong dump_ui: khi FAKE_KEYBOARD_SHIFT=1 va
 * ban phim dang mo, node nut 次へ/ログイン bi lech +600px theo truc
 * y (mo phong may that bao sai toa do nut khi ban phim IME con mo —
 * hotfix 3.2.4). CHI dump_ui dung ban lech nay; mo phong cham
 * (tap theo toa do / tap_text) van xet theo bounds THAT trong
 * currentNodes() — cham vao toa do lech se truot nhu may that.
 */
function applyKeyboardShift(nodes) {
  if (!KEYBOARD_SHIFT || !keyboardOpen) return nodes;
  return nodes.map((n) => {
    if (n.className && n.className.indexOf('Button') >= 0 &&
        (n.text === '次へ' || n.text === 'ログイン') && Array.isArray(n.bounds)) {
      return Object.assign({}, n, { bounds: [n.bounds[0], n.bounds[1] + 600, n.bounds[2], n.bounds[3] + 600] });
    }
    return n;
  });
}

/** Node cua man hinh hien tai: dang o man hinh dang nhap thi tra node dang nhap. */
function currentNodes() {
  if (lineState !== 'none') return lineNodes();
  if (signinState !== 'none') return visibleSigninNodes();
  if (ttLoginState !== 'none') return ttLoginNodes();
  return fakeNodes();
}

function findFakeNode(text, match) {
  const nodes = currentNodes();
  for (const n of nodes) {
    const cands = [n.text || '', n.desc || ''];
    for (const c of cands) {
      if (!c) continue;
      if (match === 'exact' ? c === text : c.indexOf(text) >= 0) return n;
    }
  }
  return null;
}

/**
 * Hieu ung chuyen man hinh khi cham vao mot node (dung chung cho
 * tap_text va tap theo toa do): cham 次へ thi dang nhap Google/TikTok
 * chuyen buoc; cham ログイン o feed thi vao man hinh username TikTok;
 * cham ログイン o man hinh mat khau TikTok thi ket thuc dang nhap;
 * cham チェックインする thi danh dau da check-in.
 */
function applyTapTransitions(hit) {
  const hitText = (hit.text || '') + (hit.desc || '');
  if (hitText.indexOf('次へ') >= 0) {
    if (signinState === 'email') { signinState = 'password'; signinDumpCounts.password = 0; passwordFieldText = ''; }
    else if (signinState === 'password') signinState = FAKE_VERIFY ? 'verify' : 'done';
    // o 'verify' thi cham 次へ van o lai verify (chua nhap ma thi chua qua)
    else if (ttLoginState === 'username') { ttLoginState = 'password'; ttPassFieldText = ''; }
  }
  // May trang thai dang nhap TikTok Lite (Giai doan 3.2)
  if (ttLoginState === 'none' && signinState === 'none' && hitText.indexOf('ログイン') >= 0) {
    ttLoginState = 'username';
  } else if (ttLoginState === 'password' && hitText.indexOf('ログイン') >= 0) {
    ttLoginState = FAKE_TT_VERIFY ? 'verify' : 'none';
  }
  // Nut diem danh tren feed: bam vao la man hinh bao check-in xong
  if (hitText.indexOf('チェックインする') >= 0) ttCheckedIn = true;
  // May trang thai dang ky LINE (Giai doan 5)
  if (lineState === 'entry' && hitText.indexOf('新規登録') >= 0) {
    lineState = 'auth';
  } else if (lineState === 'auth' && hitText.indexOf('Googleで続ける') >= 0) {
    lineState = 'country';
  } else if (lineState === 'countrylist') {
    if (hitText.indexOf('シンガポール') >= 0) { lineCountry = 'SG'; lineState = 'country'; }
    else if (hitText.indexOf('日本') >= 0) { lineCountry = 'JP'; lineState = 'country'; }
  } else if (lineState === 'country') {
    if (hitText.indexOf('次へ') >= 0) {
      // Chi khi quoc gia da la Singapore thi 次へ moi di tiep
      if (lineCountry === 'SG') lineState = FAKE_LINE_VERIFY ? 'verify' : 'home';
    } else if (hitText.indexOf('+81') >= 0 || hitText.indexOf('日本') >= 0 ||
               hitText.indexOf('シンガポール') >= 0 || hitText.indexOf('+65') >= 0) {
      lineState = 'countrylist';
    }
  } else if (lineState === 'verify' && hitText.indexOf('次へ') >= 0) {
    if (lineCodeText) lineState = 'home';
  }
}

function handleCmd(msg) {
  const args = msg.args || {};
  console.log('[fake-agent] nhan lenh:', msg.cmd, JSON.stringify(args));
  // Ghi nhat ky lenh (debug): input_text/tap_text ghi chi tiet khi thanh
  // cong (o cac nhanh rieng ben duoi), cac lenh con lai ghi theo ten.
  if (msg.cmd !== 'input_text' && msg.cmd !== 'tap_text') logCmd(msg.cmd);
  switch (msg.cmd) {
    case 'status':
      result(msg.id, true, null, {
        battery: battery, charging: false, network: 'wifi', screenOn: true,
        label: 'Máy test ảo', model: 'Xperia XZ2 (fake)', android: '10',
        deviceOwner: IS_DEVICE_OWNER, accessibility: HAS_ACCESSIBILITY,
        width: SCREEN_W || undefined, height: SCREEN_H || undefined,
        lastTap: lastTap, lastSwipe: lastSwipe,
        signinState: signinState,
        ttLoginState: ttLoginState,
        ttCheckedIn: ttCheckedIn,
        lineState: lineState,
        openAppLog: openAppLog.slice(),
        cmdLog: cmdLog.slice()
      });
      break;
    case 'open_app': {
      // Mo app khac = roi khoi man hinh dang nhap Google (neu dang o do)
      // va ve feed TikTok (ttLoginState ve none); cac o nhap lam moi lai.
      // Mo LINE (Giai doan 5): vao man hinh entry cua dang ky LINE,
      // tru khi FAKE_LINE_NOT_INSTALLED=1 thi tra app_not_installed.
      const pkg = args['package'] || '';
      openAppLog.push(pkg);
      if (pkg === LINE_PKG && FAKE_LINE_NOT_INSTALLED) {
        result(msg.id, false, 'app_not_installed', null);
        break;
      }
      signinState = 'none';
      ttLoginState = 'none';
      keyboardOpen = false;
      emailFieldText = ''; passwordFieldText = ''; ttUserFieldText = ''; ttPassFieldText = '';
      lineState = (pkg === LINE_PKG) ? 'entry' : 'none';
      if (pkg === LINE_PKG) { lineCountry = 'JP'; lineCodeText = ''; }
      result(msg.id, true, null, { opened: pkg });
      break;
    }
    case 'open_google_signin':
      // Mo man hinh dang nhap Google — khong can Tro nang (giong agent that)
      signinState = 'email';
      signinDumpCounts = { email: 0, password: 0 };
      emailFieldText = ''; passwordFieldText = '';
      keyboardOpen = false;
      result(msg.id, true, null, { opened: 'google_signin' });
      break;
    case 'wake':
      result(msg.id, true, null, { awake: true });
      break;
    case 'install_url':
      result(msg.id, true, null, { installer: 'opened (fake)', url: args.url || '' });
      break;
    case 'screenshot':
      result(msg.id, true, null, { image: TINY_JPEG_B64 });
      break;
    case 'factory_reset':
      if (IS_DEVICE_OWNER) result(msg.id, true, null, { wiping: true });
      else result(msg.id, false, 'not_device_owner', null);
      break;
    case 'tap': {
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      // Cham theo toa do: diem cham nam trong bounds cua node nao thi
      // mo phong nhu cham vao node do (chuyen man hinh nhu tap_text);
      // cham vao nut (Button) co chu thi ghi them "tap_text:<chu>" vao
      // cmdLog — helper 3.2.1 cua server cham nut bang lenh 'tap' nay.
      const px = args.x || 0, py = args.y || 0;
      lastTap = { x: px, y: py };
      const hitN = currentNodes().find((n) => Array.isArray(n.bounds) &&
        px >= n.bounds[0] && px <= n.bounds[2] && py >= n.bounds[1] && py <= n.bounds[3]);
      if (hitN) {
        applyTapTransitions(hitN);
        if (hitN.className && hitN.className.indexOf('Button') >= 0 && hitN.text) {
          logCmd('tap_text:' + hitN.text);
        }
      }
      result(msg.id, true, null, { tapped: { x: px, y: py } });
      break;
    }
    case 'swipe':
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      lastSwipe = { x1: args.x1 || 0, y1: args.y1 || 0, x2: args.x2 || 0, y2: args.y2 || 0 };
      result(msg.id, true, null, { swiped: lastSwipe });
      break;
    case 'input_text':
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      if (NO_FOCUS) { result(msg.id, false, 'no_focus', null); break; }
      // Hotfix 3.2.2: FAKE_NO_FOCUS_FIRST=n — n lan input_text dau
      // tien tra no_focus (mo phong o chua kip focus tren may that),
      // ghi cmdLog "input_text:no_focus" de thay cac lan thu lai.
      if (noFocusFirstLeft > 0) {
        noFocusFirstLeft--;
        logCmd('input_text:no_focus');
        result(msg.id, false, 'no_focus', null);
        break;
      }
      // Ghi nhat ky theo man hinh dang nhap: email ghi ro (khong nhay cam),
      // mat khau CHI ghi dang che — khong bao gio ghi mat khau that.
      // Dong thoi LUU noi dung vao o nhap tuong ung (mo phong o giu
      // text sau khi nhap — hotfix 3.2.3): o mat khau chi giu noi bo,
      // dump_ui chi hien dau cham.
      if (signinState === 'email') {
        logCmd('input_text(email):' + (args.text || ''));
        // FAKE_DROP_FIRST_INPUT=1: lan nhap thanh cong dau tien bi
        // "rot" — lenh van ok, cmdLog van ghi, nhung o KHONG giu
        // noi dung (dump_ui tiep theo van thay o trong).
        if (dropFirstInputLeft > 0) dropFirstInputLeft--;
        else emailFieldText = args.text || '';
      }
      else if (signinState === 'password') { passwordFieldText = args.text || ''; logCmd('input_text(password):********'); }
      else if (ttLoginState === 'username') { ttUserFieldText = args.text || ''; logCmd('input_text(ttuser):' + (args.text || '')); }
      else if (ttLoginState === 'password') { ttPassFieldText = args.text || ''; logCmd('input_text(password):********'); }
      else if (lineState === 'verify') { lineCodeText = args.text || ''; logCmd('input_text(linecode):********'); }
      else if (lineState === 'countrylist') { logCmd('input_text(linesearch):' + (args.text || '')); }
      else logCmd('input_text:' + (args.text || ''));
      // Nhap thanh cong = ban phim IME dang mo (mo phong 3.2.4)
      keyboardOpen = true;
      result(msg.id, true, null, { typedLength: (args.text || '').length });
      break;
    case 'key':
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      // Phim Back dong ban phim IME (mo phong 3.2.4) — dump_ui sau
      // do lai bao bounds DUNG cua cac nut. Ghi cmdLog "key:back"
      // de script kiem chung thay duoc buoc tat ban phim.
      if ((args.key || '') === 'back') { keyboardOpen = false; logCmd('key:back'); }
      result(msg.id, true, null, { key: args.key || '' });
      break;
    case 'dump_ui': {
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      // Dang o man hinh dang nhap Google: tra node dang nhap, KHONG dem
      // vao bo dem check-in (chi dump o man hinh TikTok moi dem).
      // Rieng bo dem cua FAKE_DELAY_NEXT thi co dem theo man hinh.
      if (signinState !== 'none') {
        if (signinState === 'email' || signinState === 'password') signinDumpCounts[signinState]++;
        const sn = applyKeyboardShift(visibleSigninNodes());
        result(msg.id, true, null, { nodes: sn, count: sn.length });
        break;
      }
      // Dang o man hinh dang nhap TikTok Lite: tra node dang nhap TikTok,
      // cung KHONG dem vao bo dem check-in.
      if (ttLoginState !== 'none') {
        const tn = applyKeyboardShift(ttLoginNodes());
        result(msg.id, true, null, { nodes: tn, count: tn.length });
        break;
      }
      // Dang o man hinh dang ky LINE (Giai doan 5): tra node LINE,
      // cung KHONG dem vao bo dem check-in.
      if (lineState !== 'none') {
        const ln = applyKeyboardShift(lineNodes());
        result(msg.id, true, null, { nodes: ln, count: ln.length });
        break;
      }
      dumpCount++;
      const nodes = applyKeyboardShift(fakeNodes());
      result(msg.id, true, null, { nodes: nodes, count: nodes.length });
      break;
    }
    case 'tap_text': {
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      const hit = findFakeNode(args.text || '', args.match || 'contains');
      if (!hit) { result(msg.id, false, 'text_not_found', null); break; }
      logCmd('tap_text:' + (args.text || ''));
      // May trang thai dang nhap: cham vao node thi chuyen man hinh
      applyTapTransitions(hit);
      result(msg.id, true, null, {
        tapped: true,
        text: hit.text || hit.desc || '',
        bounds: hit.bounds,
        x: Math.round((hit.bounds[0] + hit.bounds[2]) / 2),
        y: Math.round((hit.bounds[1] + hit.bounds[3]) / 2)
      });
      break;
    }
    case 'wait_text': {
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      const hit = findFakeNode(args.text || '', 'contains');
      result(msg.id, true, null, { found: !!hit });
      break;
    }
    case 'open_url': {
      if (!HAS_ACCESSIBILITY) { result(msg.id, false, 'no_accessibility', null); break; }
      const url = args.url || '';
      if (!url || (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0)) {
        result(msg.id, false, 'bad_url', null);
        break;
      }
      result(msg.id, true, null, { opened: url });
      break;
    }
    default:
      result(msg.id, false, 'unknown_cmd', null);
  }
}
