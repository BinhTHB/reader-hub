import React, { useState, useEffect } from "react";
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
import { mediaService } from "../../lib/mediaService";

let AudioService: any = null;

// Try to load AudioService plugin
try {
  if (Capacitor.isNativePlatform()) {
    AudioService = require('../../lib/audioService').default;
    console.log('[ReadingScreen] AudioService loaded:', AudioService);
  }
} catch (err) {
  console.warn('[ReadingScreen] AudioService not available:', err);
  AudioService = null;
}

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
  const [story, setStory] = useState<any>(null);
  const [enableTapToSeek, setEnableTapToSeek] = useState(() => {
    const saved = localStorage.getItem('reader_enableTapToSeek');
    return saved === 'true';
  });
  const [enableAutoScroll, setEnableAutoScroll] = useState(() => {
    const saved = localStorage.getItem('reader_enableAutoScroll');
    return saved !== 'false'; // Default true
  });
  const [shouldAutoResume, setShouldAutoResume] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const isPlayingRef = React.useRef(isPlaying);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && currentChapterIndex < chapters.length - 1) {
      // Swipe left -> next chapter
      goToNextChapter();
    }
    if (isRightSwipe && currentChapterIndex > 0) {
      // Swipe right -> previous chapter
      goToPreviousChapter();
    }
  };

  // Auto-scroll to current paragraph
  useEffect(() => {
    if (isPlaying && enableAutoScroll && contentRef.current) {
      const paragraphElement = contentRef.current.querySelector(`[data-paragraph-index="${currentParagraphIndex}"]`);
      if (paragraphElement) {
        paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentParagraphIndex, isPlaying, enableAutoScroll]);

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
    localStorage.setItem('reader_enableTapToSeek', enableTapToSeek.toString());
  }, [enableTapToSeek]);

  useEffect(() => {
    localStorage.setItem('reader_enableAutoScroll', enableAutoScroll.toString());
  }, [enableAutoScroll]);

  // Keep isPlayingRef in sync with isPlaying state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (chapter?.story_id) {
      loadChapters();
    }
  }, [chapter?.story_id]);

   // Initialize Media Session and set up handlers
   useEffect(() => {
     if (chapter && story) {
       const coverUrl = story.cover_url?.startsWith('http') 
         ? story.cover_url 
         : `https://${R2_PUBLIC_DOMAIN}/${story.cover_url}`;
       
       console.log('[ReadingScreen] Initializing media session for:', chapter.title);
       console.log('[ReadingScreen] Capacitor platform:', Capacitor.getPlatform());
       console.log('[ReadingScreen] Is native:', Capacitor.isNativePlatform());
       
       mediaService.initMediaSession(chapter, story.title, coverUrl);
       
       mediaService.setMediaSessionHandlers({
         play: handlePlayPause,
         pause: handlePlayPause,
         nexttrack: goToNextChapter,
         previoustrack: goToPreviousChapter,
       });

       // Start foreground service on Android only
       if (Capacitor.isNativePlatform() && AudioService) {
         console.log('[ReadingScreen] Starting audio service...');
         
         AudioService.startService({
           title: chapter?.title || `Chương ${chapter?.chapter_number}`,
           artist: story.title,
           coverUrl: coverUrl,
         }).then(() => {
           console.log('[ReadingScreen] Audio service started successfully');
         }).catch(err => {
           console.error('[ReadingScreen] Failed to start audio service:', err);
         });
       } else {
         console.log('[ReadingScreen] Skipping audio service (web platform or service unavailable)');
       }
     }
   }, [chapter, story]);

   // Update playback state and manage Wake Lock
   useEffect(() => {
     if (content) {
       mediaService.updatePlaybackState(isPlaying, currentParagraphIndex, content.paragraphs.length);
       mediaService.ensureWakeLock(isPlaying);

       // Update foreground service on Android only
       if (Capacitor.isNativePlatform() && AudioService) {
         AudioService.updatePlaybackState({
           isPlaying: isPlaying,
         }).catch(err => console.error('Failed to update playback state:', err));
       }
     }
   }, [isPlaying, currentParagraphIndex, content]);

  // Load story details for Media Session
  useEffect(() => {
    if (chapter?.story_id) {
      const loadStory = async () => {
        try {
          const { data, error } = await supabase
            .from('stories')
            .select('id, title, cover_url')
            .eq('id', chapter.story_id)
            .single();

          if (error) throw error;
          setStory(data);
        } catch (err) {
          console.error('Failed to load story:', err);
        }
      };
      loadStory();
    }
  }, [chapter?.story_id]);

   // Cleanup: Release Wake Lock and stop service on unmount
   useEffect(() => {
     return () => {
       mediaService.releaseWakeLock();
       if (Capacitor.isNativePlatform() && AudioService) {
         AudioService.stopService().catch(err => console.error('Failed to stop audio service:', err));
       }
     };
   }, []);

  useEffect(() => {
    if (chapter?.text_r2_url) {
      loadContent();
      saveReadingHistory();
    }
  }, [chapter?.text_r2_url]);

  // Save reading position periodically and on unmount
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (chapter?.id) {
        const positions = localStorage.getItem('reading_positions') || '{}';
        const positionsMap = JSON.parse(positions);

        positionsMap[chapter.id] = {
          paragraphIndex: currentParagraphIndex,
          isPlaying: isPlaying,
          timestamp: new Date().toISOString(),
        };

        console.log('Auto-saving position for chapter', chapter.id, ':', positionsMap[chapter.id]);
        localStorage.setItem('reading_positions', JSON.stringify(positionsMap));
      }
    }, 2000); // Save every 2 seconds

    return () => {
      clearInterval(saveInterval);
      // Final save on unmount
      if (chapter?.id) {
        const positions = localStorage.getItem('reading_positions') || '{}';
        const positionsMap = JSON.parse(positions);

        positionsMap[chapter.id] = {
          paragraphIndex: currentParagraphIndex,
          isPlaying: isPlaying,
          timestamp: new Date().toISOString(),
        };

        console.log('Cleanup: Final save for chapter', chapter.id, ':', positionsMap[chapter.id]);
        localStorage.setItem('reading_positions', JSON.stringify(positionsMap));
      }
    };
  }, [chapter?.id, currentParagraphIndex, isPlaying]);

  // Restore reading position when content loads
  useEffect(() => {
    if (content && content.paragraphs.length > 0) {
      const restored = restoreReadingPosition();
      
      if (restored) {
        console.log('Position restored, paragraphIndex:', restored.paragraphIndex, 'isPlaying:', restored.isPlaying);
        // Always restore position if found
        if (shouldAutoResume || restored.isPlaying) {
          // Auto-resume if was playing or explicitly requested
          console.log('Auto-resuming from paragraph', restored.paragraphIndex);
          setShouldAutoResume(false);
          setIsPlaying(true);
          // Use setTimeout to ensure state is updated before speaking
          setTimeout(() => {
            speakParagraph(restored.paragraphIndex);
          }, 50);
        }
      } else if (shouldAutoResume) {
        // No saved position, but auto-resume requested (chapter change)
        console.log('No saved position, starting from 0');
        setShouldAutoResume(false);
        setIsPlaying(true);
        setTimeout(() => {
          speakParagraph(0);
        }, 50);
      }
    }
  }, [content]);

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

  const restoreReadingPosition = () => {
    if (!chapter?.id) return null;

    const positions = localStorage.getItem('reading_positions') || '{}';
    const positionsMap = JSON.parse(positions);
    const position = positionsMap[chapter.id];

    console.log('Restoring position for chapter', chapter.id, ':', position);

    if (position && position.paragraphIndex >= 0) {
      setCurrentParagraphIndex(position.paragraphIndex);
      return position;
    }

    return null;
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
      
      // Don't reset paragraph index here, let restoreReadingPosition handle it
    } catch (err: any) {
      console.error('Failed to load chapter content:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleParagraphClick = async (index: number) => {
    if (!enableTapToSeek) return;
    
    setCurrentParagraphIndex(index);
    if (isPlaying) {
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      await speakParagraph(index);
    }
  };

  const changeChapter = async (newChapter: Chapter, autoResume: boolean = false) => {
    // Stop current playback immediately
    const wasPlaying = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
    
    // Reset paragraph index and content before changing chapter
    setCurrentParagraphIndex(0);
    setContent(null);
    setShouldAutoResume(autoResume || wasPlaying);
    
    // Change chapter
    setChapter(newChapter);
    const newIndex = chapters.findIndex(ch => ch.id === newChapter.id);
    setCurrentChapterIndex(newIndex);
    setShowChapterList(false);

     // Update metadata for new chapter
     if (story) {
       const newTitle = newChapter.title || `Chương ${newChapter.chapter_number}`;
       mediaService.initMediaSession(newChapter, story.title, 
         story.cover_url?.startsWith('http') ? story.cover_url : `https://${R2_PUBLIC_DOMAIN}/${story.cover_url}`
       );

       if (Capacitor.isNativePlatform() && AudioService) {
         AudioService.updateMetadata({
           title: newTitle,
           artist: story.title,
         }).catch(err => console.error('Failed to update metadata:', err));
       }
     }
    
    // Return whether audio was playing (for auto-resume)
    return wasPlaying;
  };

  const goToNextChapter = async () => {
    if (currentChapterIndex < chapters.length - 1) {
      await changeChapter(chapters[currentChapterIndex + 1], true);
    }
  };

  const goToPreviousChapter = async () => {
    if (currentChapterIndex > 0) {
      await changeChapter(chapters[currentChapterIndex - 1], true);
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
       // Finished all paragraphs, auto-advance to next chapter if available
       if (currentChapterIndex < chapters.length - 1) {
         const nextChapter = chapters[currentChapterIndex + 1];
         await changeChapter(nextChapter, true);
         // Keep playing state, auto-resume will happen via useEffect
       } else {
         // Last chapter, stop playing
         setIsPlaying(false);
         setCurrentParagraphIndex(0);
       }
       return;
     }

     const text = content.paragraphs[index];

     if (Capacitor.isNativePlatform()) {
       // Use native TTS on Android
       try {
         // Update paragraph index immediately for smooth UI
         setCurrentParagraphIndex(index);
         
         await TextToSpeech.speak({
           text: text,
           lang: 'vi-VN',
           rate: speechRate,
           pitch: speechPitch,
           volume: 1.0,
           category: 'ambient',
         });

         // Check if still playing using ref (more reliable than state)
         if (!isPlayingRef.current) return;

         // Auto-advance to next paragraph
         if (index < content.paragraphs.length - 1) {
           // Minimal delay for smooth transition
           setTimeout(() => {
             if (isPlayingRef.current) {
               speakParagraph(index + 1);
             }
           }, 100);
         } else {
           // Finished chapter, auto-advance
           if (currentChapterIndex < chapters.length - 1) {
             const nextChapter = chapters[currentChapterIndex + 1];
             await changeChapter(nextChapter, true);
           } else {
             setIsPlaying(false);
             setCurrentParagraphIndex(0);
           }
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
         
         utterance.onstart = () => {
           // Update UI immediately when speech starts
           setCurrentParagraphIndex(index);
         };
         
         utterance.onend = async () => {
           // Check if still playing using ref
           if (!isPlayingRef.current) return;

           if (index < content.paragraphs.length - 1) {
             // Minimal delay for smooth transition
             setTimeout(() => {
               if (isPlayingRef.current) {
                 speakParagraph(index + 1);
               }
             }, 100);
           } else {
             // Finished chapter, auto-advance
             if (currentChapterIndex < chapters.length - 1) {
               const nextChapter = chapters[currentChapterIndex + 1];
               await changeChapter(nextChapter, true);
             } else {
               setIsPlaying(false);
               setCurrentParagraphIndex(0);
             }
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
            ref={contentRef}
            className="max-w-2xl mx-auto px-6 py-8 pb-48 overflow-y-auto"
            onScroll={handleScroll}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
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
                  data-paragraph-index={index}
                  onClick={() => handleParagraphClick(index)}
                  className={`mb-4 text-justify transition-all ${
                    index === currentParagraphIndex && isPlaying
                      ? "bg-orange-200 dark:bg-orange-900/40 px-2 py-1 rounded-lg"
                      : ""
                  } ${enableTapToSeek ? "cursor-pointer hover:bg-muted/50" : ""}`}
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

            {/* Tap to Seek */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Bấm để tua</label>
              <button
                onClick={() => setEnableTapToSeek(!enableTapToSeek)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  enableTapToSeek ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full flex items-center justify-center transition-transform ${
                    enableTapToSeek ? "translate-x-6" : ""
                  }`}
                >
                </div>
              </button>
            </div>

            {/* Auto Scroll */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Tự động cuộn theo audio</label>
              <button
                onClick={() => setEnableAutoScroll(!enableAutoScroll)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  enableAutoScroll ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full flex items-center justify-center transition-transform ${
                    enableAutoScroll ? "translate-x-6" : ""
                  }`}
                >
                </div>
              </button>
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
                  ref={(el) => {
                    if (ch.id === chapter?.id && el) {
                      setTimeout(() => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 100);
                    }
                  }}
                  onClick={() => {
                    changeChapter(ch);
                    setShowChapterList(false);
                  }}
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
