import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import firebaseConfigJson from '../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let messagingPromise: Promise<Messaging | null> | null = null;

export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') return null;
  if (!messagingPromise) {
    messagingPromise = isSupported().then((supported) => {
      if (supported) {
        return getMessaging(app);
      } else {
        console.warn('[FCM] Firebase Messaging is not supported in this browser environment');
        return null;
      }
    }).catch((err) => {
      console.warn('[FCM] Error checking Firebase Messaging support:', err);
      return null;
    });
  }
  return messagingPromise;
};

/**
 * Register Service Worker for FCM background push notifications
 */
export const registerFCMServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    console.log('[FCM SW] Service Worker registered successfully:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[FCM SW] Registration error:', err);
    return null;
  }
};

/**
 * Request FCM Device Token for Push Notifications
 */
export const requestFCMToken = async (vapidKey?: string): Promise<string | null> => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission was denied by user');
      return null;
    }

    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const swReg = await registerFCMServiceWorker();

    const currentToken = await getToken(messaging, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: swReg || undefined,
    });

    if (currentToken) {
      console.log('[FCM Token] Obtained FCM Token:', currentToken);
      localStorage.setItem('ezz_fcm_token', currentToken);
      return currentToken;
    } else {
      console.warn('[FCM] No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.error('[FCM Error] Error retrieving FCM token:', err);
    return null;
  }
};

/**
 * Listen for foreground push messages when app is open
 */
export const subscribeForegroundFCM = async (callback: (payload: any) => void) => {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log('[FCM Message Received Foreground]:', payload);
    callback(payload);
  });
};
