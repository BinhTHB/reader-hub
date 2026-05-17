import { useState, useEffect } from "react";
import {
  ChevronLeft,
  Settings,
  Sun,
  Moon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
  Play,
  Pause,
  Volume2,
  RefreshCw,
  List,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { R2_PUBLIC_DOMAIN, supabase } from "../../lib/supabase";

interface ReadingScreenProps {
  chapter?: any;
  onBack: () => void;
}

interface ChapterContent {
  paragraphs: string[];
}

interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  text_r2_url: string;
}

export function ReadingScreen({ chapter: initialChapter, onBack }: ReadingScreenProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('reader_fontSize');
    return saved ? Number(saved) : 18;
  });
  const [lineHeight, setLineHeight] = useState(() => {
    const saved = localStorage.getItem('reader_lineHeight');
    return saved ? Number(saved) : 1.7;
  });
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('reader_isDark');
    return saved === 'true';
  });
  const [progress, setProgress] = useState(0);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [speechRate, setSpeechRate] = useState(() => {
    const saved = localStorage.getItem('reader_speechRate');
    return saved ? Number(saved) : 1.0;
  });
  const [speechPitch, setSpeechPitch] = useState(() => {
    const saved = localStorage.getItem('reader_speechPitch');
    return saved ? Number(saved) : 1.0;
  });
  const [chapter, setChapter] = useState(initialChapter);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('reader_fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('reader_lineHeight', lineHeight.toString());
  }, [lineHeight]);

  useEffect(() => {
    localStorage.setItem('reader_isDark', isDark.toString());
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('reader_speechRate', speechRate.toString());
  }, [speechRate]);

  useEffect(() => {
    localStorage.setItem('reader_speechPitch', speechPitch.toString());
  }, [speechPitch]);

  useEffect(() => {
    if (chapter?.story_id) {
      loadChapters();
    }
  }, [chapter?.story_id]);

  useEffect(() => {
    if (chapter?.text_r2_url) {
      loadContent();
      saveReadingHistory();
    }
  }, [chapter?.text_r2_url]);

  const saveReadingHistory = () => {
    if (!chapter?.story_id || !chapter?.chapter_number || !chapter?.id) return;

    const saved = localStorage.getItem('reading_history');
    const history = saved ? JSON.parse(saved) : [];

    // Remove existing entry for this story
    const filtered = history.filter((h: any) => h.story_id !== chapter.story_id);

    // Add new entry at the beginning
    filtered.unshift({
      story_id: chapter.story_id,
      chapter_id: chapter.id,
      chapter_number: chapter.chapter_number,
      last_read: new Date().toISOString(),
    });

    // Keep only last 50 items
    const trimmed = filtered.slice(0, 50);

    localStorage.setItem('reading_history', JSON.stringify(trimmed));
  };

  const loadChapters = async () => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('story_id', chapter.story_id)
        .order('chapter_number', { ascending: true });

      if (error) throw error;
      
      setChapters(data || []);
      const currentIndex = data?.findIndex(ch => ch.id === chapter.id) || 0;
      setCurrentChapterIndex(currentIndex);
    } catch (err) {
      console.error('Failed to load chapters:', err);
    }
  };

  const loadContent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const r2Url = chapter.text_r2_url;
      if (!r2Url) {
        throw new Error('Chương này chưa có nội dung');
      }

      const url = r2Url.startsWith('http') ? r2Url : `https://${R2_PUBLIC_DOMAIN}/${r2Url}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setContent(data);
      setCurrentParagraphIndex(0);
    } catch (err: any) {
      console.error('Failed to load chapter content:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const changeChapter = (newChapter: Chapter) => {
    if (isPlaying) {
      handlePlayPause();
    }
    setChapter(newChapter);
    const newIndex = chapters.findIndex(ch => ch.id === newChapter.id);
    setCurrentChapterIndex(newIndex);
    setShowChapterList(false);
  };

  const goToNextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      changeChapter(chapters[currentChapterIndex + 1]);
    }
  };

  const goToPreviousChapter = () => {
    if (currentChapterIndex > 0) {
      changeChapter(chapters[currentChapterIndex - 1]);
    }
  };

  const handlePlayPause = async () => {
    if (!content || content.paragraphs.length === 0) return;

    if (!isPlaying) {
      setIsPlaying(true);
      await speakParagraph(currentParagraphIndex);
    } else {
      setIsPlaying(false);
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const speakParagraph = async (index: number) => {
    if (!content || index >= content.paragraphs.length) {
      setIsPlaying(false);
      return;
    }

    const text = content.paragraphs[index];

    if (Capacitor.isNativePlatform()) {
      // Use native TTS on Android
      try {
        await TextToSpeech.speak({
          text: text,
          lang: 'vi-VN',
          rate: speechRate,
          pitch: speechPitch,
          volume: 1.0,
          category: 'ambient',
        });

        // Auto-advance to next paragraph
        if (index < content.paragraphs.length - 1 && isPlaying) {
          setCurrentParagraphIndex(index + 1);
          await speakParagraph(index + 1);
        } else {
          setIsPlaying(false);
          setCurrentParagraphIndex(0);
        }
      } catch (error) {
        console.error('TTS error:', error);
        setIsPlaying(false);
      }
    } else {
      // Use Web Speech API on browser
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.lang = 'vi-VN';
        
        utterance.onend = () => {
          if (index < content.paragraphs.length - 1) {
            setCurrentParagraphIndex(index + 1);
            speakParagraph(index + 1);
          } else {
            setIsPlaying(false);
            setCurrentParagraphIndex(0);
          }
        };

        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const scrollProgress = (element.scrollTop / (element.scrollHeight - element.clientHeight)) * 100;
    setProgress(scrollProgress);
  };

  return (
    <div
      className={`min-h-screen ${
        isDark ? "bg-[#121212] text-white" : "bg-background text-foreground"
      }`}
    >
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted/30 z-50">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="sticky top-1 bg-background/80 backdrop-blur-sm z-40 px-4 py-3 flex items-center justify-between border-b border-border/50">
        <button
          onClick={onBack}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-medium truncate flex-1 mx-3">
          {chapter?.title || `Chương ${chapter?.chapter_number || '...'}`}
        </h3>
        <button
          onClick={() => setShowChapterList(true)}
          className="p-2 hover:bg-muted rounded-full transition-colors mr-1"
        >
          <List className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-24">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 mb-4">Lỗi: {error}</p>
            <button
              onClick={loadContent}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Reading Content */}
      {!isLoading && !error && content && (
        <>
          <div 
            className="max-w-2xl mx-auto px-6 py-8 pb-48 overflow-y-auto"
            onScroll={handleScroll}
            style={{ maxHeight: 'calc(100vh - 200px)' }}
          >
            <div
              className={`prose prose-sm max-w-none ${
                isDark ? "prose-invert" : ""
              }`}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
              }}
            >
              <h2 className="text-center mb-8">
                {chapter?.title || `Chương ${chapter?.chapter_number}`}
              </h2>
              {content.paragraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className={`mb-4 text-justify transition-all ${
                    index === currentParagraphIndex && isPlaying
                      ? "bg-primary/20 px-2 py-1 rounded-lg"
                      : ""
                  }`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          {/* TTS Controls */}
          <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 z-40">
            <div className="max-w-md mx-auto bg-card/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg border border-border">
              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>
                    Đoạn {currentParagraphIndex + 1}/{content.paragraphs.length}
                  </span>
                  <span>Tốc độ: {speechRate.toFixed(1)}x | Tông: {speechPitch.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${((currentParagraphIndex + 1) / content.paragraphs.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={goToPreviousChapter}
                  disabled={currentChapterIndex === 0}
                  className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                  title="Chương trước"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={async () => {
                    if (currentParagraphIndex > 0) {
                      setCurrentParagraphIndex(currentParagraphIndex - 1);
                      if (isPlaying) {
                        if (Capacitor.isNativePlatform()) {
                          await TextToSpeech.stop();
                        } else if ('speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                        }
                        await speakParagraph(currentParagraphIndex - 1);
                      }
                    }
                  }}
                  disabled={currentParagraphIndex === 0}
                  className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                  title="Đoạn trước"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="p-4 bg-primary text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>

                <button
                  onClick={async () => {
                    if (currentParagraphIndex < content.paragraphs.length - 1) {
                      setCurrentParagraphIndex(currentParagraphIndex + 1);
                      if (isPlaying) {
                        if (Capacitor.isNativePlatform()) {
                          await TextToSpeech.stop();
                        } else if ('speechSynthesis' in window) {
                          window.speechSynthesis.cancel();
                        }
                        await speakParagraph(currentParagraphIndex + 1);
                      }
                    }
                  }}
                  disabled={currentParagraphIndex >= content.paragraphs.length - 1}
                  className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                  title="Đoạn sau"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>

                <button
                  onClick={goToNextChapter}
                  disabled={currentChapterIndex >= chapters.length - 1}
                  className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-30"
                  title="Chương sau"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-card w-full rounded-t-3xl p-6 space-y-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-medium text-center">Cài đặt đọc</h3>

            {/* Font Size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Cỡ chữ</label>
                <span className="text-sm text-muted-foreground">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min="14"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Line Height */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Khoảng cách dòng</label>
                <span className="text-sm text-muted-foreground">
                  {lineHeight.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.0"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Dark Mode */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Chế độ tối</label>
              <button
                onClick={() => setIsDark(!isDark)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  isDark ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full flex items-center justify-center transition-transform ${
                    isDark ? "translate-x-6" : ""
                  }`}
                >
                  {isDark ? (
                    <Moon className="w-3 h-3 text-primary" />
                  ) : (
                    <Sun className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-border my-2" />
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" />
              Cài đặt đọc giọng nói
            </h4>

            {/* Speech Rate */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Tốc độ đọc</label>
                <span className="text-sm text-muted-foreground">
                  {speechRate.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={speechRate}
                onChange={(e) => setSpeechRate(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0.1x</span>
                <span>5.0x</span>
              </div>
            </div>

            {/* Speech Pitch */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Tông giọng</label>
                <span className="text-sm text-muted-foreground">
                  {speechPitch.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={speechPitch}
                onChange={(e) => setSpeechPitch(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0.1x</span>
                <span>5.0x</span>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-primary text-white rounded-full font-medium hover:opacity-90 transition-opacity"
            >
              Xong
            </button>
          </div>
        </div>
      )}

      {/* Chapter List Modal */}
      {showChapterList && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setShowChapterList(false)}
        >
          <div
            className="bg-card w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-medium text-center mb-4">Mục lục</h3>
            
            <div className="space-y-2">
              {chapters.map((ch, index) => (
                <button
                  key={ch.id}
                  onClick={() => changeChapter(ch)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    ch.id === chapter?.id
                      ? 'bg-primary text-white'
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Chương {ch.chapter_number}
                    </span>
                    {ch.id === chapter?.id && (
                      <span className="text-xs bg-white/20 px-2 py-1 rounded">
                        Đang đọc
                      </span>
                    )}
                  </div>
                  {ch.title && (
                    <p className="text-sm mt-1 opacity-80 truncate">
                      {ch.title}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
