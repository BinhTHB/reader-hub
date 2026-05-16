# Fix CORS cho Cloudflare R2

Lỗi CORS chỉ xảy ra khi chạy Flutter Web (localhost). APK Android không bị ảnh hưởng.

## Cách fix:

### 1. Cấu hình CORS qua Cloudflare Dashboard

1. Đăng nhập vào Cloudflare Dashboard
2. Vào R2 → Chọn bucket `reader-hub-data`
3. Vào Settings → CORS Policy
4. Thêm CORS rule:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2. Hoặc dùng Wrangler CLI

```bash
# Tạo file cors.json
cat > cors.json << EOF
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
EOF

# Apply CORS policy
wrangler r2 bucket cors put reader-hub-data --file cors.json
```

### 3. Verify CORS

```bash
curl -I -X OPTIONS \
  -H "Origin: http://localhost:58994" \
  -H "Access-Control-Request-Method: GET" \
  https://pub-3ccdfab0a8404fccb5c340426d452889.r2.dev/stories/dau-la-dai-luc/cover.jpeg
```

Nếu thành công, response sẽ có header:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

## Lưu ý

- CORS chỉ cần thiết cho Flutter Web
- APK Android không cần CORS (native HTTP request)
- Nếu chỉ dùng APK, có thể bỏ qua lỗi này
