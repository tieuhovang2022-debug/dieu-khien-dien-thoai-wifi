# VERIFY — Farm Control Giai đoạn 1 (kiểm chứng nội bộ, 2026-11-14)

## Toolchain
- Temurin OpenJDK 17.0.21 (tải tarball chính thức, cài vào ~/workspace/tools/jdk)
- Android SDK: cmdline-tools 12.0 + platforms;android-29 + build-tools;30.0.3.
  Lưu ý: sdkmanager không chạy được qua proxy egress của VM (Java lỗi doTunneling),
  nên platform-29_r05.zip và build-tools_r30.0.3-linux.zip được tải trực tiếp từ
  dl.google.com bằng curl và bố trí thủ công vào cây SDK — aapt2/d8/zipalign/apksigner chạy tốt.


## APK agent — BUILD THÀNH CÔNG
- File: agent/agent.apk (25 KB), ký bằng debug keystore (agent/debug.keystore), apksigner verify OK.
- aapt2 dump badging:
  - package: name='vn.duongashita.farmagent' versionCode='1' versionName='1.0'
  - sdkVersion:'28' targetSdkVersion:'29'
  - application: label='Farm Agent'
  - launchable-activity: vn.duongashita.farmagent.MainActivity
  - uses-permission: INTERNET, ACCESS_NETWORK_STATE, FOREGROUND_SERVICE,
    RECEIVE_BOOT_COMPLETED, WAKE_LOCK, REQUEST_INSTALL_PACKAGES,
    REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (bổ sung cho nút tắt tối ưu pin)
- CHƯA test trên máy thật — mới biên dịch + kiểm tĩnh. Người dùng là người test máy thật đầu tiên.

## Server — TEST VÒNG KÍN ĐẠT (server.js + fake-agent.js trên cùng VM)
- GET /api/devices → fake-device-001 ("Máy test ảo", Xperia XZ2 (fake), Android 10, pin 87%) online=true.
- POST /api/cmd status → ok=true, data: battery 87, charging false, network wifi, screenOn true.
- POST /api/cmd open_app (com.zhiliaoapp.musically.go) → ok=true, opened đúng package.
- POST /api/cmd wake → ok=true.
- POST /api/cmd screenshot → ok=true, data.image giải mã base64 = 635 byte, magic JPEG FFD8/FFD9 hợp lệ.
- POST /api/cmd với deviceId không tồn tại → HTTP 404 {ok:false, error:"device_not_found"} (lỗi gọn).
- GET / → HTTP 200 (dashboard).
- Ghi chú nhỏ: /api/devices ngay sau hello hiện network "none" vì hello (theo đặc tả) không mang
  trường network — heartbeat/status đầu tiên (tối đa 30 giây với agent thật) sẽ cập nhật đúng.

## Chưa làm ở giai đoạn 1 (đúng phạm vi)
- Chưa có Device Owner / ghi danh QR / reset máy từ xa / cấp Gmail — giai đoạn 2, 3.
- Lệnh install_url trên máy thật mới mở trình cài đặt, người dùng vẫn chạm "Cài đặt".

---

# VERIFY — Farm Control Giai đoạn 2 (kiểm chứng nội bộ, 2026-11-16)

Script kiểm chứng: `verify-stage2.js` (tự chạy server tạm ở cổng 18787/18080 +
fake agent nhiều chế độ, dọn pool test sau khi chạy). Kết quả: **38 PASS, 0 FAIL**.

## APK agent v2 — BUILD THÀNH CÔNG
- versionCode 2 / versionName "2.0", package vn.duongashita.farmagent, minSdk 28 / targetSdk 29 (không đổi).
- Ký bằng ĐÚNG debug keystore cũ (agent/debug.keystore): apksigner verify OK,
  cert SHA-256 digest = `0c153ff07f181ca786a379ad4893adbb76066416b71533db452da0cb058b9a29`
  — KHỚP 100% với Stage 1.
- aapt2 dump xmltree xác nhận trong APK có: `.AdminReceiver` (BIND_DEVICE_ADMIN +
  meta-data @xml/device_admin), `.FarmAccessibilityService` (BIND_ACCESSIBILITY_SERVICE +
  meta-data @xml/accessibility_config), res/xml/device_admin.xml + res/xml/accessibility_config.xml.
- Checksum cho QR provisioning (base64url, không padding, của cert SHA-256 trên):
  `DBU_8H8YHKeGo3mtSJOtu3YGZBa3FTPbRS2gywWLmik`.
- Mới trong agent: lệnh factory_reset (chỉ chạy khi là Device Owner, trả ok trước
  rồi wipeData sau 1,5s; chưa Device Owner → lỗi `not_device_owner`), lệnh
  tap/swipe/input_text/key qua AccessibilityService (chưa bật Trợ năng →
  `no_accessibility`; input_text không có ô nhập đang focus → `no_focus`;
  key enter không inject được → `key_not_supported`), status/hello/heartbeat
  mang thêm `deviceOwner` + `accessibility`. Toàn bộ lệnh Stage 1 giữ nguyên.
- CHƯA test trên máy thật — mới biên dịch + kiểm tĩnh + test vòng kín bằng máy ảo.

## Server v2 — TEST VÒNG KÍN ĐẠT (verify-stage2.js)
- Fake agent online, /api/devices hiện đúng deviceOwner=false / accessibility=true / agentVersion 2.0-fake.
- tap, swipe, input_text, key(back) → ok. status (lệnh cũ) vẫn ok và mang 2 cờ mới.
- factory_reset: chưa Device Owner → `{ok:false, error:"not_device_owner"}`;
  với FAKE_DEVICE_OWNER=1 → `{ok:true, data:{wiping:true}}`.
- FAKE_NO_FOCUS=1: input_text → lỗi `no_focus`. FAKE_ACCESSIBILITY=0: status báo
  accessibility=false, tap → lỗi `no_accessibility`.
- Kho Gmail: import 5 dòng (3 hợp lệ + 1 trùng + 1 hỏng) → added=3, skipped=1;
  GET /api/gmail trả passwordMasked "********", rà toàn bộ response KHÔNG chứa
  mật khẩu thật; assign → tài khoản ready tiếp theo (a2) gắn đúng deviceId;
  signin-assist chạy 2 bước input_text đều ok và response HTTP không lộ mật khẩu
  (mật khẩu chỉ đi qua kênh lệnh TCP tới agent); mark-die + delete chạy đúng.
- Pipeline "cap-may-moi" (không nhập URL APK): các bước đi đúng thứ tự
  done → skipped → skipped → done → waiting_manual (bước assign_gmail cấp thật
  a1 cho máy trong lúc chạy), POST /api/pipeline/resume → run hoàn thành (done).
- GET /api/provision/qr: JSON parse được; component
  `vn.duongashita.farmagent/vn.duongashita.farmagent.AdminReceiver`; download
  location `http://<SERVER_LAN_IP>:<port>/apks/agent.apk`; có SKIP_ENCRYPTION +
  LEAVE_ALL_SYSTEM_APPS_ENABLED; checksum ở endpoint KHỚP với checksum tính độc
  lập từ APK thật bằng apksigner trong cùng script kiểm chứng.
- Dashboard: HTTP 200, có đủ panel Giai đoạn 2 (tổng quan, lưới máy, pipeline,
  kho Gmail, QR, nhật ký).

## Giới hạn đã biết (nói rõ trong HUONG-DAN)
- factory_reset chỉ chạy trên máy đã ghi danh Device Owner bằng QR lúc vừa
  factory reset; máy cài agent kiểu thường sẽ nhận lỗi not_device_owner.
- Trợ năng phải bật tay 1 lần/máy (Android không cho app tự bật).
- CAPTCHA / xác minh SĐT của Google vẫn là bước chạm tay — pipeline dừng ở
  trạng thái waiting_manual ("Chờ chạm tay") chờ bấm Resume.
- signin-assist gõ email rồi mật khẩu vào ô đang focus; nếu máy đang ở ô email
  thì cần chạm "Tiếp theo" giữa 2 bước (dashboard có ghi chú này).
- APK v2 vẫn CHƯA chạy trên máy thật nào.

## Giai đoạn 3 — Kiểm chứng (2026-11-16)

APK agent v3: build thành công bằng `agent/build.sh` — versionCode 3 /
versionName "3.0", package vn.duongashita.farmagent, minSdk 28 / targetSdk 29
(không đổi), kích thước 33.319 byte. Chứng chỉ ký (apksigner):
SHA-256 `0c153ff07f181ca786a379ad4893adbb76066416b71533db452da0cb058b9a29` —
trùng khớp Giai đoạn 1 và 2 (cùng debug.keystore của dự án).

Chạy `node verify-stage3.js` (server tạm trên TCP 19787 / HTTP 19080, vòng xem
game rút ngắn bằng `FARM_WATCH_MIN_SEC=1` / `FARM_WATCH_MAX_SEC=2`, fake agent
với `FAKE_CHECKIN_AFTER=2`) và chạy lại `node verify-stage2.js`:

**verify-stage3.js: 41 PASS, 0 FAIL** — gồm:
- Server v3 khởi động, `/api/info` báo `agentVersionExpected: 3.0`; fake agent
  online với `agentVersion 3.0-fake`, accessibility=true.
- Lệnh mới: `dump_ui` → ok, trả danh sách node có nút 「次へ」, lần dump đầu chưa
  có chữ check-in; `tap_text` contains → ok (đúng tọa độ tâm), `tap_text` exact
  không khớp → `text_not_found`, chữ không có → `text_not_found`; `wait_text`
  có chữ → `found=true`, không có → `found=false` (vẫn ok); `open_url` https →
  ok, URL sai định dạng → `bad_url`.
- Hồi quy Gmail: import 2 tài khoản, list luôn che mật khẩu, không lộ pass thật.
- Hồi quy pipeline `cap-may-moi`: chạy tới `waiting_manual` → resume → `done`
  (thứ tự bước done,skipped,skipped,done,done).
- Flow `dang-ky-tiktok-lite`: đủ 3 flow trong `/api/pipelines`; flow chạy tới
  bước manual đúng tên "Đăng nhập: nhập số điện thoại/email, mã xác minh và
  CAPTCHA trên máy" và dừng `waiting_manual`; các bước tap_text trước manual đều
  `done` — marker có trên màn hình giả thì chạm thật (「スキップ」「次へ」), marker
  không có thì ghi chú "bỏ qua (dung sai)" và đi tiếp, không fail; resume →
  `done` toàn bộ 19 bước.
- Watch quét game: trước khi xem, `tap_text` 「チェックイン完了」 → `text_not_found`;
  `POST /api/watch/start` → vòng chạy; dump lần 2 thấy marker → trạng thái máy
  thành `da_checkin` với `matchedMarker` = 「チェックイン完了」, bộ đếm
  check-in thành công = 1, sự kiện `checkin_success` xuất hiện trong
  `/api/events`, thẻ máy (`/api/devices`) hiện trạng thái watch, và vòng xem tự
  dừng (số vòng không tăng sau 3 giây).
- Flow `quet-game-xem-video` chạy từ panel pipeline: 3 bước
  (command/wait/watch_game) đều `done`; `POST /api/watch/stop` → ok.
- Dashboard HTTP 200, có ô đếm "Check-in thành công" và ô nhập của flow mới.

**verify-stage2.js chạy lại: 38 PASS, 0 FAIL** — không hồi quy; kiểm tra checksum
QR trong đó xác nhận APK v3 ký cùng chứng chỉ (checksum
`DBU_8H8YHKeGo3mtSJOtu3YGZBa3FTPbRS2gywWLmik`, trùng APK v2).

LƯU Ý: toàn bộ kiểm chứng trên là với fake agent. Agent v3 (dump_ui/tap_text/
wait_text/open_url qua AccessibilityService thật) CHƯA chạy trên điện thoại thật;
các marker trong `server/data/flow-config.json` là giá trị mặc định phỏng đoán
theo giao diện TikTok Lite tiếng Nhật — phải hiệu chuẩn sau lần chạy thật đầu
tiên (xem mục Hiệu chuẩn trong HUONG-DAN.md của gói Giai đoạn 3).

---

## Giai đoạn 3.1 — Cấp Gmail TỰ ĐỘNG (kiểm chứng nội bộ, 2026-11-16)

Yêu cầu của người dùng: bấm "Cấp Gmail" là điện thoại TỰ mở màn hình đăng
nhập Google, TỰ nhập Gmail từ kho, bấm Tiếp theo, TỰ nhập mật khẩu và
đăng nhập — không chạm tay, trừ CAPTCHA / xác minh của Google (vẫn dừng
"Chờ chạm tay" như các giai đoạn trước).

APK agent v3.1: build thành công bằng `agent/build.sh` — versionCode 4 /
versionName "3.1", package vn.duongashita.farmagent, minSdk 28 /
targetSdk 29 (không đổi), kích thước 33.319 byte. Chứng chỉ ký (apksigner):
SHA-256 `0c153ff07f181ca786a379ad4893adbb76066416b71533db452da0cb058b9a29` —
trùng khớp Giai đoạn 1, 2 và 3 (cùng debug.keystore; checksum QR
provisioning không đổi). Kiểm tĩnh: chuỗi `open_google_signin` và
`android.settings.ADD_ACCOUNT_SETTINGS` có trong classes.dex.

Mới trong agent v3.1:
- Lệnh `open_google_signin`: startActivity Intent
  `android.settings.ADD_ACCOUNT_SETTINGS` kèm EXTRA_ACCOUNT_TYPES =
  {"com.google"} + FLAG_ACTIVITY_NEW_TASK; lỗi thì thử lại không kèm
  extra; vẫn lỗi thì trả `no_activity`. Lệnh này KHÔNG cần Trợ năng.
  Hello báo agentVersion "3.1". Mọi lệnh cũ giữ nguyên.

Mới trong server v3.1:
- `flow-config.json` thêm mục `signin` (mặc định tiếng Nhật trước):
  emailScreen [メールアドレスまたは電話番号 / メールアドレス / Email or phone],
  nextButton [次へ / Next], passwordScreen [パスワード / Password],
  agreeButton [同意します / I agree], verifyMarkers [本人確認 / 確認コード /
  セキュリティコード / 電話番号を入力 / ロボットではありません / 2段階認証].
  loadFlowConfig hợp nhất với mặc định khi file thiếu mục — file cũ của
  Giai đoạn 3 (chưa có signin) vẫn chạy được.
- Hàm dùng chung `gmailSigninSequence(deviceId, acct, hooks)`: mở màn
  hình đăng nhập → poll dump_ui mỗi ~1,5s (tối đa ~25s) chờ marker màn
  hình email → chạm ô EditText đầu tiên (lệnh tap theo tọa độ tâm) →
  input_text email → tap_text nút Tiếp theo → poll dump_ui: thấy
  verifyMarker thì park waiting_manual với ghi chú nguyên văn "Máy đang
  ở bước xác minh của Google — xử lý chạm tay trên máy rồi bấm Chạy
  tiếp", thấy marker màn hình mật khẩu (hoặc EditText) thì tiếp tục →
  chạm ô mật khẩu → input_text mật khẩu → tap_text Tiếp theo → cửa sổ
  ~8s chạm nút đồng ý nếu có (dung sai) → dump cuối: còn verifyMarker
  thì park, không còn thì done. Resume sau park chạy lại đúng vòng kiểm
  tra cuối (đồng ý + quét xác minh). Mọi tiểu bước đều ghi sự kiện loại
  `gmail_signin` (thấy email, mật khẩu luôn "********").
- Flow mới `cap-gmail-tu-dong` (2 bước: assign_gmail có reuseAssigned —
  máy đã có tài khoản được cấp thì dùng lại, kho rỗng thì lỗi rõ ràng —
  rồi gmail_signin). Dashboard có nút **✉️ Cấp Gmail** trên từng thẻ máy
  chạy flow này; flow cũng xuất hiện trong ô chọn Pipeline (qua
  /api/pipelines).
- Pipeline `cap-may-moi`: bước assign_gmail thêm cờ withSignin — cấp
  xong chạy luôn trình tự đăng nhập tự động trong cùng bước (chỉ park
  khi gặp xác minh). Thứ tự/trạng thái 5 bước giữ nguyên như Giai đoạn 2
  (done, skipped, skipped, done, waiting_manual — đã kiểm chứng lại).
  Bước manual cuối đổi tên thành "Kiểm tra trên máy: đăng nhập TikTok
  Lite / xử lý CAPTCHA nếu còn (chạm tay)".
- `POST /api/gmail/signin-assist` **ủy quyền cho gmailSigninSequence**
  (thay cho cách gõ 2 lần vào ô đang focus của Giai đoạn 2) nhưng **giữ
  nguyên dạng response cũ** {ok, email, passwordMasked, deviceId,
  steps:[email, password]} — verify-stage2 khẳng định nguyên dạng này
  nên vẫn đạt. Khác biệt hành vi: nếu Google bắt xác minh, endpoint (là
  request đồng bộ, không park được) trả ok=false + outcome='verify' và
  ghi chú hướng dẫn dùng flow cap-gmail-tu-dong để dừng Chờ chạm tay.

Fake agent v3.1: thêm máy trạng thái màn hình đăng nhập Google cho
dump_ui/tap_text — `open_google_signin` → state email (node
メールアドレスまたは電話番号 + 1 EditText + nút 次へ) → input_text +
tap_text 次へ → state password (node パスワード + 1 EditText) →
input_text + tap_text 次へ → state done (node ホーム, không còn marker
đăng nhập); với FAKE_VERIFY=1 thì sang state verify (本人確認 /
確認コード). open_app đưa state về none. Lệnh status trả thêm
`signinState` và `cmdLog` (nhật ký lệnh đã nhận; input_text ở màn hình
mật khẩu ghi "input_text(password):********" — không ghi mật khẩu thật).
Lưu ý tương thích: bộ đếm FAKE_CHECKIN_AFTER chỉ đếm dump_ui ở màn hình
TikTok (dump ở các màn hình đăng nhập không đếm) để trình tự đăng nhập
không làm lệch kiểm chứng vòng xem game của Giai đoạn 3.

Chạy `node verify-stage31.js` (server tạm TCP 20787 / HTTP 20080):

**verify-stage31.js: 29 PASS, 0 FAIL** — gồm:
- (a) Flow cap-gmail-tu-dong chạy đến done: assign_gmail done (ghi rõ
  email được cấp), gmail_signin done.
- (b) Thứ tự lệnh fake agent nhận được (qua data.cmdLog của lệnh
  status), lọc input_text/tap_text/open_google_signin, khớp ĐÚNG:
  open_google_signin → input_text(email):s31a@gmail.com → tap_text:次へ
  → input_text(password):******** → tap_text:次へ.
- (c) Quét toàn bộ thân mọi response API trong phiên + /api/events:
  mật khẩu thử (2 tài khoản) KHÔNG xuất hiện ở đâu; sự kiện gmail_signin
  ghi được email và bước hoàn tất, mật khẩu chỉ ở dạng ********.
- (d) FAKE_VERIFY=1: flow dừng waiting_manual với ghi chú xác minh
  nguyên văn; Resume → chạy lại kiểm tra cuối → vẫn còn xác minh nên
  dừng lại waiting_manual; Stop → run stopped hẳn. Bước assign dùng lại
  tài khoản đã cấp (reuseAssigned) như thiết kế.
- Lệnh open_google_signin trực tiếp qua /api/cmd → ok; dashboard có nút
  Cấp Gmail + flow mới.

**verify-stage3.js chạy lại: 41 PASS, 0 FAIL** và **verify-stage2.js
chạy lại: 38 PASS, 0 FAIL** — không hồi quy. Chạy thêm một lượt
verify-stage31.js trên bản server ĐÃ ĐÓNG GÓI trong thư mục giao hàng
(farm-agent-giai-doan-3-1): 29 PASS, 0 FAIL.

Ghi chú tương thích: fake agent vẫn báo agentVersion "3.0-fake" và
/api/info vẫn báo agentVersionExpected "3.0" — hai script kiểm chứng cũ
khẳng định nguyên văn các chuỗi này; APK thật là 3.1 (hello báo "3.1").

LƯU Ý: toàn bộ kiểm chứng trên là với fake agent. Agent v3.1
(open_google_signin + trình tự đăng nhập) CHƯA chạy trên điện thoại
thật; các marker trong mục `signin` của flow-config.json là mặc định
phỏng theo màn hình đăng nhập Google tiếng Nhật — phải hiệu chuẩn sau
lần chạy thật đầu tiên bằng dump_ui (xem HUONG-DAN.md của gói 3.1).
CAPTCHA / xác minh SĐT / 2 bước của Google vẫn là bước chạm tay (flow
dừng ở waiting_manual chờ Resume) — đúng giới hạn đã thống nhất.
