import React, { useState, useEffect, useRef } from "react";
import "./App.css";

// Local Storage utility functions for offline functionality
const LocalStorage = {
  // Save reminder settings
  saveReminderSettings: (settings) => {
    localStorage.setItem('reminderSettings', JSON.stringify(settings));
  },
  
  // Load reminder settings
  loadReminderSettings: () => {
    const settings = localStorage.getItem('reminderSettings');
    return settings ? JSON.parse(settings) : {
      text: "Time to take a break!",
      intervalValue: 5,
      intervalUnit: "minutes",
      notificationDuration: 10 // Default 10 seconds
    };
  },
  
  // Save reminders history (for future features)
  saveRemindersHistory: (reminders) => {
    localStorage.setItem('remindersHistory', JSON.stringify(reminders));
  },
  
  // Load reminders history
  loadRemindersHistory: () => {
    const history = localStorage.getItem('remindersHistory');
    return history ? JSON.parse(history) : [];
  },
  
  // Add reminder to history
  addReminderToHistory: (reminder) => {
    const history = LocalStorage.loadRemindersHistory();
    const newReminder = {
      id: Date.now().toString(),
      text: reminder.text,
      interval: reminder.interval,
      timestamp: new Date().toISOString(),
      duration: reminder.duration
    };
    history.unshift(newReminder);
    // Keep only last 50 reminders
    if (history.length > 50) {
      history.splice(50);
    }
    LocalStorage.saveRemindersHistory(history);
    return newReminder;
  }
};

const App = () => {
  // Load initial settings from localStorage
  const initialSettings = LocalStorage.loadReminderSettings();
  
  const [reminderText, setReminderText] = useState(initialSettings.text);
  const [intervalValue, setIntervalValue] = useState(initialSettings.intervalValue);
  const [intervalUnit, setIntervalUnit] = useState(initialSettings.intervalUnit);
  const [notificationDuration, setNotificationDuration] = useState(initialSettings.notificationDuration);
  const [isActive, setIsActive] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [nextReminderTime, setNextReminderTime] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [permissionDeniedCount, setPermissionDeniedCount] = useState(0);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const deferredPrompt = useRef(null);
  const reminderIdRef = useRef(Date.now());
  const keepAliveIntervalRef = useRef(null);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const settings = {
      text: reminderText,
      intervalValue: intervalValue,
      intervalUnit: intervalUnit,
      notificationDuration: notificationDuration
    };
    LocalStorage.saveReminderSettings(settings);
  }, [reminderText, intervalValue, intervalUnit, notificationDuration]);

  // Calculate interval in milliseconds
  const getIntervalMs = () => {
    return intervalUnit === "seconds" ? intervalValue * 1000 : intervalValue * 60 * 1000;
  };

  // Get notification duration in milliseconds
  const getNotificationDurationMs = () => {
    return notificationDuration * 1000;
  };

  // Enhanced notification permission check with better user interaction handling
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      
      // Check if user has denied permission multiple times
      const deniedCount = parseInt(localStorage.getItem('notificationDeniedCount') || '0');
      setPermissionDeniedCount(deniedCount);
      
      if (deniedCount >= 2 && Notification.permission === 'denied') {
        setShowPermissionHelp(true);
      }
    }

    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setShowInstallPrompt(true);
      console.log('PWA install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      setShowInstallPrompt(false);
      console.log('PWA is installed and running in standalone mode');
    }

    // Enhanced service worker registration with better background persistence
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          console.log('Service Worker registered successfully:', registration);
          
          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('New service worker installed');
                  // Don't auto-refresh, let user decide
                }
              });
            }
          });
          
          // Keep service worker alive with periodic messages
          if (registration.active) {
            startKeepAlive();
          }
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }

    // Handle page visibility changes for better background behavior
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('App went to background - service worker should maintain reminders');
      } else {
        console.log('App came to foreground');
        // Sync state with service worker
        if (isActive) {
          setNextReminderTime(calculateNextReminderTime());
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopKeepAlive();
    };
  }, []);

  // Keep service worker alive
  const startKeepAlive = () => {
    keepAliveIntervalRef.current = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          if (event.data.type === 'KEEP_ALIVE_ACK') {
            console.log('Service worker is alive');
          }
        };
        
        navigator.serviceWorker.controller.postMessage(
          { type: 'KEEP_ALIVE' },
          [messageChannel.port2]
        );
      }
    }, 25000); // Every 25 seconds
  };

  const stopKeepAlive = () => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  };

  // Enhanced PWA installation with better Android support
  const handleInstallClick = async () => {
    if (!deferredPrompt.current) {
      // For Android Chrome, provide manual installation instructions
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isChrome = /Chrome/i.test(navigator.userAgent);
      const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
      
      if (isAndroid && isChrome) {
        alert(
          "To install this app:\n\n" +
          "1. Tap the three dots (⋮) in Chrome\n" +
          "2. Select 'Add to Home screen'\n" +
          "3. Choose 'Install' (not just 'Add')\n" +
          "4. Tap 'Install' when prompted\n\n" +
          "The app will then appear in your app drawer like other apps!"
        );
      } else if (isSafari) {
        alert(
          "To install this app on Safari:\n\n" +
          "1. Tap the Share button (📤)\n" +
          "2. Select 'Add to Home Screen'\n" +
          "3. Tap 'Add' when prompted\n\n" +
          "The app will appear on your home screen!"
        );
      } else {
        alert("This app can be installed on supported browsers. Try using Chrome on Android or Safari on iOS.");
      }
      return;
    }

    try {
      // Show the install prompt
      deferredPrompt.current.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.current.userChoice;

      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setShowInstallPrompt(false);
      } else {
        console.log('User dismissed the install prompt');
      }

      // Clear the saved prompt since it can't be used again
      deferredPrompt.current = null;
    } catch (error) {
      console.error('Error during installation:', error);
      
      // Fallback for manual installation
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isChrome = /Chrome/i.test(navigator.userAgent);
      
      if (isAndroid && isChrome) {
        alert(
          "To install this app manually:\n\n" +
          "1. Open Chrome menu (three dots)\n" +
          "2. Select 'Add to Home screen'\n" +
          "3. Choose 'Install' (not just 'Add')\n" +
          "4. Tap 'Install' when prompted\n\n" +
          "The app will appear in your app drawer!"
        );
      } else {
        alert(
          "To install this app manually:\n\n" +
          "1. Open browser menu\n" +
          "2. Select 'Add to Home screen' or 'Install'\n" +
          "3. Tap 'Install' when prompted\n\n" +
          "The app will appear on your device!"
        );
      }
    }
  };

  // Enhanced notification permission request with proper user interaction handling
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("This browser doesn't support notifications");
      return false;
    }

    // Check current permission status
    const currentPermission = Notification.permission;
    console.log('Current notification permission:', currentPermission);

    if (currentPermission === "granted") {
      setNotificationPermission("granted");
      return true;
    }

    if (currentPermission === "denied") {
      // Handle denied permissions with better user guidance
      const deniedCount = permissionDeniedCount + 1;
      setPermissionDeniedCount(deniedCount);
      localStorage.setItem('notificationDeniedCount', deniedCount.toString());
      
      if (deniedCount >= 2) {
        setShowPermissionHelp(true);
        alert(
          "Notification permissions have been denied. To enable notifications:\n\n" +
          "1. Click the lock icon (🔒) in your browser's address bar\n" +
          "2. Find 'Notifications' and set it to 'Allow'\n" +
          "3. Refresh the page and try again\n\n" +
          "Or check your browser settings for this site."
        );
      } else {
        alert(
          "Notifications are currently blocked. Please allow notifications for reminders to work properly.\n\n" +
          "Click the lock icon in your browser's address bar to change this setting."
        );
      }
      return false;
    }

    try {
      // Request permission - this MUST be called from a user interaction
      const permission = await Notification.requestPermission();
      console.log('Notification permission request result:', permission);
      
      setNotificationPermission(permission);
      
      if (permission === "granted") {
        console.log("Notification permission granted!");
        // Reset denied count on successful grant
        setPermissionDeniedCount(0);
        localStorage.removeItem('notificationDeniedCount');
        setShowPermissionHelp(false);
        return true;
      } else if (permission === "denied") {
        const deniedCount = permissionDeniedCount + 1;
        setPermissionDeniedCount(deniedCount);
        localStorage.setItem('notificationDeniedCount', deniedCount.toString());
        
        alert(
          "Notification permission was denied. To enable notifications:\n\n" +
          "1. Click the lock icon (🔒) in your browser's address bar\n" +
          "2. Set 'Notifications' to 'Allow'\n" +
          "3. Refresh the page and try again"
        );
        return false;
      } else {
        console.log("Notification permission dismissed");
        return false;
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      alert("Failed to request notification permission. Please try again.");
      return false;
    }
  };

  // Enhanced notification system with background support
  const showNotification = () => {
    try {
      if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return;
      }

      if (Notification.permission !== "granted") {
        console.log("Notification permission not granted:", Notification.permission);
        return;
      }

      // Use service worker for persistent background notifications
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send message to service worker for persistent notification
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: 'Smart Reminder',
          body: reminderText,
          tag: 'reminder-' + Date.now(),
          duration: getNotificationDurationMs()
        });
        console.log('Persistent notification requested via service worker');
      } else {
        console.log('Service worker not ready, using fallback notification');
        
        // Fallback to regular web notification
        const notification = new Notification("Smart Reminder", {
          body: reminderText,
          icon: "/icon-192x192.png",
          badge: "/icon-192x192.png",
          tag: "reminder-notification",
          requireInteraction: false,
          silent: false,
          timestamp: Date.now(),
          renotify: true
        });

        // Auto-dismiss after custom duration
        setTimeout(() => {
          try {
            notification.close();
          } catch (e) {
            console.log("Error closing notification:", e);
          }
        }, getNotificationDurationMs());

        // Handle notification click
        notification.onclick = function(event) {
          try {
            event.preventDefault();
            window.focus();
            this.close();
          } catch (e) {
            console.log("Error handling notification click:", e);
          }
        };
      }

    } catch (error) {
      console.error("Error creating notification:", error);
    }
  };

  // Calculate next reminder time
  const calculateNextReminderTime = () => {
    const now = new Date();
    const next = new Date(now.getTime() + getIntervalMs());
    return next;
  };

  // Update next reminder time every second when active
  useEffect(() => {
    if (isActive) {
      const timer = setInterval(() => {
        setNextReminderTime(calculateNextReminderTime());
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setNextReminderTime(null);
    }
  }, [isActive, intervalValue, intervalUnit]);

  // Enhanced start reminders with background support
  const startReminders = async () => {
    if (!reminderText.trim()) {
      alert("Please enter a reminder message!");
      return;
    }

    if (intervalValue < 1) {
      const unit = intervalUnit === "seconds" ? "second" : "minute";
      alert(`Please enter a valid interval (minimum 1 ${unit})!`);
      return;
    }

    // Enhanced permission check with proper user interaction
    if (notificationPermission !== "granted") {
      console.log('Requesting notification permission from user interaction');
      const granted = await requestNotificationPermission();
      if (!granted) {
        console.log('Notification permission not granted, cannot start reminders');
        return;
      }
    }

    const reminderId = Date.now().toString();
    reminderIdRef.current = reminderId;
    
    setIsActive(true);
    setNextReminderTime(calculateNextReminderTime());
    
    console.log('Starting enhanced reminders with background support');
    
    // Show first notification immediately and add to history
    const reminderEntry = {
      text: reminderText,
      interval: getIntervalMs(),
      duration: getNotificationDurationMs()
    };
    LocalStorage.addReminderToHistory(reminderEntry);
    showNotification();
    
    // Start background reminders via service worker for better persistence
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'START_BACKGROUND_REMINDERS',
        text: reminderText,
        interval: getIntervalMs(),
        duration: getNotificationDurationMs(),
        id: reminderId
      });
      console.log('Background reminders started via service worker');
    }
    
    // Also maintain main thread interval as backup
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        // Only show notifications from main thread when app is visible
        // Service worker handles background notifications
        showNotification();
      }
    }, getIntervalMs());
  };

  // Enhanced stop reminders
  const stopReminders = () => {
    console.log('Stopping all reminders');
    
    setIsActive(false);
    setNextReminderTime(null);
    
    // Stop main thread interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Stop background reminders via service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STOP_BACKGROUND_REMINDERS',
        id: reminderIdRef.current
      });
      console.log('Background reminders stopped via service worker');
    }
  };

  // Format time for display
  const formatTime = (date) => {
    if (!date) return "";
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReminders();
    };
  }, []);

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex flex-col overflow-hidden">
      {/* Header - Compact */}
      <div className="flex-shrink-0 text-center py-4 px-4">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500 rounded-full mb-2">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Smart Reminders</h1>
        
        {/* PWA Install Prompt - Inline and Compact */}
        {showInstallPrompt && (
          <div className="mt-2">
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-full transition-colors duration-200"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Install App
            </button>
          </div>
        )}
      </div>

      {/* Main Content - Single Page Layout */}
      <div className="flex-1 flex flex-col px-4 pb-4 max-w-md mx-auto w-full overflow-hidden">
        
        {/* Notification Permission Alert - Compact */}
        {(notificationPermission === "denied" || showPermissionHelp) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex-shrink-0">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-red-800 text-xs font-medium">Notifications Blocked</p>
                <p className="text-red-700 text-xs">Enable in browser settings or click the lock icon 🔒 in address bar</p>
              </div>
            </div>
          </div>
        )}

        {/* Status Card - Compact */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-3 border border-gray-100 flex-shrink-0">
          <div className="text-center">
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mb-2 ${
              isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`}></div>
              {isActive ? 'Active' : 'Inactive'}
            </div>
            
            {isActive && nextReminderTime ? (
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">Next reminder:</p>
                <p className="text-sm font-mono font-bold text-blue-600">
                  {formatTime(nextReminderTime)}
                </p>
              </div>
            ) : (
              <p className="text-gray-500 text-xs">Click Start to begin</p>
            )}
          </div>
        </div>

        {/* Form Card - Main Content Area */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex-1 flex flex-col min-h-0">
          <form onSubmit={(e) => { e.preventDefault(); isActive ? stopReminders() : startReminders(); }} className="flex flex-col h-full">
            
            {/* Reminder Text Input - Compact */}
            <div className="mb-3">
              <label htmlFor="reminderText" className="block text-xs font-medium text-gray-700 mb-1">
                Reminder Message
              </label>
              <textarea
                id="reminderText"
                value={reminderText}
                onChange={(e) => setReminderText(e.target.value)}
                placeholder="Enter your reminder message..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none bg-white text-gray-900 placeholder-gray-500 text-sm"
                rows="2"
                disabled={isActive}
              />
            </div>

            {/* Interval Dropdown - Compact */}
            <div className="mb-3">
              <label htmlFor="interval" className="block text-xs font-medium text-gray-700 mb-1">
                Reminder Interval
              </label>
              <div className="relative">
                <select
                  id="interval"
                  value={`${intervalValue}-${intervalUnit}`}
                  onChange={(e) => {
                    const [value, unit] = e.target.value.split('-');
                    setIntervalValue(parseInt(value));
                    setIntervalUnit(unit);
                  }}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900 appearance-none cursor-pointer text-sm"
                  disabled={isActive}
                >
                  <option value="20-seconds">20 seconds</option>
                  <option value="30-seconds">30 seconds</option>
                  {[...Array(30)].map((_, index) => {
                    const minutes = index + 1;
                    return (
                      <option key={`${minutes}-minutes`} value={`${minutes}-minutes`}>
                        {minutes} minute{minutes > 1 ? 's' : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Notification Duration Dropdown - New Feature */}
            <div className="mb-4">
              <label htmlFor="notificationDuration" className="block text-xs font-medium text-gray-700 mb-1">
                Notification Duration
              </label>
              <div className="relative">
                <select
                  id="notificationDuration"
                  value={notificationDuration}
                  onChange={(e) => setNotificationDuration(parseInt(e.target.value))}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white text-gray-900 appearance-none cursor-pointer text-sm"
                  disabled={isActive}
                >
                  {[...Array(20)].map((_, index) => {
                    const seconds = index + 1;
                    return (
                      <option key={seconds} value={seconds}>
                        {seconds} second{seconds > 1 ? 's' : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Action Button - Bottom of form */}
            <div className="mt-auto">
              <button
                type="submit"
                className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 text-sm ${
                  isActive 
                    ? 'bg-red-500 hover:bg-red-600 focus:ring-red-200' 
                    : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-200'
                }`}
              >
                {isActive ? (
                  <span className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6" />
                    </svg>
                    Stop Reminders
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-8h5l-5-5-5 5h5v8z" />
                    </svg>
                    Start Reminders
                  </span>
                )}
              </button>
              
              {/* Info - Very Compact */}
              <div className="mt-2 text-center">
                <p className="text-xs text-gray-500">
                  Works in background • Auto-dismiss in 10s
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;