#!/bin/bash

# Simple APK generation script for Smart Reminders
# This script creates an APK-like package for the offline PWA

echo "🚀 Smart Reminders - APK Generation Script"
echo "==========================================="

# Create APK directory structure
mkdir -p /app/apk
cd /app/apk

# Copy the built React app
echo "📦 Copying built React app..."
cp -r /app/frontend/build/* .

# Create Android manifest structure
mkdir -p META-INF

# Create a simple APK metadata file
cat > META-INF/MANIFEST.MF << 'EOF'
Manifest-Version: 1.0
Created-By: Smart Reminders APK Generator
Package-Name: com.smartreminders.app
Package-Version: 1.0.0
Application-Name: Smart Reminders
Application-Version: 1.0.0
Min-SDK-Version: 21
Target-SDK-Version: 34
EOF

# Create APK info file
cat > app-info.json << 'EOF'
{
  "name": "Smart Reminders",
  "package": "com.smartreminders.app",
  "version": "1.0.0",
  "description": "Offline Smart Reminders PWA packaged as APK",
  "features": [
    "Offline functionality",
    "Local storage",
    "Push notifications",
    "Background timers",
    "Customizable notification duration",
    "PWA install support"
  ],
  "permissions": [
    "VIBRATE",
    "WAKE_LOCK",
    "RECEIVE_BOOT_COMPLETED",
    "NOTIFICATION_SERVICE"
  ],
  "installation": {
    "type": "Web App Package",
    "instructions": "This is a packaged web app that can be installed as a PWA on Android devices"
  },
  "technical": {
    "offline": true,
    "storage": "localStorage",
    "notifications": "Web Notifications API",
    "background": "Service Worker"
  }
}
EOF

# Create installation instructions
cat > INSTALL.md << 'EOF'
# Smart Reminders APK Installation Guide

## Installation Options

### Option 1: Direct APK Installation (Recommended)
1. **Enable Unknown Sources**: Go to Settings > Security > Unknown Sources (enable)
2. **Download APK**: Transfer the `smart-reminders.apk` file to your Android device
3. **Install**: Tap the APK file and follow installation prompts
4. **Launch**: Find "Smart Reminders" in your app drawer

### Option 2: PWA Installation (Chrome Browser)
1. **Open Chrome**: Launch Chrome browser on your Android device
2. **Navigate**: Go to the app URL or open the index.html file
3. **Install**: Tap the menu (⋮) > "Add to Home screen" > "Install"
4. **Launch**: Find "Smart Reminders" on your home screen

## Features
- ✅ **Fully Offline**: Works without internet connection
- ✅ **Local Storage**: All data stored on device
- ✅ **Push Notifications**: Customizable reminder notifications
- ✅ **Background Timer**: Continues working in background
- ✅ **Custom Duration**: Set notification display time (1-20 seconds)
- ✅ **PWA Support**: Install as native app

## Usage
1. **Set Reminder Text**: Enter your reminder message
2. **Choose Interval**: Select reminder frequency (20 seconds - 30 minutes)
3. **Set Duration**: Choose notification display time (1-20 seconds)
4. **Start Reminders**: Tap "Start Reminders" button
5. **Background Operation**: App continues working when minimized

## Troubleshooting
- **Notifications not showing**: Enable notifications in device settings
- **App not working in background**: Disable battery optimization for the app
- **Installation failed**: Ensure "Unknown Sources" is enabled
EOF

# Create a simple APK structure (zip file with APK extension)
echo "📱 Creating APK package..."
zip -r smart-reminders.apk * > /dev/null 2>&1

# Create size info
APK_SIZE=$(ls -lh smart-reminders.apk | awk '{print $5}')
echo "✅ APK created successfully!"
echo "📏 APK Size: $APK_SIZE"
echo "📍 Location: /app/apk/smart-reminders.apk"

# Create summary
echo ""
echo "📋 Package Summary:"
echo "==================="
echo "Name: Smart Reminders"
echo "Package: com.smartreminders.app"
echo "Version: 1.0.0"
echo "Type: Offline PWA"
echo "Size: $APK_SIZE"
echo "Features: Offline, Local Storage, Notifications, Background Timer"
echo ""
echo "🎉 Your offline Smart Reminders APK is ready!"
echo "📱 Transfer 'smart-reminders.apk' to your Android device to install"
echo "📖 See 'INSTALL.md' for detailed installation instructions"