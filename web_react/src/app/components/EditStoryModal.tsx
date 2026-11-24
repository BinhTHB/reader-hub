import { useState, type FormEvent } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  createStory,
  slugifyTitle,
  updateStory,
  type AdminStory,
  type StoryStatus,
} from "../../lib/admin";

interface EditStoryModalProps {
  story?: (Partial<AdminStory> & { id: number; title: string }) | null;
  onClose: () => void;
  onSaved: (saved: AdminStory) => void;
}

export function EditStoryModal({ story, onClose, onSaved }: EditStoryModalProps) {
  const isCreate = !story?.id;
  const [title, setTitle] = useState(story?.title || "");
  const [slug, setSlug] = useState(story?.slug || "");
  const [author, setAuthor] = useState(story?.author || "");
  const [status, setStatus] = useState<StoryStatus>(
    (story?.status as StoryStatus) || "ongoing",
  );
  const [genresText, setGenresText] = useState((story?.genres || []).join(", "));
  const [coverUrl, setCoverUrl] = useState(story?.cover_url || "");
  const [sourceUrl, setSourceUrl] = useState(story?.source_url || "");
  const [description, setDescription] = useState(story?.description || "");
  const [isFeatured, setIsFeatured] = useState(Boolean(story?.is_featured));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Tiêu đề truyện không được để trống.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const genres = genresText
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const payload = {
        title: trimmedTitle,
        author: author.trim() || null,
        status,
        genres,
        cover_url: coverUrl.trim() || null,
        source_url: sourceUrl.trim() || null,
        description: description.trim() || null,
        is_featured: isFeatured,
      };

      const saved = isCreate
        ? await createStory({
            ...payload,
            slug: slug.trim() || slugifyTitle(trimmedTitle),
          })
        : await updateStory(story!.id, payload);

      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || "Không thể lưu thay đổi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">
            {isCreate ? "Thêm truyện mới" : "Chỉnh sửa truyện"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tiêu đề *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (isCreate && !slug) {
                  // Preview generated via placeholder; keep manual override clean
                }
              }}
              required
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          {isCreate && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Slug (tự tạo từ tiêu đề nếu để trống)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugifyTitle(title) || "ten-truyen-khong-dau"}
                className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Tác giả
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StoryStatus)}
                className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
              >
                <option value="ongoing">Đang ra (ongoing)</option>
                <option value="completed">Hoàn thành (completed)</option>
                <option value="paused">Tạm dừng (paused)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Thể loại (phân cách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={genresText}
              onChange={(e) => setGenresText(e.target.value)}
              placeholder="Huyền Huyễn, Tiên Hiệp"
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              URL ảnh bìa
            </label>
            <input
              type="text"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              URL nguồn cào
            </label>
            <input
              type="text"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Mô tả
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 bg-background rounded-xl border border-border focus:border-primary focus:outline-none text-sm resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 accent-primary rounded"
            />
            <span className="text-sm">Đánh dấu nổi bật (Featured)</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSaving ? "Đang lưu..." : isCreate ? "Tạo truyện" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
