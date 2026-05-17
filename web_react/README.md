# 📚 Reader Hub - Ứng dụng Đọc Truyện với Web Scraping

> Ứng dụng mobile đọc truyện dài với tính năng tự động scrape truyện từ nhiều nguồn web sử dụng GitHub Actions + Playwright.

![Tech Stack](https://img.shields.io/badge/React-18.3.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4.1-38bdf8)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Scraper-2088FF)

---

## 🎯 Tính năng chính

### ✅ Đã triển khai (Frontend)
- 🏠 **Trang chủ**: Tiếp tục đọc, đề xuất cá nhân, truyện hot, thể loại
- 📖 **Đọc truyện**: Font size/line height tùy chỉnh, dark mode, progress tracking
- 📚 **Thư viện**: Quản lý sách đang đọc, yêu thích, bộ sưu tập, lịch sử
- 🔍 **Tìm kiếm & Cào**: Search truyện → Chọn từ danh sách → Trigger scraping job
- 👤 **Profile**: Thống kê đọc, streak counter, achievements
- 🎨 **UI/UX**: Material Design, smooth animations, responsive

### 🚧 Cần tích hợp (Backend)
- ⚡ Supabase Database + Edge Functions
- 🤖 GitHub Actions workflow (scraper.py)
- ☁️ Cloudflare R2 storage
- 🔄 Realtime job updates
- 🔐 Authentication & sync

---

## 🏗️ Kiến trúc

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   React     │─────▶│   Supabase   │─────▶│   GitHub    │
│   Frontend  │      │   Backend    │      │   Actions   │
│             │◀─────│   Realtime   │      │  (Scraper)  │
└─────────────┘      └──────────────┘      └──────┬──────┘
                            │                      │
                            │                      │
                     ┌──────▼──────┐        ┌──────▼──────┐
                     │  PostgreSQL │        │ Playwright  │
                     │   Database  │        │  + Stealth  │
                     └─────────────┘        └──────┬──────┘
                                                   │
                                            ┌──────▼──────┐
                                            │ Cloudflare  │
                                            │     R2      │
                                            └─────────────┘
```

**Chi tiết**: Xem [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repo-url>
cd reader-hub
pnpm install
```

### 2. Development
```bash
pnpm dev
```

Ứng dụng chạy tại `http://localhost:5173` (hoặc port được hiển thị)

### 3. Build
```bash
pnpm build
```

---

## 📁 Cấu trúc Project

```
reader-hub/
├── src/
│   ├── app/
│   │   ├── App.tsx                 # Main app với navigation
│   │   ├── components/
│   │   │   ├── BottomNav.tsx       # Bottom tab navigation
│   │   │   ├── BookCard.tsx        # Card hiển thị sách
│   │   │   ├── Skeleton.tsx        # Loading states
│   │   │   └── EmptyState.tsx      # Empty states
│   │   └── screens/
│   │       ├── HomeScreen.tsx      # 🏠 Trang chủ
│   │       ├── ReadingScreen.tsx   # 📖 Màn đọc
│   │       ├── LibraryScreen.tsx   # 📚 Thư viện
│   │       ├── DetailScreen.tsx    # 📄 Chi tiết truyện
│   │       ├── ProfileScreen.tsx   # 👤 Profile
│   │       └── ScrapeScreen.tsx    # 🔥 Cào truyện (QUAN TRỌNG)
│   ├── styles/
│   │   ├── theme.css              # Design tokens
│   │   └── fonts.css              # Font imports
│   └── lib/
│       └── supabase.ts            # (Cần tạo) Supabase client
├── public/
├── .env.local                      # (Cần tạo) Environment variables
├── package.json
├── INTEGRATION_GUIDE.md            # 📘 Hướng dẫn tích hợp backend
├── ARCHITECTURE.md                 # 🏗️ Kiến trúc & data flow
└── README.md                       # 📄 File này
```

---

## 🔧 Tích hợp Backend

Hiện tại frontend đang chạy với **mock data**. Để kết nối backend thật:

### Bước 1: Setup Supabase
1. Tạo project trên [supabase.com](https://supabase.com)
2. Chạy migrations (tạo tables: `novels`, `chapters`, `scraping_jobs`)
3. Deploy Edge Functions (`search-novels`, `trigger-scraper`)

### Bước 2: Setup Cloudflare R2
1. Tạo R2 bucket cho storage
2. Config CORS cho bucket
3. Lấy API keys (access key + secret)

### Bước 3: Setup GitHub Actions
1. Tạo repository cho scraper
2. Add secrets (Supabase, R2, GitHub token)
3. Tạo workflow `.github/workflows/scraper.yml`
4. Viết `scraper.py` + parsers

### Bước 4: Update Frontend
1. Install `@supabase/supabase-js`
2. Tạo `src/lib/supabase.ts`
3. Update `ScrapeScreen.tsx` (thay mock → real API)

**Chi tiết đầy đủ**: Xem [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

---

## 🎨 Design System

### Colors
```css
--primary: #6C5CE7       /* Tím nhạt - CTAs, accent */
--secondary: #8E7BFF     /* Tím phụ - tags, badges */
--background: #FFFFFF    /* Trắng - nền sáng */
--foreground: #1E1E1E    /* Đen nhẹ - text chính */
```

### Typography
- **Font Family**: Playfair Display (serif, elegant)
- **Base Size**: 16px
- **Line Height**: 1.6-1.8 (đọc dài)

### Spacing
- Base unit: 8px
- Padding/Margin: 16px, 24px, 32px
- Touch targets: Min 44-48px

---

## 🧪 Testing

### Manual Testing
```bash
# Run dev server
pnpm dev

# Test các màn hình:
# 1. Home → Xem continue reading, recommendations
# 2. Library → Quản lý sách
# 3. Cào → Search "Kiếm" → Chọn scrape
# 4. Profile → Xem stats
```

### Integration Testing (Sau khi có backend)
```bash
# Test search API
curl https://your-project.supabase.co/functions/v1/search-novels?q=Kiếm

# Test trigger scraper
curl -X POST https://your-project.supabase.co/functions/v1/trigger-scraper \
  -H "Content-Type: application/json" \
  -d '{"source_url": "https://truyenfull.vn/test"}'
```

---

## 📝 Quy trình Scraping (4 bước)

### 1. **Trigger**
User search → chọn truyện → Frontend gọi Edge Function → GitHub Actions `repository_dispatch`

### 2. **Orchestrator**
`scraper.py` nhận job → `detect_parser()` chọn parser → scrape metadata (title, author, cover)

### 3. **Pagination**
Loop qua danh sách chương → parse HTML mỗi chương → upload JSON lên R2 → lưu `text_r2_url` vào DB

### 4. **Bypass**
Playwright + playwright-stealth + random fingerprints → vượt Cloudflare → proxy rotation nếu bị block

**Chi tiết**: Xem [ARCHITECTURE.md](./ARCHITECTURE.md#-data-flow-complete-scraping-process)

---

## 🔐 Environment Variables

### Frontend (`.env.local`)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Backend (GitHub Secrets)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc... # service_role key
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=reader-hub-storage
GITHUB_TOKEN=ghp_... # for repository_dispatch
```

---

## 🛠️ Tech Stack Chi Tiết

### Frontend
- **Framework**: React 18.3.1
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.1 (v4 - no config file)
- **UI Components**: Radix UI (Headless components)
- **Icons**: Lucide React
- **State**: React Hooks (useState, useEffect)

### Backend (Cần tích hợp)
- **Database**: Supabase PostgreSQL
- **Functions**: Supabase Edge Functions (Deno)
- **Realtime**: Supabase Realtime (WebSocket)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Scraper**: Python 3.11 + Playwright + Beautiful Soup
- **Orchestration**: GitHub Actions

### DevOps
- **CI/CD**: GitHub Actions
- **Hosting**: Vercel / Netlify (frontend)
- **Monitoring**: Supabase Dashboard

---

## 📚 Tài liệu

- [📘 INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Hướng dẫn tích hợp backend từng bước
- [🏗️ ARCHITECTURE.md](./ARCHITECTURE.md) - Kiến trúc hệ thống & data flow
- [🎨 reader-hub-ui-plan.md](./src/imports/pasted_text/reader-hub-ui-plan.md) - Design spec gốc

---

## 🐛 Troubleshooting

### Vite dev server không start
```bash
# Xóa node_modules và reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Tailwind classes không apply
- Đảm bảo file có import `@tailwind` directives
- Check console có warning không
- Restart dev server

### Import errors
```bash
# Clear cache
rm -rf node_modules/.vite
pnpm dev
```

---

## 🤝 Contributing

### Workflow
1. Fork repo
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Style
- Use TypeScript strict mode
- Follow React best practices
- Use Tailwind utility classes
- Add JSDoc comments for complex logic

---

## 📄 License

MIT License - Xem [LICENSE](./LICENSE) để biết thêm chi tiết

---

## 🙏 Credits

- **UI Design**: Inspired by Material Design & iOS Reading Apps
- **Icons**: [Lucide Icons](https://lucide.dev)
- **Fonts**: Playfair Display (Google Fonts)
- **Built with**: React, Tailwind CSS, Supabase

---

## 📞 Support

- 📧 Email: support@readerhub.app
- 💬 Discord: [Join Server](https://discord.gg/readerhub)
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)

---

**Developed by**: Claude Sonnet 4.5  
**Last Updated**: 2026-05-17  
**Version**: 1.0.0

---

## 🚀 Roadmap

### Phase 1: Core Features (Current)
- [x] UI/UX Design System
- [x] Frontend Screens (Home, Library, Reading, Profile)
- [x] Search & Scrape UI
- [ ] Backend Integration

### Phase 2: Backend (Next)
- [ ] Supabase Setup (Database + Functions)
- [ ] GitHub Actions Scraper
- [ ] Cloudflare R2 Storage
- [ ] Realtime Updates

### Phase 3: Advanced Features
- [ ] User Authentication
- [ ] Cloud Sync (reading progress)
- [ ] Offline Reading
- [ ] Push Notifications (new chapters)
- [ ] Multi-language Support
- [ ] Community Features (reviews, ratings)

### Phase 4: Mobile Native
- [ ] React Native conversion
- [ ] iOS App Store
- [ ] Android Play Store
- [ ] Deep linking

---

**Happy Reading! 📚✨**
