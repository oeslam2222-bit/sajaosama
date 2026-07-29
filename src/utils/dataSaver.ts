// Data Saver Utility for Low-Bandwidth Mobile Networks

export interface DataSaverConfig {
  enabled: boolean;
  autoDetected: boolean;
  effectiveType: string;
  saveDataHeader: boolean;
}

const STORAGE_KEY = 'ezz_data_saver_mode';
const ROUTE_CACHE_KEY = 'ezz_route_cache_v1';

// Read saved preference or auto-detect slow connection
export const getInitialDataSaverState = (): boolean => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
    // Auto-detect network connection status
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (conn) {
      if (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g') {
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
};

export const setDataSaverState = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch (e) {
    // ignore
  }
};

// Calculate adaptive polling interval in ms
export const getAdaptivePollingInterval = (
  baseMs: number,
  isDataSaver: boolean,
  hasActiveTrip: boolean
): number => {
  if (!isDataSaver) return baseMs;
  // If user has an active trip, keep status polling reasonably fast (e.g., 5s instead of 3s)
  if (hasActiveTrip) {
    return Math.max(baseMs, 5000);
  }
  // Idle polling in data saver mode runs every 12s to save mobile bandwidth
  return Math.max(baseMs * 2.5, 10000);
};

// Local Storage Cache for Navigation Routes (OSRM requests)
export const getCachedRoute = (pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number): any | null => {
  try {
    const key = `${pickupLat.toFixed(3)}_${pickupLng.toFixed(3)}_${dropoffLat.toFixed(3)}_${dropoffLng.toFixed(3)}`;
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const item = cache[key];
    if (item && Date.now() - item.timestamp < 24 * 3600 * 1000) { // 24hr cache
      return item.data;
    }
  } catch (e) {
    // ignore
  }
  return null;
};

export const setCachedRoute = (pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, data: any): void => {
  try {
    const key = `${pickupLat.toFixed(3)}_${pickupLng.toFixed(3)}_${dropoffLat.toFixed(3)}_${dropoffLng.toFixed(3)}`;
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    
    // Prune old entries if too big (>50 items)
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      delete cache[keys[0]];
    }

    cache[key] = {
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    // ignore
  }
};
