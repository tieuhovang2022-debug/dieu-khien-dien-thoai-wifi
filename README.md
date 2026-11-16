# Điều khiển điện thoại không dây (Farm Control)

Hệ thống điều khiển dàn điện thoại Android qua WiFi, kiểu MobiGrid: mỗi máy cài một app **Farm Agent** tự kết nối về **server chạy trên MacBook** (cùng mạng WiFi), điều khiển tập trung từ trang web điều khiển (dashboard).

## Kiến trúc

- `agent/` — Farm Agent: app Android viết bằng Java thuần (không thư viện ngoài), package `vn.duongashita.farmagent`, minSdk 28 / targetSdk 29. Chạy dịch vụ nền, kết nối TCP tới server (cổng 8787, giao thức JSON từng dòng), tự kết nối lại khi mất mạng.
- `server/` — Server Node.js không phụ thuộc thư viện ngoài: cổng TCP 8787 nhận agent, cổng HTTP 8080 phục vụ dashboard và phát file APK tại `/apks/`.

## Chức năng

- Điều khiển cơ bản: xem trạng thái (pin, model, mạng), mở app, đánh thức, chụp màn hình, cài APK từ URL.
- **Reset máy từ xa một chạm** — với máy đã ghi danh Device Owner bằng QR ngay sau khi khôi phục cài đặt gốc (lệnh `factory_reset`).
- Trợ năng (Accessibility): chạm, vuốt, gõ chữ, phím Back/Home/Enter, đọc cây giao diện (`dump_ui`), bấm theo chữ trên màn hình (`tap_text`), chờ chữ xuất hiện (`wait_text`), mở link (`open_url`).
- **Kho Gmail + cấp máy tự động**: nhập kho Gmail (mật khẩu luôn hiển thị dạng che trên dashboard); bấm "Cấp Gmail" là điện thoại **tự mở màn hình đăng nhập Google, tự nhập Gmail, tự nhập mật khẩu và đăng nhập** — chỉ dừng ở bước **"Chờ chạm tay"** khi Google bắt xác minh số điện thoại / CAPTCHA.
- **Đăng ký TikTok Lite bán tự động**: tự bấm qua các màn hình mở đầu theo danh sách mốc chữ trong `server/data/flow-config.json`, dừng chờ chạm tay ở bước nhập số điện thoại/email + mã xác minh.
- **Quét game + xem video heo**: tự lướt video theo vòng lặp, đọc màn hình liên tục; khi thấy mốc chữ check-in thành công (trong `flow-config.json`) thì báo sự kiện về dashboard và dừng vòng lặp của máy đó.

## Hiệu chỉnh sau khi test máy thật

Các mốc chữ nhận diện giao diện TikTok Lite nằm trong `server/data/flow-config.json` — đây là giá trị mặc định phỏng theo giao diện tiếng Nhật, **cần hiệu chỉnh** sau lần chạy máy thật đầu tiên: dùng lệnh `dump_ui` xem chữ thật trên màn hình máy, sửa file cấu hình rồi chạy lại (server tự đọc lại file, không cần khởi động lại). Xem mục ★ trong `HUONG-DAN.md`.

## Trạng thái kiểm chứng

- Giai đoạn 1+2+3+3.1 đã kiểm chứng vòng kín bằng agent giả lập: 38/38 (giai đoạn 2), 41/41 (giai đoạn 3) và 29/29 (giai đoạn 3.1 — cấp Gmail tự đăng nhập) mục đều đạt — chi tiết trong `VERIFY.md`, script kiểm chứng: `verify-stage2.js`, `verify-stage3.js`, `verify-stage31.js`.
- **Chưa chạy trên điện thoại thật.** Bước tiếp theo: cài lên 1 máy test, hiệu chỉnh dần theo kết quả thực tế.

## Không có trong repo này

- File `agent.apk` đã biên dịch và khóa ký app (`debug.keystore`) — cố ý không đưa lên. Biên dịch APK bằng `agent/build.sh` (cần JDK 17 + Android SDK platform 29 / build-tools 30.0.3).
- Dữ liệu kho Gmail thật — file `server/data/gmail-pool.json` được tạo trên máy chạy server, không nằm trong mã nguồn.

## Chạy server

```bash
cd server
node server.js
# Dashboard: http://localhost:8080
```

Hướng dẫn cài đặt và sử dụng đầy đủ: `HUONG-DAN.md`.
