package com.readerhub.audioservice;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "AudioService")
public class AudioServicePlugin extends Plugin {

    private static final String CHANNEL_ID = "audio_playback_channel";
    private NotificationManager notificationManager;

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
        AudioForegroundService.setListener(new AudioForegroundService.ServiceListener() {
            @Override
            public void onMediaAction(String action) {
                JSObject data = new JSObject();
                data.put("action", action);
                notifyListeners("mediaAction", data);
            }

            @Override
            public void onParagraphChanged(int index) {
                JSObject data = new JSObject();
                data.put("index", index);
                notifyListeners("paragraphChanged", data);
            }
        });
    }

    @PluginMethod
    public void startService(PluginCall call) {
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String coverUrl = call.getString("coverUrl", "");
        
        List<String> paragraphsList = new ArrayList<>();
        try {
            com.getcapacitor.JSArray paragraphsArray = call.getArray("paragraphs");
            if (paragraphsArray != null) {
                for (int i = 0; i < paragraphsArray.length(); i++) {
                    paragraphsList.add(paragraphsArray.getString(i));
                }
            }
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Error parsing paragraphs", e);
        }

        int startIndex = call.getInt("startIndex", 0);
        float speechRate = call.getFloat("speechRate", 1.0f);
        float speechPitch = call.getFloat("speechPitch", 1.0f);

        try {
            Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("artist", artist);
            serviceIntent.putExtra("coverUrl", coverUrl);
            serviceIntent.putStringArrayListExtra("paragraphs", new ArrayList<>(paragraphsList));
            serviceIntent.putExtra("startIndex", startIndex);
            serviceIntent.putExtra("speechRate", speechRate);
            serviceIntent.putExtra("speechPitch", speechPitch);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            
            android.util.Log.d("AudioService", "Service started successfully");
            call.resolve();
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Failed to start service", e);
            call.reject("Failed to start service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
            getContext().stopService(serviceIntent);
            android.util.Log.d("AudioService", "Service stopped");
            call.resolve();
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Failed to stop service", e);
            call.reject("Failed to stop service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");

        try {
            Intent intent = new Intent(getContext(), AudioForegroundService.class);
            intent.setAction("UPDATE_METADATA");
            intent.putExtra("title", title);
            intent.putExtra("artist", artist);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            
            android.util.Log.d("AudioService", "Metadata updated: " + title);
            call.resolve();
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Failed to update metadata", e);
            call.reject("Failed to update metadata: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        boolean isPlaying = call.getBoolean("isPlaying", false);

        try {
            Intent intent = new Intent(getContext(), AudioForegroundService.class);
            intent.setAction("UPDATE_PLAYBACK_STATE");
            intent.putExtra("isPlaying", isPlaying);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            
            android.util.Log.d("AudioService", "Playback state updated: " + isPlaying);
            call.resolve();
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Failed to update playback state", e);
            call.reject("Failed to update playback state: " + e.getMessage());
        }
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        int index = call.getInt("index", 0);
        try {
            Intent intent = new Intent(getContext(), AudioForegroundService.class);
            intent.setAction("SEEK_TO");
            intent.putExtra("targetIndex", index);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            android.util.Log.e("AudioService", "Failed to seekTo", e);
            call.reject("Failed to seekTo: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Audio Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for audio playback");
            channel.setShowBadge(false);
            
            notificationManager = getContext().getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
                android.util.Log.d("AudioService", "Notification channel created");
            }
        }
    }
}
