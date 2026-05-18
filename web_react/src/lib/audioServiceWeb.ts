// Web implementation of Audio Service Plugin
import { WebPlugin } from '@capacitor/core';
import type { AudioServicePlugin } from './audioService';

export class AudioServiceWeb extends WebPlugin implements AudioServicePlugin {
  async startService(options: { title: string; artist: string; coverUrl: string }): Promise<void> {
    console.log('[AudioServiceWeb] startService called with:', options);
  }

  async stopService(): Promise<void> {
    console.log('[AudioServiceWeb] stopService called');
  }

  async updateMetadata(options: { title: string; artist: string }): Promise<void> {
    console.log('[AudioServiceWeb] updateMetadata called with:', options);
  }

  async updatePlaybackState(options: { isPlaying: boolean }): Promise<void> {
    console.log('[AudioServiceWeb] updatePlaybackState called with:', options);
  }
}
