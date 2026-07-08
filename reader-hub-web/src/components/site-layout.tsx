import { Link } from "@tanstack/react-router";
import { Search, Menu, X, ArrowUpRight, LogOut, Shield } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GENRES } from "@/lib/stories-data";
import { useAuth } from "@/hooks/use-auth";

export function SiteLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const initial = (profile?.display_name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground font-[family-name:var(--font-sans)] antialiased selection:bg-foreground selection:text-background">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-6 md:px-10">
          <Link to="/" className="flex items-baseline gap-0.5">
            <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none tracking-tight">
              Reader Hub
            </span>
            <span className="font-[family-name:var(--font-brand)] text-[28px] leading-none italic text-muted-foreground">
              /
            </span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground [&.active]:text-foreground"
            >
              Trang chủ
            </Link>
            <Link
              to="/bang-xep-hang"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground [&.active]:text-foreground"
            >
              Bảng xếp hạng
            </Link>
            <Link
              to="/the-loai"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground [&.active]:text-foreground"
            >
              Thể loại
            </Link>
            <Link
              to="/ca-nhan"
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground [&.active]:text-foreground"
            >
              Cá nhân
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Tìm truyện, tác giả…"
                className="h-9 w-64 rounded-md border border-border bg-transparent pl-8 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground"
              />
            </div>
            {user ? (
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  to="/ca-nhan"
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm transition hover:bg-secondary"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-[11px] font-medium text-background">
                    {initial}
                  </span>
                  <span className="max-w-[120px] truncate text-xs font-medium">
                    {profile?.display_name || user.email}
                  </span>
                  {profile?.is_admin && (
                    <span
                      title="Admin"
                      className="inline-flex items-center rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    >
                      <Shield className="mr-0.5 h-2.5 w-2.5" /> Admin
                    </span>
                  )}
                </Link>
                <button
                  onClick={() => signOut()}
                  className="grid h-9 w-9 place-items-center rounded-md border border-border transition hover:bg-secondary"
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="hidden h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-sm font-medium text-background transition hover:bg-foreground/85 md:inline-flex"
              >
                Đăng nhập
              </Link>
            )}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border md:hidden"
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-border md:hidden">
            <nav className="mx-auto flex max-w-[1400px] flex-col p-4">
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Trang chủ
              </Link>
              <Link
                to="/bang-xep-hang"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Bảng xếp hạng
              </Link>
              <Link
                to="/the-loai"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Thể loại
              </Link>
              <Link
                to="/ca-nhan"
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
              >
                Cá nhân
              </Link>
              {user ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="mt-1 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-secondary"
                >
                  Đăng xuất
                </button>
              ) : (
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
                >
                  Đăng nhập
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-32 border-t border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] md:text-6xl">
                Đọc mọi lúc. <span className="italic text-muted-foreground">Mọi nơi.</span>
              </p>
              <p className="mt-6 max-w-md text-sm text-muted-foreground">
                Reader Hub — thư viện truyện online biên tập theo phong cách tạp chí. Chọn lọc, tinh
                gọn, tôn trọng người đọc.
              </p>
              <form className="mt-8 flex max-w-sm items-center gap-2 border-b border-foreground pb-2">
                <input
                  placeholder="email@cua-ban.com"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button className="inline-flex items-center gap-1 text-sm font-medium">
                  Đăng ký <ArrowUpRight className="h-4 w-4" />
                </button>
              </form>
            </div>
            <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Khám phá
                </p>
                <ul className="mt-5 space-y-3 text-sm">
                  <li>
                    <Link to="/" className="hover:text-muted-foreground">
                      Trang chủ
                    </Link>
                  </li>
                  <li>
                    <Link to="/bang-xep-hang" className="hover:text-muted-foreground">
                      Bảng xếp hạng
                    </Link>
                  </li>
                  <li>
                    <Link to="/the-loai" className="hover:text-muted-foreground">
                      Thể loại
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Thể loại
                </p>
                <ul className="mt-5 space-y-3 text-sm">
                  {GENRES.slice(0, 5).map((g) => (
                    <li key={g.slug}>
                      <Link
                        to="/the-loai/$slug"
                        params={{ slug: g.slug }}
                        className="hover:text-muted-foreground"
                      >
                        {g.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Kết nối
                </p>
                <ul className="mt-5 space-y-3 text-sm">
                  <li>
                    <a className="hover:text-muted-foreground" href="#">
                      Twitter / X
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-muted-foreground" href="#">
                      Instagram
                    </a>
                  </li>
                  <li>
                    <a className="hover:text-muted-foreground" href="#">
                      Facebook
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground md:flex-row md:items-center">
            <p>© 2026 Reader Hub. Bản quyền được bảo lưu.</p>
            <p className="font-[family-name:var(--font-display)] italic">
              Được xây dựng bởi Reader Hub.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function StoryCard({
  slug,
  title,
  cover,
  latestChapter,
  genres,
  updatedAt,
}: {
  slug: string;
  title: string;
  cover: string;
  latestChapter: string;
  genres: string[];
  updatedAt: string;
}) {
  return (
    <Link to="/truyen/$slug" params={{ slug }} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-secondary">
        <img
          src={cover}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover grayscale-[15%] transition duration-700 group-hover:scale-[1.03] group-hover:grayscale-0"
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {genres[0]}
        </p>
        <p className="text-[10px] text-muted-foreground">{updatedAt}</p>
      </div>
      <h3 className="mt-1 line-clamp-2 font-[family-name:var(--font-display)] text-xl leading-tight transition group-hover:italic">
        {title}
      </h3>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{latestChapter}</p>
    </Link>
  );
}
