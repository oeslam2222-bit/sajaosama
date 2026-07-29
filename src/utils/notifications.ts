/**
 * Ezz Notification & Audio Alert System
 * Synthesizes high-quality, rich audio alerts using the Web Audio API (to avoid loading external audio files)
 * and controls browser native push notifications, title flashing, and mobile vibrations.
 */

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

export const sendNativeNotification = (title: string, body: string, icon = '🚗') => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${icon}</text></svg>`,
      });
    } catch (e) {
      console.warn('Native notification failed:', e);
    }
  }
};

// Browser Title Flashing Helper
let flashInterval: ReturnType<typeof setInterval> | null = null;
const originalTitle = document.title;

export const startTitleFlash = (message: string) => {
  if (flashInterval) clearInterval(flashInterval);
  let isMsg = false;
  flashInterval = setInterval(() => {
    document.title = isMsg ? message : originalTitle;
    isMsg = !isMsg;
  }, 1000);
};

export const stopTitleFlash = () => {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  document.title = originalTitle;
};

// Mobile Vibration Helper
export const triggerVibration = (pattern: number | number[]) => {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn('Vibration API not supported or blocked:', e);
    }
  }
};

// --- Web Audio API Synthesizers (100% Client-Side, No File Dependencies) ---

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

/**
 * Play a custom synthesized sound using the Web Audio API.
 * @param type Sound preset type
 */
export const playNotificationSound = (type: 'new_trip' | 'trip_accepted' | 'chat_message' | 'trip_completed' | 'alert') => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'new_trip') {
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

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);

      triggerVibration([100, 50, 100, 50, 200]);

    } else if (type === 'trip_accepted') {
      // Pleasant upward major arpeggio chime (for rider)
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.36); // C6

      gainNode.gain.setValueAtTime(0.25, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.75);

      triggerVibration([150, 100, 150]);

    } else if (type === 'chat_message') {
      // High quick bubble double-pop sound
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1200, now + 0.08); // High pop

      gainNode.gain.setValueAtTime(0.18, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);

      triggerVibration(60);

    } else if (type === 'trip_completed') {
      // Warm, rich multi-tone celebratory success bell
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(587.33, now + 0.1); // D5
      osc1.frequency.setValueAtTime(659.25, now + 0.2); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.3); // G5
      osc1.frequency.setValueAtTime(880.00, now + 0.4); // A5
      osc1.frequency.setValueAtTime(1046.50, now + 0.5); // C6

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(261.63, now); // C4
      osc2.frequency.setValueAtTime(392.00, now + 0.3); // G4

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 1.2);

      triggerVibration([200, 100, 300]);

    } else if (type === 'alert') {
      // Strong dual-frequency caution chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440, now); // A4
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(445, now); // Slightly detuned

      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);

      triggerVibration([100, 100, 100]);
    }
  } catch (err) {
    console.warn('Web Audio Playback blocked or not supported:', err);
  }
};

export const speakText = (text: string, lang = 'ar-EG') => {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel(); // Stop any current speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis failed:', e);
    }
  }
};

let alarmInterval: any = null;

export const startLoudRepeatingAlarm = (message: string, soundType: 'new_trip' | 'alert' | 'trip_accepted' = 'new_trip', arabicMessage?: string) => {
  // Clear any existing alarm
  if (alarmInterval) {
    clearInterval(alarmInterval);
  }

  // Play immediately
  playNotificationSound(soundType);
  if (arabicMessage) {
    speakText(arabicMessage, 'ar-EG');
  } else {
    speakText(message, 'en-US');
  }

  // Set interval to repeat every 1.5 seconds — fast enough to feel continuous
  alarmInterval = setInterval(() => {
    playNotificationSound(soundType);
    if (arabicMessage) {
      speakText(arabicMessage, 'ar-EG');
    } else {
      speakText(message, 'en-US');
    }
  }, 1500);
};

export const stopLoudRepeatingAlarm = () => {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

