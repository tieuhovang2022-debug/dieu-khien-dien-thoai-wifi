# Farm Control — Giai đoạn 3: Hướng dẫn

Gói này hoàn thiện hệ thống điều khiển dàn máy không dây: **agent biết "nhìn"
màn hình và bấm theo chữ, quy trình đăng ký TikTok Lite bán tự động, và vòng
quét game & xem video heo tự báo khi check-in thành công.**

> ⚠️ Nói thẳng trước: toàn bộ Giai đoạn 3 đã biên dịch và kiểm chứng vòng kín
> bằng máy ảo (fake agent) trên máy chủ — nhưng **vẫn CHƯA chạy trên điện
> thoại thật**, giống các giai đoạn trước. Lần test máy thật đầu tiên vẫn bắt
> đầu từ các bước chạy server / cài agent như Giai đoạn 1–2, và các "dấu chữ"
> nhận diện màn hình (mục 3) gần như chắc chắn phải **hiệu chuẩn** sau lần
> chạy thật đầu tiên — đó là việc bình thường, cách làm ở mục 6.

---

## 1. Giai đoạn 3 có gì mới

**App Farm Agent v3.0 trên điện thoại** (cài đè lên v2 được — cùng chữ ký):
- Lệnh mới `dump_ui`: gửi về server toàn bộ "cây giao diện" của màn hình hiện
  tại — mọi dòng chữ / mô tả / nút đang thấy, kèm tọa độ (tối đa 500 mục).
  Đây là "đôi mắt" của hệ thống.
- Lệnh mới `tap_text {text, match}`: tự tìm nút/dòng chữ trên màn hình và
  chạm vào giữa nó. `match` = `contains` (chữ cần tìm nằm trong dòng chữ,
  mặc định) hoặc `exact` (khớp đúng toàn bộ). Không thấy thì trả lỗi
  `text_not_found`.
- Lệnh mới `wait_text {text, timeoutMs}`: chờ tối đa 30 giây cho một chữ
  xuất hiện trên màn hình, trả về thấy hay chưa.
- Lệnh mới `open_url {url}`: mở một link (ví dụ link game) bằng app mặc định
  của máy. Link sai định dạng trả lỗi `bad_url`.
- Cả 4 lệnh trên đều cần **Trợ năng đã bật** (như các lệnh chạm/nhập chữ của
  Giai đoạn 2); chưa bật thì trả lỗi `no_accessibility`.
- Mọi lệnh của Giai đoạn 1–2 (status / open_app / wake / install_url /
  screenshot / tap / swipe / input_text / key / factory_reset) giữ nguyên.

**Server v3 (chạy trên MacBook):**
- File cấu hình mới `server/data/flow-config.json`: chứa các **dấu chữ**
  (marker) để nhận diện màn hình TikTok Lite — sửa file này là đổi hành vi
  của 2 quy trình mới, **không cần sửa code, không cần khởi động lại server**
  (server đọc lại file mỗi lần chạy). File bị xoá/hỏng thì server tự dùng bộ
  mặc định.
- Quy trình mới **"Đăng ký TikTok Lite"** (bán tự động) — mục 4.
- Quy trình mới **"Quét game & xem video"** + vòng xem chạy nền trên server,
  tự phát hiện check-in thành công và báo lên dashboard — mục 5.
- Dashboard thêm: ô tổng quan **"🐷 Check-in thành công"** (tổng số lần phát
  hiện được), huy hiệu trạng thái xem game trên từng thẻ máy (Đang quét game
  / 🎉 ĐÃ CHECK-IN / đã dừng / lỗi), nút **Quét game & xem video** và **Dừng
  xem game** ngay trên thẻ máy, ô nhập **Link game** + **Thời gian xem** ở
  panel quy trình, và nhật ký sự kiện **tô xanh nổi bật** mỗi lần có máy
  check-in thành công.
- API mới cho vòng xem: `POST /api/watch/start`, `POST /api/watch/stop`,
  `GET /api/watch`, `GET /api/events`.
- Kho Gmail, pipeline "Cấp máy mới", QR ghi danh Device Owner: giữ nguyên
  như Giai đoạn 2. Mật khẩu vẫn luôn hiển thị dạng che.

---

## 2. Chạy hệ thống (tóm tắt — chi tiết như gói Giai đoạn 2)

1. Giải nén gói này trên MacBook, mở Terminal trong thư mục `server/`, chạy
   `node server.js` → mở dashboard `http://localhost:8080`.
2. Cài `agent.apk` v3 lên máy test (tải từ `http://<IP-MacBook>:8080/apks/agent.apk`
   — gói đã để sẵn bản v3 trong `server/public-apks/`), nhập IP MacBook +
   cổng `8787` + nhãn máy → **Lưu & Kết nối** → cho phép chụp màn hình → tắt
   tối ưu pin cho agent.
3. Bật **Trợ năng** cho Farm Agent (Cài đặt → Trợ năng → dịch vụ đã cài →
   Farm Agent) — bắt buộc cho mọi tính năng mới của Giai đoạn 3.
4. (Nếu muốn reset từ xa) ghi danh **Device Owner** bằng QR như hướng dẫn
   Giai đoạn 2 — không đổi.

---

## 3. File cấu hình dấu chữ: `server/data/flow-config.json`

```json
{
  "onboardingMarkers": ["同意する", "許可する", "スキップ", "次へ", "登録", "ログイン"],
  "checkinSuccessMarkers": ["チェックイン完了", "チェックイン成功", "ポイントを獲得しました", "付与されました"]
}
```

- `onboardingMarkers`: các nút chữ mà quy trình đăng ký sẽ lần lượt thử chạm
  trên các màn hình chào của TikTok Lite (đồng ý điều khoản, cho phép, bỏ
  qua, tiếp theo, đăng ký, đăng nhập).
- `checkinSuccessMarkers`: các dòng chữ chỉ xuất hiện khi **heo đã nhảy /
  check-in thành công** — vòng xem game quét màn hình tìm đúng các chữ này.

⚠️ Đây là **bộ mặc định phỏng đoán** theo giao diện TikTok Lite tiếng Nhật
phổ biến. Chữ trên máy thật có thể khác (khác phiên bản app, khác ngôn ngữ,
thêm emoji/khoảng trắng...). Vì vậy mới có mục 6 — Hiệu chuẩn.

---

## 4. Quy trình "Đăng ký TikTok Lite" (bán tự động)

Chọn ở panel **Chạy quy trình** → tick máy → **Bắt đầu chạy**. Các bước:

1. Mở app TikTok Lite, chờ 5 giây cho app nạp xong.
2. Lần lượt thử chạm các nút trong `onboardingMarkers` (mỗi nút cách nhau
   1 giây). **Bước nào không thấy nút thì ghi chú "bỏ qua (dung sai)" và đi
   tiếp — không làm hỏng cả quy trình**, vì mỗi máy/phiên bản hiện các màn
   hình chào khác nhau.
3. Dừng ở bước **CHỜ CHẠM TAY**: "Đăng nhập: nhập số điện thoại/email, mã xác
   minh và CAPTCHA trên máy". Đây là phần **bắt buộc làm tay** — Google/
   TikTok chặn tự động hoá ở đúng chỗ này (mã SMS, CAPTCHA). Huynh đăng nhập
   trên máy xong thì bấm **Đã xử lý — chạy tiếp** ở dòng của máy.
4. Sau khi chạy tiếp: máy thử chạm lại 「登録」/「次へ」 để chốt các màn hình
   còn lại (vẫn dung sai) → hoàn thành.

Nhiều máy chạy song song được; mỗi máy dừng chờ chạm tay độc lập.

---

## 5. Quy trình "Quét game & xem video" (vòng xem tự động)

Hai cách bật:

- **Từ panel quy trình:** chọn flow "Quét game & xem video heo (tự báo
  check-in)", (tuỳ chọn) dán **Link game** và đặt **Thời gian xem** (mặc định
  30 phút) → tick máy → **Bắt đầu chạy**.
- **Ngay trên thẻ máy:** bấm **🐷 Quét game & xem video** (dùng Link game +
  số phút đang điền ở panel quy trình). Đang xem thì nút đổi thành
  **■ Dừng xem game**.

Cách vòng xem chạy (trên server, riêng từng máy):

1. Mở TikTok Lite — hoặc mở thẳng **Link game** nếu có.
2. Lặp lại cho tới khi hết giờ hoặc bị dừng:
   - **Quét màn hình** (`dump_ui`): nếu thấy bất kỳ chữ nào trong
     `checkinSuccessMarkers` → **heo đã nhảy!** Server ghi sự kiện
     `checkin_success`, ô đếm **Check-in thành công** tăng 1, thẻ máy hiện
     huy hiệu **🎉 ĐÃ CHECK-IN THÀNH CÔNG**, nhật ký hiện dòng xanh nổi bật,
     và vòng xem của máy đó **tự dừng**.
   - **Vuốt lên** xem video tiếp theo (tọa độ tính theo kích thước màn
     hình), rồi nghỉ ngẫu nhiên **25–40 giây** mới lặp lại — nhịp xem giống
     người thật hơn là vuốt liên tục đều tăm tắp.
3. Hết giờ mà chưa check-in: vòng tự dừng, thẻ máy ghi "đã dừng".
   Nếu máy mất kết nối/quét màn hình lỗi 3 lần liên tiếp: vòng dừng và ghi
   lỗi rõ lý do.

---

## 6. ★ HIỆU CHUẨN SAU LẦN CHẠY THẬT ĐẦU TIÊN (quan trọng nhất)

Đây là vòng "test thử rồi chỉnh sửa dần" đã thống nhất: chạy thật → xem máy
thật đang hiện chữ gì → sửa dấu chữ → chạy lại. Cụ thể:

1. Để máy test đứng ở đúng màn hình cần nhận diện (ví dụ màn hình TikTok
   Lite lúc vừa check-in xong, hoặc màn hình chào lúc mới mở app).
2. Xem máy thật đang hiện những chữ gì bằng lệnh `dump_ui`. Cách dễ nhất:
   mở Terminal trên MacBook (server đang chạy) và gõ — thay `<ID-MÁY>` bằng
   id của máy (xem ở `http://localhost:8080/api/devices`):

   ```
   curl -s -X POST http://localhost:8080/api/cmd -H 'Content-Type: application/json' -d '{"deviceId":"<ID-MÁY>","cmd":"dump_ui","args":{}}'
   ```

   Kết quả trả về danh sách mọi dòng chữ (`text`) và mô tả (`desc`) đang có
   trên màn hình thật.
3. Mở `server/data/flow-config.json`, sửa 2 danh sách dấu chữ cho khớp chữ
   thật vừa thấy:
   - Màn hình chào hiện nút chữ gì khác → sửa `onboardingMarkers`.
   - Màn hình check-in thành công hiện câu gì → chép **nguyên văn** câu đó
     vào `checkinSuccessMarkers`.
4. Chạy lại quy trình — **không cần khởi động lại server**, server đọc lại
   file cấu hình mỗi lần chạy quy trình/vòng xem.
5. Lặp lại tới khi nhận diện trúng. Nếu bí, gửi đệ kết quả `dump_ui` của
   màn hình đó, đệ sửa dấu chữ cho.

---

## 7. Các giới hạn cần biết (nói thẳng)

- **Đăng ký TikTok Lite là BÁN tự động, không phải tự động 100%.** Nhập số
  điện thoại/email, mã xác minh và CAPTCHA vẫn phải chạm tay — quy trình cố
  tình dừng chờ ở đúng bước đó. Không có cách vượt CAPTCHA/xác minh một cách
  đàng hoàng, và từ đầu dự án mình đã thống nhất như vậy.
- **Phát hiện check-in phụ thuộc hoàn toàn vào chữ trên màn hình.** Nếu
  TikTok Lite đổi câu chữ, hoặc máy để ngôn ngữ khác tiếng Nhật, vòng xem sẽ
  không nhận ra cho tới khi hiệu chuẩn lại dấu chữ (mục 6). Ngược lại, nếu
  một dòng chữ trong `checkinSuccessMarkers` xuất hiện ở màn hình khác (ví dụ
  banner quảng cáo có câu tương tự), có thể báo nhầm — khi hiệu chuẩn nên
  chọn câu chữ càng đặc trưng càng tốt.
- `dump_ui` chỉ "thấy" được những gì AccessibilityService đọc được. Một số
  màn hình vẽ bằng canvas/game (không có nút/chữ chuẩn Android) sẽ trả về
  rất ít node — khi đó nhận diện bằng chữ không dùng được ở màn hình đó.
- Các lệnh mới đều cần **Trợ năng bật**; máy tắt Trợ năng thì báo
  `no_accessibility` ngay, không chạy ngầm được.
- Vòng xem chạy trên **server**: MacBook tắt/ngủ hoặc máy rớt WiFi thì vòng
  xem dừng theo. Nhiều máy cùng xem thì mỗi máy một vòng độc lập.
- Toàn bộ Giai đoạn 3 **chưa chạy trên điện thoại thật** — kể cả agent v3.
  Lần test thật đầu tiên hãy làm trên **1 máy test** trước, hiệu chuẩn xong
  mới nhân ra cả dàn.

---

## 8. Nội dung gói

- `agent.apk` — Farm Agent v3.0 (ký cùng keystore với v1/v2, cài đè được).
- `server/server.js`, `server/dashboard.html`, `server/fake-agent.js` —
  server Giai đoạn 3 (Node thuần, không cần npm install).
- `server/provisioning.json` — checksum chữ ký của APK cho QR ghi danh
  (đừng sửa; chỉ đổi khi build lại APK bằng keystore khác).
- `server/public-apks/agent.apk` — bản sao agent v3 để server phát cho điện
  thoại tải và cho QR ghi danh.
- `server/data/flow-config.json` — file cấu hình dấu chữ mặc định (mục 3, 6).
- `server/data/` — nơi server tự tạo thêm `gmail-pool.json` khi chạy.
- Kiểm chứng nội bộ: xem `VERIFY.md` trong thư mục dự án (mục Giai đoạn 3:
  verify-stage3.js 41 mục kiểm tra vòng kín đều đạt; verify-stage2.js chạy
  lại 38/38 đạt, không hồi quy).
