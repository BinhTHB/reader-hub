// Capacitor Audio Service Plugin
// Wrapper cho native Android Foreground Service

import { registerPlugin } from '@capacitor/core';

export interface AudioServicePlugin {
  startService(options: { title: string; artist: string; coverUrl: string }): Promise<void>;
  stopService(): Promise<void>;
  updateMetadata(options: { title: string; artist: string }): Promise<void>;
  updatePlaybackState(options: { isPlaying: boolean }): Promise<void>;
}

const AudioService = registerPlugin<AudioServicePlugin>('AudioService', {
  web: () => import('./audioServiceWeb').then(m => new m.AudioServiceWeb()),
});

export default AudioService;
