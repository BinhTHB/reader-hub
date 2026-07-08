import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Eye, Star, BookOpen } from "lucide-react";
import { SiteLayout } from "@/components/site-layout";
import { formatViews } from "@/lib/stories-data";
import { useStories } from "@/lib/stories-db";

export const Route = createFileRoute("/bang-xep-hang")({
  component: RankingPage,
  head: () => ({
    meta: [
      { title: "Bảng xếp hạng — Reader Hub" },
      { name: "description", content: "Top truyện được đọc nhiều nhất trên Reader Hub." },
    ],
  }),
});

function RankingPage() {
  const { data: stories = [], isLoading } = useStories();
  const ranked = [...stories].sort((a, b) => b.views - a.views);
  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
              Bảng xếp hạng
            </h1>
            <p className="text-sm text-muted-foreground">Top truyện được đọc nhiều nhất tuần này</p>
          </div>
        </div>

        {isLoading && <p className="mt-8 text-sm text-muted-foreground">Đang tải bảng xếp hạng…</p>}
        <div className="mt-8 space-y-3">
          {ranked.map((s, idx) => (
            <Link
              key={s.slug}
              to="/truyen/$slug"
              params={{ slug: s.slug }}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-lg hover:shadow-primary/10"
            >
              <div
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl font-[family-name:var(--font-brand)] text-2xl ${idx < 3 ? "bg-gradient-to-br from-primary to-accent text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              >
                {idx + 1}
              </div>
              <img
                src={s.cover}
                alt={s.title}
                className="h-20 w-14 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-1 font-[family-name:var(--font-display)] text-lg font-bold group-hover:text-primary">
                  {s.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {s.author} · {s.genres.join(", ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {formatViews(s.views)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {s.rating}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> {s.chapters} chương
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SiteLayout>
  );
}
