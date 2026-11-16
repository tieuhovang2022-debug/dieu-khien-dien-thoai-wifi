# Farm Control — Giai đoạn 3.1: Hướng dẫn

Giai đoạn 3.1 thêm đúng một việc mà các giai đoạn trước còn thiếu:
**bấm "Cấp Gmail" là điện thoại TỰ đăng nhập Google** — tự mở màn hình
đăng nhập, tự nhập Gmail lấy từ kho, tự bấm "Tiếp theo", tự nhập mật
khẩu và đăng nhập. Không cần chạm tay nữa — trừ khi Google bắt xác minh.

> ⚠️ Nói thẳng trước: Giai đoạn 3.1 đã biên dịch và kiểm chứng vòng kín
> bằng máy ảo (fake agent): **29/29 mục kiểm chứng mới đạt, chạy lại bộ
> kiểm chứng Giai đoạn 3 (41/41) và Giai đoạn 2 (38/38) vẫn đạt.** Nhưng
> phần mới của 3.1 **vẫn CHƯA chạy trên điện thoại thật** — lần chạy thật
> đầu tiên có thể phải hiệu chuẩn lại các "dấu chữ" nhận diện màn hình
> đăng nhập Google (mục 5), giống như đã nói ở Giai đoạn 3.

---

## 1. Giai đoạn 3.1 có gì mới

**App Farm Agent v3.1 trên điện thoại** (cài đè lên v3.0 được — cùng
chữ ký, xem mục 2):

- Lệnh mới `open_google_signin`: mở thẳng màn hình "thêm tài khoản
  Google" của Android. Lệnh này **không cần Trợ năng** (chỉ là mở màn
  hình); các bước gõ chữ/bấm nút sau đó vẫn cần Trợ năng như cũ.
- Mọi lệnh của Giai đoạn 1–3 giữ nguyên.

**Server v3.1 (chạy trên MacBook):**

- Quy trình mới **"Cấp Gmail tự động"** — chạy bằng nút **✉️ Cấp Gmail**
  ngay trên thẻ của từng máy ở dashboard, hoặc chọn trong mục Pipeline:
  1. Cấp tài khoản từ kho Gmail cho máy (máy đã có tài khoản được cấp
     thì dùng lại tài khoản đó, không tốn thêm tài khoản mới). Kho hết
     tài khoản sẵn sàng thì quy trình báo lỗi rõ ràng và dừng.
  2. Máy tự mở màn hình đăng nhập Google.
  3. Server "nhìn" màn hình bằng `dump_ui`, chờ thấy ô nhập email thì
     chạm vào ô và **tự nhập email**.
  4. Tự bấm nút **Tiếp theo** （次へ）.
  5. Chờ màn hình mật khẩu, chạm ô mật khẩu và **tự nhập mật khẩu**.
  6. Tự bấm **Tiếp theo** lần nữa; nếu hiện nút đồng ý điều khoản thì
     tự bấm luôn.
  7. Quét lại màn hình lần cuối: xong thì báo **"✅ Đăng nhập Gmail
     hoàn tất"** trong nhật ký sự kiện của dashboard.
- Pipeline **"Cấp máy mới"** cũng dùng luôn trình tự tự động này ở bước
  cấp Gmail (trước đây bước đăng nhập Google là bước chạm tay).
- Nút "Hỗ trợ đăng nhập" cũ trong panel Kho Gmail giờ cũng chạy trình
  tự tự động này (không còn kiểu gõ 2 lần vào ô đang chọn như trước).
- **An toàn mật khẩu:** mật khẩu thật chỉ đi qua kênh lệnh giữa server
  và app trên máy. Dashboard, nhật ký sự kiện và mọi API đều chỉ hiện
  `********`. Trong nhật ký bạn sẽ thấy email và các bước đã làm, không
  bao giờ thấy mật khẩu.

**Khi Google bắt xác minh thì sao?** Nếu giữa chừng Google hiện màn
hình xác minh (nhập mã gửi về điện thoại, CAPTCHA "tôi không phải người
máy", xác minh 2 bước...), quy trình **dừng ở trạng thái "Chờ chạm tay"**
với ghi chú *"Máy đang ở bước xác minh của Google — xử lý chạm tay trên
máy rồi bấm Chạy tiếp"*. Bạn cầm máy đó lên, xử lý bước xác minh bằng
tay, rồi vào dashboard bấm **"Đã xử lý — chạy tiếp"** ở mục Pipeline —
quy trình sẽ tự kiểm tra lại màn hình và hoàn tất. Đây là giới hạn của
Google, không phải lỗi: không công cụ nào qua được bước này thay bạn.

---

## 2. Cách cập nhật từ gói Giai đoạn 3 đang chạy trên MacBook

**Trên MacBook:**

1. Sang cửa sổ Terminal đang chạy server cũ, bấm **Ctrl + C** để dừng
   server cũ.
2. Giải nén gói mới này (`farm-agent-giai-doan-3-1`) — để cạnh thư mục
   gói cũ cũng được.
3. **Giữ lại kho Gmail (nếu đã nhập):** chép file
   `data/gmail-pool.json` từ thư mục `server` của gói CŨ sang thư mục
   `server/data` của gói MỚI (đè lên nếu có). Không chép thì kho Gmail ở
   gói mới sẽ trống và phải nhập lại.
4. Mở Terminal, `cd` vào thư mục `server` của gói MỚI rồi chạy:
   `node server.js`
5. Mở dashboard như cũ: `http://localhost:8080` (hoặc IP của MacBook).

**Trên điện thoại (từng máy):**

1. Cài file `agent.apk` mới (v3.1) đè lên bản cũ — **cùng chữ ký nên
   Android cho cài đè như một bản cập nhật**: IP server, cổng và tên
   máy đã lưu trong app được giữ nguyên, không phải nhập lại.
2. Cách tiện nhất: trên trình duyệt của điện thoại mở
   `http://<IP-MacBook>:8080/apks/agent.apk` (server mới tự phát file
   APK mới tại địa chỉ này) rồi cài. Hoặc chép file `agent.apk` trong
   gói này vào máy rồi cài như thường.
3. Mở Farm Agent một lần để app chạy lại; kiểm tra dashboard thấy máy
   **Online** và ghi **Agent v3.1** là xong.
4. Nhắc lại 2 việc chỉ làm 1 lần cho mỗi máy (nếu chưa làm): bật **Trợ
   năng** cho Farm Agent (để app gõ chữ/bấm nút được) và cho phép **chụp
   màn hình** (để dùng nút chụp màn hình trên dashboard).

---

## 3. Cách dùng Cấp Gmail tự động

1. Vào panel **Kho Gmail** trên dashboard, nhập tài khoản (mỗi dòng
   `email|mật khẩu`) nếu kho đang trống.
2. Ở **thẻ của máy** cần cấp, bấm **✉️ Cấp Gmail**.
3. Ngồi xem **nhật ký sự kiện**: sẽ hiện lần lượt "đã mở màn hình đăng
   nhập Google" → "đã nhập email ..." → "đã nhập mật khẩu ********" →
   "✅ Đăng nhập Gmail hoàn tất". Tiến trình chi tiết từng bước cũng
   hiện ở mục **Pipeline**.
4. Nếu máy dừng ở **"Chờ chạm tay"**: cầm đúng máy đó, xử lý bước xác
   minh Google trên màn hình máy, quay lại dashboard bấm **"Đã xử lý —
   chạy tiếp"**.

Điều kiện để chạy được: máy đang **Online**, đã bật **Trợ năng**, và
kho Gmail còn tài khoản "Sẵn sàng" (hoặc máy đã được cấp tài khoản từ
trước).

---

## 4. Giới hạn thành thật

- **CAPTCHA / xác minh điện thoại / xác minh 2 bước của Google vẫn là
  bước chạm tay.** Quy trình dừng ở "Chờ chạm tay" và chỉ chạy tiếp khi
  bạn xử lý xong trên máy rồi bấm chạy tiếp. Tài khoản nào Google bắt
  xác minh ngay từ bước nhập email cũng vậy.
- **Dấu chữ nhận diện màn hình đăng nhập là giá trị mặc định tiếng
  Nhật** (kèm vài dấu tiếng Anh) — phỏng theo màn hình đăng nhập Google
  thông thường. Máy nào dùng ngôn ngữ khác, hoặc Google đổi giao diện,
  thì có thể không khớp: triệu chứng là quy trình báo "Không thấy màn
  hình nhập email/mật khẩu sau 25 giây". Cách sửa ở mục 5 — không cần
  sửa code.
- Đăng nhập Google trên máy **chưa từng có tài khoản Google nào** và
  máy **đã có sẵn tài khoản Google khác** có thể hiện màn hình hơi
  khác nhau; dấu chữ mặc định nhắm vào trường hợp phổ biến nhất (thêm
  tài khoản mới).
- Toàn bộ Giai đoạn 3.1 **chưa chạy trên điện thoại thật** — hãy thử
  trước trên 1 máy, hiệu chuẩn dấu chữ (mục 5) cho khớp, rồi mới chạy
  cho cả dàn.

---

## 5. Hiệu chuẩn dấu chữ đăng nhập (khi chạy thật không khớp)

Các dấu chữ nằm trong file `server/data/flow-config.json`, mục
**`signin`** — sửa file này bằng trình soạn thảo văn bản bất kỳ, **không
cần khởi động lại server** (server đọc lại file mỗi lần chạy):

- `emailScreen`: các dòng chữ chỉ xuất hiện ở màn hình nhập email
  (mặc định: `メールアドレスまたは電話番号`, `メールアドレス`,
  `Email or phone`).
- `nextButton`: chữ trên nút đi tiếp (mặc định: `次へ`, `Next`).
- `passwordScreen`: dòng chữ ở màn hình nhập mật khẩu (mặc định:
  `パスワード`, `Password`).
- `agreeButton`: nút đồng ý điều khoản nếu có (mặc định: `同意します`,
  `I agree`) — không thấy cũng không sao.
- `verifyMarkers`: các dòng chữ báo Google đang bắt xác minh (mặc
  định: `本人確認`, `確認コード`, `セキュリティコード`,
  `電話番号を入力`, `ロボットではありません`, `2段階認証`) — thấy một
  trong các dòng này là quy trình dừng chờ chạm tay.

**Cách lấy chữ thật trên màn hình máy:** khi máy đang ở màn hình đăng
nhập cần hiệu chuẩn, gửi lệnh `dump_ui` cho máy đó (qua dashboard/API
`/api/cmd`) — kết quả trả về toàn bộ chữ đang hiện trên màn hình. Copy
đúng dòng chữ thật vào mục tương ứng trong `signin` rồi chạy lại.

---

## 6. Trong gói này có gì

- `agent.apk` — Farm Agent v3.1 (cài đè lên v3.0/v2/v1 đều được, cùng
  chữ ký).
- `server/` — server v3.1 hoàn chỉnh: `server.js`, `dashboard.html`,
  `fake-agent.js` (máy ảo để kiểm chứng), `provisioning.json`,
  `public-apks/agent.apk` (bản v3.1 — server phát tại `/apks/agent.apk`),
  `data/flow-config.json` (đã có mục `signin`) + `data/README.txt`.
- `HUONG-DAN.md` — file này.

Kiểm chứng nội bộ của giai đoạn này (máy ảo, vòng kín): flow Cấp Gmail
tự động chạy đến hoàn tất; agent nhận đúng thứ tự lệnh mở màn hình →
nhập email → bấm Tiếp theo → nhập mật khẩu → bấm Tiếp theo; mật khẩu
không xuất hiện trong bất kỳ phản hồi API / nhật ký nào; với trường hợp
Google bắt xác minh, flow dừng đúng ở "Chờ chạm tay" và chạy tiếp được
sau khi bấm Resume. Chi tiết trong `VERIFY.md` của dự án.
