// Firebase Messaging Service Worker
// This file MUST be in your public/ folder at the root

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyANHZKNAfYFlEFAQ0lwG50PMOv2OBrEXEY",
  authDomain: "ludepoz.firebaseapp.com",
  projectId: "ludepoz",
  storageBucket: "ludepoz.firebasestorage.app",
  messagingSenderId: "621042040835",
  appId: "1:621042040835:web:011319e9504f928e75ce36"
});

const messaging = firebase.messaging();

// Handle background push notifications (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const title = payload.notification?.title || 'Kampasika';
  const options = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'kampasika-notification',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Open Kampasika' }
    ]
  };

  self.registration.showNotification(title, options);
});

// Handle notification click — open the app and clear notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    // Close all kampasika notifications
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach(n => n.close());
    }).then(() => {
      return clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('kampasika') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow('/');
    })
  );
});
