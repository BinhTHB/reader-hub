# Hướng Dẫn Chạy & Kiểm Thử Thủ Công (Manual Testing) Cho React Web App

Tài liệu này hướng dẫn chi tiết cách khởi động, chạy thử và tự kiểm tra (Manual Test) ứng dụng **React Web App** (`web_react`) trên trình duyệt máy tính, điện thoại, hoặc trực tiếp trên máy ảo Android với tính năng cập nhật tức thì (Live Reload).

---

## 🖥️ PHẦN 1: CHẠY THỬ & TEST TRÊN TRÌNH DUYỆT MÁY TÍNH (PC BROWSER)

Đây là cách nhanh nhất để bạn tự kiểm tra giao diện, luồng chuyển đổi giữa các màn hình và các tính năng chính.

### 1. Khởi động Local Server
Mở terminal PowerShell của bạn và chạy lệnh:
```powershell
cd e:\project\reader-hub\web_react
pnpm dev
```
Hệ thống sẽ khởi động máy chủ thử nghiệm local tại đường dẫn: **`http://localhost:5173`**

### 2. Mẹo giả lập màn hình Điện thoại trên Trình duyệt (Rất Quan Trọng)
Vì ứng dụng được thiết kế theo giao diện di động (Mobile UI), nếu bạn xem bằng màn hình PC thông thường sẽ thấy ứng dụng nằm căn giữa. Để test trải nghiệm vuốt chạm chuẩn điện thoại:
1. Mở link `http://localhost:5173` trên trình duyệt (Chrome, Edge hoặc Brave).
2. Nhấn phím **F12** (hoặc chuột phải chọn *Inspect / Kiểm tra*) để mở DevTools.
3. Bấm vào biểu tượng **Thiết bị di động** ở góc trên bên trái của bảng DevTools (hoặc nhấn tổ hợp phím **Ctrl + Shift + M**).
4. Ở thanh điều khiển phía trên, chọn một thiết bị di động (ví dụ: *iPhone 14 Pro* hoặc *Pixel 7*) và chỉnh tỷ lệ hiển thị là **100%**.
5. Bây giờ bạn có thể dùng chuột vuốt cuộn màn hình, nhấn các nút chuẩn xác như đang cầm điện thoại!

---

## 📱 PHẦN 2: TEST TRỰC TIẾP TRÊN ĐIỆN THOẠI / GIẢ LẬP (LIVE RELOAD)

**Đặc sản của Capacitor:** Bạn không cần phải tốn 2 phút build ra file APK mỗi lần muốn test thử thay đổi. Bạn có thể chạy chế độ **Live Reload** — Bạn sửa code trên máy tính $\rightarrow$ Màn hình ứng dụng trên điện thoại/máy ảo tự động cập nhật ngay lập tức!

### 1. Điều kiện chuẩn bị:
* Bạn đã kết nối điện thoại Android của bạn vào máy tính qua cáp USB (đã bật *USB Debugging / Gỡ lỗi USB* trong cài đặt nhà phát triển).
* HOẶC bạn đã khởi động sẵn một **Máy ảo Android (Emulator)** trong Android Studio.

### 2. Chạy lệnh Test Live-Reload:
Tại thư mục `web_react`, bạn chạy lệnh sau:
```powershell
npx cap run android --live-reload --external
```

### 3. Cách hoạt động:
1. Capacitor sẽ quét và hiển thị danh sách các thiết bị đang kết nối (điện thoại thật hoặc máy ảo).
2. Bạn chọn thiết bị muốn chạy bằng cách nhấn phím mũi tên và ấn **Enter**.
3. Ứng dụng sẽ được biên dịch và tự động cài đặt lên điện thoại của bạn.
4. **Trải nghiệm:** Bây giờ bạn cầm điện thoại lên thao tác test thử. Hãy thử sửa đổi một chữ bất kỳ trong file [HomeScreen.tsx](file:///e:/project/reader-hub/web_react/src/app/screens/HomeScreen.tsx), ngay khi bạn bấm **Save** trên máy tính, màn hình điện thoại của bạn sẽ tự chớp và cập nhật chữ mới đó ngay lập tức!

---

## 🔍 PHẦN 3: KỊCH BẢN TỰ KIỂM TRA CÁC TÍNH NĂNG CHÍNH

Khi bạn tự test trên trình duyệt/điện thoại, hãy đi qua lần lượt các kịch bản sau để đảm bảo app hoạt động đúng 100%:

### 1. Test Trang Chủ (HomeScreen)
* **Trạng thái tải (Loading):** Khi vừa F5, ứng dụng phải hiển thị vòng quay loading mượt mà.
* **Danh sách truyện:** Truyện phải được tải trực tiếp từ cơ sở dữ liệu Supabase của bạn (ảnh bìa truyện, tiêu đề, số lượng chương phải hiển thị đầy đủ).
* **Nút bấm:** Bấm vào một thẻ truyện để kiểm tra tính năng điều hướng sang màn hình Chi tiết.

### 2. Test Trang Chi Tiết (DetailScreen)
* **Thông tin truyện:** Tên tác giả, ảnh bìa lớn, mô tả truyện phải khớp với cơ sở dữ liệu.
* **Danh sách chương:** Phải liệt kê đầy đủ các chương đã cào của truyện đó.
* **Điều hướng:** Click chọn một chương bất kỳ (ví dụ: *Chương 1*) để chuyển sang màn hình Đọc truyện.

### 3. Test Trang Đọc Truyện & Bộ Đọc Audio (ReadingScreen)
* **Nội dung chương:** Chữ truyện phải được load từ file JSON trên Cloudflare R2 của bạn.
* **Bộ đọc TTS (Phát âm thanh):**
  * Bấm nút **Phát (Play)** $\rightarrow$ Giọng đọc của Google/Trình duyệt phải cất lên đọc đoạn đầu tiên. Đoạn văn đang đọc phải được **tô sáng (highlight) viền xanh**.
  * Bấm nút **Tạm dừng (Pause)** $\rightarrow$ Âm thanh phải dừng ngay lập tức.
  * Bấm nút **Tua đoạn (Next / Previous)** $\rightarrow$ Bộ đọc phải nhảy sang đoạn tiếp theo/trước đó và highlight đúng đoạn mới.
  * Kéo thanh **Tốc độ đọc (Speed)** $\rightarrow$ Tốc độ giọng đọc phải nhanh hơn hoặc chậm hơn tương ứng.
* **Cài đặt giao diện:** Thử thay đổi cỡ chữ to/nhỏ và bật/tắt chế độ tối (Dark mode) xem giao diện có đổi màu chuẩn không.

### 4. Test Tính năng Tìm kiếm & Cào truyện (ScrapeScreen)
* Bấm vào thanh tìm kiếm ở trang chủ $\rightarrow$ App tự động chuyển sang trang Tìm & Cào truyện.
* Nhập tên truyện muốn tìm (ví dụ: `Đấu Phá Thương Khung`) rồi ấn tìm kiếm.
* Chọn nguồn truyện (ví dụ: *Truyện Full*) và bấm nút **Cào truyện** để kiểm tra tính năng kích hoạt Scraper trên GitHub Actions.
