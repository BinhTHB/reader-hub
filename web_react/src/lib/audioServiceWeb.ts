// Web implementation of Audio Service Plugin
import { WebPlugin } from '@capacitor/core';
import type { AudioServicePlugin } from './audioService';

export class AudioServiceWeb extends WebPlugin implements AudioServicePlugin {
  async startService(options: { title: string; artist: string; coverUrl: string }): Promise<void> {
    console.log('Audio Service started (Web):', options);
    // Web doesn't need foreground service, Media Session handles it
  }

  async stopService(): Promise<void> {
    console.log('Audio Service stopped (Web)');
  }

  async updateMetadata(options: { title: string; artist: string }): Promise<void> {
    console.log('Audio Service metadata updated (Web):', options);
  }

  async updatePlaybackState(options: { isPlaying: boolean }): Promise<void> {
    console.log('Audio Service playback state updated (Web):', options);
  }
}
