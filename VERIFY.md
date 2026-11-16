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

---

## Giai đoạn 3.2 — Kho heo + đăng nhập TikTok Lite + điểm danh 14 ngày + dashboard 4 tab (kiểm chứng nội bộ, 2026-11-16)

Yêu cầu của người dùng: viết lại trang điều khiển theo mẫu đã duyệt
(4 tab: Dàn máy / Kho dữ liệu / Tác vụ / Hành động, tông tím) và code
đầy đủ công dụng + liên kết các phần. Hai làm rõ thêm về "Check heo":
(1) Check heo là việc hằng ngày của máy ĐÃ quét ăn game — check xem
video để Nik mời nhận thêm tiền thưởng (không phải quét game nói
chung); (2) Nik xem PHẢI vào bằng link game chuyên dụng / mã QR riêng
thì bên Link mới được ghi nhận thành công — link này bắt buộc khi chạy
Check heo và được lưu trên server (data/game-link.json) để khỏi dán
lại mỗi ngày.

Agent: **KHÔNG đổi** — vẫn Farm Agent v3.1 (cùng APK, cùng chữ ký;
mọi tính năng 3.2 đều chạy bằng các lệnh agent sẵn có).

Mới trong server v3.2:
- **Kho tài khoản xem heo chưa đăng nhập** (`data/heo-pool.json`, tự
  tạo rỗng): API mirror kho Gmail — `POST /api/heo/import` (dòng
  `username|mật khẩu` hoặc `username:mật khẩu`, dedupe theo username,
  bỏ dòng hỏng + báo số lượng), `GET /api/heo` (mật khẩu LUÔN che),
  `POST /api/heo/assign-next {deviceId}`, `POST /api/heo/mark-die`,
  `POST /api/heo/delete`. Entry có thêm `loggedInAt`.
- **Flow `dang-nhap-tiktok-lite`**: cấp tài khoản heo (reuse nếu máy
  đã được cấp; kho rỗng → lỗi rõ ràng `pool_empty`) → `open_app`
  TikTok Lite → điều hướng màn hình đăng nhập theo mục **`tiktokLogin`**
  mới trong flow-config (loginEntry / usernameScreen / passwordScreen /
  loginButton / verifyMarkers, mặc định tiếng Nhật trước) → nhập
  username → nhập mật khẩu → bấm đăng nhập → kiểm tra cuối: thấy chữ
  xác minh thì park `waiting_manual` với ghi chú nguyên văn "Máy đang
  ở bước xác minh của TikTok — xử lý chạm tay trên máy rồi bấm Chạy
  tiếp"; xong thì ghi `loggedInAt`. Engine `tiktokLoginSequence()`
  viết theo đúng mẫu `gmailSigninSequence()` (poll dump_ui ~1,5s,
  timeout ~25s, sự kiện `tiktok_login` từng tiểu bước, mật khẩu luôn
  `********`).
- **Flow `diem-danh` (điểm danh 14 ngày)**: trạng thái per-device trong
  `data/checkin-state.json` (`{dates[], cycleStart}`, ngày theo
  Asia/Tokyo). Mở TikTok Lite → vào mục điểm danh theo mục **`checkin`**
  mới trong flow-config (entryMarkers / buttonMarkers /
  successMarkers) → thấy chữ thành công thì ghi ngày hôm nay; hôm nay
  đã ghi rồi thì xong ngay với ghi chú "Hôm nay đã điểm danh rồi".
  API `GET /api/checkin` (count/dates/todayDone/complete) +
  `POST /api/checkin/reset {deviceId}`.
- **Check heo**: thẻ ở tab Hành động ghi đúng nghĩa "Máy đã quét ăn
  game — check xem video hằng ngày để Nik mời nhận thêm tiền thưởng";
  ô **"Link game chuyên dụng (hoặc nội dung mã QR)" là BẮT BUỘC** —
  trống thì dashboard chặn chạy và báo rõ phải dán link trước. Chạy =
  mở link bằng `open_url` → vòng xem tự vuốt video + quét dump_ui tìm
  chữ thành công → ghi sự kiện `checkin_success`, đánh dấu máy, dừng.
  Link lưu server-side: `GET/POST /api/game-link` +
  `data/game-link.json`; dashboard tự tải và điền sẵn (cả ô Check heo,
  Xem video và Pipeline), tự lưu khi chạy/đổi link.
- **"Tự động xem video" tách hẳn khỏi Check heo**: watch manager thêm
  cờ `detect` (mặc định true — mọi caller cũ giữ nguyên hành vi);
  xem video thường chạy `detect:false` — chỉ vuốt xem hết giờ, KHÔNG
  quét chữ thành công, không báo check-in.
- **Dashboard viết lại** (theo mẫu demo đã duyệt): 1 trang, header +
  5 ô đếm (Tổng máy / Online / Gmail sẵn sàng / TK heo sẵn sàng /
  Check-in thành công), thanh tab sticky 4 tab đúng thứ tự **📱 Dàn
  máy (mặc định) · 🗄 Kho dữ liệu · ⚙ Tác vụ · ▶ Hành động**, chỉ hiện
  panel của tab đang chọn; tông tím phong phú (violet chủ đạo + hồng
  sakura + xanh dương + hổ phách theo mục), chữ to, gọn. Thẻ máy có
  checkbox chọn máy (dùng chung cho Tác vụ/Hành động), badge Gmail đã
  cấp / TK heo đã cấp / điểm danh n/14 / trạng thái xem, nút Status /
  Wake / Screenshot / ✉️ Cấp Gmail; panel QR nằm trong tab Dàn máy.
  Tab Kho dữ liệu: kho Gmail + kho heo cạnh nhau. Tab Tác vụ: 4 thẻ
  (Đăng nhập Google, Tải LINE, Tải TikTok Lite, Đăng nhập TikTok Lite
  bằng TK trong kho) + khối Pipeline đầy đủ + nhật ký sự kiện. Tab
  Hành động: Điểm danh 14 ngày (nút chạy + tiến độ từng máy + nút bắt
  đầu chu kỳ mới), Tự động xem video, Check heo + ô đếm check-in +
  nhật ký check-in/xem video. Mọi API cũ giữ nguyên.
- `/api/devices` thêm `gmailAssigned`, `heoAssigned`, `checkin`
  (count/dates/todayDone/complete) cho từng máy.
- flow-config.json thêm 2 mục `tiktokLogin` + `checkin` (đọc lại trực
  tiếp mỗi lần chạy, file cũ thiếu mục thì dùng mặc định — tương thích
  ngược).

Fake agent v3.2: thêm máy trạng thái đăng nhập TikTok Lite (feed có
nút ログイン → màn hình username → password → về feed; env
`FAKE_TT_VERIFY=1` → màn hình verify 本人確認/確認コード) và màn hình
điểm danh trên feed (nút チェックインする → dump sau đó có
チェックイン完了); input_text ở màn hình username TikTok ghi
`input_text(ttuser):<username>`, ở màn hình mật khẩu ghi che. Bộ đếm
`FAKE_CHECKIN_AFTER` giữ nguyên hành vi (chỉ đếm dump ở màn hình
TikTok feed; dump ở các màn hình đăng nhập Google/TikTok không đếm).

Chạy `node verify-stage32.js` (server tạm TCP 21787 / HTTP 21080,
vòng xem rút ngắn bằng `FARM_WATCH_MIN_SEC=1` / `FARM_WATCH_MAX_SEC=2`):

**verify-stage32.js: 54 PASS, 0 FAIL** — gồm:
- (a) Kho heo: import 4 dòng (2 hợp lệ + 1 trùng + 1 hỏng) →
  added=2, skipped=1; list luôn che mật khẩu, không lộ pass thật;
  assign-next cấp đúng tài khoản đầu kho, thẻ máy hiện TK đã cấp;
  mark-die + delete chạy đúng.
- (f) `/api/game-link`: ban đầu rỗng → lưu → đọc lại đúng; file
  `game-link.json` có trên đĩa.
- (b) Flow `dang-nhap-tiktok-lite` chạy đến `done`; fake agent nhận
  đúng thứ tự lệnh: `open_app → tap_text:ログイン →
  input_text(ttuser):nikheo_a1 → tap_text:次へ →
  input_text(password):******** → tap_text:ログイン`; tài khoản được
  ghi `loggedInAt`; sự kiện `tiktok_login` ghi đủ tiến trình.
- (d) `FAKE_TT_VERIFY=1`: flow dừng `waiting_manual` với ghi chú xác
  minh TikTok nguyên văn; Stop → run dừng hẳn.
- (e) Điểm danh: ghi ngày 1/14, `/api/checkin` count=1 /
  todayDone=true / complete=false, `checkin-state.json` lưu đúng
  ngày Tokyo; chạy lại cùng ngày → "Hôm nay đã điểm danh rồi", count
  vẫn 1; reset → count=0.
- (f) Check heo qua link chuyên dụng (watch + detect): phát hiện
  チェックイン完了 → `da_checkin`, bộ đếm check-in tăng, có sự kiện
  `checkin_success`; xem video thường (`detect:false`) vẫn `watching`
  sau 3,5 giây dù màn hình có sẵn chữ thành công — không báo nhầm.
- (g) Dashboard: HTTP 200, 4 tab đúng thứ tự với Dàn máy là tab mặc
  định active; có kho heo, flow đăng nhập TikTok và ô link game
  chuyên dụng với đúng câu chữ của người dùng.
- (c) Quét toàn bộ thân mọi response API trong phiên + `/api/events`:
  cả 3 mật khẩu heo thử nghiệm KHÔNG xuất hiện ở đâu.

**verify-stage2.js chạy lại: 38 PASS, 0 FAIL; verify-stage3.js chạy
lại: 41 PASS, 0 FAIL; verify-stage31.js chạy lại: 29 PASS, 0 FAIL**
— không hồi quy.

LƯU Ý: toàn bộ kiểm chứng trên là với fake agent. Các marker trong
mục `tiktokLogin` và `checkin` của flow-config.json là mặc định phỏng
theo giao diện TikTok Lite tiếng Nhật — phải hiệu chuẩn sau lần chạy
thật đầu tiên bằng dump_ui (xem HUONG-DAN.md của gói 3.2). Xác minh
của TikTok (mã xác nhận / CAPTCHA) vẫn là bước chạm tay (flow dừng ở
waiting_manual chờ Resume) — đúng giới hạn đã thống nhất.

## Giai đoạn 3.2.1 — Hotfix lỗi máy thật: nút "Tiếp theo" xuất hiện trễ trong cây accessibility (2026-11-16)

### Bằng chứng từ máy thật (Sony SOV37)

Ảnh chụp máy thật khi chạy flow "Cấp Gmail tự động": flow ĐÃ mở được
màn hình đăng nhập Google tiếng Nhật và ĐÃ tự nhập email
(KatinaJohnson9aamb@alazlyc.org hiện rõ trong ô
メールアドレスまたは電話番号), nút 次へ màu xanh hiện rõ trên màn
hình — nhưng run vẫn báo lỗi "Không thấy nút Tiếp theo ở màn hình
nhập email".

Chẩn đoán: `gmailSigninSequence()` chỉ thử `tap_text` MỘT lần duy
nhất cho nút Tiếp theo. Trên máy thật, tại đúng thời điểm đó cây
accessibility chưa kịp lộ node nút (bàn phím đang mở / màn hình đang
chuyển / ô nhập đang xác thực) nên lần thử duy nhất trượt. Marker
không sai — KHÔNG đổi marker.

### Cách sửa (chỉ server.js; agent Android không đổi)

- Thêm helper `tapMarkerWithRetry(deviceId, markers, { timeoutMs:
  15000, intervalMs: 1200, verifyMarkers, logTag })`: quét dump_ui
  liên tục — thấy chữ xác minh (verifyMarkers của mục flow-config
  tương ứng) thì dừng ngay và báo 'verify'; thấy node chứa marker
  (text hoặc desc, có bounds) thì chạm vào tâm bounds bằng lệnh
  'tap' và báo 'tapped'; hết 15 giây chưa thấy thì báo 'not_found'.
- `gmailSigninSequence()`: dùng helper cho CẢ HAI lần bấm Tiếp theo
  (màn hình email + màn hình mật khẩu), thay cho `tapFirstMarker`
  một lần. Gặp 'verify' giữa lúc chờ nút thì xử lý đúng như nhánh
  xác minh sẵn có (dừng Chờ chạm tay / outcome 'verify'; Resume thì
  bước chờ màn hình mật khẩu xử lý như đã resume). Mọi sự kiện, ghi
  chú, cách che mật khẩu giữ nguyên.
- `tiktokLoginSequence()` (flow dang-nhap-tiktok-lite): dùng helper
  tương tự cho nút vào đăng nhập (loginEntry), nút sau khi nhập
  username và nút đăng nhập sau mật khẩu (loginButton) — cùng cơ chế
  báo 'verify' và dừng Chờ chạm tay như cũ.
- flow-config.json KHÔNG đổi marker. Mọi API và hành vi khác giữ
  nguyên.

### Fake agent — mô phỏng lỗi máy thật

- Env mới `FAKE_DELAY_NEXT=<n>`: trên màn hình email VÀ mật khẩu của
  đăng nhập Google, node nút 次へ bị ẩn khỏi n lần dump_ui đầu tiên
  của màn hình đó, xuất hiện từ lần dump thứ n+1.
- Lệnh 'tap' theo tọa độ nay mô phỏng chạm vào node nằm dưới điểm
  chạm (chuyển màn hình giống tap_text); chạm vào nút (Button) có
  chữ thì cmdLog ghi thêm "tap_text:<chữ>" để script kiểm chứng thấy
  được hiệu ứng chạm nút của helper (helper chạm bằng 'tap').

### Kết quả kiểm chứng (fake agent, vòng kín)

**verify-stage321.js (mới): 18 PASS, 0 FAIL**, gồm:

- (a) Với FAKE_DELAY_NEXT=2, kiểm tra trực tiếp qua /api/cmd
  dump_ui: 2 lần dump đầu ở màn hình email CHƯA có node 次へ
  (4 nodes), lần dump thứ 3 nút xuất hiện (5 nodes).
- (b) Với FAKE_DELAY_NEXT=2, flow cap-gmail-tu-dong vẫn chạy đến
  done; thứ tự lệnh agent nhận được vẫn đúng:
  `open_google_signin → input_text(email) → tap_text:次へ →
  input_text(password):******** → tap_text:次へ`.
- (c) Không đặt FAKE_DELAY_NEXT: flow vẫn done, thứ tự lệnh đúng
  như trước — không hồi quy đường bình thường.
- (d) Mật khẩu thử nghiệm không xuất hiện trong bất kỳ response
  API / sự kiện nào của cả phiên.

**Chạy lại hồi quy: verify-stage2.js 38 PASS, 0 FAIL;
verify-stage3.js 41 PASS, 0 FAIL; verify-stage31.js 29 PASS,
0 FAIL; verify-stage32.js 54 PASS, 0 FAIL** — đúng nguyên số đếm
trước hotfix, không hồi quy.

LƯU Ý: kiểm chứng trên vẫn là với fake agent — nhưng lần này fake
agent mô phỏng đúng hiện tượng đã quan sát trên máy thật (nút hiện
trễ trong cây accessibility). Cần chạy lại flow Cấp Gmail trên máy
SOV37 thật để xác nhận dứt điểm.

---

## Giai đoạn 3.2.2 — Hotfix lỗi máy thật thứ hai: ô nhập chưa kịp focus (input_text trả no_focus) (2026-11-16)

### Bằng chứng từ máy thật (Sony SOV37, bản 3.2.1)

Ảnh chụp màn hình console của server khi chạy flow "Cấp Gmail tự
động" hai lần liên tiếp trên máy thật:

```
[event] gmail_signin SOV37 — Cấp Gmail tự động: đã mở màn hình đăng nhập Google, chờ ô nhập email...
[pipeline] run-12-... gmail_signin: Tự đăng nhập Google chưa xong: Không nhập được email: no_focus
[pipeline] run-13-... gmail_signin: Tự đăng nhập Google chưa xong: Không nhập được email: no_focus
```

Chẩn đoán: màn hình đăng nhập mở và được nhận diện, server chạm vào
ô EditText, nhưng lệnh `input_text` trả `no_focus` — trên máy thật ô
chưa kịp nhận input-focus tại thời điểm đó (trễ focus/IME ngay sau
lần chạm), trong khi một lần chạy ở nhịp chậm hơn trước đó đã nhập
được email thành công (ảnh chụp 19:03 cùng ngày: email đã nằm trong
ô). Đây là lỗi THỜI ĐIỂM tạm thời, không phải lỗi marker hay lỗi ô
nhập — KHÔNG đổi flow-config, KHÔNG đổi agent.

### Cách sửa (chỉ server.js; agent Android và flow-config không đổi)

- Thêm helper `inputTextWithRetry(deviceId, text, { attempts: 6,
  intervalMs: 1500, log })`: gọi lệnh `input_text`; CHỈ thử lại khi
  lỗi là `no_focus` (chờ 1,5 giây giữa các lần, tối đa 6 lần); lỗi
  khác trả về ngay; ngoại lệ gửi lệnh cũng trả về ngay. Qua `log`
  chỉ ghi ĐÚNG MỘT sự kiện chờ ("Ô nhập chưa sẵn sàng (no_focus) —
  chờ ô nhập focus rồi nhập lại...") để không spam nhật ký; text —
  nhất là mật khẩu — không bao giờ xuất hiện trong sự kiện.
- `gmailSigninSequence()`: dùng helper cho CẢ nhập email và nhập
  mật khẩu; sau khi chạm ô, nghỉ ~800ms (trước là 400ms) trước lần
  nhập đầu tiên.
- `tiktokLoginSequence()`: dùng helper + nghỉ ~800ms tương tự cho
  nhập username và nhập mật khẩu.
- Mọi ghi chú lỗi giữ nguyên dạng cũ ("Không nhập được email:
  no_focus", ...), hành vi dừng Chờ chạm tay và cách che mật khẩu
  không đổi.

### Fake agent — mô phỏng lỗi máy thật

- Env mới `FAKE_NO_FOCUS_FIRST=<n>`: n lần `input_text` ĐẦU TIÊN
  của phiên trả `no_focus`, từ lần thứ n+1 trở đi bình thường. Mỗi
  lần lỗi ghi vào cmdLog dòng `input_text:no_focus` để script kiểm
  chứng thấy được các lần server thử lại. Chế độ cũ
  `FAKE_NO_FOCUS=1` (lỗi toàn thời gian, dùng cho test Giai đoạn 2)
  giữ nguyên, vẫn ưu tiên trước.

### Kết quả kiểm chứng (fake agent, vòng kín)

**verify-stage322.js (mới): 16 PASS, 0 FAIL**, gồm:

- (a) Với FAKE_NO_FOCUS_FIRST=2, flow cap-gmail-tu-dong vẫn chạy
  đến `done`; cmdLog cho thấy đúng thứ tự:
  `open_google_signin → input_text:no_focus → input_text:no_focus →
  input_text(email) → tap_text:次へ → input_text(password):********
  → tap_text:次へ`; sự kiện chờ-đợi no_focus chỉ ghi đúng 1 lần.
- (b) Với FAKE_NO_FOCUS_FIRST=99, flow dừng gọn ở trạng thái
  `error` với ghi chú "Tự đăng nhập Google chưa xong: Không nhập
  được email: no_focus" (không treo, không crash); helper thử đúng
  6 lần (6 dòng `input_text:no_focus` trong cmdLog).
- (c) Quét toàn bộ thân mọi response API trong phiên + /api/events:
  mật khẩu thử (2 tài khoản) KHÔNG xuất hiện ở đâu.
- Chạy thêm verify-stage322.js trên bản server ĐÃ ĐÓNG GÓI trong
  thư mục giao hàng (farm-agent-giai-doan-3-2-2): 16 PASS, 0 FAIL.

**Chạy lại hồi quy: verify-stage2.js 38 PASS, 0 FAIL;
verify-stage3.js 41 PASS, 0 FAIL; verify-stage31.js 29 PASS,
0 FAIL; verify-stage32.js 54 PASS, 0 FAIL; verify-stage321.js
18 PASS, 0 FAIL** — đúng nguyên số đếm trước hotfix, không hồi quy.

LƯU Ý: kiểm chứng trên vẫn là với fake agent — nhưng fake agent
lần này mô phỏng đúng hiện tượng đã quan sát trên máy thật (ô nhập
chưa kịp focus ở những lần input_text đầu tiên). Cần chạy lại flow
Cấp Gmail trên máy SOV37 thật (bản 3.2.2) để xác nhận dứt điểm.

---

## Giai đoạn 3.2.3 (hotfix, 2026-11-16) — nhận nhầm màn hình email là màn hình mật khẩu + vòng lặp thử lại theo bước nhập

### Bằng chứng máy thật (Sony SOV37, chạy bản 3.2.2, ~22:07–22:10)

- Ảnh chụp tab Kho dữ liệu: kho Gmail có đúng 1 tài khoản, email
  đầy đủ và đúng (LilyCreightonwugwb@alazlyc.org), trạng thái
  "Đã cấp" cho máy SOV37, mật khẩu hiển thị dạng che — **dữ liệu
  kho hoàn toàn đúng**.
- Ảnh chụp điện thoại cùng lúc: ô **EMAIL** của màn hình đăng nhập
  Google (nhãn メールアドレスまたは電話番号） lại chứa chuỗi
  "Phat3479" — tức **mật khẩu của tài khoản đã bị gõ vào ô email**.

### Chẩn đoán

Màn hình đăng nhập Google là WebView/DOM: cây `dump_ui` có thể
chứa sẵn chữ của bước mật khẩu (node DOM ẩn "パスワード") ngay cả
khi đang ở bước email. Cách nhận diện cũ ở bước chờ màn hình mật
khẩu — "có marker passwordScreen **HOẶC có bất kỳ ô EditText nào**
thì coi là màn hình mật khẩu" — khiến nhánh mật khẩu thắng ngay
trên màn hình email; `input_text` (SET_TEXT) liền ghi mật khẩu đè
lên ô nhập duy nhất đang hiện, chính là ô email.

### Cách sửa (chỉ server/server.js — agent và flow-config KHÔNG đổi)

1. **Phân loại màn hình NGHIÊM NGẮT** (`classifySigninScreen` /
   `classifyTiktokScreen`): có bất kỳ marker emailScreen
   (usernameScreen) nào → màn hình EMAIL (ưu tiên tuyệt đối); chỉ
   khi KHÔNG có marker email mà có marker passwordScreen mới là
   màn hình MẬT KHẨU. Áp dụng nhất quán ở mọi điểm phân loại:
   chờ màn hình đầu, chờ sau khi bấm Tiếp theo, và đường Resume.
   Bỏ hẳn điều kiện "hoặc có ô EditText" ở các bước chờ màn hình
   mật khẩu (Google + TikTok).
2. **Xác minh sau khi nhập + canh gác bước mật khẩu**: sau khi
   nhập email/username phải thấy đúng chuỗi vừa nhập trong
   text/desc của một node; trước khi gõ mật khẩu, dump của vòng
   hiện tại bắt buộc phân loại là 'password'; sau khi gõ mật khẩu
   phải có một ô EditText đang chứa text (chỉ kiểm tra có/không,
   không ghi lại nội dung).
3. **Vòng lặp THỬ LẠI theo bước nhập** (điều chỉnh theo yêu cầu
   người dùng, thay cho cơ chế "dừng ngay khi không khớp" phác
   thảo ban đầu): mỗi bước nhập (email + mật khẩu Google, tài
   khoản + mật khẩu TikTok) là một vòng lặp — phân loại lại màn
   hình → chạm ô → nghỉ ~800ms → nhập (helper 3.2.2) → xác minh →
   bấm nút chuyển bước (helper 3.2.1) → kiểm tra trang đã chuyển
   chưa. Chưa chuyển thì nghỉ **~5 giây** rồi làm lại cả bước,
   tối đa **~5 phút/bước**; hết giờ bước lỗi với ghi chú "Đã thử
   nhập lại nhiều lần trong 5 phút nhưng trang chưa chuyển —
   kiểm tra máy/mạng". Nhập lại an toàn vì input_text ghi đè nội
   dung ô. Thấy chữ **xác minh ở bất kỳ đâu thì dừng Chờ chạm
   tay NGAY** — vòng lặp không bao giờ cố vượt qua xác minh. Run
   bị Stop thì thoát ngay với outcome 'stopped' (hooks.isStopped
   được nối từ run.stopped ở cả 3 điểm gọi pipeline; việc ngủ chờ
   giữa các vòng cũng thức dậy sớm khi Stop). Nhật ký giữ gọn:
   tối đa 1 sự kiện thử-lại mỗi vòng.
   - Trường hợp giữ nguyên xử lý của 3.2.2: lỗi đến từ chính lệnh
     nhập sau khi helper đã thử 6 lần (điển hình no_focus vĩnh
     viễn — ô không nhận được focus) thì bước lỗi ngay với ghi
     chú lỗi nhập cũ ("Không nhập được email: no_focus"), vì làm
     lại cả bước trong tình trạng đó không thay đổi được gì và
     bộ kiểm chứng 3.2.2 đã khoá hành vi này.

### Fake agent — mô phỏng thêm

- Env mới `FAKE_SIGNIN_BOTH_MARKERS=1`: dump ở màn hình email
  Google có thêm node ẩn text "パスワード" (bounds rỗng) — mô
  phỏng DOM ẩn của WebView trên máy thật.
- Env mới `FAKE_DROP_FIRST_INPUT=1`: lần `input_text` thành
  công đầu tiên trên màn hình email Google không "dính" (lệnh
  vẫn ok, cmdLog vẫn ghi, nhưng ô vẫn trống) — mô phỏng nhập
  "rớt" trên máy thật.
- Ô nhập nay **giữ lại nội dung đã nhập** trong dump_ui (email /
  username: text thật; mật khẩu: chuỗi dấu "•" như Android thật)
  để server xác minh sau-khi-nhập được như trên máy thật.

### Kết quả kiểm chứng (fake agent, vòng kín)

**verify-stage323.js (mới): 25 PASS, 0 FAIL**, gồm:

- (a) Với FAKE_SIGNIN_BOTH_MARKERS=1, flow cap-gmail-tu-dong vẫn
  `done`; cmdLog đúng thứ tự `open_google_signin →
  input_text(email) → tap_text:次へ → input_text(password):********
  → tap_text:次へ`; **input_text đầu tiên mang email** (hết lỗi gõ
  sai trường); mật khẩu chỉ được gõ sau lần bấm Tiếp theo đầu
  tiên; đường vui chỉ có đúng 1 vòng nhập (không có sự kiện
  thử-lại nào).
- (b) Không đặt env: flow vẫn `done`, đúng thứ tự lệnh như trước.
- (d) Với FAKE_DROP_FIRST_INPUT=1: lần nhập email đầu bị "rớt",
  flow **tự nhập lại (đúng 2 lần input_text(email) trong
  cmdLog)**, có sự kiện thử-lại của bước email, và vẫn `done` —
  vòng lặp thử lại cứu được ca nhập rớt mà bản cũ sẽ dừng lỗi.
- (c) Quét toàn bộ thân mọi response API trong phiên +
  /api/events: mật khẩu thử (2 tài khoản) KHÔNG xuất hiện ở đâu.
- Chạy thêm verify-stage323.js trên bản server ĐÃ ĐÓNG GÓI trong
  thư mục giao hàng (farm-agent-giai-doan-3-2-3): 25 PASS, 0 FAIL.

**Chạy lại hồi quy: verify-stage2.js 38 PASS, 0 FAIL;
verify-stage3.js 41 PASS, 0 FAIL; verify-stage31.js 29 PASS,
0 FAIL; verify-stage32.js 54 PASS, 0 FAIL; verify-stage321.js
18 PASS, 0 FAIL; verify-stage322.js 16 PASS, 0 FAIL** — đúng
nguyên số đếm trước hotfix, không hồi quy.

LƯU Ý: kiểm chứng vẫn bằng fake agent — nhưng fake nay mô phỏng
đúng cả hai hiện tượng máy thật đã gặp (DOM ẩn chứa marker bước
mật khẩu ngay ở bước email, và lần nhập đầu bị "rớt"). Cần chạy
lại flow Cấp Gmail trên máy SOV37 thật (bản 3.2.3) để xác nhận
dứt điểm.
