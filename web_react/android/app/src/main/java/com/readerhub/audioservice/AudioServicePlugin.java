package com.readerhub.audioservice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AudioService")
public class AudioServicePlugin extends Plugin {

    private static final String CHANNEL_ID = "audio_playback_channel";
    private static final int NOTIFICATION_ID = 1001;
    private NotificationManager notificationManager;

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
    }

    @PluginMethod
    public void startService(PluginCall call) {
        String title = call.getString("title", "Unknown Title");
        String artist = call.getString("artist", "Unknown Artist");
        String coverUrl = call.getString("coverUrl", "");

        try {
            Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("artist", artist);
            serviceIntent.putExtra("coverUrl", coverUrl);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            
            android.util.Log.d("AudioService", "Service started: " + title);
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
