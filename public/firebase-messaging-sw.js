importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "BCpZgxfVSjWFXh3ySZm5oeZb3ak8nEK_zCc9brxVGq-9JVgEIhpiJCOg3169zvMK4OvF3CBGzSq9YpMMnjYaGTE",
  authDomain: "ludepoz.firebaseapp.com",
  projectId: "ludepoz",
  storageBucket: "ludepoz.firebasestorage.app",
  messagingSenderId: "621042040835",
  appId: "1:621042040835:web:011319e9504f928e75ce36"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/logo192.png'
  });
});
