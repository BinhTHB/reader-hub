# Phân tích kỹ thuật: Tích hợp Scrapling vào Reader-Hub Scraper

Tài liệu này phân tích chi tiết về **Scrapling** (một thư viện cào web Python thế hệ mới cực kỳ mạnh mẽ) và đánh giá khả năng, ưu điểm cũng như cách thức tích hợp Scrapling để cải thiện hệ thống cào truyện hiện tại của dự án **Reader-Hub**.

---

## 1. So sánh kiến trúc: Hiện tại vs Scrapling

Dưới đây là bảng so sánh trực quan giữa giải pháp hiện tại của dự án (dựa trên **Playwright + Playwright-Stealth + BeautifulSoup**) và giải pháp tích hợp **Scrapling**:

| Tính năng | Giải pháp Hiện tại (Playwright + BS4) | Giải pháp Đề xuất với Scrapling |
| :--- | :--- | :--- |
| **Vượt bot (Anti-bot Bypass)** | Sử dụng `playwright-stealth` thủ công và chèn các script che giấu (`Object.defineProperty(navigator, 'webdriver', ...)`). Dễ bị phát hiện bởi Cloudflare nâng cao. | Tích hợp sẵn `StealthyFetcher` với công nghệ giả lập TLS Fingerprint nâng cao và tự động giải quyết Cloudflare Turnstile/Interstitial mà không cần viết thêm script che giấu. |
| **Tránh sập do thay đổi DOM** | Nếu cấu trúc trang web thay đổi (ví dụ: đổi class, đổi ID, đổi cấu trúc thẻ), các parser dựa trên BeautifulSoup sẽ bị lỗi hoàn toàn. Phải vào sửa code thủ công. | Sử dụng **Adaptive Scraping** với thuật toán nhận dạng tương đồng thông minh (`adaptive=True`). Tự động tìm lại phần tử mục tiêu dựa trên "vân tay" của phần tử cũ ngay cả khi class/ID bị thay đổi. |
| **Quản lý Proxy** | Tự phát triển module `proxy_rotator.py` thủ công, phải đóng trình duyệt, tạo context mới mỗi khi xoay proxy, dễ rò rỉ DNS. | Tích hợp sẵn `ProxyRotator` trong tất cả các session (`FetcherSession`, `StealthySession`, `DynamicSession`) hỗ trợ xoay vòng proxy tự động và chống rò rỉ DNS qua DNS-over-HTTPS (DoH). |
| **Quản lý phiên (Session)** | Quản lý thủ công thông qua `BrowserContext` của Playwright, tự duy trì cookie/headers. | Sử dụng các đối tượng Session cao cấp hỗ trợ quản lý trạng thái, cookie và tái sử dụng pool tab trình duyệt cực kỳ hiệu quả và an toàn. |
| **Chặn quảng cáo / Tải tài nguyên** | Phải tự cấu hình block route thủ công trong Playwright nếu muốn chặn ảnh/css/ads để tối ưu tốc độ. | Tích hợp sẵn bộ lọc chặn quảng cáo và tracker (~3,500 domain quảng cáo phổ biến) giúp giảm băng thông và tăng tốc độ cào đáng kể. |
| **Độ phức tạp mã nguồn** | Cao. File `scraper.py` dài hơn 660 dòng với nhiều logic lặp lại, xử lý ngoại lệ, xoay proxy và quản lý vòng đời Playwright phức tạp. | Thấp. Code sẽ cực kỳ ngắn gọn vì Scrapling đóng gói toàn bộ logic quản lý trình duyệt, anti-bot, và proxy xoay vòng dưới dạng một interface sạch sẽ. |

---

## 2. Các điểm cải thiện cốt lõi cho Reader-Hub

### 2.1. Bypass Cloudflare Đáng tin cậy hơn (Đặc biệt với uukanshu.cc và Webnovel)
Hiện tại, trang `uukanshu.cc` sử dụng Cloudflare Turnstile và nếu ta gọi bằng `requests` thông thường sẽ bị lỗi `403`. Với `StealthyFetcher` hoặc `StealthySession` của Scrapling:
```python
from scrapling.fetchers import StealthySession

# Scrapling tự động quản lý pool trình duyệt và giải quyết các thử thách của Cloudflare
with StealthySession(headless=True, solve_cloudflare=True) as session:
    page = session.fetch("https://uukanshu.cc/book/8530/")
    # Kết quả trả về là một Selector trực quan tương tự BeautifulSoup/Scrapy
    chapters = page.css('div#list-chapterAll dd a')
```
Logic này giúp loại bỏ hoàn toàn các cấu hình phức tạp trong `create_browser_context` hiện tại.

### 2.2. Khả năng Chống lỗi do thay đổi DOM (Adaptive Selector)
Đây là tính năng độc nhất vô nhị của Scrapling. Với các trang truyện thường xuyên thay đổi class CSS để chống cào (ví dụ: đổi `.chapter-c` thành `.chapter-content-v2` hoặc các chuỗi ngẫu nhiên):
- **Hiện tại**: Parser của ta sẽ không tìm thấy nội dung và lưu dữ liệu trống, hoặc ném lỗi khiến job thất bại.
- **Scrapling**: Khi tìm kiếm phần tử lần đầu, ta bật `auto_save=True` để Scrapling lưu lại dấu vết (fingerprint) của phần tử. Trong các lần cào sau, nếu không tìm thấy selector cũ, ta chỉ cần gọi với tham số `adaptive=True`:
```python
# Lần đầu tiên cào (lưu vân tay của thẻ chứa nội dung chương)
content_el = page.css('.chapter-c', auto_save=True)

# Các lần cào tiếp theo (nếu trang web cập nhật giao diện, class bị thay đổi)
content_el = page.css('.chapter-c', adaptive=True) 
# Scrapling sẽ tự động tìm kiếm phần tử có độ tương đồng cao nhất về vị trí, thẻ con, cấu trúc văn bản
```
Điều này giúp hệ thống cào truyện của Reader-Hub trở nên cực kỳ bền bỉ, giảm thiểu tối đa chi phí bảo trì parser khi các nguồn truyện cập nhật giao diện.

### 2.3. Quản lý và Xoay vòng Proxy Tự động & Bảo mật
Module `proxy_rotator.py` hiện tại yêu cầu ta tự viết logic lấy proxy, kiểm tra trạng thái sống chết, lưu lịch sử lỗi và nạp vào Playwright context mới.
Với Scrapling, ta có thể khai báo một `ProxyRotator` trực tiếp và gán cho Session:
```python
from scrapling.fetchers import ProxyRotator, StealthySession

# Khởi tạo proxy rotator từ danh sách proxy của dự án hoặc API
rotator = ProxyRotator(proxies=["http://proxy1.com", "http://proxy2.com"])

# Session tự động xoay proxy khi phát hiện lỗi hoặc theo chu kỳ
with StealthySession(proxy_rotator=rotator, use_doh=True) as session:
    # use_doh=True giúp ngăn chặn rò rỉ DNS qua proxy, tăng tính ẩn danh
    page = session.fetch("https://truyenfull.vision/...")
```

### 2.4. Tối ưu hóa hiệu năng & Giảm băng thông (Ad Block)
Khi chạy Playwright ở chế độ Headless để cào hàng ngàn chương, việc tải các script quảng cáo, ảnh bìa lặp đi lặp lại hoặc các tracker làm tiêu tốn rất nhiều RAM/CPU của server (đặc biệt là môi trường GitHub Actions vốn bị giới hạn tài nguyên).
Scrapling cho phép chặn các tài nguyên không cần thiết cực kỳ đơn giản:
```python
# Bật tính năng chặn quảng cáo và vô hiệu hóa tải các tài nguyên nặng (image, font, media)
session = StealthySession(
    disable_resources=True,  # Không tải ảnh/font để tăng tốc 3-5 lần
    ad_block=True            # Tự động chặn các mạng quảng cáo tích hợp sẵn
)
```

---

## 3. Bản kế hoạch Tích hợp từng bước (Không Sửa Code Hiện tại)

Để đảm bảo an toàn và tính kế thừa, ta có thể tích hợp Scrapling song song với hệ thống hiện tại mà không làm ảnh hưởng đến các parser đang chạy tốt. Quy trình thực hiện như sau:

### Bước 1: Cập nhật dependency
Thêm `scrapling` và các gói mở rộng vào `requirements.txt`:
```txt
scrapling==0.2.1
# hoặc cài kèm các fetcher dependencies (playwright, v.v.):
scrapling[fetchers]
```

### Bước 2: Tạo Parser mới hoặc nâng cấp BaseParser để hỗ trợ Scrapling Selector
Ta có thể mở rộng `BaseSiteParser` để trả về cả BeautifulSoup lẫn Scrapling Selector, hoặc tạo một class parser lai.
Vì Scrapling Selector hỗ trợ đầy đủ các API quen thuộc từ Scrapy/BeautifulSoup (`css()`, `xpath()`, `find_all()`), việc chuyển đổi mã nguồn từ BeautifulSoup sang Scrapling cực kỳ dễ dàng:
```python
# Thay vì:
# soup = BeautifulSoup(html, "lxml")
# title = soup.select_one("h3.title").get_text()

# Ta dùng Scrapling Selector:
from scrapling.parser import Selector
page = Selector(html)
title = page.css("h3.title::text").get()
```

### Bước 3: Đơn giản hóa file `scraper.py`
Thay thế logic quản lý vòng đời Playwright thủ công, logic xoay proxy và các vòng lặp fetch thử lại phức tạp bằng một `StealthySession` duy nhất:
```python
async def run_scraper_with_scrapling():
    from scrapling.fetchers import AsyncStealthySession
    
    # Khởi tạo session với cấu hình tối ưu chống bot và chặn tài nguyên rác
    async with AsyncStealthySession(
        headless=True,
        solve_cloudflare=True,
        disable_resources=True, # Tăng tốc độ
        ad_block=True
    ) as session:
        # Cào thông tin truyện
        page = await session.fetch(STORY_SOURCE_URL)
        story_info = parser.parse_story_info(page.text, STORY_SOURCE_URL)
        
        # Cào từng chương
        for ch_info in target_chapters:
            ch_page = await session.fetch(ch_info["source_url"])
            content = parser.parse_chapter_content(ch_page.text)
            # ... Upload R2 & cập nhật Supabase ...
```

---

## 4. Kết luận & Khuyến nghị

**Scrapling** là một bước tiến lớn so với việc tự xây dựng wrapper chống bot quanh Playwright thủ công như dự án đang làm.
- **Có nên chuyển đổi hoàn toàn không?**
  - Đối với các trang web có cơ chế chống bot thông thường (như TruyenFull), giải pháp hiện tại hoạt động khá ổn định.
  - Đối với các trang web sử dụng Cloudflare gắt gao (như uukanshu.cc, Webnovel, MeTruyenChu khi cập nhật bảo mật), việc chuyển sang **Scrapling** là cực kỳ đáng giá vì nó giảm thiểu hàng trăm dòng code boilerplate và tự động hóa toàn bộ phần khó nhất (giả lập vân tay TLS, giải Turnstile, xoay proxy sạch).
- **Khuyến nghị**: Nên tạo thử nghiệm một nhánh mới (ví dụ: `feature/scrapling-integration`) để viết thử nghiệm bộ cào cho một nguồn truyện khó trước (như `uukanshu.cc`), đánh giá hiệu năng trên môi trường thực tế trước khi áp dụng đại trà cho toàn bộ hệ thống.
