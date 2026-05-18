// Media Session API + Wake Lock API Service
// Cho phép control audio từ notification/lock screen và giữ app hoạt động khi màn hình tắt

let wakeLock: WakeLockSentinel | null = null;

export const mediaService = {
  // Khởi tạo Media Session
  initMediaSession: (chapter: any, storyTitle: string, coverUrl: string) => {
    if (!('mediaSession' in navigator)) {
      console.warn('Media Session API not supported');
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter?.title || `Chương ${chapter?.chapter_number}`,
        artist: storyTitle,
        artwork: [
          {
            src: coverUrl,
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ],
      });

      console.log('Media Session initialized:', {
        title: chapter?.title,
        artist: storyTitle,
      });
    } catch (error) {
      console.error('Error initializing Media Session:', error);
    }
  },

  // Set Media Session action handlers
  setMediaSessionHandlers: (handlers: {
    play: () => void;
    pause: () => void;
    nexttrack: () => void;
    previoustrack: () => void;
  }) => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', handlers.play);
      navigator.mediaSession.setActionHandler('pause', handlers.pause);
      navigator.mediaSession.setActionHandler('nexttrack', handlers.nexttrack);
      navigator.mediaSession.setActionHandler('previoustrack', handlers.previoustrack);

      console.log('Media Session handlers set');
    } catch (error) {
      console.error('Error setting Media Session handlers:', error);
    }
  },

  // Update playback state
  updatePlaybackState: (isPlaying: boolean, currentIndex: number, totalParagraphs: number) => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      
      // Update position state (optional, for progress tracking)
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: totalParagraphs,
          playbackRate: 1,
          position: currentIndex,
        });
      }
    } catch (error) {
      console.error('Error updating playback state:', error);
    }
  },

  // Request Wake Lock (giữ CPU hoạt động khi màn hình tắt)
  requestWakeLock: async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock API not supported');
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock acquired');

      // Release wake lock khi visibility thay đổi
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && wakeLock) {
          wakeLock.release();
          wakeLock = null;
          console.log('Wake Lock released (page hidden)');
        }
      });
    } catch (error) {
      console.error('Error requesting Wake Lock:', error);
    }
  },

  // Release Wake Lock
  releaseWakeLock: async () => {
    if (wakeLock) {
      try {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake Lock released');
      } catch (error) {
        console.error('Error releasing Wake Lock:', error);
      }
    }
  },

  // Check if audio is playing and request wake lock
  ensureWakeLock: async (isPlaying: boolean) => {
    if (isPlaying) {
      await mediaService.requestWakeLock();
    } else {
      await mediaService.releaseWakeLock();
    }
  },
};
