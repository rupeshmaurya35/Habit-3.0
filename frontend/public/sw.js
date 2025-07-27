/* Enhanced Service Worker for Smart Reminders PWA - Background Persistence & System Notifications */

const CACHE_NAME = 'smart-reminders-v4';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

// Global state for background reminders
let backgroundReminders = new Map();

// Install service worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker
        return self.skipWaiting();
      })
  );
});

// Activate service worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Ensure the service worker takes control immediately
      return self.clients.claim();
    })
  );
});

// Enhanced fetch event with network-first strategy for better PWA experience
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Clone the response for caching
        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(request, responseToCache);
          });
        
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(request);
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, duration } = event.data;
    const dismissTime = duration || 10000; // Default 10 seconds if not specified
    
    // Show persistent system notification (appears even when app is closed)
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: tag || 'reminder',
      requireInteraction: false,
      silent: false,
      persistent: true, // Keep notification persistent
      renotify: true, // Allow renotification with same tag
      timestamp: Date.now(),
      data: {
        url: self.location.origin,
        dismissTime: Date.now() + dismissTime,
        clickAction: 'focus-app'
      },
      actions: [
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/icon-192x192.png'
        }
      ]
    }).then(() => {
      console.log('Persistent system notification shown');
      
      // Auto dismiss after custom duration
      setTimeout(() => {
        self.registration.getNotifications({ tag: tag || 'reminder' })
          .then(notifications => {
            notifications.forEach(notification => {
              if (notification.data && Date.now() >= notification.data.dismissTime) {
                notification.close();
                console.log(`Notification auto-dismissed after ${dismissTime/1000} seconds`);
              }
            });
          });
      }, dismissTime);
    }).catch(error => {
      console.error('Error showing persistent notification:', error);
    });
  }
  
  // Handle background reminder setup
  if (event.data && event.data.type === 'START_BACKGROUND_REMINDERS') {
    const { text, interval, duration, id } = event.data;
    const dismissTime = duration || 10000; // Default 10 seconds if not specified
    console.log('Starting background reminders:', { text, interval, duration, id });
    
    // Store reminder in service worker memory
    backgroundReminders.set(id, {
      text,
      interval,
      duration: dismissTime,
      active: true,
      lastNotification: Date.now()
    });
    
    // Start background reminder loop
    startBackgroundReminder(id, text, interval, dismissTime);
  }
  
  // Handle stopping background reminders
  if (event.data && event.data.type === 'STOP_BACKGROUND_REMINDERS') {
    const { id } = event.data;
    console.log('Stopping background reminders:', id);
    
    if (backgroundReminders.has(id)) {
      backgroundReminders.delete(id);
    }
    
    // Clear any existing notifications
    self.registration.getNotifications().then(notifications => {
      notifications.forEach(notification => {
        if (notification.tag.includes('reminder')) {
          notification.close();
        }
      });
    });
  }
  
  // Handle PWA install event
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle keep alive ping
  if (event.data && event.data.type === 'KEEP_ALIVE') {
    console.log('Service worker keep alive ping received');
    // Send acknowledgment back to main thread
    event.ports[0].postMessage({ type: 'KEEP_ALIVE_ACK' });
  }
});

// Background reminder function
function startBackgroundReminder(id, text, intervalMs, dismissTimeMs) {
  const reminder = backgroundReminders.get(id);
  if (!reminder || !reminder.active) {
    return;
  }
  
  // Show notification
  self.registration.showNotification('Smart Reminder', {
    body: text,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: `background-reminder-${id}`,
    requireInteraction: false,
    silent: false,
    persistent: true,
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: self.location.origin,
      dismissTime: Date.now() + dismissTimeMs,
      reminderId: id
    },
    actions: [
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  }).then(() => {
    console.log('Background reminder notification shown');
    
    // Schedule next reminder
    setTimeout(() => {
      if (backgroundReminders.has(id) && backgroundReminders.get(id).active) {
        startBackgroundReminder(id, text, intervalMs, dismissTimeMs);
      }
    }, intervalMs);
    
    // Auto dismiss after custom duration
    setTimeout(() => {
      self.registration.getNotifications({ tag: `background-reminder-${id}` })
        .then(notifications => {
          notifications.forEach(notification => {
            if (notification.data && Date.now() >= notification.data.dismissTime) {
              notification.close();
              console.log(`Background notification auto-dismissed after ${dismissTimeMs/1000} seconds`);
            }
          });
        });
    }, dismissTimeMs);
  }).catch(error => {
    console.error('Error showing background reminder:', error);
    // Retry after a short delay
    setTimeout(() => {
      if (backgroundReminders.has(id) && backgroundReminders.get(id).active) {
        startBackgroundReminder(id, text, intervalMs, dismissTimeMs);
      }
    }, intervalMs);
  });
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    // Just close the notification
    return;
  }
  
  // Focus or open the app window - critical for background persistence
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window first
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            if ('focus' in client) {
              return client.focus();
            }
          }
        }
        // Open new window if no existing window found
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
      .catch(error => {
        console.error('Error focusing/opening app window:', error);
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification);
  
  // If this was a background reminder, don't stop the sequence
  if (event.notification.tag.includes('background-reminder')) {
    console.log('Background reminder notification closed, sequence continues');
  }
});

// Enhanced PWA install and lifecycle events
self.addEventListener('appinstalled', (event) => {
  console.log('PWA was installed successfully!');
});

// Keep service worker alive with periodic wake-up
setInterval(() => {
  console.log('Service worker heartbeat - staying alive');
}, 30000); // Every 30 seconds

// Background sync for offline reminders
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  if (event.tag === 'reminder-sync') {
    event.waitUntil(
      // Sync any pending reminders
      syncPendingReminders()
    );
  }
});

function syncPendingReminders() {
  return new Promise((resolve) => {
    console.log('Syncing pending reminders...');
    // Check if any background reminders need to be restarted
    backgroundReminders.forEach((reminder, id) => {
      if (reminder.active) {
        console.log('Restarting background reminder:', id);
        startBackgroundReminder(id, reminder.text, reminder.interval);
      }
    });
    resolve();
  });
}

// Handle push notifications (enhanced for better background support)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    console.log('Push notification received:', data);
    
    const options = {
      body: data.body || 'Smart Reminder',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'push-reminder',
      requireInteraction: false,
      persistent: true,
      renotify: true,
      data: {
        url: self.location.origin,
        clickAction: 'focus-app'
      },
      actions: [
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Smart Reminders', options)
    );
  }
});

// Handle service worker lifecycle for better background persistence
self.addEventListener('beforeinstallprompt', (event) => {
  console.log('Service worker beforeinstallprompt event');
});

// Prevent service worker from being killed too aggressively
self.addEventListener('freeze', (event) => {
  console.log('Service worker freeze event - preventing aggressive shutdown');
});

self.addEventListener('resume', (event) => {
  console.log('Service worker resume event - restarting background tasks');
  // Restart any active background reminders
  syncPendingReminders();
});