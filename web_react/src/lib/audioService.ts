// Capacitor Audio Service Plugin
// Wrapper cho native Android Foreground Service

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export interface AudioServicePlugin {
  startService(options: { title: string; artist: string; coverUrl: string }): Promise<void>;
  stopService(): Promise<void>;
  updateMetadata(options: { title: string; artist: string }): Promise<void>;
  updatePlaybackState(options: { isPlaying: boolean }): Promise<void>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (data: { action: string }) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

console.log('[AudioService] Registering plugin...');
console.log('[AudioService] Platform:', Capacitor.getPlatform());
console.log('[AudioService] Is native platform:', Capacitor.isNativePlatform());

const AudioService = registerPlugin<AudioServicePlugin>('AudioService', {
  web: () => import('./audioServiceWeb').then(m => {
    console.log('[AudioService] Using web implementation');
    return new m.AudioServiceWeb();
  }),
});

console.log('[AudioService] Plugin registered:', AudioService);

export default AudioService;
