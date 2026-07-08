import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { SiteLayout, StoryCard } from "@/components/site-layout";
import { GENRES } from "@/lib/stories-data";
import { useStories } from "@/lib/stories-db";

export const Route = createFileRoute("/the-loai/$slug")({
  component: GenrePage,
  notFoundComponent: NotFound,
  errorComponent: ErrorC,
  head: ({ params }) => {
    const g = GENRES.find((x) => x.slug === params.slug);
    const name = g?.name ?? "Thể loại";
    return {
      meta: [
        { title: `${name} — Reader Hub` },
        { name: "description", content: `Truyện thể loại ${name} hay nhất trên Reader Hub.` },
      ],
    };
  },
});

function GenrePage() {
  const { slug } = Route.useParams();
  const g = GENRES.find((x) => x.slug === slug);
  const { data: stories = [], isLoading } = useStories();
  const list = stories.filter((s) => g && s.genres.includes(g.name));

  if (!g) return <NotFound />;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-4xl">
            {g.icon}
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">{g.name}</h1>
            <p className="text-sm text-muted-foreground">{list.length} truyện</p>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-12 text-center text-muted-foreground">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="mt-12 text-center text-muted-foreground">
            Chưa có truyện nào trong thể loại này.
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {list.map((s) => (
              <StoryCard key={s.slug} {...s} />
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function NotFound() {
  const { slug } = Route.useParams();
  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">
          Không tìm thấy thể loại
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Thể loại "{slug}" không tồn tại.</p>
        <Link
          to="/the-loai"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Về danh sách thể loại
        </Link>
      </div>
    </SiteLayout>
  );
}

function ErrorC({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Có lỗi xảy ra</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Thử lại
        </button>
      </div>
    </SiteLayout>
  );
}
