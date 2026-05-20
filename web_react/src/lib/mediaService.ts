// Media Session API + Wake Lock API Service
// Cho phép control audio từ notification/lock screen và giữ app hoạt động khi màn hình tắt

let wakeLock: WakeLockSentinel | null = null;
let silentAudio: HTMLAudioElement | null = null;

// Khởi tạo silent audio câm để keep-alive background audio trên web di động
const initSilentAudio = () => {
  if (!silentAudio && typeof window !== 'undefined') {
    try {
      // 1-second silent WAV base64
      silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      silentAudio.loop = true;
      silentAudio.volume = 0.01; // Gần như không nghe thấy để bypass chính sách sleep của trình duyệt
    } catch (e) {
      console.error('Failed to initialize silent audio:', e);
    }
  }
};

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

  // Phát Silent Audio để giữ tiến trình hoạt động khi chạy nền
  playSilentAudio: () => {
    initSilentAudio();
    if (silentAudio) {
      silentAudio.play().then(() => {
        console.log('[MediaService] Silent audio playing (keep-alive)');
      }).catch(err => {
        console.warn('[MediaService] Failed to play silent audio:', err);
      });
    }
  },

  // Tạm dừng Silent Audio
  pauseSilentAudio: () => {
    if (silentAudio) {
      silentAudio.pause();
      console.log('[MediaService] Silent audio paused');
    }
  },

  // Request Wake Lock (giữ CPU hoạt động khi màn hình tắt)
  requestWakeLock: async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock API not supported');
      return;
    }

    try {
      if (wakeLock) {
        return;
      }
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock acquired');

      // Release wake lock khi visibility thay đổi
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && wakeLock) {
          wakeLock.release().then(() => {
            wakeLock = null;
            console.log('Wake Lock released (page hidden)');
          }).catch(e => console.error(e));
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
