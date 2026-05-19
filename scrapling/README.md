# Scrapling Scraper Module

Thư mục này chứa nhánh triển khai bộ cào dữ liệu (scraper) sử dụng thư viện **Scrapling** gốc tại [GitHub: D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling).

## Giới thiệu về Scrapling

**Scrapling** là một Web Scraping Framework hiện đại, tối ưu hóa cho việc vượt tường lửa (Cloudflare, v.v.), tự động thích ứng với thay đổi cấu trúc DOM của trang web (Adaptive Element Tracking) và tích hợp các công nghệ giả lập trình duyệt Playwright ẩn danh (Stealthy Fetching) thông qua `rebrowser-playwright`.

Dự án **Reader Hub** sử dụng Scrapling để cải thiện khả năng thu thập dữ liệu tự động, ổn định hơn và tránh bị chặn so với các phương thức truyền thống.

## Cấu trúc thư mục

- `scraper.py`: File chạy chính để cào thông tin truyện, danh sách chương và đẩy nội dung chương lên Cloudflare R2 / Supabase Database.
- `search_sources.py`: Thực hiện tìm kiếm truyện trên nhiều nguồn song song thông qua Scrapling.
- `parsers.py`: Định nghĩa các bộ phân tích cú pháp HTML cụ thể cho từng nguồn truyện (`truyenfull`, `metruyenchu`, `truyendich`, `uukanshu`).
- `sites_config.py`: Registry tập trung quản lý các domain nguồn truyện.
- `r2_uploader.py`: Helper để tải dữ liệu và ảnh bìa lên kho lưu trữ R2.
- `supabase_client.py`: Tương tác với Supabase DB (quản lý jobs, lưu trữ thông tin truyện/chương).
- `bypasses/`: Chứa các kịch bản JS bypass stealth tinh chỉnh nhằm ẩn danh hóa Playwright tối đa.

## Cách chạy kiểm thử cục bộ (Local Testing)

1. Tạo môi trường ảo và cài đặt các thư viện:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   python -m rebrowser_playwright install chromium
   ```

2. Kiểm thử tính năng tìm kiếm:
   ```bash
   python test_local.py search "Đấu La Đại Lục"
   ```

3. Kiểm thử tính năng cào dữ liệu của một truyện:
   ```bash
   python test_local.py scrape truyenfull "https://truyenfull.vision/dau-la-dai-luc/"
   ```
