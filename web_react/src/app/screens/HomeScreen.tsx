import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { BookCard } from "../components/BookCard";
import { EditStoryModal } from "../components/EditStoryModal";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";
import { deleteContent, type AdminStory } from "../../lib/admin";

interface HomeScreenProps {
  onNavigate: (screen: string, data?: any) => void;
  isAdmin?: boolean;
}

type Story = AdminStory;

export function HomeScreen({ onNavigate, isAdmin = false }: HomeScreenProps) {
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ongoing" | "completed" | "paused">("all");
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [deletingStory, setDeletingStory] = useState<Story | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('stories')
        .select('id, title, author, description, cover_url, source_url, genres, status, total_chapters, is_featured')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setAllStories((data || []) as Story[]);
    } catch (err: any) {
      console.error('Failed to load stories:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const stories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allStories.filter((story) => {
      if (statusFilter !== "all" && story.status !== statusFilter) return false;
      if (!q) return true;
      return (
        story.title.toLowerCase().includes(q) ||
        (story.author || "").toLowerCase().includes(q)
      );
    });
  }, [allStories, searchQuery, statusFilter]);

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
    if (!coverUrl) return "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&h=600&fit=crop";
    if (coverUrl.startsWith('http')) return coverUrl;
    return `https://${R2_PUBLIC_DOMAIN}/${coverUrl}`;
  };

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary px-4 pt-12 pb-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-medium">Reader Hub Admin</h1>
          {isAdmin ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </span>
          ) : (
            <button
              onClick={() => onNavigate("profile")}
              className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-medium"
            >
              Chưa đăng nhập Admin
            </button>
          )}
        </div>
        <p className="text-sm text-white/80">
          {isAdmin ? "Quản lý, chỉnh sửa và xoá truyện" : "Đăng nhập tài khoản Admin để sửa/xoá truyện"}
        </p>
      </div>

      <div className="px-4 space-y-6 -mt-6">
        {/* Search & Status Filter */}
        <div className="bg-card rounded-2xl p-4 shadow-lg border border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm truyện..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-input-background rounded-xl border border-border/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {([
              { id: "all", label: "Tất cả" },
              { id: "ongoing", label: "Đang ra" },
              { id: "completed", label: "Hoàn thành" },
              { id: "paused", label: "Tạm dừng" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 mb-3">Lỗi: {error}</p>
            <button
              onClick={loadStories}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && stories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery ? 'Không tìm thấy truyện phù hợp' : 'Chưa có truyện nào'}
            </p>
          </div>
        )}

        {/* Stories Grid */}
        {!isLoading && !error && stories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Tất cả truyện ({stories.length})</h2>
              <button
                onClick={loadStories}
                className="text-sm text-primary flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                Làm mới
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {stories.map((story) => (
                <div key={story.id} className="relative flex flex-col">
                  <BookCard
                    id={story.id}
                    cover={getCoverUrl(story.cover_url)}
                    title={story.title}
                    author={story.author || 'Đang cập nhật'}
                    genre={story.genres?.[0] || 'Chưa phân loại'}
                    onClick={() => onNavigate("detail", story)}
                  />
                  {isAdmin && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingStory(story)}
                        className="flex-1 py-1.5 rounded-lg border border-border bg-card text-xs font-medium flex items-center justify-center gap-1 hover:bg-muted"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingStory(story)}
                        className="py-1.5 px-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-medium flex items-center justify-center hover:bg-red-500/20"
                        title="Xoá truyện"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {editingStory && (
        <EditStoryModal
          story={editingStory}
          onClose={() => setEditingStory(null)}
          onSaved={(updated) => {
            setAllStories((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
            setEditingStory(null);
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
