// Service Worker désactivé pour la V1
// Sera réactivé proprement sur Netlify en V2
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
