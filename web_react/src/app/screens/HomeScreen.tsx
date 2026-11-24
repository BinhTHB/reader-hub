import { useState, useEffect, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  ShieldCheck,
  Plus,
  BookOpen,
  Star,
} from "lucide-react";
import { EditStoryModal } from "../components/EditStoryModal";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";
import { deleteContent, type AdminStory } from "../../lib/admin";

interface HomeScreenProps {
  onNavigate: (screen: string, data?: any) => void;
  isAdmin?: boolean;
}

type SortBy = "updated" | "chapters" | "views" | "title";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ongoing: { label: "Đang ra", cls: "bg-blue-500/15 text-blue-500" },
  completed: { label: "Hoàn thành", cls: "bg-emerald-500/15 text-emerald-500" },
  paused: { label: "Tạm dừng", cls: "bg-amber-500/15 text-amber-500" },
};

export function HomeScreen({ onNavigate, isAdmin = false }: HomeScreenProps) {
  const [allStories, setAllStories] = useState<AdminStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ongoing" | "completed" | "paused"
  >("all");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [modalStory, setModalStory] = useState<AdminStory | "create" | null>(null);
  const [deletingStory, setDeletingStory] = useState<AdminStory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void loadStories();
  }, []);

  const loadStories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, slug, title, author, description, cover_url, source_url, genres, status, total_chapters, view_count, is_featured, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setAllStories((data || []) as AdminStory[]);
    } catch (err: any) {
      console.error("Failed to load stories:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    let ongoing = 0;
    let completed = 0;
    let featured = 0;
    for (const s of allStories) {
      if (s.status === "ongoing") ongoing++;
      else if (s.status === "completed") completed++;
      if (s.is_featured) featured++;
    }
    return { total: allStories.length, ongoing, completed, featured };
  }, [allStories]);

  const stories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allStories.filter((story) => {
      if (statusFilter !== "all" && story.status !== statusFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        (story.author || "").toLowerCase().includes(q) ||
        (story.slug || "").toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "chapters") {
        return (b.total_chapters || 0) - (a.total_chapters || 0);
      }
      if (sortBy === "views") {
        return (b.view_count || 0) - (a.view_count || 0);
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title, "vi");
      }
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }, [allStories, searchQuery, statusFilter, sortBy]);

  const handleConfirmDelete = async () => {
    if (!deletingStory || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteContent("story", deletingStory.id);
      setAllStories((prev) => prev.filter((s) => s.id !== deletingStory.id));
      setDeletingStory(null);
    } catch (err: any) {
      setError(err?.message || "Không thể xoá truyện.");
      setDeletingStory(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const getCoverUrl = (coverUrl: string | null) => {
    if (!coverUrl)
      return "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&h=300&fit=crop";
    if (coverUrl.startsWith("http")) return coverUrl;
    return `https://${R2_PUBLIC_DOMAIN}/${coverUrl}`;
  };

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary px-4 pt-10 pb-8 text-white">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-xl font-medium">Quản lý truyện</h1>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => setModalStory("create")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-primary text-xs font-medium shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm
                </button>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Admin
                </span>
              </>
            ) : (
              <button
                onClick={() => onNavigate("profile")}
                className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-medium"
              >
                Đăng nhập Admin
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-white/80">
          {isAdmin
            ? "Thêm, sửa thông tin, quản lý chương và xoá truyện"
            : "Bạn cần đăng nhập tài khoản Admin để thực hiện thao tác quản trị"}
        </p>
      </div>

      <div className="px-4 space-y-4 -mt-5">
        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Tổng", value: stats.total },
            { label: "Đang ra", value: stats.ongoing },
            { label: "Hoàn thành", value: stats.completed },
            { label: "Nổi bật", value: stats.featured },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-card rounded-xl p-2.5 border border-border text-center shadow-sm"
            >
              <div className="text-base font-semibold">{item.value}</div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Search, Filter & Sort */}
        <div className="bg-card rounded-2xl p-3.5 shadow-sm border border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm theo tên, tác giả, slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-input-background rounded-xl border border-border/50 focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {([
                { id: "all", label: "Tất cả" },
                { id: "ongoing", label: "Đang ra" },
                { id: "completed", label: "Hoàn thành" },
                { id: "paused", label: "Tạm dừng" },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === tab.id
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="text-xs px-2 py-1 rounded-lg border border-border bg-background shrink-0"
            >
              <option value="updated">Mới cập nhật</option>
              <option value="chapters">Nhiều chương</option>
              <option value="views">Lượt xem</option>
              <option value="title">Tên A-Z</option>
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="w-7 h-7 text-primary animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-red-500 text-sm mb-3">Lỗi: {error}</p>
            <button
              onClick={loadStories}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm"
            >
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !error && stories.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {searchQuery || statusFilter !== "all"
              ? "Không tìm thấy truyện phù hợp"
              : "Chưa có truyện nào trong hệ thống"}
          </div>
        )}

        {!isLoading && !error && stories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-medium text-muted-foreground">
                Hiển thị {stories.length} truyện
              </h2>
              <button
                onClick={loadStories}
                className="text-xs text-primary flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Làm mới
              </button>
            </div>

            <div className="space-y-2.5">
              {stories.map((story) => {
                const st = STATUS_LABELS[story.status] || {
                  label: story.status,
                  cls: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={story.id}
                    className="bg-card rounded-xl border border-border p-3 flex gap-3 items-start"
                  >
                    <img
                      src={getCoverUrl(story.cover_url)}
                      alt={story.title}
                      loading="lazy"
                      onClick={() => onNavigate("detail", story)}
                      className="w-14 h-20 rounded-lg object-cover shrink-0 bg-muted cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        onClick={() => onNavigate("detail", story)}
                        className="font-medium text-sm line-clamp-1 cursor-pointer hover:text-primary"
                      >
                        {story.title}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {story.author || "Chưa rõ tác giả"}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {story.total_chapters || 0} chương
                        </span>
                        {story.is_featured && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-medium">
                            <Star className="w-2.5 h-2.5 fill-current" /> Nổi bật
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2.5">
                        <button
                          type="button"
                          onClick={() => onNavigate("detail", story)}
                          className="px-2.5 py-1 rounded-lg bg-muted text-xs font-medium inline-flex items-center gap-1 hover:bg-muted/80"
                        >
                          <BookOpen className="w-3.5 h-3.5" /> Chương
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => setModalStory(story)}
                              className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium inline-flex items-center gap-1 hover:bg-muted"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingStory(story)}
                              className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-medium inline-flex items-center gap-1 hover:bg-red-500/20 ml-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Xoá
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {modalStory !== null && (
        <EditStoryModal
          story={modalStory === "create" ? null : modalStory}
          onClose={() => setModalStory(null)}
          onSaved={(saved) => {
            setAllStories((prev) => {
              const exists = prev.some((item) => item.id === saved.id);
              return exists
                ? prev.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...prev];
            });
            setModalStory(null);
          }}
        />
      )}

      {deletingStory && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeletingStory(null)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-3xl p-6 shadow-xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-2">Xác nhận xoá truyện</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Bạn có chắc chắn muốn xoá "{deletingStory.title}"? Toàn bộ chương và dữ liệu R2 sẽ bị xoá vĩnh viễn.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingStory(null)}
                className="flex-1 py-2.5 bg-muted text-foreground rounded-xl font-medium"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? "Đang xoá..." : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
