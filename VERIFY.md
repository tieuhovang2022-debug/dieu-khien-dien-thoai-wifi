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
