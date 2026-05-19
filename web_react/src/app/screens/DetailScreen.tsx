import { useState, useEffect } from "react";
import {
  ChevronLeft,
  Heart,
  Share2,
  Download,
  Star,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";

interface DetailScreenProps {
  book?: any;
  onBack: () => void;
  onStartReading: (chapter: any) => void;
  user?: any;
}

interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  text_r2_url: string;
  created_at: string;
}

export function DetailScreen({ book, onBack, onStartReading, user }: DetailScreenProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [story, setStory] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastReadChapterId, setLastReadChapterId] = useState<number | null>(null);

  const handleUpdateChapters = async () => {
    if (!bookData.source_url) return;
    setIsUpdating(true);
    setUpdateMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-scraper', {
        body: {
          story_id: bookData.id,
          source_url: bookData.source_url,
          chapter_start: 0,
          chapter_limit: 0
        }
      });

      if (error) throw error;
      setUpdateMessage("Đã gửi yêu cầu cập nhật thành công!");
    } catch (err: any) {
      console.error('Failed to trigger update:', err);
      setUpdateMessage(`Lỗi: ${err.message || 'Không thể gửi yêu cầu cập nhật'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (book?.id) {
      loadStoryDetails();
      loadChapters();
      checkIfFavorite();
    }
  }, [book?.id, user]);

  useEffect(() => {
    if (book?.id && chapters.length > 0) {
      loadLastReadChapter();
    }
  }, [book?.id, chapters, user]);

  const loadLastReadChapter = async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('reading_history')
          .select('last_chapter_number')
          .eq('user_id', user.id)
          .eq('story_id', book.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const ch = chapters.find(c => c.chapter_number === data.last_chapter_number);
          if (ch) setLastReadChapterId(ch.id);
        }
      } catch (err) {
        console.error('Failed to load last read chapter from DB:', err);
      }
    }
  };

  const getLastReadChapter = () => {
    if (user && lastReadChapterId) {
      return chapters.find(ch => ch.id === lastReadChapterId) || null;
    }

    const saved = localStorage.getItem('reading_history');
    if (!saved) return null;

    const history = JSON.parse(saved);
    const lastRead = history.find((h: any) => h.story_id === book?.id);

    if (lastRead) {
      return chapters.find(ch => ch.id === lastRead.chapter_id) || null;
    }
    return null;
  };

  const checkIfFavorite = async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('bookmarks')
          .select('id')
          .eq('user_id', user.id)
          .eq('story_id', book.id)
          .maybeSingle();

        if (error) throw error;
        setIsFavorite(!!data);
      } catch (err) {
        console.error('Failed to check database bookmark:', err);
      }
    } else {
      const saved = localStorage.getItem('bookmarks');
      if (saved) {
        const bookmarkIds = JSON.parse(saved);
        setIsFavorite(bookmarkIds.includes(book.id));
      }
    }
  };

  const toggleFavorite = async () => {
    if (user) {
      try {
        if (isFavorite) {
          const { error } = await supabase
            .from('bookmarks')
            .delete()
            .eq('user_id', user.id)
            .eq('story_id', book.id);
          if (error) throw error;
          setIsFavorite(false);
        } else {
          const { error } = await supabase
            .from('bookmarks')
            .insert({
              user_id: user.id,
              story_id: book.id,
            });
          if (error) throw error;
          setIsFavorite(true);
        }
      } catch (err) {
        console.error('Failed to toggle database bookmark:', err);
      }
    } else {
      const saved = localStorage.getItem('bookmarks');
      const bookmarkIds = saved ? JSON.parse(saved) : [];

      if (bookmarkIds.includes(book.id)) {
        // Remove bookmark
        const newBookmarks = bookmarkIds.filter((id: number) => id !== book.id);
        localStorage.setItem('bookmarks', JSON.stringify(newBookmarks));
        setIsFavorite(false);
      } else {
        // Add bookmark
        bookmarkIds.push(book.id);
        localStorage.setItem('bookmarks', JSON.stringify(bookmarkIds));
        setIsFavorite(true);
      }
    }
  };

  const loadStoryDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', book.id)
        .single();

      if (error) throw error;
      setStory(data);
    } catch (err) {
      console.error('Failed to load story details:', err);
    }
  };

  const loadChapters = async () => {
    setIsLoadingChapters(true);
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('story_id', book.id)
        .order('chapter_number', { ascending: true });

      if (error) throw error;
      setChapters(data || []);
    } catch (err) {
      console.error('Failed to load chapters:', err);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const getCoverUrl = (coverUrl: string | null) => {
    if (!coverUrl) return "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&h=600&fit=crop";
    if (coverUrl.startsWith('http')) return coverUrl;
    return `https://${R2_PUBLIC_DOMAIN}/${coverUrl}`;
  };

  const bookData = story || book || {
    cover_url: null,
    title: "Đang tải...",
    author: "Đang tải...",
    description: "",
    total_chapters: 0,
    genres: [],
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 px-4 py-3 flex items-center justify-between border-b border-border/50">
        <button
          onClick={onBack}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFavorite}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <Heart
              className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : ""
                }`}
            />
          </button>
          <button className="p-2 hover:bg-muted rounded-full transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cover & Meta */}
      <div className="px-4 pt-6">
        <div className="flex gap-4 mb-6">
          <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden shadow-lg flex-shrink-0">
            <img
              src={getCoverUrl(bookData.cover_url)}
              alt={bookData.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-xl font-medium mb-2">{bookData.title}</h1>
            <p className="text-sm text-muted-foreground mb-2">
              {bookData.author || 'Đang cập nhật'}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-muted-foreground">
                {bookData.total_chapters || chapters.length} chương
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground capitalize">
                {bookData.status || 'ongoing'}
              </span>
            </div>
            {bookData.genres && bookData.genres.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {bookData.genres.slice(0, 2).map((genre: string, idx: number) => (
                  <span key={idx} className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-full">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => {
              if (chapters.length > 0) {
                const lastRead = getLastReadChapter();
                onStartReading(lastRead || chapters[0]);
              }
            }}
            disabled={chapters.length === 0}
            className="flex-1 py-3 bg-primary text-white rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <BookOpen className="w-5 h-5" />
            {chapters.length > 0 ? 'Bắt đầu đọc' : 'Chưa có chương'}
          </button>

          {chapters.length > 0 && bookData.source_url && (
            <button
              onClick={handleUpdateChapters}
              disabled={isUpdating}
              className="px-5 py-3 border border-primary text-primary bg-transparent rounded-full font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Đang gửi...' : 'Cập nhật'}
            </button>
          )}
        </div>

        {/* Feedback Banner */}
        {updateMessage && (
          <div className={`mb-6 p-3 rounded-xl border text-sm ${updateMessage.startsWith('Lỗi') ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>
            {updateMessage}
          </div>
        )}

        {/* Description */}
        {bookData.description && (
          <section className="mb-6">
            <h2 className="text-lg font-medium mb-3">Mô tả</h2>
            <div className="bg-card rounded-xl p-4 border border-border/50">
              <p
                className={`text-sm text-muted-foreground leading-relaxed ${!showFullDescription ? "line-clamp-3" : ""
                  }`}
              >
                {bookData.description}
              </p>
              {bookData.description.length > 150 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-sm text-primary font-medium mt-2"
                >
                  {showFullDescription ? "Thu gọn" : "Xem thêm"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Chapter List */}
        <section className="mb-6">
          <button
            onClick={() => setExpandedChapters(!expandedChapters)}
            className="w-full flex items-center justify-between mb-3"
          >
            <h2 className="text-lg font-medium">
              Danh sách chương ({chapters.length})
            </h2>
            <div className="flex items-center gap-2">
              {isLoadingChapters && <RefreshCw className="w-4 h-4 animate-spin text-primary" />}
              {expandedChapters ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </button>
          {expandedChapters && (
            <>
              {isLoadingChapters ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : chapters.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chưa có chương nào
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {chapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      onClick={() => onStartReading(chapter)}
                      className="flex items-center justify-between p-3 bg-card rounded-lg border border-border/50 hover:border-primary/50 cursor-pointer transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="text-sm font-medium">
                          Chương {chapter.chapter_number}: {chapter.title || `Chương ${chapter.chapter_number}`}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {new Date(chapter.created_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <BookOpen className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
