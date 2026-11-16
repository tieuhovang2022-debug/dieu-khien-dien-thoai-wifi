Thư mục dữ liệu của server. Khi server chạy, file gmail-pool.json sẽ được
tự tạo tại đây (chứa kho Gmail: email, mật khẩu, trạng thái, máy được cấp).
Mật khẩu trong file này là mật khẩu thật — giữ file này trên MacBook của
bạn, không chia sẻ ra ngoài. Dashboard và API luôn hiển thị mật khẩu dạng che.

File flow-config.json (có sẵn trong gói) chứa các "dấu chữ" nhận diện màn
hình TikTok Lite mà Giai đoạn 3 dùng: onboardingMarkers (các nút chữ ở màn
hình chào, cho quy trình đăng ký) và checkinSuccessMarkers (các dòng chữ
báo check-in thành công, cho vòng quét game). File này sửa được tự do bằng
trình soạn thảo văn bản: server đọc lại file mỗi lần chạy nên sửa xong
không cần khởi động lại server. Nếu file bị xoá hoặc sai định dạng JSON,
server tự quay về bộ dấu chữ mặc định. Xem mục Hiệu chuẩn trong HUONG-DAN.md.
