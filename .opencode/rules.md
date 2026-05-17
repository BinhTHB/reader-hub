# Project Rules

## Communication Rule

**Giao tiếp bằng tiếng Việt**

**Suy luận bằng tiếng Việt**

## Documentation Rule
**Luôn ghi lại các bước đã thực hiện vào file CONTEXT.md**

Khi thực hiện các thay đổi quan trọng trong dự án, hãy cập nhật file `CONTEXT.md` với:

1. **Các quyết định thiết kế mới**: Khi thêm/thay đổi kiến trúc, công nghệ, hoặc approach
2. **Các bước setup/config**: Khi thêm dependencies, environment variables, hoặc cấu hình mới
3. **Các vấn đề đã fix**: Khi giải quyết bug hoặc issue quan trọng, ghi lại nguyên nhân và cách fix
4. **Các thay đổi về flow**: Khi thay đổi luồng xử lý, API endpoints, hoặc data pipeline
5. **Các test results**: Khi chạy test và có kết quả quan trọng cần lưu lại

### Format ghi chép

Thêm vào cuối file CONTEXT.md hoặc cập nhật section tương ứng:

```markdown
## [Ngày] [Giờ UTC+7] - [Tên thay đổi]

**Vấn đề**: Mô tả vấn đề hoặc yêu cầu

**Giải pháp**: Các bước đã thực hiện
1. Bước 1
2. Bước 2
3. ...

**Kết quả**: Kết quả sau khi thực hiện

**Lưu ý**: Các điểm cần chú ý cho tương lai
```

### Quy tắc dọn dẹp (Cleanup Rule)

Đối với những lỗi/vấn đề đã gặp phải và đã được giải quyết triệt để, không còn ảnh hưởng hay giá trị tham khảo cho tương lai (ví dụ: các lỗi build môi trường cũ đã bỏ qua), có thể xoá bỏ các mục đó trong `CONTEXT.md` để giữ cho nội dung file luôn tinh gọn và tập trung vào trạng thái hiện tại của dự án.

### Ví dụ

```markdown
## 2026-05-16 19:30 - Fix lỗi hiển thị danh sách chương

**Vấn đề**: Cần verify các chức năng scraping hoạt động đúng theo spec

**Giải pháp**:
1. Test search multi-source (TruyenFull + MeTruyenChu)
2. Test scrape story info, chapter list, chapter content
3. Test proxy rotation system

**Kết quả**: 
- Search: ✅ Cả 2 nguồn hoạt động
- Scrape TF: ✅ 50 chapters, 44 paragraphs
- Scrape MTC: ✅ 90 chapters, 254 paragraphs  
- Proxy: ✅ 4 working proxies từ 3908 candidates

**Lưu ý**: MeTruyenChu một số URL cũ bị redirect sang TruyenFull
```

## Khi nào KHÔNG cần ghi

- Các thay đổi nhỏ, trivial (fix typo, format code)
- Các thay đổi tạm thời, experimental chưa confirm
- Các debug steps không liên quan đến solution cuối cùng
