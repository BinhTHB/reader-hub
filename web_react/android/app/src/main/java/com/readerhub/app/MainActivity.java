package com.readerhub.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.readerhub.audioservice.AudioServicePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Register custom plugins
        registerPlugin(AudioServicePlugin.class);
    }
}
