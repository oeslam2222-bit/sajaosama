/**
 * Ezz Notification & Audio Alert System
 * Optimized for Drivers & Background Execution:
 * - Prioritizes Audio & Speech Synthesis FIRST, then displays native/SW background notifications.
 * - Keeps Web Audio API primed across tab focus / background transitions.
 * - Handles ServiceWorker background push and client postMessage notifications.
 */

// --- Notification Permission & Service Worker Helpers ---

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

/**
 * Send a native browser or ServiceWorker notification.
 * Uses ServiceWorker registration if available for better background persistence.
 */
export const sendNativeNotification = (title: string, body: string, icon = '🚖', tag?: string) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const iconDataUrl = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${icon}</text></svg>`;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    icon: iconDataUrl,
    badge: iconDataUrl,
    tag: tag || title,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300, 100, 400],
    data: { dateOfArrival: Date.now(), url: '/' },
  };

  // Try via active ServiceWorker postMessage or showNotification
  if ('serviceWorker' in navigator) {
    if (navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_BACKGROUND_NOTIFICATION',
          title,
          body,
          icon: iconDataUrl,
          tag: tag || title,
          vibrate: [300, 100, 300, 100, 400],
        });
        return;
      } catch (e) {
        console.warn('SW postMessage failed, falling back to registration:', e);
      }
    }

    navigator.serviceWorker.ready
      .then((reg) => {
        reg.showNotification(title, options).catch(() => {
          fallbackNativeNotification(title, options);
        });
      })
      .catch(() => {
        fallbackNativeNotification(title, options);
      });
  } else {
    fallbackNativeNotification(title, options);
  }
};

const fallbackNativeNotification = (title: string, options: NotificationOptions) => {
  try {
    new Notification(title, options);
  } catch (e) {
    console.warn('Fallback native notification failed:', e);
  }
};

// --- Browser Title Flashing Helper ---
let flashInterval: ReturnType<typeof setInterval> | null = null;
const originalTitle = typeof document !== 'undefined' ? document.title : 'Ezz Ride';

export const startTitleFlash = (message: string) => {
  if (typeof document === 'undefined') return;
  if (flashInterval) clearInterval(flashInterval);
  let isMsg = false;
  flashInterval = setInterval(() => {
    document.title = isMsg ? message : originalTitle;
    isMsg = !isMsg;
  }, 1000);
};

export const stopTitleFlash = () => {
  if (typeof document === 'undefined') return;
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  document.title = originalTitle;
};

// --- Mobile Vibration Helper ---
export const triggerVibration = (pattern: number | number[] = [300, 100, 300, 100, 400]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn('Vibration API not supported or blocked:', e);
    }
  }
};

// --- Web Audio API Synthesizers (Audio Context & Priming) ---

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

export const getAudioContext = (): AudioContext => {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

/**
 * Prime and unlock AudioContext on user interaction so background alerts play without browser blockage
 */
export const unlockAudioContext = () => {
  if (audioUnlocked) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Play a 0.001s silent buffer to permanently unlock
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
    console.log('[Ezz Audio] Web Audio Context successfully unlocked');
  } catch (e) {
    console.warn('[Ezz Audio] Could not unlock Web Audio Context:', e);
  }
};

// Auto-attach unlock listeners on first user gesture
if (typeof window !== 'undefined') {
  const userGestureEvents = ['click', 'touchstart', 'pointerdown', 'keydown'];
  const handleGesture = () => {
    unlockAudioContext();
    userGestureEvents.forEach((evt) => window.removeEventListener(evt, handleGesture));
  };
  userGestureEvents.forEach((evt) => window.addEventListener(evt, handleGesture, { passive: true }));

  // Re-resume on visibility change if driver returns or tab wakes up
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  });
}

export const playRingtoneAlert = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Dual-tone phone ring alert (853Hz + 960Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(853, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(960, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.setValueAtTime(0.35, now + 0.02);
    gainNode.gain.setValueAtTime(0, now + 0.4);
    gainNode.gain.setValueAtTime(0.35, now + 0.6);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.1);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.2);
    osc2.stop(now + 1.2);
  } catch (err) {
    console.warn('Ringtone playback error:', err);
  }
};

/**
 * Play synthesized high-attention sounds using Web Audio API
 */
export const playNotificationSound = (type: 'new_trip' | 'trip_accepted' | 'chat_message' | 'trip_completed' | 'alert' | 'ringtone') => {
  try {
    if (type === 'ringtone') {
      playRingtoneAlert();
      return;
    }
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'new_trip') {
      playRingtoneAlert();
      // Powerful alternating double-chime siren (attention grabber for driver)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(659.25, now + 0.15); // E5
      osc1.frequency.setValueAtTime(587.33, now + 0.3); // D5
      osc1.frequency.setValueAtTime(659.25, now + 0.45); // E5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(293.66, now); // D4
      osc2.frequency.setValueAtTime(329.63, now + 0.15); // E4

      gainNode.gain.setValueAtTime(0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);

    } else if (type === 'trip_accepted') {
      // Upward major arpeggio chime (for rider)
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.36); // C6

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.75);

    } else if (type === 'chat_message') {
      // Quick bubble double-pop
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1200, now + 0.08); // High pop

      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);

    } else if (type === 'trip_completed') {
      // Warm, rich multi-tone success chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.2);
      osc1.frequency.setValueAtTime(1046.50, now + 0.4);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(261.63, now);
      osc2.frequency.setValueAtTime(392.00, now + 0.3);

      gainNode.gain.setValueAtTime(0.35, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);

    } else if (type === 'alert') {
      // Strong dual-frequency caution chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(445, now);

      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    }
  } catch (err) {
    console.warn('Web Audio Playback issue:', err);
  }
};

/**
 * Text-to-Speech synthesis helper
 */
export const speakText = (text: string, lang = 'ar-EG') => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel(); // Cancel active speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-EG';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const egVoice = voices.find(v => v.lang.includes('ar-EG') || v.lang.includes('ar_EG')) ||
                        voices.find(v => v.lang.startsWith('ar'));
        if (egVoice) {
          utterance.voice = egVoice;
        }
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed:', e);
    }
  }
};

/**
 * Priority Alert Driver Helper:
 * Ensures strict execution order:
 * 1. Audio Sound Playback
 * 2. Speech Synthesis / Voice Announcement
 * 3. Mobile Device Vibration
 * 4. Background Native / Service Worker Notification
 */
export const notifyDriverWithAudioFirst = async ({
  title,
  body,
  soundType = 'new_trip',
  speechText,
  lang = 'ar-EG',
  tag,
}: {
  title: string;
  body: string;
  soundType?: 'new_trip' | 'trip_accepted' | 'chat_message' | 'trip_completed' | 'alert';
  speechText?: string;
  lang?: string;
  tag?: string;
}) => {
  // --- PRIORITY 1: AUDIO & VOICE & VIBRATION FIRST ---
  try {
    playNotificationSound(soundType);
    if (speechText) {
      speakText(speechText, lang);
    }
    triggerVibration([300, 100, 300, 100, 400]);
    startTitleFlash(`🚨 ${title}`);
  } catch (e) {
    console.warn('Audio priority step failed:', e);
  }

  // --- PRIORITY 2: NATIVE / SERVICE WORKER NOTIFICATION SECOND ---
  try {
    sendNativeNotification(title, body, '🚖', tag);
  } catch (e) {
    console.warn('Native notification step failed:', e);
  }
};

/**
 * Initialize Firebase FCM Service Worker & token subscription
 */
export const initFirebaseFCM = async (onMessageCallback?: (payload: any) => void) => {
  try {
    const { requestFCMToken, subscribeForegroundFCM } = await import('../firebase');
    const token = await requestFCMToken();
    if (token) {
      console.log('[FCM Init] Device FCM token obtained:', token);
    }
    if (onMessageCallback) {
      subscribeForegroundFCM(onMessageCallback);
    }
    return token;
  } catch (err) {
    console.warn('[FCM Init] Failed to initialize FCM:', err);
    return null;
  }
};

let alarmInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Loud repeating driver alarm that rings periodically until trip is accepted or dismissed.
 * Follows strict priority: Audio -> Speech -> Vibration -> Title Flash -> Background Push Notification.
 */
export const startLoudRepeatingAlarm = (
  messageEn: string,
  soundType: 'new_trip' | 'alert' | 'trip_accepted' = 'new_trip',
  arabicMessage?: string
) => {
  if (alarmInterval) {
    clearInterval(alarmInterval);
  }

  const voiceMsg = arabicMessage || messageEn;
  const displayTitle = arabicMessage ? '🚖 طلب مشوار جديد!' : '🚖 New Ride Request!';

  // Execute immediate Audio-First alert
  notifyDriverWithAudioFirst({
    title: displayTitle,
    body: voiceMsg,
    soundType,
    speechText: voiceMsg,
    lang: arabicMessage ? 'ar-EG' : 'en-US',
    tag: 'new-driver-trip-alarm',
  });

  // Set repeating interval every 1.8 seconds
  alarmInterval = setInterval(() => {
    // 1. Audio sound
    playNotificationSound(soundType);
    // 2. Speech synthesis
    speakText(voiceMsg, arabicMessage ? 'ar-EG' : 'en-US');
    // 3. Vibration
    triggerVibration([300, 100, 300, 100, 400]);
    // 4. Background notification
    sendNativeNotification(displayTitle, voiceMsg, '🚖', 'new-driver-trip-alarm');
  }, 1800);
};

export const stopLoudRepeatingAlarm = () => {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  stopTitleFlash();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};
