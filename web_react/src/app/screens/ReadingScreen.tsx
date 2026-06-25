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
  Clock,
  Trash2,
} from "lucide-react";
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { R2_PUBLIC_DOMAIN, supabase } from "../../lib/supabase";
import { mediaService } from "../../lib/mediaService";
import { cleanChapterCache, getChapterFromCache, saveChapterToCache, deleteChapterFromCache, type ChapterContent } from "../../lib/chapterCache";

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
  user?: any;
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

export function ReadingScreen({ chapter: initialChapter, onBack, user }: ReadingScreenProps) {
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
  const [shouldAutoResume, setShouldAutoResume] = useState(() => {
    if (initialChapter?.id) {
      const positions = localStorage.getItem('reading_positions') || '{}';
      const positionsMap = JSON.parse(positions);
      const position = positionsMap[initialChapter.id];
      return position ? position.isPlaying === true : false;
    }
    return false;
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(() => {
    const saved = localStorage.getItem('reader_sleepTimer');
    return saved ? Number(saved) : null;
  });
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const sleepTimerEndTimeRef = React.useRef<number | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const isPlayingRef = React.useRef(isPlaying);
  const handlePlayPauseRef = React.useRef<any>(null);
  const goToNextChapterRef = React.useRef<any>(null);
  const goToPreviousChapterRef = React.useRef<any>(null);
  const isProgrammaticScrollRef = React.useRef(false);
  const scrollTimeoutRef = React.useRef<any>(null);
  const lastComputedIndexRef = React.useRef(0);
  const isPositionRestoredRef = React.useRef(false);
  const currentUtteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);
  const pendingAutoResumeRef = React.useRef(false);

  const setPlaying = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  };

  // Keep lastComputedIndexRef in sync with currentParagraphIndex state
  useEffect(() => {
    lastComputedIndexRef.current = currentParagraphIndex;
  }, [currentParagraphIndex]);

  // Keep ref callbacks up to date on every render to prevent closures in Media Session handlers
  useEffect(() => {
    handlePlayPauseRef.current = handlePlayPause;
    goToNextChapterRef.current = goToNextChapter;
    goToPreviousChapterRef.current = goToPreviousChapter;
  });

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
          play: () => handlePlayPauseRef.current?.(),
          pause: () => handlePlayPauseRef.current?.(),
          nexttrack: () => goToNextChapterRef.current?.(),
          previoustrack: () => goToPreviousChapterRef.current?.(),
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

    // Update playback state and manage Wake Lock & Silent Audio
    useEffect(() => {
      if (content) {
        mediaService.updatePlaybackState(isPlaying, currentParagraphIndex, content.paragraphs.length);
        mediaService.ensureWakeLock(isPlaying);

        if (isPlaying) {
          mediaService.playSilentAudio();
        } else {
          mediaService.pauseSilentAudio();
        }

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

    // Cleanup: Release Wake Lock, stop silent audio and stop service on unmount
    useEffect(() => {
      return () => {
        mediaService.releaseWakeLock();
        mediaService.pauseSilentAudio();
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

  // Sleep Timer countdown effect
  useEffect(() => {
    if (sleepTimer === null) {
      return;
    }

    if (!isPlaying) {
      // If paused, keep timeLeft but stop interval
      return;
    }

    // Initialize or restore endTime
    const initialSeconds = timeLeft > 0 ? timeLeft : sleepTimer * 60;
    setTimeLeft(initialSeconds);
    sleepTimerEndTimeRef.current = Date.now() + initialSeconds * 1000;

    const timerId = setInterval(() => {
      if (sleepTimerEndTimeRef.current) {
        const remaining = Math.round((sleepTimerEndTimeRef.current - Date.now()) / 1000);
        if (remaining <= 0) {
          console.log('[SleepTimer] Time up! Stopping audio...');
          setPlaying(false);
          if (Capacitor.isNativePlatform()) {
            TextToSpeech.stop().catch(err => console.error(err));
      } else if ('speechSynthesis' in window) {
        // Only cancel if actively speaking to avoid corrupting
        // speech engine state when called from onend (natural chapter end)
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
      }
          stopSleepTimer();
        } else {
          setTimeLeft(remaining);
        }
      }
    }, 1000);

    return () => clearInterval(timerId);
  }, [sleepTimer, isPlaying]);

  // Start sleep timer
  const startSleepTimer = (minutes: number) => {
    setSleepTimer(minutes);
    localStorage.setItem('reader_sleepTimer', minutes.toString());
    const seconds = minutes * 60;
    setTimeLeft(seconds);
    sleepTimerEndTimeRef.current = Date.now() + seconds * 1000;
  };

  // Stop sleep timer
  const stopSleepTimer = () => {
    setSleepTimer(null);
    localStorage.removeItem('reader_sleepTimer');
    setTimeLeft(0);
    sleepTimerEndTimeRef.current = null;
  };

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Prefetching logic for next 10 chapters
  const prefetchNextChapters = async (currentIndex: number, chaptersList: Chapter[]) => {
    if (!chaptersList || chaptersList.length === 0) return;
    const nextChapters = chaptersList.slice(currentIndex + 1, currentIndex + 11);
    
    for (const ch of nextChapters) {
      if (!ch.text_r2_url) continue;
      
      const cached = await getChapterFromCache(ch.id);
      if (cached) continue;
      
      try {
        const url = ch.text_r2_url.startsWith('http') 
          ? ch.text_r2_url 
          : `https://${R2_PUBLIC_DOMAIN}/${ch.text_r2_url}`;
        
        console.log(`[Prefetch] Fetching chapter ${ch.chapter_number}`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          await saveChapterToCache(ch.id, data);
          console.log(`[Prefetch] Cached chapter ${ch.chapter_number}`);
        }
      } catch (err) {
        console.warn(`[Prefetch] Failed for chapter ${ch.chapter_number}:`, err);
      }
    }
  };

  useEffect(() => {
    if (chapters.length > 0 && currentChapterIndex !== -1) {
      prefetchNextChapters(currentChapterIndex, chapters);
      
      const keepIds = chapters
        .slice(Math.max(0, currentChapterIndex - 2), currentChapterIndex + 12)
        .map(ch => ch.id);
      cleanChapterCache(keepIds);
    }
  }, [currentChapterIndex, chapters]);

  // Listen for media actions from native notification bar controls
  useEffect(() => {
    if (Capacitor.isNativePlatform() && AudioService) {
      console.log('[ReadingScreen] Registering native mediaAction listener');
      const listener = AudioService.addListener('mediaAction', (data: { action: string }) => {
        console.log('[ReadingScreen] Received native media action:', data.action);
        if (data.action === 'PLAY_PAUSE') {
          handlePlayPauseRef.current?.();
        } else if (data.action === 'NEXT') {
          goToNextChapterRef.current?.();
        } else if (data.action === 'PREVIOUS') {
          goToPreviousChapterRef.current?.();
        }
      });

      return () => {
        console.log('[ReadingScreen] Removing native mediaAction listener');
        listener.remove();
      };
    }
  }, []);

  // Save reading position periodically and on unmount
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (chapter?.id && isPositionRestoredRef.current) {
        const positions = localStorage.getItem('reading_positions') || '{}';
        const positionsMap = JSON.parse(positions);

        positionsMap[chapter.id] = {
          paragraphIndex: lastComputedIndexRef.current,
          isPlaying: isPlaying,
          timestamp: new Date().toISOString(),
        };

        console.log('Auto-saving position for chapter', chapter.id, ':', positionsMap[chapter.id]);
        localStorage.setItem('reading_positions', JSON.stringify(positionsMap));
      }
    }, 2000); // Save every 2 seconds

    return () => {
      clearInterval(saveInterval);
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      if (!isPositionRestoredRef.current) {
        console.log('[Cleanup] Ignored saving because position was not yet restored for chapter', chapter?.id);
        return;
      }

      const finalIndex = lastComputedIndexRef.current;
      console.log('[Cleanup] Final save paragraph index:', finalIndex);

      // Final save on unmount
      if (chapter?.id) {
        const positions = localStorage.getItem('reading_positions') || '{}';
        const positionsMap = JSON.parse(positions);

        positionsMap[chapter.id] = {
          paragraphIndex: finalIndex,
          isPlaying: isPlaying,
          timestamp: new Date().toISOString(),
        };

        console.log('Cleanup: Final save for chapter', chapter.id, ':', positionsMap[chapter.id]);
        localStorage.setItem('reading_positions', JSON.stringify(positionsMap));

        // Sync to Supabase if logged in
        if (user && chapter?.story_id) {
          const scrollPos = content?.paragraphs?.length ? finalIndex / content.paragraphs.length : 0;
          supabase
            .from('reading_history')
            .upsert({
              user_id: user.id,
              story_id: chapter.story_id,
              last_chapter_number: chapter.chapter_number,
              scroll_position: scrollPos,
              last_read_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,story_id'
            })
            .then(({ error }) => {
              if (error) console.error('Failed final reading position sync:', error);
            });
        }
      }
    };
  }, [chapter?.id, currentParagraphIndex, isPlaying, user, content]);

  const restoreReadingPositionFromDB = async () => {
    if (!user || !chapter?.story_id || !content) return;
    try {
      const { data, error } = await supabase
        .from('reading_history')
        .select('scroll_position, last_chapter_number')
        .eq('user_id', user.id)
        .eq('story_id', chapter.story_id)
        .maybeSingle();

      if (error) throw error;
      if (data && data.last_chapter_number === chapter.chapter_number && data.scroll_position > 0) {
        const paragraphIndex = Math.floor(data.scroll_position * content.paragraphs.length);
        if (paragraphIndex >= 0 && paragraphIndex < content.paragraphs.length) {
          console.log('[ReadingScreen] Restored scroll position from DB:', paragraphIndex);
          setCurrentParagraphIndex(paragraphIndex);
          lastComputedIndexRef.current = paragraphIndex;
          
          // Save back to local storage positions so we don't fetch DB repeatedly
          const positions = localStorage.getItem('reading_positions') || '{}';
          const positionsMap = JSON.parse(positions);
          positionsMap[chapter.id] = {
            paragraphIndex: paragraphIndex,
            isPlaying: false,
            timestamp: new Date().toISOString(),
          };
          localStorage.setItem('reading_positions', JSON.stringify(positionsMap));

          // Auto-scroll to restored paragraph index
          setTimeout(() => {
            if (contentRef.current) {
              const paragraphElement = contentRef.current.querySelector(`[data-paragraph-index="${paragraphIndex}"]`);
              if (paragraphElement) {
                isProgrammaticScrollRef.current = true;
                paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                  isProgrammaticScrollRef.current = false;
                }, 1000);
              }
            }
          }, 150);

            if (shouldAutoResume || pendingAutoResumeRef.current) {
            pendingAutoResumeRef.current = false;
            setShouldAutoResume(false);
            setPlaying(true);
            setTimeout(() => {
              speakParagraph(paragraphIndex);
            }, 500);
          }
        }
      } else if (shouldAutoResume || pendingAutoResumeRef.current) {
        pendingAutoResumeRef.current = false;
        setShouldAutoResume(false);
        setPlaying(true);
        setTimeout(() => {
          speakParagraph(0);
        }, 500);
      }
    } catch (err) {
      console.error('Failed to restore reading position from DB:', err);
      if (shouldAutoResume || pendingAutoResumeRef.current) {
        pendingAutoResumeRef.current = false;
        setShouldAutoResume(false);
        setPlaying(true);
        setTimeout(() => {
          speakParagraph(0);
        }, 500);
      }
    } finally {
      isPositionRestoredRef.current = true;
    }
  };

  // Restore reading position when content loads
  useEffect(() => {
    if (content && content.paragraphs.length > 0) {
      const restored = restoreReadingPosition();
      
      if (restored) {
        console.log('Position restored, paragraphIndex:', restored.paragraphIndex, 'isPlaying:', restored.isPlaying, 'shouldAutoResume:', shouldAutoResume, 'pendingAutoResumeRef:', pendingAutoResumeRef.current);
        // Always restore position if found
        if (shouldAutoResume || pendingAutoResumeRef.current || restored.isPlaying) {
          // Auto-resume if was playing or explicitly requested
          pendingAutoResumeRef.current = false;
          console.log('Auto-resuming from paragraph', restored.paragraphIndex);
          setShouldAutoResume(false);
          setPlaying(true);
          // Use setTimeout to ensure state is updated before speaking
          setTimeout(() => {
            speakParagraph(restored.paragraphIndex);
          }, 500);
        }
        // Force scroll even if not playing, to restore scroll view
        setTimeout(() => {
          if (contentRef.current) {
            const paragraphElement = contentRef.current.querySelector(`[data-paragraph-index="${restored.paragraphIndex}"]`);
            if (paragraphElement) {
              isProgrammaticScrollRef.current = true;
              paragraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                isProgrammaticScrollRef.current = false;
              }, 1000);
            }
          }
        }, 150);
      } else if (user) {
        // No local positions, fetch from Supabase DB
        restoreReadingPositionFromDB();
      } else {
        // No local positions, no user -> start from 0
        isPositionRestoredRef.current = true;
        if (shouldAutoResume || pendingAutoResumeRef.current) {
          // No saved position, but auto-resume requested (chapter change)
          pendingAutoResumeRef.current = false;
          console.log('No saved position, starting from 0');
          setShouldAutoResume(false);
          setPlaying(true);
          setTimeout(() => {
            speakParagraph(0);
          }, 500);
        }
      }
    }
  }, [content, shouldAutoResume]);

  const saveReadingHistory = async () => {
    if (!chapter?.story_id || !chapter?.chapter_number || !chapter?.id) return;

    // Save locally first
    const saved = localStorage.getItem('reading_history');
    const history = saved ? JSON.parse(saved) : [];

    const filtered = history.filter((h: any) => h.story_id !== chapter.story_id);
    filtered.unshift({
      story_id: chapter.story_id,
      chapter_id: chapter.id,
      chapter_number: chapter.chapter_number,
      last_read: new Date().toISOString(),
    });

    const trimmed = filtered.slice(0, 50);
    localStorage.setItem('reading_history', JSON.stringify(trimmed));

    // Sync to Supabase if logged in
    if (user) {
      try {
        const { error } = await supabase
          .from('reading_history')
          .upsert({
            user_id: user.id,
            story_id: chapter.story_id,
            last_chapter_number: chapter.chapter_number,
            last_read_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,story_id'
          });

        if (error) throw error;
      } catch (err) {
        console.error('Failed to sync reading history to DB:', err);
      }
    }
  };

  const restoreReadingPosition = () => {
    if (!chapter?.id) return null;

    const positions = localStorage.getItem('reading_positions') || '{}';
    const positionsMap = JSON.parse(positions);
    const position = positionsMap[chapter.id];

    console.log('Restoring position for chapter', chapter.id, ':', position);

    if (position && position.paragraphIndex >= 0) {
      setCurrentParagraphIndex(position.paragraphIndex);
      lastComputedIndexRef.current = position.paragraphIndex;
      isPositionRestoredRef.current = true;
      return position;
    }

    return null;
  };

  const loadChapters = async () => {
    try {
      let allChapters: Chapter[] = [];
      let from = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('chapters')
          .select('*')
          .eq('story_id', chapter.story_id)
          .order('chapter_number', { ascending: true })
          .range(from, from + limit - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allChapters = [...allChapters, ...data];
          if (data.length < limit) {
            hasMore = false;
          } else {
            from += limit;
          }
        } else {
          hasMore = false;
        }
      }

      setChapters(allChapters);
      const currentIndex = allChapters.findIndex(ch => ch.id === chapter.id) || 0;
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

      // Try local cache first
      const cachedData = await getChapterFromCache(chapter.id);
      if (cachedData) {
        console.log(`[Cache] Loaded chapter ${chapter.chapter_number} from local cache`);
        setContent(cachedData);
        return;
      }

      const url = r2Url.startsWith('http') ? r2Url : `https://${R2_PUBLIC_DOMAIN}/${r2Url}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setContent(data);
      
      // Save to cache
      await saveChapterToCache(chapter.id, data);
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
      setPlaying(false);
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    }
    
    // Reset paragraph index and content before changing chapter
    setCurrentParagraphIndex(0);
    setContent(null);
    if (wasPlaying) {
      console.log('[changeChapter] Setting pendingAutoResumeRef = true (wasPlaying:', wasPlaying, ')');
      pendingAutoResumeRef.current = true;
    }
    setShouldAutoResume(wasPlaying);
    isPositionRestoredRef.current = false;
    
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
      await changeChapter(chapters[currentChapterIndex + 1], false);
    }
  };

  const goToPreviousChapter = async () => {
    if (currentChapterIndex > 0) {
      await changeChapter(chapters[currentChapterIndex - 1], false);
    }
  };

  const handleDeleteCurrentChapter = async () => {
    if (!chapter?.id) return;

    try {
      setShowDeleteConfirm(false);
      setShowSettings(false);
      setPlaying(false);
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const { data, error } = await supabase.functions.invoke('delete-content', {
        body: { type: 'chapter', id: chapter.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await deleteChapterFromCache(chapter.id);

      const remainingChapters = chapters.filter((ch) => ch.id !== chapter.id);
      setChapters(remainingChapters);

      if (remainingChapters.length === 0) {
        onBack();
        return;
      }

      const nextChapter = remainingChapters[currentChapterIndex] || remainingChapters[currentChapterIndex - 1] || remainingChapters[0];
      await changeChapter(nextChapter, false);
      setCurrentChapterIndex(remainingChapters.findIndex((ch) => ch.id === nextChapter.id));
    } catch (err: any) {
      console.error('Failed to delete current chapter:', err);
      setError(err.message || 'Không thể xóa chương hiện tại');
    }
  };

  const handlePlayPause = async () => {
    if (!content || content.paragraphs.length === 0) return;

    if (!isPlaying) {
      setPlaying(true);
      await speakParagraph(currentParagraphIndex);
    } else {
      setPlaying(false);
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

   const speakParagraph = async (index: number) => {
     // Check if we are supposed to be playing
     if (!isPlayingRef.current) {
       console.log('[speakParagraph] Cancelled because isPlayingRef is false');
       return;
     }

     // Check sleep timer expiry
     if (sleepTimerEndTimeRef.current && Date.now() >= sleepTimerEndTimeRef.current) {
       console.log('[SleepTimer] Timer expired. Stopping audio playback.');
       setPlaying(false);
       stopSleepTimer();
       return;
     }

     if (!content || index >= content.paragraphs.length) {
       // Finished all paragraphs, auto-advance to next chapter if available
       if (currentChapterIndex < chapters.length - 1) {
         const nextChapter = chapters[currentChapterIndex + 1];
         await changeChapter(nextChapter, true);
         // Keep playing state, auto-resume will happen via useEffect
       } else {
         // Last chapter, stop playing
         setPlaying(false);
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
                 console.log('[onend] Auto-advancing to chapter', nextChapter.chapter_number);
                 // Pre-save next chapter position in localStorage (survives StrictMode)
                 const pos = JSON.parse(localStorage.getItem('reading_positions') || '{}');
                 pos[nextChapter.id] = { paragraphIndex: 0, isPlaying: true, timestamp: new Date().toISOString() };
                 localStorage.setItem('reading_positions', JSON.stringify(pos));
                 pendingAutoResumeRef.current = true;
                await changeChapter(nextChapter, true);
              } else {
                setPlaying(false);
                setCurrentParagraphIndex(0);
              }
            }
        } catch (error) {
          console.error('TTS error:', error);
          setPlaying(false);
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

          utterance.onerror = (event: any) => {
            console.error('[SpeechSynthesis] Error for paragraph', index, ':', event.error || event);
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
                 console.log('[onend-web] Auto-advancing to chapter', nextChapter.chapter_number);
                 // Pre-save next chapter position in localStorage (survives StrictMode)
                 const pos = JSON.parse(localStorage.getItem('reading_positions') || '{}');
                 pos[nextChapter.id] = { paragraphIndex: 0, isPlaying: true, timestamp: new Date().toISOString() };
                 localStorage.setItem('reading_positions', JSON.stringify(pos));
                 pendingAutoResumeRef.current = true;
                 await changeChapter(nextChapter, true);
               } else {
                 setPlaying(false);
                 setCurrentParagraphIndex(0);
               }
             }
           };

           currentUtteranceRef.current = utterance;

          // Chrome Web Speech API bug workarounds:
          // 1. getVoices() kickstarts the speech engine
          // 2. cancel() resets queue if engine is busy
          // 3. Delay lets Chrome fully reset engine state before speak()
          window.speechSynthesis.getVoices();
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
          }
          await new Promise<void>(r => setTimeout(r, 100));
          if (!isPlayingRef.current) {
            console.log('[speakParagraph] Cancelled after engine reset delay');
            return;
          }
          window.speechSynthesis.speak(utterance);
       }
     }
   };

  const syncParagraphIndexFromScroll = () => {
    if (!contentRef.current || !content) return;
    const container = contentRef.current;
    const paragraphs = container.querySelectorAll('[data-paragraph-index]');
    if (paragraphs.length === 0) return;
    
    const containerRect = container.getBoundingClientRect();
    // Sticky header Y offset is roughly 60px
    const targetLine = containerRect.top + 60;
    
    let foundIndex = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const pRect = p.getBoundingClientRect();
      if (pRect.top <= targetLine && pRect.bottom >= targetLine) {
        foundIndex = parseInt(p.getAttribute('data-paragraph-index') || '0', 10);
        break;
      }
    }
    
    if (foundIndex === 0) {
      let minDistance = Infinity;
      paragraphs.forEach((p) => {
        const pRect = p.getBoundingClientRect();
        const distance = Math.abs(pRect.top - targetLine);
        if (distance < minDistance) {
          minDistance = distance;
          foundIndex = parseInt(p.getAttribute('data-paragraph-index') || '0', 10);
        }
      });
    }
    
    return foundIndex;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const scrollProgress = (element.scrollTop / (element.scrollHeight - element.clientHeight)) * 100;
    setProgress(scrollProgress);

    // Update paragraph index based on scroll position in non-playing mode
    if (!isPlaying && !isProgrammaticScrollRef.current) {
      const foundIndex = syncParagraphIndexFromScroll();
      if (foundIndex !== undefined) {
        console.log('[handleScroll] Scrolled paragraph:', foundIndex);
        lastComputedIndexRef.current = foundIndex;
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        if (isProgrammaticScrollRef.current) return;
        setCurrentParagraphIndex(lastComputedIndexRef.current);
      }, 150);
    }
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

            {/* Sleep Timer */}
            <div className="border-t border-border my-2" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Hẹn giờ tắt
                </h4>
                {sleepTimer !== null && (
                  <span className="text-xs font-semibold px-2 py-0.5 bg-primary/10 text-primary rounded-full animate-pulse">
                    Còn {formatTimeLeft(timeLeft)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {[
                  { label: "Tắt", value: null },
                  { label: "10p", value: 10 },
                  { label: "20p", value: 20 },
                  { label: "30p", value: 30 },
                  { label: "45p", value: 45 },
                  { label: "60p", value: 60 },
                ].map((option) => (
                  <button
                    key={option.label}
                    onClick={() => {
                      if (option.value === null) {
                        stopSleepTimer();
                      } else {
                        startSleepTimer(option.value);
                      }
                    }}
                    className={`py-2 px-0.5 text-center text-xs font-medium rounded-lg border transition-all ${
                      (option.value === null && sleepTimer === null) || (option.value !== null && sleepTimer === option.value)
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-muted/50 hover:bg-muted border-transparent text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete current chapter */}
            <div className="border-t border-border my-2" />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 bg-destructive/10 text-destructive rounded-full font-medium hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Xóa chương hiện tại
            </button>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-primary text-white rounded-full font-medium hover:opacity-90 transition-opacity"
            >
              Xong
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-card w-full max-w-sm rounded-3xl p-6 shadow-xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-medium mb-2">Xác nhận xóa</h3>
              <p className="text-sm text-muted-foreground">
                Bạn có chắc muốn xóa Chương {chapter?.chapter_number}? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-muted text-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteCurrentChapter()}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
              >
                Xóa
              </button>
            </div>
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
