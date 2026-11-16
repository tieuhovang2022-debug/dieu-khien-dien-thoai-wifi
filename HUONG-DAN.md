# Farm Control — Giai đoạn 3.2: Hướng dẫn

> **BẢN 3.2.2 (hotfix, 2026-11-16)** — Sửa lỗi gặp tiếp trên máy
> thật (Sony SOV37) khi chạy bản 3.2.1: flow "Cấp Gmail tự động" mở
> được màn hình đăng nhập Google nhưng báo "Không nhập được email:
> no_focus" — ô nhập chưa kịp nhận focus tại thời điểm server gõ
> chữ vào (trễ focus/bàn phím ngay sau lần chạm). Bản 3.2.2 cho
> server **nghỉ ~0,8 giây sau khi chạm ô rồi mới nhập, và tự nhập
> lại tối đa 6 lần (mỗi lần cách nhau 1,5 giây) khi gặp lỗi
> no_focus** — áp dụng cho cả nhập email + mật khẩu của đăng nhập
> Google và nhập tài khoản + mật khẩu của đăng nhập TikTok Lite.
> Marker nhận diện KHÔNG đổi; app Farm Agent KHÔNG đổi (vẫn v3.1,
> không cần cài lại).
>
> **Cách cập nhật lên 3.2.2:** (1) Dừng server cũ (Ctrl+C trong
> cửa sổ Terminal đang chạy server). (2) Giải nén gói 3.2.2.
> (3) Chép **toàn bộ file trong thư mục `data/` của server cũ**
> (bản đang dùng) đè sang thư mục `data/` của server 3.2.2 — để
> giữ kho Gmail, kho heo, link game và tiến độ điểm danh. (4) Vào
> thư mục `server` của bản 3.2.2 và chạy `node server.js`. Xong —
> mở lại trang điều khiển và chạy lại "Cấp Gmail" để kiểm tra.

> **BẢN 3.2.1 (hotfix, 2026-11-16)** — Sửa lỗi gặp trên máy thật
> (Sony SOV37): khi chạy "Cấp Gmail tự động", máy đã mở được màn hình
> đăng nhập Google và đã tự nhập email, nút "Tiếp theo" hiện rõ trên
> màn hình, nhưng flow vẫn báo "Không thấy nút Tiếp theo". Nguyên
> nhân: bản 3.2 chỉ thử bấm nút đúng MỘT lần, mà trên máy thật cây
> accessibility có lúc chưa kịp hiện node nút ở thời điểm đó. Bản
> 3.2.1 cho server **chờ và thử bấm lại liên tục tới 15 giây** (áp
> dụng cho cả 2 nút "Tiếp theo" của đăng nhập Google và các nút của
> đăng nhập TikTok Lite). Marker nhận diện KHÔNG đổi; app Farm Agent
> KHÔNG đổi (vẫn v3.1, không cần cài lại).
>
> **Cách cập nhật từ 3.2 lên 3.2.1:** (1) Dừng server cũ (Ctrl+C
> trong cửa sổ Terminal đang chạy server). (2) Giải nén gói 3.2.1.
> (3) Chép **toàn bộ file trong thư mục `data/` của server cũ** (bản
> 3.2 đang dùng) đè sang thư mục `data/` của server 3.2.1 — để giữ
> kho Gmail, kho heo, link game và tiến độ điểm danh. (4) Vào thư
> mục `server` của bản 3.2.1 và chạy `node server.js`. Xong — mở lại
> trang điều khiển và chạy lại "Cấp Gmail" để kiểm tra.

Giai đoạn 3.2 viết lại **trang điều khiển** theo mẫu đã duyệt (4 tab,
tông tím) và code đầy đủ các phần còn thiếu: **kho tài khoản xem heo**,
**đăng nhập TikTok Lite tự động bằng tài khoản trong kho**, **điểm
danh 14 ngày**, và **Check heo đúng nghĩa** — việc hằng ngày của máy
đã quét ăn game, với **link game chuyên dụng bắt buộc**.

> ⚠️ Nói thẳng trước: Giai đoạn 3.2 đã kiểm chứng vòng kín bằng máy
> ảo (fake agent): **54/54 mục kiểm chứng mới đạt; chạy lại bộ kiểm
> chứng 3.1 (29/29), Giai đoạn 3 (41/41) và Giai đoạn 2 (38/38) vẫn
> đạt.** Nhưng các flow mới **vẫn CHƯA chạy trên điện thoại thật** —
> lần chạy thật đầu tiên có thể phải hiệu chuẩn lại các "dấu chữ"
> nhận diện màn hình TikTok Lite (mục 6), giống các giai đoạn trước.
>
> **App Farm Agent KHÔNG đổi ở giai đoạn này** — vẫn là v3.1, không
> cần cài lại agent trên điện thoại. Chỉ thay server.

---

## 1. Giai đoạn 3.2 có gì mới

**Trang điều khiển mới** — 1 trang, thanh tab dính ở trên đầu, chỉ
hiện nội dung của tab đang chọn:

- **📱 Dàn máy** (tab mở mặc định): lưới thẻ máy — tick chọn máy ngay
  trên thẻ (dùng chung cho mọi tác vụ/hành động), badge trạng thái:
  Device Owner, Trợ năng, **Gmail đã cấp**, **TK heo đã cấp**, **điểm
  danh n/14**, trạng thái xem video/check heo. Nút Trạng thái / Đánh
  thức / Chụp màn hình / **✉️ Cấp Gmail** / Xem riêng như cũ. Panel
  **ghi danh Device Owner (QR)** cũng nằm trong tab này. Trên đầu có
  nút "Chọn tất cả máy Online" và "Bỏ chọn hết".
- **🗄 Kho dữ liệu**: 2 kho cạnh nhau —
  - **Kho Gmail** (như cũ): nhập `email|mật khẩu`, cấp cho máy, hỗ trợ
    đăng nhập, đánh dấu die / xoá.
  - **Kho tài khoản xem heo (chưa đăng nhập)** — MỚI: nhập mỗi dòng
    `username|mật khẩu` hoặc `username:mật khẩu` (tài khoản TikTok
    Lite dùng để xem heo). Trạng thái Sẵn sàng / Đã cấp / Die; tài
    khoản đã đăng nhập vào máy sẽ ghi thêm "đã đăng nhập" kèm thời
    gian. Mật khẩu luôn hiển thị dạng che.
- **⚙ Tác vụ**: 4 thẻ chạy cho các máy đã tick chọn —
  1. **Đăng nhập tài khoản Google** (cấp Gmail từ kho + tự đăng nhập,
     như 3.1).
  2. **Tải LINE** (dán URL APK, máy tự tải và mở trình cài đặt).
  3. **Tải TikTok Lite** (dán URL APK, như trên).
  4. **Đăng nhập TikTok Lite bằng TK trong kho** — MỚI: cấp tài khoản
     từ kho heo rồi máy **tự mở TikTok Lite, tự bấm nút đăng nhập, tự
     nhập tài khoản + mật khẩu**. TikTok bắt xác minh (mã xác nhận /
     CAPTCHA) thì dừng **"Chờ chạm tay"** như Google.
  - Bên dưới vẫn có khối **Pipeline** đầy đủ (chọn mọi quy trình, gồm
    cả Đăng ký TikTok Lite bán tự động và Quét game cũ) + **Nhật ký
    sự kiện**.
- **▶ Hành động**: 3 thẻ —
  1. **Điểm danh 14 ngày** — MỚI: mở TikTok Lite, vào mục điểm danh,
     bấm điểm danh hôm nay cho các máy đã chọn. Bên dưới là **tiến độ
     từng máy** (thanh ngày n/14, hôm nay đã điểm danh chưa, nút "Bắt
     đầu chu kỳ mới" để reset). Chạy lại trong cùng một ngày thì máy
     báo "Hôm nay đã điểm danh rồi", không tính trùng.
  2. **Tự động xem video**: máy tự vuốt xem video liên tục theo số
     phút đã đặt — xem video thường thuần tuý, **không** quét điểm
     danh/check heo. Link game ở thẻ này là tuỳ chọn.
  3. **Check heo** — viết lại đúng nghĩa: dành cho **máy đã quét ăn
     game**; check xem video hằng ngày **để Nik mời nhận thêm tiền
     thưởng**. Máy mở link game chuyên dụng → tự xem video → thấy chữ
     check-in/thưởng thành công thì **tự báo về, tăng ô đếm "Check-in
     thành công" và dừng**.

**Link game chuyên dụng (quan trọng):** Nik xem heo **phải vào bằng
link game chuyên dụng hoặc quét mã QR chuyên dụng** thì bên Link mới
được ghi nhận thành công. Vì vậy ô **"Link game chuyên dụng (hoặc nội
dung mã QR)"** trong thẻ Check heo là **BẮT BUỘC** — để trống là
dashboard chặn không cho chạy và báo rõ. Dán link (hoặc dán nội dung
mã QR) vào **một lần**: link được **lưu trên server** (file
`data/game-link.json`), lần sau mở dashboard là tự điền sẵn, khỏi dán
lại mỗi ngày.

**An toàn mật khẩu:** mật khẩu của cả 2 kho chỉ đi qua kênh lệnh giữa
server và app trên máy. Dashboard, nhật ký sự kiện và mọi API đều chỉ
hiện `********`.

---

## 2. Cách cập nhật từ gói Giai đoạn 3.1 đang chạy trên MacBook

**Trên MacBook:**

1. Sang cửa sổ Terminal đang chạy server cũ, bấm **Ctrl + C** để dừng
   server cũ.
2. Giải nén gói mới này (`farm-agent-giai-doan-3-2`) — để cạnh thư mục
   gói cũ cũng được.
3. **Giữ lại kho Gmail (nếu đã nhập):** chép file
   `data/gmail-pool.json` từ thư mục `server` của gói CŨ sang thư mục
   `server/data` của gói MỚI (đè lên file trống có sẵn). Không chép
   thì kho Gmail ở gói mới sẽ trống và phải nhập lại. (Kho heo, tiến
   độ điểm danh và link game là dữ liệu mới của 3.2, bắt đầu từ
   trống.)
4. Mở Terminal, `cd` vào thư mục `server` của gói MỚI rồi chạy:
   `node server.js`
5. Mở dashboard như cũ: `http://localhost:8080` (hoặc IP của MacBook).

**Trên điện thoại: KHÔNG cần làm gì.** Agent vẫn là v3.1 như cũ —
không phải cài lại, IP/cổng/tên máy đã lưu giữ nguyên. Máy Online lên
dashboard mới là dùng được ngay các tính năng 3.2.

Nhắc lại 2 việc chỉ làm 1 lần cho mỗi máy (nếu chưa làm): bật **Trợ
năng** cho Farm Agent (để app gõ chữ/bấm nút được — bắt buộc cho đăng
nhập TikTok Lite tự động và điểm danh) và cho phép **chụp màn hình**
(nếu dùng nút chụp màn hình).

---

## 3. Cách dùng các tính năng mới

**Nạp kho heo:** tab 🗄 Kho dữ liệu → panel "Kho tài khoản xem heo" →
dán danh sách (mỗi dòng `username|mật khẩu`) → "Nhập vào kho". Dòng
trùng username hoặc sai định dạng sẽ bị bỏ qua và báo số lượng.

**Đăng nhập TikTok Lite bằng tài khoản trong kho:** tab 📱 Dàn máy →
tick chọn các máy cần đăng nhập → tab ⚙ Tác vụ → thẻ "Đăng nhập
TikTok Lite bằng TK trong kho" → "Chạy cho máy đã chọn". Xem tiến
trình ở khối Pipeline và nhật ký: máy tự mở app → bấm ログイン →
nhập tài khoản → nhập mật khẩu → bấm đăng nhập → "✅ Đăng nhập TikTok
Lite hoàn tất". Máy nào bị TikTok bắt xác minh sẽ dừng **"Chờ chạm
tay"**: cầm máy xử lý xác minh, rồi bấm "Đã xử lý — chạy tiếp" ở khối
Pipeline. Điều kiện: máy Online + đã bật Trợ năng + đã cài TikTok
Lite + kho heo còn tài khoản Sẵn sàng (hoặc máy đã được cấp tài khoản
từ trước thì dùng lại tài khoản đó).

**Điểm danh 14 ngày:** tab 📱 Dàn máy → tick chọn máy → tab ▶ Hành
động → thẻ "Điểm danh 14 ngày" → "Điểm danh cho máy đã chọn". Tiến độ
của từng máy hiện ngay bên dưới (ngày n/14). Đủ 14 ngày khác nhau là
hoàn thành chu kỳ; muốn bắt đầu lại thì bấm "Bắt đầu chu kỳ mới" ở
dòng của máy đó.

**Check heo (hằng ngày, cho máy đã ăn game):** lần đầu: dán **link
game chuyên dụng** (hoặc nội dung mã QR) vào ô trong thẻ Check heo —
link tự lưu trên server. Các ngày sau: tick chọn các máy đã ăn game →
"▶ Bắt đầu check heo" → máy tự mở link, tự xem video; Nik nào check
thành công sẽ báo về ở nhật ký check-in và ô đếm "🐷 Check-in thành
công" trên đầu trang.

**Tự động xem video:** tick chọn máy → thẻ "Tự động xem video" → đặt
số phút → "Bắt đầu xem". Vòng này chỉ xem, không báo check-in.

---

## 4. Giới hạn thành thật

- **Xác minh của TikTok (mã xác nhận / CAPTCHA) vẫn là bước chạm
  tay** — flow đăng nhập dừng ở "Chờ chạm tay" và chỉ chạy tiếp khi
  bạn xử lý xong trên máy rồi bấm chạy tiếp. CAPTCHA / xác minh của
  Google cũng vậy (như 3.1).
- **Dấu chữ nhận diện màn hình TikTok Lite là giá trị mặc định tiếng
  Nhật** — phỏng theo giao diện TikTok Lite thông thường. Máy dùng
  ngôn ngữ khác, hoặc TikTok đổi giao diện, thì có thể không khớp:
  triệu chứng là flow báo "Không thấy màn hình đăng nhập / mục điểm
  danh sau 25 giây". Cách sửa ở mục 6 — không cần sửa code.
- Đăng nhập TikTok Lite bằng **số điện thoại + mã SMS** không nằm
  trong flow tự động này — flow dùng **tài khoản + mật khẩu** trong
  kho heo. Tài khoản nào TikTok bắt buộc xác minh thêm thì rơi vào
  bước chạm tay như trên.
- Toàn bộ tính năng 3.2 **chưa chạy trên điện thoại thật** — hãy thử
  trước trên 1 máy, hiệu chuẩn dấu chữ (mục 6) cho khớp, rồi mới chạy
  cho cả dàn.

---

## 5. Trong gói này có gì

- `agent.apk` — Farm Agent **v3.1 (giữ nguyên từ gói 3.1, cùng chữ
  ký)** — chỉ cần nếu cài máy mới; máy đang chạy v3.1 rồi thì bỏ qua.
- `server/` — server v3.2 hoàn chỉnh: `server.js`, `dashboard.html`,
  `fake-agent.js` (máy ảo để kiểm chứng), `provisioning.json`,
  `public-apks/agent.apk` (bản v3.1 — server phát tại
  `/apks/agent.apk`), `data/` gồm: `flow-config.json` (đã có mục
  `tiktokLogin` + `checkin`), `gmail-pool.json` (trống),
  `heo-pool.json` (trống), `checkin-state.json` (trống),
  `game-link.json` (trống) + `README.txt`.
- `HUONG-DAN.md` — file này.

---

## 6. Hiệu chuẩn dấu chữ TikTok Lite (khi chạy thật không khớp)

Các dấu chữ nằm trong file `server/data/flow-config.json` — sửa bằng
trình soạn thảo văn bản bất kỳ, **không cần khởi động lại server**
(server đọc lại file mỗi lần chạy):

- Mục **`tiktokLogin`** (đăng nhập TikTok Lite tự động):
  - `loginEntry`: chữ trên nút vào đăng nhập (mặc định: `ログイン`,
    `ログインする`, `Log in`).
  - `usernameScreen`: dòng chữ chỉ có ở màn hình nhập tài khoản (mặc
    định: `ユーザー名`, `メールアドレス`, `電話番号`, ...).
  - `passwordScreen`: dòng chữ ở màn hình nhập mật khẩu (mặc định:
    `パスワード`, `Password`).
  - `loginButton`: nút đăng nhập / đi tiếp (mặc định: `ログイン`,
    `Log in`, `次へ`, `Next`).
  - `verifyMarkers`: các dòng chữ báo TikTok đang bắt xác minh (mặc
    định: `本人確認`, `確認コード`, `認証コード`, ...) — thấy một
    trong các dòng này là flow dừng chờ chạm tay.
- Mục **`checkin`** (điểm danh):
  - `entryMarkers`: chữ của mục điểm danh trên màn hình (mặc định:
    `チェックイン`, `ボーナス`, `ポイント`).
  - `buttonMarkers`: chữ trên nút bấm điểm danh (mặc định:
    `チェックインする`, `チェックイン`).
  - `successMarkers`: dòng chữ báo điểm danh thành công (mặc định:
    `チェックイン完了`, `チェックイン成功`,
    `ポイントを獲得しました`, `付与されました`) — cũng là các chữ mà
    vòng **Check heo** quét để báo thành công.

**Cách lấy chữ thật trên màn hình máy:** khi máy đang ở màn hình cần
hiệu chuẩn, gửi lệnh `dump_ui` cho máy đó (qua dashboard/API
`/api/cmd`) — kết quả trả về toàn bộ chữ đang hiện trên màn hình.
Copy đúng dòng chữ thật vào mục tương ứng trong `tiktokLogin` /
`checkin` rồi chạy lại.

Kiểm chứng nội bộ của giai đoạn này (máy ảo, vòng kín): kho heo nhập
/ cấp / die / xoá đúng, mật khẩu không lộ; flow đăng nhập TikTok Lite
chạy đến hoàn tất và agent nhận đúng thứ tự lệnh mở app → bấm đăng
nhập → nhập tài khoản → bấm tiếp → nhập mật khẩu → bấm đăng nhập;
TikTok bắt xác minh thì dừng đúng "Chờ chạm tay"; điểm danh ghi được
ngày 1/14, chạy lại cùng ngày không tính trùng, reset được; link
game chuyên dụng lưu/đọc lại đúng, Check heo qua link phát hiện
thành công, còn xem video thường thì không báo nhầm; dashboard đủ 4
tab đúng thứ tự. Chi tiết trong `VERIFY.md` của dự án.
