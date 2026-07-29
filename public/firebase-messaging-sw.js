// Firebase Cloud Messaging Service Worker (PWA Background Notifications)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker using applet config credentials
firebase.initializeApp({
  apiKey: "AIzaSyDNuhL_OpNMq2HSFJ6Pz871mSkXCXYwFXA",
  authDomain: "symmetric-setup-kcf5x.firebaseapp.com",
  projectId: "symmetric-setup-kcf5x",
  storageBucket: "symmetric-setup-kcf5x.firebasestorage.app",
  messagingSenderId: "963124202476",
  appId: "1:963124202476:web:6342dc6bb0696b81fa8ec9"
});

const messaging = firebase.messaging();

// Handle Background Push Notifications when PWA is closed or in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'تطبيق عز 🚖 طلب رحلة جديد!';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'لديك إشعار جديد من تطبيق عز لنقل الركاب.',
    icon: payload.notification?.icon || payload.data?.icon || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>',
    tag: payload.data?.tag || 'ezz-fcm-push',
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 400],
    data: payload.data || { url: '/' },
    actions: [
      { action: 'open_app', title: 'فتح التطبيق 🚖' },
      { action: 'dismiss', title: 'إغلاق ✖' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click event handler
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
        return clients.openWindow(event.notification.data?.url || '/');
      }
    })
  );
});
