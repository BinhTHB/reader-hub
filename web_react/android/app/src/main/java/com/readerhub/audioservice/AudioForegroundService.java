package com.readerhub.audioservice;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.Bridge;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class AudioForegroundService extends Service {

    private static final String CHANNEL_ID = "audio_playback_channel";
    private static final int NOTIFICATION_ID = 1001;
    private NotificationManager notificationManager;
    private String currentTitle = "Unknown Title";
    private String currentArtist = "Unknown Artist";
    private String currentCoverUrl = "";
    private boolean isPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = getSystemService(NotificationManager.class);
        android.util.Log.d("AudioForegroundService", "Service created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        android.util.Log.d("AudioForegroundService", "onStartCommand called");
        
        if (intent != null) {
            String action = intent.getAction();
            
            if (action == null || action.isEmpty()) {
                // Initial start
                currentTitle = intent.getStringExtra("title");
                currentArtist = intent.getStringExtra("artist");
                currentCoverUrl = intent.getStringExtra("coverUrl");
                isPlaying = true;
                android.util.Log.d("AudioForegroundService", "Starting with: " + currentTitle);
            } else if ("UPDATE_METADATA".equals(action)) {
                currentTitle = intent.getStringExtra("title");
                currentArtist = intent.getStringExtra("artist");
                android.util.Log.d("AudioForegroundService", "Metadata updated: " + currentTitle);
            } else if ("UPDATE_PLAYBACK_STATE".equals(action)) {
                isPlaying = intent.getBooleanExtra("isPlaying", false);
                android.util.Log.d("AudioForegroundService", "Playback state: " + isPlaying);
            }
        }

        // Create and show notification
        try {
            Notification notification = createNotification();
            startForeground(NOTIFICATION_ID, notification);
            android.util.Log.d("AudioForegroundService", "Notification shown");
        } catch (Exception e) {
            android.util.Log.e("AudioForegroundService", "Failed to show notification", e);
        }

        return START_STICKY;
    }

    private Notification createNotification() {
        // Get app icon
        int iconResId = getApplicationContext().getResources()
            .getIdentifier("ic_launcher", "mipmap", getPackageName());
        
        if (iconResId == 0) {
            iconResId = android.R.drawable.ic_media_play;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(iconResId)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setShowActionsInCompactView(0, 1, 2))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // Load cover image in background
        if (currentCoverUrl != null && !currentCoverUrl.isEmpty()) {
            try {
                Bitmap bitmap = loadBitmapFromUrl(currentCoverUrl);
                if (bitmap != null) {
                    builder.setLargeIcon(bitmap);
                }
            } catch (Exception e) {
                android.util.Log.e("AudioForegroundService", "Failed to load cover", e);
            }
        }

        // Add media control actions
        builder.addAction(android.R.drawable.ic_media_previous, "Previous", 
            createPendingIntent("PREVIOUS"));
        builder.addAction(
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            isPlaying ? "Pause" : "Play",
            createPendingIntent("PLAY_PAUSE")
        );
        builder.addAction(android.R.drawable.ic_media_next, "Next", 
            createPendingIntent("NEXT"));

        // Tap notification to open app
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.setContentIntent(contentIntent);
        }

        return builder.build();
    }

    private PendingIntent createPendingIntent(String action) {
        Intent intent = new Intent(this, AudioForegroundService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        try {
            URL url = new URL(urlString);
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setDoInput(true);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.connect();
            InputStream input = connection.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            android.util.Log.e("AudioForegroundService", "Failed to load bitmap", e);
            return null;
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
        android.util.Log.d("AudioForegroundService", "Service destroyed");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
