# 🚀 Quick Start - Chạy React App

## Prerequisites
- Node.js 18+ 
- pnpm (package manager)

## Cài đặt lần đầu

```bash
cd E:/projects/reader-hub/web_react
pnpm install
```

## Chạy Development Server

```bash
cd E:/projects/reader-hub/web_react
pnpm dev
```

App sẽ chạy tại: `http://localhost:5173`

## Build Production

```bash
pnpm build
```

Output: `dist/` folder

## Build APK Debug

```bash
cd E:/projects/reader-hub/web_react
pnpm build
npx cap sync android
cd android
./gradlew assembleDebug
```

APK output:

```text
E:/projects/reader-hub/web_react/android/app/build/outputs/apk/debug/app-debug.apk
```

## Tech Stack
- React 18.3.1
- Vite 6.3.5
- Tailwind CSS 4.1
- TypeScript 5.x
- Radix UI components
- Supabase backend

## Scripts có sẵn

| Command | Mô tả |
|---------|-------|
| `pnpm dev` | Chạy dev server với hot reload |
| `pnpm build` | Build production bundle |
| `pnpm preview` | Preview production build locally |

## Cấu trúc thư mục chính

```
web_react/
├── src/
│   ├── app/           # Screens & Components
│   ├── styles/        # CSS & Theme
│   └── lib/           # Utilities & Config
├── public/            # Static assets
└── package.json       # Dependencies
```

## Lưu ý
- Project dùng **pnpm**, không phải npm hay yarn
- Vite dev server auto-reload khi save file
- Port mặc định: 5173 (có thể thay đổi nếu port busy)
