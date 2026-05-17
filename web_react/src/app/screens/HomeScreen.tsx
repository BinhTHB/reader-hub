import { useState, useEffect } from "react";
import { Search, ChevronRight, RefreshCw } from "lucide-react";
import { BookCard } from "../components/BookCard";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";

interface HomeScreenProps {
  onNavigate: (screen: string, data?: any) => void;
}

interface Story {
  id: number;
  title: string;
  author: string;
  cover_url: string;
  total_chapters: number;
  genres: string[];
  status: string;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setStories(data || []);
      setAllStories(data || []);
    } catch (err: any) {
      console.error('Failed to load stories:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setStories(allStories);
      return;
    }

    const filtered = allStories.filter(story => 
      story.title.toLowerCase().includes(query.toLowerCase()) ||
      story.author?.toLowerCase().includes(query.toLowerCase())
    );
    setStories(filtered);
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
        <h1 className="text-2xl font-medium mb-2">Reader Hub</h1>
        <p className="text-sm text-white/80">
          Khám phá thế giới truyện chữ
        </p>
      </div>

      <div className="px-4 space-y-6 -mt-6">
        {/* Search Bar */}
        <div className="bg-card rounded-2xl p-4 shadow-lg border border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm kiếm truyện..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-input-background rounded-xl border border-border/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
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
                <BookCard
                  key={story.id}
                  id={story.id}
                  cover={getCoverUrl(story.cover_url)}
                  title={story.title}
                  author={story.author || 'Đang cập nhật'}
                  genre={story.genres?.[0] || 'Chưa phân loại'}
                  onClick={() => onNavigate("detail", story)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
