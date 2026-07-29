/**
 * Password Hashing & Security Utilities
 * Uses Web Crypto API for secure password hashing (SHA-256 with salt)
 */

const SALT_PREFIX = 'ezz_salt_';
const HASH_PREFIX = 'ezz_hash_';

/**
 * Generate a UUID v4 without relying on crypto.randomUUID
 * (some environments expose crypto.subtle but not crypto.randomUUID).
 */
export const generateUUID = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: RFC4122 v4 using crypto.getRandomValues when available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }
  } catch (e) {
    console.warn('crypto.getRandomValues failed, falling back to Math.random:', e);
  }
  // Last resort: Math.random based (not cryptographically secure)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Hash a password for storage using Web Crypto API
 * @param password Plain text password
 * @returns Hashed password string (salt_prefix + salt + hash_prefix + hash)
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const salt = generateUUID();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password + salt),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    
    const hashArray = Array.from(new Uint8Array(derivedBits));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `${SALT_PREFIX}${salt}${HASH_PREFIX}${hashHex}`;
  } catch (error) {
    console.warn('Web Crypto API (subtle) unavailable, falling back to basic hash');
    return fallbackHash(password);
  }
};

/**
 * Verify a password against a stored hash
 * @param password Plain text password
 * @param storedHash Stored hashed password
 * @returns true if password matches
 */
export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  try {
    if (!storedHash.includes(HASH_PREFIX)) {
      return false;
    }
    
    const parts = storedHash.split(HASH_PREFIX);
    if (parts.length !== 2) return false;
    
    const salt = parts[0].replace(SALT_PREFIX, '');
    const expectedHash = parts[1];
    
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password + salt),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    
    const hashArray = Array.from(new Uint8Array(derivedBits));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex === expectedHash;
  } catch (error) {
    console.warn('Password verification failed:', error);
    return false;
  }
};

/**
 * Fallback hashing for browsers without Web Crypto API
 * Uses a simple but better-than-nothing approach with timestamp-based salt
 */
const fallbackHash = (password: string): string => {
  const salt = generateUUID();
  const str = password + salt + Date.now();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Add additional entropy with multiple rounds
  let hash2 = 0;
  const str2 = hash.toString() + salt;
  for (let i = 0; i < str2.length; i++) {
    const char = str2.charCodeAt(i);
    hash2 = ((hash2 << 5) - hash2) + char;
    hash2 = hash2 & hash2;
  }
  return `${SALT_PREFIX}${salt}${HASH_PREFIX}${Math.abs(hash).toString(16)}${Math.abs(hash2).toString(16)}`;
};

/**
 * Check if a password hash is using the new secure format
 */
export const isSecureHash = (hash: string | undefined): boolean => {
  return !!hash && hash.includes(SALT_PREFIX) && hash.includes(HASH_PREFIX);
};

/**
 * Rate Limiter for Authentication Attempts
 * Prevents brute force attacks by limiting login attempts per phone number
 * Works in both browser and server environments
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts = 5, windowMs = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    if (now - record.lastAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, lastAttempt: now });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count += 1;
    record.lastAttempt = now;
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  getRemainingAttempts(key: string): number {
    const record = this.attempts.get(key);
    if (!record) return this.maxAttempts;

    const now = Date.now();
    if (now - record.lastAttempt > this.windowMs) {
      return this.maxAttempts;
    }

    return Math.max(0, this.maxAttempts - record.count);
  }

  getRetryAfter(key: string): number {
    const record = this.attempts.get(key);
    if (!record) return 0;

    const elapsed = Date.now() - record.lastAttempt;
    return Math.max(0, Math.ceil((this.windowMs - elapsed) / 1000));
  }
}

// Global rate limiters for rider and driver auth
export const riderAuthLimiter = new RateLimiter(5, 60000); // 5 attempts per minute
export const driverAuthLimiter = new RateLimiter(5, 60000); // 5 attempts per minute
export const adminAuthLimiter = new RateLimiter(3, 60000); // 3 attempts per minute for admin

