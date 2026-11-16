Thư mục dữ liệu của server. Khi server chạy, các file dữ liệu sẽ được
tự tạo tại đây:
- gmail-pool.json: kho Gmail (email, mật khẩu, trạng thái, máy được cấp).
- heo-pool.json: kho tài khoản TikTok Lite xem heo CHƯA đăng nhập
  (username, mật khẩu, trạng thái, máy được cấp, đã đăng nhập lúc nào)
  — thêm ở Giai đoạn 3.2.
- checkin-state.json: tiến độ điểm danh 14 ngày theo từng máy
  (danh sách ngày đã điểm danh, tính theo giờ Tokyo) — Giai đoạn 3.2.
- game-link.json: link game chuyên dụng (hoặc nội dung mã QR) dùng cho
  Check heo — Nik phải mở link này để xem thì bên Link mới được ghi
  nhận; lưu 1 lần, dashboard tự điền lại — Giai đoạn 3.2.
Mật khẩu trong các file pool là mật khẩu thật — giữ các file này trên
MacBook của bạn, không chia sẻ ra ngoài. Dashboard và API luôn hiển thị
mật khẩu dạng che.

File flow-config.json (có sẵn trong gói) chứa các "dấu chữ" nhận diện màn
hình TikTok Lite mà Giai đoạn 3 dùng: onboardingMarkers (các nút chữ ở màn
hình chào, cho quy trình đăng ký) và checkinSuccessMarkers (các dòng chữ
báo check-in thành công, cho vòng quét game). Giai đoạn 3.1 thêm mục
"signin": các dấu chữ nhận diện màn hình ĐĂNG NHẬP GOOGLE cho quy trình
Cấp Gmail tự động — emailScreen (màn hình nhập email), nextButton (nút
Tiếp theo), passwordScreen (màn hình nhập mật khẩu), agreeButton (nút
đồng ý điều khoản nếu có) và verifyMarkers (các dòng chữ cho biết Google
đang bắt XÁC MINH — CAPTCHA / mã điện thoại / 2 bước; thấy một trong các
dòng này là quy trình dừng ở "Chờ chạm tay"). File này sửa được tự do
bằng trình soạn thảo văn bản: server đọc lại file mỗi lần chạy nên sửa
xong không cần khởi động lại server. Nếu file bị xoá hoặc sai định dạng
JSON, server tự quay về bộ dấu chữ mặc định. Xem mục Hiệu chuẩn trong
HUONG-DAN.md.

Giai đoạn 3.2 thêm 2 mục vào flow-config.json: "tiktokLogin" (dấu chữ
nhận diện màn hình đăng nhập TikTok Lite: loginEntry, usernameScreen,
passwordScreen, loginButton, verifyMarkers) và "checkin" (dấu chữ cho
điểm danh: entryMarkers, buttonMarkers, successMarkers). File cấu hình
cũ thiếu 2 mục này vẫn chạy được — server tự dùng giá trị mặc định.
