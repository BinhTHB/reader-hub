import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteLayout } from "@/components/site-layout";
import { formatViews, relativeTime } from "@/lib/stories-data";
import {
  useReadingHistory,
  useBookmarks,
  type ReadingHistoryItem,
  type BookmarkItem,
} from "@/lib/stories-db";
import {
  BookOpen,
  Bookmark,
  Clock,
  Settings,
  Bell,
  Heart,
  TrendingUp,
  ArrowUpRight,
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/ca-nhan")({
  head: () => ({
    meta: [
      { title: "Trang cá nhân — Reader Hub" },
      {
        name: "description",
        content: "Lịch sử đọc, truyện theo dõi và tuỳ chọn cá nhân của bạn trên Reader Hub.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Trang cá nhân — Reader Hub" },
      { property: "og:description", content: "Lịch sử đọc và truyện theo dõi." },
    ],
  }),
  component: ProfilePage,
});

type Tab = "lich-su" | "theo-doi";

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("lich-su");
  const { data: history = [] } = useReadingHistory(user?.id);
  const { data: follows = [] } = useBookmarks(user?.id);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const stats = useMemo(() => {
    const totalChapters = history.reduce((a, h) => a + h.chapter, 0);
    const finished = history.filter((h) => h.chapter >= h.story.chapters).length;
    return {
      reading: history.length,
      following: follows.length,
      unread: 0,
      totalChapters,
      finished,
    };
  }, [history, follows]);

  if (!user) return null;

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Reader";
  const handle = user.email?.split("@")[0] || "reader";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SiteLayout>
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Trang cá nhân
          </p>
          <div className="mt-6 grid gap-10 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <div className="flex items-center gap-5">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-foreground text-3xl font-[family-name:var(--font-display)] text-background md:h-24 md:w-24 md:text-4xl">
                  {initial}
                </div>
                <div>
                  <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] md:text-6xl">
                    {displayName}
                    {profile?.is_admin && (
                      <span className="ml-3 inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 align-middle text-[10px] font-semibold uppercase tracking-wider text-background">
                        <Shield className="h-3 w-3" /> Admin
                      </span>
                    )}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    @{handle} · {user.email}
                  </p>
                </div>
              </div>
            </div>
            <div className="md:col-span-4 md:justify-self-end">
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                  <Bell className="h-3.5 w-3.5" /> Thông báo
                </button>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                  <Settings className="h-3.5 w-3.5" /> Cài đặt
                </button>
              </div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
            <Stat label="Đang đọc" value={stats.reading} icon={<BookOpen className="h-4 w-4" />} />
            <Stat
              label="Đang theo dõi"
              value={stats.following}
              icon={<Bookmark className="h-4 w-4" />}
            />
            <Stat
              label="Chương chưa đọc"
              value={stats.unread}
              icon={<Bell className="h-4 w-4" />}
              accent
            />
            <Stat
              label="Truyện đã hoàn thành"
              value={stats.finished}
              icon={<Heart className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          <div className="sticky top-16 z-30 -mx-6 border-b border-border bg-background/85 px-6 backdrop-blur-xl md:-mx-10 md:px-10">
            <div className="flex items-center gap-8">
              <TabButton active={tab === "lich-su"} onClick={() => setTab("lich-su")}>
                <Clock className="h-3.5 w-3.5" /> Lịch sử đọc
                <span className="ml-1 text-[10px] text-muted-foreground">{history.length}</span>
              </TabButton>
              <TabButton active={tab === "theo-doi"} onClick={() => setTab("theo-doi")}>
                <Bookmark className="h-3.5 w-3.5" /> Theo dõi
                <span className="ml-1 text-[10px] text-muted-foreground">{follows.length}</span>
              </TabButton>
            </div>
          </div>

          <div className="py-12 md:py-16">
            {tab === "lich-su" ? <HistoryList items={history} /> : <FollowList items={follows} />}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`bg-background p-6 ${accent ? "md:row-span-1" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em]">{label}</span>
        {icon}
      </div>
      <p className="mt-4 font-[family-name:var(--font-display)] text-4xl md:text-5xl">
        {value}
        {accent && value > 0 && (
          <span className="ml-1 text-lg italic text-muted-foreground">mới</span>
        )}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 py-4 text-sm font-medium transition ${active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function HistoryList({ items }: { items: ReadingHistoryItem[] }) {
  if (items.length === 0) return <EmptyState label="Chưa có lịch sử đọc" cta="Khám phá truyện" />;
  return (
    <ul className="divide-y divide-border">
      {items.map((h) => (
        <li
          key={h.story.slug}
          className="group grid grid-cols-[80px_1fr_auto] items-center gap-6 py-6 md:grid-cols-[100px_1fr_auto]"
        >
          <Link to="/truyen/$slug" params={{ slug: h.story.slug }} className="block">
            <div className="aspect-[3/4] overflow-hidden rounded-md bg-secondary">
              <img
                src={h.story.cover}
                alt={h.story.title}
                loading="lazy"
                className="h-full w-full object-cover grayscale-[15%] transition group-hover:grayscale-0"
              />
            </div>
          </Link>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {h.story.genres[0]}
              </p>
              <p className="text-[10px] text-muted-foreground">{relativeTime(h.lastReadAt)}</p>
            </div>
            <Link to="/truyen/$slug" params={{ slug: h.story.slug }} className="mt-1 block">
              <h3 className="line-clamp-1 font-[family-name:var(--font-display)] text-2xl leading-tight transition group-hover:italic md:text-3xl">
                {h.story.title}
              </h3>
            </Link>
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              Chương {h.chapter} / {h.story.chapters}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-[3px] flex-1 max-w-xs rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((h.chapter / Math.max(1, h.story.chapters)) * 100))}%`,
                  }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {Math.min(100, Math.round((h.chapter / Math.max(1, h.story.chapters)) * 100))}%
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              to="/truyen/$slug_/chuong/$chapter"
              params={{ slug: h.story.slug, chapter: String(h.chapter) }}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/85"
            >
              Tiếp tục <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FollowList({ items }: { items: BookmarkItem[] }) {
  if (items.length === 0)
    return <EmptyState label="Chưa theo dõi truyện nào" cta="Tìm truyện hay" />;
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <article
          key={f.story.slug}
          className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-background transition hover:border-foreground"
        >
          <Link to="/truyen/$slug" params={{ slug: f.story.slug }} className="block">
            <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
              <img
                src={f.story.cover}
                alt={f.story.title}
                loading="lazy"
                className="h-full w-full object-cover grayscale-[10%] transition duration-700 group-hover:scale-[1.03] group-hover:grayscale-0"
              />
            </div>
          </Link>
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {f.story.genres[0]}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Theo dõi {relativeTime(f.createdAt)}
              </p>
            </div>
            <Link to="/truyen/$slug" params={{ slug: f.story.slug }}>
              <h3 className="mt-1 line-clamp-1 font-[family-name:var(--font-display)] text-2xl leading-tight transition group-hover:italic">
                {f.story.title}
              </h3>
            </Link>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {f.story.latestChapter}
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {formatViews(f.story.views)}
              </span>
              <span>·</span>
              <span>{f.story.chapters} chương</span>
              <span>·</span>
              <span>{f.story.status}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ label, cta }: { label: string; cta: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-24 text-center">
      <p className="font-[family-name:var(--font-display)] text-3xl italic text-muted-foreground">
        {label}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/85"
      >
        {cta} <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
