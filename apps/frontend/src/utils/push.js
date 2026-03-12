import { APP_BASE_PATH } from '../config.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function registerPushServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register(`${APP_BASE_PATH}/sw.js`);
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await registerPushServiceWorker();
  return registration?.pushManager.getSubscription();
}

export async function subscribeToPush(vapidPublicKey) {
  const registration = await registerPushServiceWorker();
  if (!registration) {
    throw new Error('Push notifications are not supported.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Push permission was not granted.');
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
