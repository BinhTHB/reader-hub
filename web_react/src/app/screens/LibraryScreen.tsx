import { useState, useEffect } from "react";
import { Download, Heart, Clock, FolderOpen, RefreshCw } from "lucide-react";
import { BookCard } from "../components/BookCard";
import { EmptyState } from "../components/EmptyState";
import { supabase, R2_PUBLIC_DOMAIN } from "../../lib/supabase";

interface LibraryScreenProps {
  onNavigate: (screen: string, data?: any) => void;
  user?: any;
}

export function LibraryScreen({ onNavigate, user }: LibraryScreenProps) {
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [readingHistory, setReadingHistory] = useState<any[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    loadBookmarks();
    loadReadingHistory();
  }, [user]);

  const loadBookmarks = async () => {
    setIsLoadingBookmarks(true);
    try {
      if (user) {
        const { data, error } = await supabase
          .from('bookmarks')
          .select('story_id, stories(*)')
          .eq('user_id', user.id);

        if (error) throw error;
        const stories = data?.map((b: any) => b.stories).filter(Boolean) || [];
        setBookmarks(stories);
      } else {
        const saved = localStorage.getItem('bookmarks');
        if (saved) {
          const bookmarkIds = JSON.parse(saved);
          
          if (bookmarkIds.length > 0) {
            const { data, error } = await supabase
              .from('stories')
              .select('*')
              .in('id', bookmarkIds)
              .order('updated_at', { ascending: false });

            if (error) throw error;
            setBookmarks(data || []);
          } else {
            setBookmarks([]);
          }
        } else {
          setBookmarks([]);
        }
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setIsLoadingBookmarks(false);
    }
  };

  const loadReadingHistory = async () => {
    setIsLoadingHistory(true);
    try {
      if (user) {
        const { data, error } = await supabase
          .from('reading_history')
          .select('story_id, last_chapter_number, last_read_at, stories(*)')
          .eq('user_id', user.id)
          .order('last_read_at', { ascending: false });

        if (error) throw error;
        
        const historyWithStories = data?.map((h: any) => {
          const story = h.stories;
          if (!story) return null;
          return {
            ...story,
            last_read: h.last_read_at,
            chapter_number: h.last_chapter_number,
          };
        }).filter(Boolean) || [];
        
        setReadingHistory(historyWithStories);
      } else {
        const saved = localStorage.getItem('reading_history');
        if (saved) {
          const history = JSON.parse(saved);
          const storyIds = [...new Set(history.map((h: any) => h.story_id))];
          
          if (storyIds.length > 0) {
            const { data, error } = await supabase
              .from('stories')
              .select('*')
              .in('id', storyIds);

            if (error) throw error;
            
            const historyWithStories = history
              .map((historyItem: any) => {
                const story = data?.find(s => s.id === historyItem.story_id);
                if (!story) return null;
                
                return {
                  ...story,
                  last_read: historyItem.last_read,
                  chapter_number: historyItem.chapter_number,
                  chapter_id: historyItem.chapter_id,
                };
              })
              .filter((item: any) => item !== null)
              .sort((a: any, b: any) => new Date(b.last_read).getTime() - new Date(a.last_read).getTime());
            
            setReadingHistory(historyWithStories);
          } else {
            setReadingHistory([]);
          }
        } else {
          setReadingHistory([]);
        }
      }
    } catch (err) {
      console.error('Failed to load reading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleHistoryClick = async (historyItem: any) => {
    try {
      let data = null;
      let error = null;
      
      if (historyItem.chapter_id) {
        const res = await supabase
          .from('chapters')
          .select('*')
          .eq('id', historyItem.chapter_id)
          .single();
        data = res.data;
        error = res.error;
      } else {
        const res = await supabase
          .from('chapters')
          .select('*')
          .eq('story_id', historyItem.id)
          .eq('chapter_number', historyItem.chapter_number)
          .single();
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      
      if (data) {
        onNavigate("reading", data);
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
      onNavigate("detail", historyItem);
    }
  };

  const toggleBookmark = (storyId: number) => {
    const saved = localStorage.getItem('bookmarks');
    const bookmarkIds = saved ? JSON.parse(saved) : [];
    
    if (bookmarkIds.includes(storyId)) {
      // Remove bookmark
      const newBookmarks = bookmarkIds.filter((id: number) => id !== storyId);
      localStorage.setItem('bookmarks', JSON.stringify(newBookmarks));
    } else {
      // Add bookmark
      bookmarkIds.push(storyId);
      localStorage.setItem('bookmarks', JSON.stringify(bookmarkIds));
    }
    
    loadBookmarks();
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
        <h1 className="text-2xl font-medium mb-2">Thư viện</h1>
        <p className="text-sm text-white/80">
          Quản lý truyện yêu thích của bạn
        </p>
      </div>

      <div className="px-4 space-y-6 mt-6">
        {/* Bookmarks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Yêu thích ({bookmarks.length})
            </h2>
            <button 
              onClick={loadBookmarks} 
              className="text-sm text-primary flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingBookmarks ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          {isLoadingBookmarks ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : bookmarks.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Chưa có truyện yêu thích"
              description="Thêm truyện vào yêu thích để dễ dàng truy cập"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {bookmarks.map((story) => (
                <BookCard
                  key={story.id}
                  id={story.id}
                  cover={getCoverUrl(story.cover_url)}
                  title={story.title}
                  author={story.author || 'Đang cập nhật'}
                  onClick={() => onNavigate("detail", story)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Reading History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Lịch sử đọc ({readingHistory.length})
            </h2>
            <button 
              onClick={loadReadingHistory} 
              className="text-sm text-primary flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : readingHistory.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Chưa có lịch sử"
              description="Lịch sử đọc sẽ được lưu tự động khi bạn đọc truyện"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {readingHistory.map((story) => (
                <div key={story.id} className="flex flex-col">
                  <BookCard
                    id={story.id}
                    cover={getCoverUrl(story.cover_url)}
                    title={story.title}
                    author={story.author || 'Đang cập nhật'}
                    onClick={() => handleHistoryClick(story)}
                  />
                  <div className="mt-2 text-xs text-muted-foreground text-left">
                    Đang đọc đến chương {story.chapter_number}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
