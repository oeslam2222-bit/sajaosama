// Ezz Ride Hailing PWA Service Worker (v2)
const CACHE_NAME = 'ezz-ride-v2';
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => console.log("Cache error during SW install:", err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Handle background notification requests sent from client application via postMessage
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SHOW_BACKGROUND_NOTIFICATION' || event.data.type === 'DRIVER_TRIP_ALERT')) {
    const { title, body, icon, tag, data, vibrate } = event.data;
    const iconDataUrl = icon || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>';
    
    const options = {
      body: body || 'طلب مشوار جديد متاح للكابتن حالاً!',
      icon: iconDataUrl,
      badge: iconDataUrl,
      tag: tag || 'ezz-driver-alert',
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: vibrate || [300, 100, 300, 100, 400],
      data: data || { url: '/' },
      actions: [
        { action: 'open_app', title: 'عرض المشوار 🚖' },
        { action: 'dismiss', title: 'إغلاق ✖' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title || 'تنبيه كابتن عز 🚖', options)
    );
  }
});

// Listen to incoming Web Push API events
self.addEventListener('push', (event) => {
  let data = { title: 'تطبيق عز 🚖', body: 'تحديث جديد لرحلتك حالاً!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'تطبيق عز 🚖', body: event.data.text() };
    }
  }

  const iconDataUrl = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>';

  const options = {
    body: data.body,
    icon: iconDataUrl,
    badge: iconDataUrl,
    tag: data.tag || 'ezz-push-alert',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300, 100, 400],
    data: {
      dateOfArrival: Date.now(),
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click to focus application window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
