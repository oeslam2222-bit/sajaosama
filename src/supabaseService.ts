import { supabase } from './supabaseClient';
import { Driver, Rider, Location, Trip, SystemStats, Admin, RiderPreferences, AuditLogEntry, PromoCode, Region, Ad } from './types';
import { PAGINATION_PAGE_SIZE } from './constants';
import { verifyPassword, isSecureHash, hashPassword, generateUUID } from './utils/security';

const PAGE_SIZE = PAGINATION_PAGE_SIZE;

// Helper to determine if we can connect to Supabase
let isSupabaseHealthy = true;

export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_stats').select('id').limit(1);
    if (error && error.code === 'PGRST116') {
      // Table exists but is empty
      isSupabaseHealthy = true;
      return true;
    }
    if (error) {
      console.warn('Supabase Connection check failed, falling back to LocalStorage:', error.message);
      isSupabaseHealthy = false;
      return false;
    }
    isSupabaseHealthy = true;
    return true;
  } catch (err) {
    console.warn('Supabase not fully configured or unreachable:', err);
    isSupabaseHealthy = false;
    return false;
  }
};

export const getSupabaseStatus = () => isSupabaseHealthy;

// SQL initialization schema for user convenience
export const SQL_SCHEMA = `-- كابتن عز - قاعدة البيانات الكاملة - انسخ الكود بالكامل والزقه في SQL Editor بـ Supabase

-- ============================================================
-- 1. جدول المواقع
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_locations (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  city TEXT,
  country TEXT,
  x DOUBLE PRECISION,
  y DOUBLE PRECISION
);

-- ============================================================
-- 1b. جدول المناطق الإدارية
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_regions (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  country TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TEXT DEFAULT NOW()::TEXT
);

-- ============================================================
-- 2. جدول الركاب
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_riders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password TEXT,
  balance DOUBLE PRECISION DEFAULT 0,
  rating DOUBLE PRECISION DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  approval_status TEXT DEFAULT 'APPROVED',
  preferences JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE ezz_riders ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'APPROVED';
ALTER TABLE ezz_riders ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- ============================================================
-- 3. جدول الكباتن والسائقين
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password TEXT,
  car_model TEXT,
  car_plate TEXT,
  vehicle_type TEXT,
  vehicle_name TEXT,
  national_id TEXT,
  driver_license TEXT,
  personal_photo TEXT,
  national_id_image TEXT,
  driver_license_image TEXT,
  vehicle_license_image TEXT,
  is_online BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'AVAILABLE',
  approval_status TEXT DEFAULT 'PENDING',
  rating DOUBLE PRECISION DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  total_earnings DOUBLE PRECISION DEFAULT 0,
  total_commission_paid DOUBLE PRECISION DEFAULT 0,
  current_x DOUBLE PRECISION DEFAULT 50,
  current_y DOUBLE PRECISION DEFAULT 50,
  agreed_to_terms BOOLEAN DEFAULT false
);

-- ============================================================
-- 4. جدول الرحلة الحالية النشطة
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_active_trip (
  id TEXT PRIMARY KEY,
  rider_id TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  driver_id TEXT,
  driver_name TEXT,
  pickup JSONB,
  dropoff JSONB,
  status TEXT,
  fare DOUBLE PRECISION,
  commission DOUBLE PRECISION,
  distance DOUBLE PRECISION,
  created_at TEXT,
  completed_at TEXT,
  chat_messages JSONB DEFAULT '[]'::jsonb,
  rider_rating_to_driver DOUBLE PRECISION,
  rider_feedback_tags JSONB DEFAULT '[]'::jsonb,
  rider_feedback_comment TEXT,
  driver_rating_to_rider DOUBLE PRECISION,
  driver_feedback_tags JSONB DEFAULT '[]'::jsonb,
  driver_feedback_comment TEXT,
  pickup_landmark TEXT,
  eta_minutes INTEGER,
  requested_vehicle_type TEXT,
  route_geometry JSONB,
  offered_driver_ids JSONB,
  current_offered_driver_id TEXT,
  dispatch_timer INTEGER,
  dispatch_timer_max INTEGER,
  applied_promo_code TEXT,
  applied_promo_discount DOUBLE PRECISION
);

-- ============================================================
-- 5. جدول سجل الرحلات المكتملة أو الملغاة
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_trips_history (
  id TEXT PRIMARY KEY,
  rider_id TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  driver_id TEXT,
  driver_name TEXT,
  pickup JSONB,
  dropoff JSONB,
  pickup_landmark TEXT,
  status TEXT,
  fare DOUBLE PRECISION,
  commission DOUBLE PRECISION,
  distance DOUBLE PRECISION,
  eta_minutes INTEGER,
  requested_vehicle_type TEXT,
  created_at TEXT,
  completed_at TEXT,
  chat_messages JSONB DEFAULT '[]'::jsonb,
  rider_rating_to_driver DOUBLE PRECISION,
  rider_feedback_tags JSONB DEFAULT '[]'::jsonb,
  rider_feedback_comment TEXT,
  driver_rating_to_rider DOUBLE PRECISION,
  driver_feedback_tags JSONB DEFAULT '[]'::jsonb,
  driver_feedback_comment TEXT,
  route_geometry JSONB,
  offered_driver_ids JSONB,
  current_offered_driver_id TEXT,
   dispatch_timer INTEGER,
   dispatch_timer_max INTEGER,
   applied_promo_code TEXT,
   applied_promo_discount DOUBLE PRECISION
 );

-- ============================================================
-- 5b. جدول الأكواد الترويجية
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_amount DOUBLE PRECISION NOT NULL DEFAULT 5,
  rider_id TEXT,
  trip_id TEXT,
  used BOOLEAN DEFAULT FALSE,
  used_at TEXT,
  created_at TEXT DEFAULT NOW()::TEXT,
  expires_at TEXT
);

ALTER PUBLICATION supabase_realtime ADD TABLE ezz_promo_codes;

ALTER TABLE ezz_promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read promo_codes" ON ezz_promo_codes;
CREATE POLICY "Allow anon read promo_codes" ON ezz_promo_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert promo_codes" ON ezz_promo_codes;
CREATE POLICY "Allow anon insert promo_codes" ON ezz_promo_codes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update promo_codes" ON ezz_promo_codes;
CREATE POLICY "Allow anon update promo_codes" ON ezz_promo_codes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete promo_codes" ON ezz_promo_codes;
CREATE POLICY "Allow anon delete promo_codes" ON ezz_promo_codes FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_promo_code ON ezz_promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_rider ON ezz_promo_codes(rider_id);
CREATE INDEX IF NOT EXISTS idx_promo_used ON ezz_promo_codes(used);

-- ============================================================
-- 6. جدول إحصائيات النظام
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_stats (
  id TEXT PRIMARY KEY,
  commission_rate DOUBLE PRECISION DEFAULT 15,
  total_revenue DOUBLE PRECISION DEFAULT 0,
  total_commission DOUBLE PRECISION DEFAULT 0,
  total_completed_trips INTEGER DEFAULT 0,
  fixed_commission DOUBLE PRECISION DEFAULT 10,
  price_per_km DOUBLE PRECISION DEFAULT 8,
  base_fare DOUBLE PRECISION DEFAULT 20,
  distance_buffer DOUBLE PRECISION DEFAULT 1.25,
  additional_km DOUBLE PRECISION DEFAULT 0.0,
  internal_commission DOUBLE PRECISION DEFAULT 10,
  external_commission DOUBLE PRECISION DEFAULT 15,
  support_whatsapp TEXT DEFAULT '201015555555',
  free_km_threshold DOUBLE PRECISION DEFAULT 2,
  short_trip_commission DOUBLE PRECISION DEFAULT 10,
  long_trip_commission DOUBLE PRECISION DEFAULT 15,
  car_base_fare DOUBLE PRECISION DEFAULT 20,
  car_price_per_km DOUBLE PRECISION DEFAULT 8,
  car_min_fare DOUBLE PRECISION DEFAULT 15,
  car_price_per_km_20to50 DOUBLE PRECISION DEFAULT 8,
  car_price_per_km_50plus DOUBLE PRECISION DEFAULT 8,
  motorcycle_base_fare DOUBLE PRECISION DEFAULT 12,
  motorcycle_price_per_km DOUBLE PRECISION DEFAULT 5,
  motorcycle_min_fare DOUBLE PRECISION DEFAULT 10,
  motorcycle_price_per_km_20to50 DOUBLE PRECISION DEFAULT 5,
  motorcycle_price_per_km_50plus DOUBLE PRECISION DEFAULT 5,
  toktok_base_fare DOUBLE PRECISION DEFAULT 10,
  toktok_price_per_km DOUBLE PRECISION DEFAULT 4,
  toktok_min_fare DOUBLE PRECISION DEFAULT 8,
  toktok_price_per_km_20to50 DOUBLE PRECISION DEFAULT 4,
  toktok_price_per_km_50plus DOUBLE PRECISION DEFAULT 4,
  tricycle_base_fare DOUBLE PRECISION DEFAULT 10,
  tricycle_price_per_km DOUBLE PRECISION DEFAULT 4,
  tricycle_min_fare DOUBLE PRECISION DEFAULT 8,
  tricycle_price_per_km_20to50 DOUBLE PRECISION DEFAULT 4,
  tricycle_price_per_km_50plus DOUBLE PRECISION DEFAULT 4,
  incoming_commission DOUBLE PRECISION DEFAULT 5,
  outgoing_commission DOUBLE PRECISION DEFAULT 5,
  incoming_commission_percent DOUBLE PRECISION DEFAULT 10,
  outgoing_commission_percent DOUBLE PRECISION DEFAULT 10,
  commission_mode TEXT DEFAULT 'fixed',
  promo_code TEXT DEFAULT 'EZZ5',
  promo_value DOUBLE PRECISION DEFAULT 5,
  low_data_mode BOOLEAN DEFAULT true
);

-- ============================================================
-- 7. جدول المديرين
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_admin (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'ADMIN',
  created_at TEXT DEFAULT NOW()
);

-- ============================================================
-- 9. جدول الجلسات (Session) - يبقى المستخدم مسجلاً حتى بعد التحديث/الخروج من التبويب
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL, -- 'RIDER' | 'DRIVER' | 'ADMIN'
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  updated_at TEXT
);

-- ============================================================
-- 8. جدول سجل التدقيق (Audit Logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS ezz_audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT,
  action TEXT,
  user_id TEXT,
  user_type TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- ============================================================
-- 10. جدول الإعلانات للمحلات المحلية
-- ============================================================
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  offer_text TEXT NOT NULL,
  image_url TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  whatsapp TEXT,
  placement TEXT DEFAULT 'all',
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  start_date TEXT,
  end_date TEXT,
  clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT NOW()::TEXT
);

ALTER TABLE IF EXISTS ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read ads" ON ads;
CREATE POLICY "Allow public read ads" ON ads FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write ads" ON ads;
CREATE POLICY "Allow public write ads" ON ads FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update ads" ON ads;
CREATE POLICY "Allow public update ads" ON ads FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete ads" ON ads;
CREATE POLICY "Allow public delete ads" ON ads FOR DELETE USING (true);

-- ============================================================
-- Indexes للأداء المثالي
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_drivers_status ON ezz_drivers(status, approval_status, is_online);
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON ezz_drivers(phone);
CREATE INDEX IF NOT EXISTS idx_riders_phone ON ezz_riders(phone);
CREATE INDEX IF NOT EXISTS idx_trips_status ON ezz_trips_history(status);
CREATE INDEX IF NOT EXISTS idx_trips_rider ON ezz_trips_history(rider_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON ezz_trips_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_created ON ezz_trips_history(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_phone ON ezz_admin(phone);

-- ============================================================
-- تفعيل RLS مع Policies تسمح بالعمليات المباشرة من العميل
-- ملاحظة: بما أننا نستخدم anon key من العميل مباشرة، نسمح بالعمليات الكاملة
-- ============================================================
ALTER TABLE IF EXISTS ezz_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_active_trip ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_trips_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ezz_regions ENABLE ROW LEVEL SECURITY;

-- Locations: الجميع يقرأ ويعدل
DROP POLICY IF EXISTS "Allow public read locations" ON ezz_locations;
CREATE POLICY "Allow public read locations" ON ezz_locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write locations" ON ezz_locations;
CREATE POLICY "Allow public write locations" ON ezz_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update locations" ON ezz_locations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete locations" ON ezz_locations FOR DELETE USING (true);

-- Regions: الجميع يقرأ ويعدل (الإدارة تضيف المناطق)
DROP POLICY IF EXISTS "Allow public read regions" ON ezz_regions;
CREATE POLICY "Allow public read regions" ON ezz_regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write regions" ON ezz_regions;
CREATE POLICY "Allow public write regions" ON ezz_regions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update regions" ON ezz_regions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete regions" ON ezz_regions FOR DELETE USING (true);

-- Riders: الجميع يقرأ ويعدل
DROP POLICY IF EXISTS "Allow public read riders" ON ezz_riders;
CREATE POLICY "Allow public read riders" ON ezz_riders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write riders" ON ezz_riders;
CREATE POLICY "Allow public write riders" ON ezz_riders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update riders" ON ezz_riders FOR UPDATE USING (true);
CREATE POLICY "Allow public delete riders" ON ezz_riders FOR DELETE USING (true);

-- Drivers: الجميع يقرأ السائقين الموثقين، ويعدل
DROP POLICY IF EXISTS "Allow public read approved drivers" ON ezz_drivers;
CREATE POLICY "Allow public read approved drivers" ON ezz_drivers FOR SELECT USING (approval_status = 'APPROVED');
DROP POLICY IF EXISTS "Allow public write drivers" ON ezz_drivers;
CREATE POLICY "Allow public write drivers" ON ezz_drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update drivers" ON ezz_drivers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete drivers" ON ezz_drivers FOR DELETE USING (true);

-- Active trips: يسمح بالقراءة (مطلوب لـ Realtime والسائق يشوف الرحلة)، مسموح بالكتابة
DROP POLICY IF EXISTS "Deny anon read active_trip" ON ezz_active_trip;
CREATE POLICY "Allow anon read active_trip" ON ezz_active_trip FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write active_trip" ON ezz_active_trip;
CREATE POLICY "Allow public write active_trip" ON ezz_active_trip FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update active_trip" ON ezz_active_trip FOR UPDATE USING (true);
CREATE POLICY "Allow public delete active_trip" ON ezz_active_trip FOR DELETE USING (true);

-- تفعيل Realtime على جدول الرحلة النشطة (مطلوب لوصول الطلب للسائق فوراً)
ALTER PUBLICATION supabase_realtime ADD TABLE ezz_active_trip;

-- Trips history: الجميع يقرأ (مطلوب للوحة الإدارة)، مسموح بالكتابة
DROP POLICY IF EXISTS "Allow public read trips_history" ON ezz_trips_history;
CREATE POLICY "Allow public read trips_history" ON ezz_trips_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write trips_history" ON ezz_trips_history;
CREATE POLICY "Allow public write trips_history" ON ezz_trips_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update trips_history" ON ezz_trips_history FOR UPDATE USING (true);
CREATE POLICY "Allow public delete trips_history" ON ezz_trips_history FOR DELETE USING (true);

-- Stats: الجميع يقرأ ويعدل
DROP POLICY IF EXISTS "Allow public read stats" ON ezz_stats;
CREATE POLICY "Allow public read stats" ON ezz_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write stats" ON ezz_stats;
CREATE POLICY "Allow public write stats" ON ezz_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update stats" ON ezz_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete stats" ON ezz_stats FOR DELETE USING (true);

-- Admin: يسمح بالقراءة والكتابة (للتوثيق وتعديل البيانات)
DROP POLICY IF EXISTS "Allow public read admin" ON ezz_admin;
CREATE POLICY "Allow public read admin" ON ezz_admin FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write admin" ON ezz_admin;
CREATE POLICY "Allow public write admin" ON ezz_admin FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update admin" ON ezz_admin FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete admin" ON ezz_admin;
CREATE POLICY "Allow public delete admin" ON ezz_admin FOR DELETE USING (true);

-- Audit logs: ممنوع القراءة العامة، مسموح بالكتابة
DROP POLICY IF EXISTS "Deny anon read audit_logs" ON ezz_audit_logs;
CREATE POLICY "Deny anon read audit_logs" ON ezz_audit_logs FOR SELECT USING (false);
DROP POLICY IF EXISTS "Allow public write audit_logs" ON ezz_audit_logs;
CREATE POLICY "Allow public write audit_logs" ON ezz_audit_logs FOR INSERT WITH CHECK (true);

-- Sessions: يسمح بالقراءة والكتابة (تسجيل الدخول يبقى بعد التحديث)
DROP POLICY IF EXISTS "Allow public read sessions" ON ezz_sessions;
CREATE POLICY "Allow public read sessions" ON ezz_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write sessions" ON ezz_sessions;
CREATE POLICY "Allow public write sessions" ON ezz_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sessions" ON ezz_sessions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete sessions" ON ezz_sessions FOR DELETE USING (true);
`;

// --- DRIVER TRANSFORMS ---
export const mapDriverFromDB = (row: any): Driver => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  password: row.password,
  carModel: row.car_model || '',
  carPlate: row.car_plate || '',
  vehicleType: row.vehicle_type || 'CAR',
  vehicleName: row.vehicle_name || '',
  nationalId: row.national_id || '',
  driverLicense: row.driver_license || '',
  personalPhoto: row.personal_photo || '',
  nationalIdImage: row.national_id_image || '',
  driverLicenseImage: row.driver_license_image || '',
  vehicleLicenseImage: row.vehicle_license_image || '',
  isOnline: !!row.is_online,
  status: row.status || 'AVAILABLE',
  approvalStatus: row.approval_status || 'PENDING',
  rating: row.rating || 5.0,
  totalTrips: row.total_trips || 0,
  totalEarnings: row.total_earnings || 0,
  totalCommissionPaid: row.total_commission_paid || 0,
  currentX: row.current_x || 50,
  currentY: row.current_y || 50,
  agreedToTerms: !!row.agreed_to_terms,
  serviceAreas: (() => {
    const val = row.service_areas;
    if (Array.isArray(val)) return val;
    if (!val) return [];
    try {
      // sometimes stored as JSON string
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })(),
  autoAccept: !!row.auto_accept,
  autoShowMap: !!row.auto_show_map,
});

export const mapDriverToDB = (drv: Driver) => ({
  id: drv.id,
  name: drv.name,
  phone: drv.phone,
  password: drv.password,
  car_model: drv.carModel,
  car_plate: drv.carPlate,
  vehicle_type: drv.vehicleType,
  vehicle_name: drv.vehicleName,
  national_id: drv.nationalId,
  driver_license: drv.driverLicense,
  personal_photo: drv.personalPhoto,
  national_id_image: drv.nationalIdImage,
  driver_license_image: drv.driverLicenseImage,
  vehicle_license_image: drv.vehicleLicenseImage,
  is_online: drv.isOnline,
  status: drv.status,
  approval_status: drv.approvalStatus,
  rating: drv.rating,
  total_trips: drv.totalTrips,
  total_earnings: drv.totalEarnings,
  total_commission_paid: drv.totalCommissionPaid,
  current_x: drv.currentX,
  current_y: drv.currentY,
  agreed_to_terms: drv.agreedToTerms,
  service_areas: drv.serviceAreas || [],
  auto_accept: drv.autoAccept || false,
  auto_show_map: drv.autoShowMap || false,
});

// --- RIDER TRANSFORMS ---
export const mapRiderFromDB = (row: any): Rider => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  password: row.password,
  balance: row.balance || 0,
  rating: row.rating || 5.0,
  totalTrips: row.total_trips || 0,
  approvalStatus: row.approval_status || 'APPROVED',
  preferences: (row.preferences as RiderPreferences) || {},
});

export const mapRiderToDB = (r: Rider) => {
  const base = {
    id: r.id,
    name: r.name,
    phone: r.phone,
    password: r.password,
    balance: r.balance,
    rating: r.rating || 5.0,
    total_trips: r.totalTrips || 0,
  } as any;
  if (r.approvalStatus && r.approvalStatus !== 'APPROVED') {
    base.approval_status = r.approvalStatus;
  }
  if (r.preferences) {
    base.preferences = r.preferences;
  }
  return base;
};

// --- LOCATION TRANSFORMS ---
export const mapLocationFromDB = (row: any): Location => ({
  id: row.id,
  nameAr: row.name_ar,
  nameEn: row.name_en,
  lat: row.lat,
  lng: row.lng,
  city: row.city || '',
  country: row.country || '',
  x: row.x || 50,
  y: row.y || 50,
});

export const mapLocationToDB = (loc: Location) => ({
  id: loc.id,
  name_ar: loc.nameAr,
  name_en: loc.nameEn,
  lat: loc.lat,
  lng: loc.lng,
  city: loc.city,
  country: loc.country,
  x: loc.x,
  y: loc.y,
});

// --- REGION TRANSFORMS ---
export const mapRegionFromDB = (row: any): Region => ({
  id: row.id,
  nameAr: row.name_ar,
  nameEn: row.name_en,
  country: row.country || '',
  lat: row.lat || 0,
  lng: row.lng || 0,
  createdAt: row.created_at || '',
});

export const mapRegionToDB = (region: Region) => ({
  id: region.id,
  name_ar: region.nameAr,
  name_en: region.nameEn,
  country: region.country,
  lat: region.lat,
  lng: region.lng,
  created_at: region.createdAt,
});

// --- TRIP TRANSFORMS ---
export const mapTripFromDB = (row: any): Trip => ({
  id: row.id,
  riderId: row.rider_id || '',
  riderName: row.rider_name || '',
  riderPhone: row.rider_phone || '',
  driverId: row.driver_id || undefined,
  driverName: row.driver_name || undefined,
  pickup: row.pickup,
  dropoff: row.dropoff,
  pickupLandmark: row.pickup_landmark || undefined,
  status: row.status || 'IDLE',
  fare: row.fare || 0,
  commission: row.commission || 0,
  distance: row.distance || 0,
  etaMinutes: row.eta_minutes || undefined,
  requestedVehicleType: row.requested_vehicle_type || undefined,
  createdAt: row.created_at || '',
  completedAt: row.completed_at || undefined,
  chatMessages: row.chat_messages || [],
  riderRatingToDriver: row.rider_rating_to_driver || undefined,
  riderFeedbackTags: row.rider_feedback_tags || [],
  riderFeedbackComment: row.rider_feedback_comment || undefined,
  driverRatingToRider: row.driver_rating_to_rider || undefined,
  driverFeedbackTags: row.driver_feedback_tags || [],
  driverFeedbackComment: row.driver_feedback_comment || undefined,
  routeGeometry: row.route_geometry || undefined,
  offeredDriverIds: row.offered_driver_ids || undefined,
  currentOfferedDriverId: row.current_offered_driver_id || undefined,
  dispatchTimer: row.dispatch_timer ?? undefined,
  dispatchTimerMax: row.dispatch_timer_max ?? undefined,
  appliedPromoCode: row.applied_promo_code || undefined,
  appliedPromoDiscount: row.applied_promo_discount || undefined,
});

export const mapTripToDB = (trip: Trip) => ({
  id: trip.id,
  rider_id: trip.riderId,
  rider_name: trip.riderName,
  rider_phone: trip.riderPhone,
  driver_id: trip.driverId || null,
  driver_name: trip.driverName || null,
  pickup: trip.pickup,
  dropoff: trip.dropoff,
  pickup_landmark: trip.pickupLandmark || null,
  status: trip.status,
  fare: trip.fare,
  commission: trip.commission,
  distance: trip.distance,
  eta_minutes: trip.etaMinutes || null,
  requested_vehicle_type: trip.requestedVehicleType || null,
  created_at: trip.createdAt,
  completed_at: trip.completedAt || null,
  chat_messages: trip.chatMessages || [],
  rider_rating_to_driver: trip.riderRatingToDriver || null,
  rider_feedback_tags: trip.riderFeedbackTags || [],
  rider_feedback_comment: trip.riderFeedbackComment || null,
  driver_rating_to_rider: trip.driverRatingToRider || null,
  driver_feedback_tags: trip.driverFeedbackTags || [],
  driver_feedback_comment: trip.driverFeedbackComment || null,
  route_geometry: trip.routeGeometry || null,
  offered_driver_ids: trip.offeredDriverIds || null,
  current_offered_driver_id: trip.currentOfferedDriverId || null,
  dispatch_timer: trip.dispatchTimer ?? null,
  dispatch_timer_max: trip.dispatchTimerMax ?? null,
  applied_promo_code: trip.appliedPromoCode || null,
  applied_promo_discount: trip.appliedPromoDiscount || null,
});

// --- API METHODS ---

// Fetch Drivers
export const fetchDrivers = async (): Promise<Driver[] | null> => {
  try {
    // Include `service_areas` in the select so remote fetch preserves driver coverage areas
    const { data, error } = await supabase.from('ezz_drivers').select('id,name,phone,password,car_model,car_plate,vehicle_type,vehicle_name,national_id,driver_license,personal_photo,national_id_image,driver_license_image,vehicle_license_image,is_online,status,approval_status,rating,total_trips,total_earnings,total_commission_paid,current_x,current_y,agreed_to_terms,service_areas');
    if (error) throw error;
    return data.map(mapDriverFromDB);
  } catch (err: any) {
    console.warn('Could not fetch drivers from Supabase, using local:', err.message);
    return null;
  }
};

// Save Driver
export const saveDriver = async (driver: Driver): Promise<boolean> => {
  try {
    const passwordToStore = isSecureHash(driver.password)
      ? driver.password
      : await hashPassword(driver.password || generateUUID());
    const { error } = await supabase.from('ezz_drivers').upsert({
      ...mapDriverToDB(driver),
      password: passwordToStore,
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save driver to Supabase:', err.message);
    return false;
  }
};

// Delete Driver
export const deleteDriverInDB = async (driverId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_drivers').delete().eq('id', driverId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not delete driver in Supabase:', err.message);
    return false;
  }
};

// Fetch Registered Riders
export const fetchRiders = async (): Promise<Rider[] | null> => {
  try {
    const { data, error } = await supabase.from('ezz_riders').select('id,name,phone,password,balance,rating,total_trips,approval_status');
    if (error) throw error;
    return data.map(mapRiderFromDB);
  } catch (err: any) {
    console.warn('Could not fetch riders from Supabase:', err.message);
    return null;
  }
};

// Save Rider
export const saveRider = async (rider: Rider): Promise<boolean> => {
  try {
    const passwordToStore = isSecureHash(rider.password)
      ? rider.password
      : await hashPassword(rider.password || generateUUID());
    const { error } = await supabase.from('ezz_riders').upsert({
      ...mapRiderToDB(rider),
      password: passwordToStore,
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save rider to Supabase:', err.message);
    return false;
  }
};

// Delete Rider
export const deleteRiderInDB = async (riderId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_riders').delete().eq('id', riderId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not delete rider in Supabase:', err.message);
    return false;
  }
};

// Fetch Active Trip
export const fetchActiveTrip = async (userId?: string, userRole?: 'rider' | 'driver' | 'admin'): Promise<Trip | null | 'NO_TABLE'> => {
  try {
    let query = supabase.from('ezz_active_trip').select('*').order('created_at', { ascending: false });

    if (userId && userRole === 'rider') {
      query = query.eq('rider_id', userId);
    } else if (userId && userRole === 'driver') {
      // Fetch trips where this driver is assigned, current offered, OR in the offered list.
      // PostgREST .or() can't check JSONB containment, so we fetch by driver_id/current_offered
      // and also fetch recent SEARCHING trips to check offeredDriverIds client-side.
      query = query.or(`driver_id.eq.${userId},current_offered_driver_id.eq.${userId},status.eq.SEARCHING`);
    }
    // admin gets all

    const { data, error } = await query.limit(1);
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('[fetchActiveTrip] No active trip in DB (empty table)');
        return null;
      }
      throw error;
    }
    if (!data || data.length === 0) {
      console.log('[fetchActiveTrip] No active trip in DB (empty result)');
      return null;
    }

    // For drivers, filter SEARCHING trips to only those where this driver is in offeredDriverIds.
    // The .or() query fetches all SEARCHING trips, so we narrow down client-side.
    if (userId && userRole === 'driver') {
      const relevant = data.find((row: any) => {
        const trip = mapTripFromDB(row);
        if (trip.driverId === userId) return true;
        if (trip.currentOfferedDriverId === userId) return true;
        if (trip.status === 'SEARCHING' && trip.offeredDriverIds?.includes(userId)) return true;
        return false;
      });
      if (relevant) {
        console.log('[fetchActiveTrip] Found active trip:', relevant.id, 'status:', relevant.status, 'for driver:', userId);
        return mapTripFromDB(relevant);
      }
      console.log('[fetchActiveTrip] No relevant trip for driver:', userId);
      return null;
    }

    console.log('[fetchActiveTrip] Found active trip:', data[0].id, 'status:', data[0].status, 'for role:', userRole);
    return mapTripFromDB(data[0]);
  } catch (err: any) {
    console.warn('Could not fetch active trip from Supabase:', err.message);
    return 'NO_TABLE';
  }
};

// Fetch all pending SEARCHING trips for available requests list
export const fetchPendingTrips = async (): Promise<Trip[]> => {
  try {
    const { data, error } = await supabase
      .from('ezz_active_trip')
      .select('*')
      .eq('status', 'SEARCHING')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];
    return data.map(mapTripFromDB);
  } catch (err: any) {
    console.warn('Could not fetch pending trips from Supabase:', err.message);
    return [];
  }
};

// Save Active Trip
export const saveActiveTrip = async (trip: Trip | null): Promise<boolean> => {
  try {
    if (!trip) {
      const { error } = await supabase.from('ezz_active_trip').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      console.log('[saveActiveTrip] Cleared active trip from DB');
      return true;
    }

    console.log('[saveActiveTrip] Saving trip to DB:', trip.id, 'status:', trip.status, 'offeredDriverIds:', trip.offeredDriverIds);

    // ── Race-condition guard for ACCEPTED ──────────────────────────────
    // Only one driver may win the accepting race.  We issue a conditional
    // UPDATE that succeeds only when the trip is still SEARCHING.
    // If another driver already accepted *and* updated first, this returns
    // false so the losing driver can revert the optimistic UI.
    if (trip.status === 'ACCEPTED') {
      // Map the trip to DB format for the update payload
      const payload = mapTripToDB(trip);
      const { data, error } = await supabase
        .from('ezz_active_trip')
        .update(payload)
        .eq('id', trip.id)
        .eq('status', 'SEARCHING')   // 👈  only SEARCHING trips can be accepted
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // No row matched the id + status='SEARCHING' condition, which means
        // either the trip was already accepted by another driver or it was
        // cancelled / deleted.
        console.warn('[saveActiveTrip] Race lost — trip no longer SEARCHING (already accepted by another driver)');
        return false;
      }

      console.log('[saveActiveTrip] ACCEPTED saved successfully (race won)');
      return true;
    }

    // ── All other statuses (including SEARCHING updates) use upsert ────
    const { error: insertError } = await supabase
      .from('ezz_active_trip')
      .upsert(mapTripToDB(trip), { onConflict: 'id' });
    if (insertError) throw insertError;
    console.log('[saveActiveTrip] Trip saved successfully');

    return true;
  } catch (err: any) {
    console.warn('Could not save active trip to Supabase:', err.message);
    return false;
  }
};

// Subscribe to active trip changes in realtime (used by the driver app to receive new ride requests)
export const subscribeToActiveTrips = (
  onTrip: (trip: Trip | null) => void,
  userId?: string,
  userRole?: 'rider' | 'driver' | 'admin'
): { unsubscribe: () => void } => {
  const channel = supabase
    .channel('ezz_active_trip_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ezz_active_trip' },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          onTrip(null);
          return;
        }
        if (payload.new) {
          const trip = mapTripFromDB(payload.new);
          if (userId && userRole === 'rider' && trip.riderId !== userId) return;
          // Driver sees the trip if they are the assigned driver, the current offered driver,
          // OR they are in the offeredDriverIds list (simultaneous broadcast to all offered drivers).
          if (userId && userRole === 'driver') {
            const isAssignedDriver = trip.driverId === userId;
            const isCurrentOffered = trip.currentOfferedDriverId === userId;
            const isOffered = !!(trip.offeredDriverIds && trip.offeredDriverIds.includes(userId));
            if (!isAssignedDriver && !isCurrentOffered && !isOffered) return;
          }
          onTrip(trip);
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    }
  };
};

// Fetch Trips History
export const fetchTripsHistory = async ({ userId, role }: { userId?: string; role?: 'rider' | 'driver' } = {}): Promise<Trip[] | null> => {
  try {
    let query = supabase
      .from('ezz_trips_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (role === 'rider' && userId) {
      query = query.eq('rider_id', userId);
    } else if (role === 'driver' && userId) {
      query = query.eq('driver_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapTripFromDB);
  } catch (err: any) {
    console.warn('Could not fetch trips history from Supabase:', err.message);
    return null;
  }
};

// Add to Trips History
export const saveTripToHistory = async (trip: Trip): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_trips_history').upsert(mapTripToDB(trip));
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save trip to history in Supabase:', err.message);
    return false;
  }
};

export const fetchTripsHistoryCount = async ({
  userId,
  role,
  dateFrom,
  dateTo,
}: {
  userId?: string;
  role?: 'rider' | 'driver';
  dateFrom?: string;
  dateTo?: string;
}): Promise<number> => {
  try {
    let query = supabase.from('ezz_trips_history').select('*', { count: 'exact', head: true });

    if (role === 'rider' && userId) {
      query = query.eq('rider_id', userId);
    } else if (role === 'driver' && userId) {
      query = query.eq('driver_id', userId);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  } catch (err: any) {
    console.warn('Could not count trips history from Supabase:', err.message);
    return 0;
  }
};

export const fetchTripsHistoryPaginated = async ({
  userId,
  role,
  dateFrom,
  dateTo,
  statusFilter,
  searchQuery,
  page = 0,
  limit = PAGE_SIZE,
}: {
  userId?: string;
  role?: 'rider' | 'driver';
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}): Promise<{ trips: Trip[]; hasMore: boolean }> => {
  try {
    let query = supabase.from('ezz_trips_history').select('*');

    if (role === 'rider' && userId) {
      query = query.eq('rider_id', userId);
    } else if (role === 'driver' && userId) {
      query = query.eq('driver_id', userId);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'ACTIVE') {
        query = query.in('status', ['ACCEPTED', 'ARRIVED', 'STARTED']);
      } else {
        query = query.eq('status', statusFilter);
      }
    }

    const from = page * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error } = await query;
    if (error) throw error;

    let trips = (data || []).map(mapTripFromDB);

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      trips = trips.filter(
        (trip) =>
          trip.riderName.toLowerCase().includes(q) ||
          (trip.driverName && trip.driverName.toLowerCase().includes(q)) ||
          trip.pickup.nameAr.toLowerCase().includes(q) ||
          trip.pickup.nameEn.toLowerCase().includes(q) ||
          trip.dropoff.nameAr.toLowerCase().includes(q) ||
          trip.dropoff.nameEn.toLowerCase().includes(q)
      );
    }

    return { trips, hasMore: trips.length === limit };
  } catch (err: any) {
    console.warn('Could not fetch paginated trips history from Supabase:', err.message);
    return { trips: [], hasMore: false };
  }
};

export const fetchTripsHistoryFilteredPaginated = async ({
  userId,
  role,
  dateFrom,
  dateTo,
  statusFilter,
  searchQuery,
  page = 0,
  limit = PAGE_SIZE,
}: {
  userId?: string;
  role?: 'rider' | 'driver';
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}): Promise<{ trips: Trip[]; hasMore: boolean }> => {
  try {
    let query = supabase.from('ezz_trips_history').select('*');

    if (role === 'rider' && userId) {
      query = query.eq('rider_id', userId);
    } else if (role === 'driver' && userId) {
      query = query.eq('driver_id', userId);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'ACTIVE') {
        query = query.in('status', ['ACCEPTED', 'ARRIVED', 'STARTED']);
      } else {
        query = query.eq('status', statusFilter);
      }
    }

    const from = page * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error } = await query;
    if (error) throw error;

    let trips = (data || []).map(mapTripFromDB);

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      trips = trips.filter(
        (trip) =>
          trip.riderName.toLowerCase().includes(q) ||
          (trip.driverName && trip.driverName.toLowerCase().includes(q)) ||
          trip.pickup.nameAr.toLowerCase().includes(q) ||
          trip.pickup.nameEn.toLowerCase().includes(q) ||
          trip.dropoff.nameAr.toLowerCase().includes(q) ||
          trip.dropoff.nameEn.toLowerCase().includes(q)
      );
    }

    return { trips, hasMore: trips.length === limit };
  } catch (err: any) {
    console.warn('Could not fetch filtered paginated trips history from Supabase:', err.message);
    return { trips: [], hasMore: false };
  }
};

// Clear Trips History
export const clearTripsHistoryInDB = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_trips_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not clear trips history in Supabase:', err.message);
    return false;
  }
};

// Clear ALL Riders from Supabase
export const clearAllRidersInDB = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_riders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not clear riders in Supabase:', err.message);
    return false;
  }
};

// Clear ALL Drivers from Supabase
export const clearAllDriversInDB = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not clear drivers in Supabase:', err.message);
    return false;
  }
};

// Fetch Stats
export const fetchStats = async (): Promise<SystemStats | null> => {
  try {
    const { data, error } = await supabase.from('ezz_stats').select('*').eq('id', 'singleton');
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const row = data[0];
  return {
    commissionRate: row.commission_rate || 15,
    totalRevenue: row.total_revenue || 0,
    totalCommission: row.total_commission || 0,
    totalCompletedTrips: row.total_completed_trips || 0,
    fixedCommission: row.fixed_commission !== undefined && row.fixed_commission !== null ? row.fixed_commission : 10,
    pricePerKm: row.price_per_km !== undefined && row.price_per_km !== null ? row.price_per_km : 8,
    baseFare: row.base_fare !== undefined && row.base_fare !== null ? row.base_fare : 20,
    distanceBuffer: row.distance_buffer !== undefined && row.distance_buffer !== null ? row.distance_buffer : 1.25,
    additionalKm: row.additional_km !== undefined && row.additional_km !== null ? row.additional_km : 0.0,
    internalCommission: row.internal_commission !== undefined && row.internal_commission !== null ? row.internal_commission : 10,
    externalCommission: row.external_commission !== undefined && row.external_commission !== null ? row.external_commission : 15,
    supportWhatsApp: row.support_whatsapp || '201015555555',
    shortTripCommission: row.short_trip_commission !== undefined && row.short_trip_commission !== null ? row.short_trip_commission : 10,
    longTripCommission: row.long_trip_commission !== undefined && row.long_trip_commission !== null ? row.long_trip_commission : 15,
    freeKmThreshold: row.free_km_threshold !== undefined && row.free_km_threshold !== null ? row.free_km_threshold : 2,
    carBaseFare: row.car_base_fare !== undefined && row.car_base_fare !== null ? row.car_base_fare : 20,
    carPricePerKm: row.car_price_per_km !== undefined && row.car_price_per_km !== null ? row.car_price_per_km : 8,
    carMinFare: row.car_min_fare !== undefined && row.car_min_fare !== null ? row.car_min_fare : 15,
    carPricePerKm20to50: row.car_price_per_km_20to50 !== undefined && row.car_price_per_km_20to50 !== null ? row.car_price_per_km_20to50 : 8,
    carPricePerKm50plus: row.car_price_per_km_50plus !== undefined && row.car_price_per_km_50plus !== null ? row.car_price_per_km_50plus : 8,
    motorcycleBaseFare: row.motorcycle_base_fare !== undefined && row.motorcycle_base_fare !== null ? row.motorcycle_base_fare : 12,
    motorcyclePricePerKm: row.motorcycle_price_per_km !== undefined && row.motorcycle_price_per_km !== null ? row.motorcycle_price_per_km : 5,
    motorcycleMinFare: row.motorcycle_min_fare !== undefined && row.motorcycle_min_fare !== null ? row.motorcycle_min_fare : 10,
    motorcyclePricePerKm20to50: row.motorcycle_price_per_km_20to50 !== undefined && row.motorcycle_price_per_km_20to50 !== null ? row.motorcycle_price_per_km_20to50 : 5,
    motorcyclePricePerKm50plus: row.motorcycle_price_per_km_50plus !== undefined && row.motorcycle_price_per_km_50plus !== null ? row.motorcycle_price_per_km_50plus : 5,
    toktokBaseFare: row.toktok_base_fare !== undefined && row.toktok_base_fare !== null ? row.toktok_base_fare : 10,
    toktokPricePerKm: row.toktok_price_per_km !== undefined && row.toktok_price_per_km !== null ? row.toktok_price_per_km : 4,
    toktokMinFare: row.toktok_min_fare !== undefined && row.toktok_min_fare !== null ? row.toktok_min_fare : 8,
    toktokPricePerKm20to50: row.toktok_price_per_km_20to50 !== undefined && row.toktok_price_per_km_20to50 !== null ? row.toktok_price_per_km_20to50 : 4,
    toktokPricePerKm50plus: row.toktok_price_per_km_50plus !== undefined && row.toktok_price_per_km_50plus !== null ? row.toktok_price_per_km_50plus : 4,
    tricycleBaseFare: row.tricycle_base_fare !== undefined && row.tricycle_base_fare !== null ? row.tricycle_base_fare : 10,
    tricyclePricePerKm: row.tricycle_price_per_km !== undefined && row.tricycle_price_per_km !== null ? row.tricycle_price_per_km : 4,
    tricycleMinFare: row.tricycle_min_fare !== undefined && row.tricycle_min_fare !== null ? row.tricycle_min_fare : 8,
    tricyclePricePerKm20to50: row.tricycle_price_per_km_20to50 !== undefined && row.tricycle_price_per_km_20to50 !== null ? row.tricycle_price_per_km_20to50 : 4,
    tricyclePricePerKm50plus: row.tricycle_price_per_km_50plus !== undefined && row.tricycle_price_per_km_50plus !== null ? row.tricycle_price_per_km_50plus : 4,
    incomingCommission: row.incoming_commission !== undefined && row.incoming_commission !== null ? row.incoming_commission : 5,
    outgoingCommission: row.outgoing_commission !== undefined && row.outgoing_commission !== null ? row.outgoing_commission : 5,
    incomingCommissionPercent: row.incoming_commission_percent !== undefined && row.incoming_commission_percent !== null ? row.incoming_commission_percent : 10,
    outgoingCommissionPercent: row.outgoing_commission_percent !== undefined && row.outgoing_commission_percent !== null ? row.outgoing_commission_percent : 10,
    commissionMode: row.commission_mode || 'fixed',
    promoCode: row.promo_code || 'EZZ5',
    promoValue: row.promo_value !== undefined && row.promo_value !== null ? row.promo_value : 5,
    lowDataMode: !!(row.low_data_mode),
  };
  } catch (err: any) {
    console.warn('Could not fetch stats from Supabase:', err.message);
    return null;
  }
};

// Save Stats
export const saveStats = async (stats: SystemStats): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_stats').upsert({
      id: 'singleton',
      commission_rate: stats.commissionRate,
      total_revenue: stats.totalRevenue,
      total_commission: stats.totalCommission,
      total_completed_trips: stats.totalCompletedTrips,
      fixed_commission: stats.fixedCommission,
      price_per_km: stats.pricePerKm,
      base_fare: stats.baseFare,
      distance_buffer: stats.distanceBuffer,
      additional_km: stats.additionalKm,
      internal_commission: stats.internalCommission,
      external_commission: stats.externalCommission,
      support_whatsapp: stats.supportWhatsApp,
      free_km_threshold: stats.freeKmThreshold,
      short_trip_commission: stats.shortTripCommission,
      long_trip_commission: stats.longTripCommission,
      car_base_fare: stats.carBaseFare,
      car_price_per_km: stats.carPricePerKm,
      car_min_fare: stats.carMinFare,
      car_price_per_km_20to50: stats.carPricePerKm20to50,
      car_price_per_km_50plus: stats.carPricePerKm50plus,
      motorcycle_base_fare: stats.motorcycleBaseFare,
      motorcycle_price_per_km: stats.motorcyclePricePerKm,
      motorcycle_min_fare: stats.motorcycleMinFare,
      motorcycle_price_per_km_20to50: stats.motorcyclePricePerKm20to50,
      motorcycle_price_per_km_50plus: stats.motorcyclePricePerKm50plus,
      toktok_base_fare: stats.toktokBaseFare,
      toktok_price_per_km: stats.toktokPricePerKm,
      toktok_min_fare: stats.toktokMinFare,
      toktok_price_per_km_20to50: stats.toktokPricePerKm20to50,
      toktok_price_per_km_50plus: stats.toktokPricePerKm50plus,
      tricycle_base_fare: stats.tricycleBaseFare,
      tricycle_price_per_km: stats.tricyclePricePerKm,
      tricycle_min_fare: stats.tricycleMinFare,
      tricycle_price_per_km_20to50: stats.tricyclePricePerKm20to50,
      tricycle_price_per_km_50plus: stats.tricyclePricePerKm50plus,
      incoming_commission: stats.incomingCommission,
      outgoing_commission: stats.outgoingCommission,
      incoming_commission_percent: stats.incomingCommissionPercent,
      outgoing_commission_percent: stats.outgoingCommissionPercent,
      commission_mode: stats.commissionMode,
      promo_code: stats.promoCode,
      promo_value: stats.promoValue,
      low_data_mode: stats.lowDataMode,
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save stats to Supabase:', err.message);
    return false;
  }
};

const mapPromoCodeFromDB = (row: any): PromoCode => ({
  id: row.id,
  code: row.code,
  discountAmount: row.discount_amount || 0,
  riderId: row.rider_id || undefined,
  tripId: row.trip_id || undefined,
  used: row.used || false,
  usedAt: row.used_at || undefined,
  createdAt: row.created_at,
  expiresAt: row.expires_at || undefined,
});

export const generatePromoCode = async (discountAmount: number, riderId?: string, expiresAt?: string): Promise<PromoCode | null> => {
  try {
    const code = `EZZ${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const id = `promo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const { data, error } = await supabase
      .from('ezz_promo_codes')
      .insert({
        id,
        code,
        discount_amount: discountAmount,
        rider_id: riderId || null,
        expires_at: expiresAt || null,
        used: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return mapPromoCodeFromDB(data);
  } catch (err) {
    console.warn('Could not generate promo code:', err);
    return null;
  }
};

export const validatePromoCode = async (code: string, riderId?: string): Promise<PromoCode | null> => {
  try {
    const { data, error } = await supabase
      .from('ezz_promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('used', false)
      .single();

    if (error || !data) return null;

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null;
    }

    if (data.rider_id && data.rider_id !== riderId) {
      return null;
    }

    return mapPromoCodeFromDB(data);
  } catch (err) {
    console.warn('Could not validate promo code:', err);
    return null;
  }
};

export const markPromoCodeAsUsed = async (promoCodeId: string, tripId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('ezz_promo_codes')
      .update({
        used: true,
        trip_id: tripId,
        used_at: new Date().toISOString(),
      })
      .eq('id', promoCodeId)
      .eq('used', false);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Could not mark promo code as used:', err);
    return false;
  }
};

export const fetchPromoCodes = async (): Promise<PromoCode[]> => {
  try {
    const { data, error } = await supabase
      .from('ezz_promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapPromoCodeFromDB);
  } catch (err) {
    console.warn('Could not fetch promo codes:', err);
    return [];
  }
};

// Fetch Locations
export const fetchLocations = async (): Promise<Location[] | null> => {
  try {
    const { data, error } = await supabase.from('ezz_locations').select('*');
    if (error) throw error;
    return data.map(mapLocationFromDB);
  } catch (err: any) {
    console.warn('Could not fetch locations from Supabase:', err.message);
    return null;
  }
};

// Save Location
export const saveLocationInDB = async (loc: Location): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_locations').upsert(mapLocationToDB(loc));
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save location to Supabase:', err.message);
    return false;
  }
};

// Delete Location
export const deleteLocationInDB = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_locations').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not delete location in Supabase:', err.message);
    return false;
  }
};

// --- REGIONS CRUD ---

export const fetchRegions = async (): Promise<Region[] | null> => {
  try {
    const { data, error } = await supabase.from('ezz_regions').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapRegionFromDB);
  } catch (err: any) {
    console.warn('Could not fetch regions from Supabase:', err.message);
    return null;
  }
};

export const saveRegion = async (region: Region): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_regions').upsert(mapRegionToDB(region));
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save region to Supabase:', err.message);
    return false;
  }
};

export const deleteRegionInDB = async (regionId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_regions').delete().eq('id', regionId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not delete region in Supabase:', err.message);
    return false;
  }
};

// Save Rider Preferences (favorites / home / work / recent / last pickup-dropoff)
export const saveRiderPreferences = async (riderId: string, preferences: RiderPreferences): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_riders').update({ preferences }).eq('id', riderId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save rider preferences to Supabase:', err.message);
    return false;
  }
};

// --- AUDIT LOGS ---

export const logAuditToDB = async (entry: AuditLogEntry): Promise<boolean> => {
  try {
    const { error } = await supabase.from('ezz_audit_logs').insert({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      user_id: entry.userId,
      user_type: entry.userType,
      details: entry.details,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      success: entry.success,
      error_message: entry.errorMessage || null,
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save audit log to Supabase:', err.message);
    return false;
  }
};

// --- SESSIONS (keep user logged in across reloads & support multi-account tabs) ---

const getDeviceId = (): string => {
  try {
    // Priority to tab-isolated device ID so multiple tabs can run different accounts concurrently
    let deviceId = sessionStorage.getItem('ezz_tab_device_id');
    if (!deviceId) {
      const sharedDeviceId = localStorage.getItem('ezz_device_id');
      if (sharedDeviceId) {
        deviceId = sharedDeviceId;
      } else {
        deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('ezz_device_id', deviceId);
      }
      sessionStorage.setItem('ezz_tab_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
};

export const saveSession = async (role: 'RIDER' | 'DRIVER' | 'ADMIN', userId: string): Promise<boolean> => {
  try {
    const deviceId = `tab_${role.toLowerCase()}_${userId}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      sessionStorage.setItem('ezz_tab_device_id', deviceId);
      localStorage.setItem('ezz_device_id', deviceId);
    } catch {}

    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { error } = await supabase.from('ezz_sessions').upsert({
      id,
      role,
      user_id: userId,
      device_id: deviceId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not save session to Supabase:', err.message);
    return false;
  }
};

export const loadSession = async (): Promise<{ role: 'RIDER' | 'DRIVER' | 'ADMIN'; userId: string } | null> => {
  try {
    const deviceId = getDeviceId();
    const { data, error } = await supabase
      .from('ezz_sessions')
      .select('role,user_id,updated_at')
      .eq('device_id', deviceId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return { role: data[0].role as any, userId: data[0].user_id };
  } catch (err: any) {
    console.warn('Could not load session from Supabase:', err.message);
    return null;
  }
};

export const clearSession = async (role: 'RIDER' | 'DRIVER' | 'ADMIN'): Promise<boolean> => {
  try {
    const deviceId = getDeviceId();
    try {
      sessionStorage.removeItem('ezz_tab_device_id');
    } catch {}
    const { error } = await supabase.from('ezz_sessions').delete().eq('role', role).eq('device_id', deviceId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn('Could not clear session from Supabase:', err.message);
    return false;
  }
};

// --- ADMIN AUTH ---

export const fetchAdmins = async (): Promise<Admin[] | null> => {
  try {
    const { data, error } = await supabase.from('ezz_admin').select('*');
    if (error) throw error;
    return data as Admin[];
  } catch (err: any) {
    console.warn('Could not fetch admins from Supabase:', err.message);
    return null;
  }
};

export const authenticateAdmin = async (phone: string, password: string): Promise<Admin | null> => {
  try {
    const { data, error } = await supabase.from('ezz_admin').select('*').eq('phone', phone).limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const admin = data[0] as Admin;
    const storedPassword = admin.password;

    if (!storedPassword) return null;

    if (isSecureHash(storedPassword)) {
      const isValid = await verifyPassword(password, storedPassword);
      return isValid ? admin : null;
    }

    return null;
  } catch (err: any) {
    console.warn('Could not authenticate admin:', err.message);
    return null;
  }
};

// ============================================================
// ADS — local store advertising
// ============================================================

const DEFAULT_LOCAL_ADS: Ad[] = [];

const getLocalAds = (): Ad[] => {
  try {
    const data = localStorage.getItem('ezz_ads_local');
    if (!data) {
      return [];
    }
    const parsed: Ad[] = JSON.parse(data);
    return parsed.filter((a) => a.id !== 'sample-ad-1');
  } catch {
    return [];
  }
};

const saveLocalAds = (ads: Ad[]) => {
  try {
    localStorage.setItem('ezz_ads_local', JSON.stringify(ads));
  } catch (e) {
    console.warn('Failed to save ads locally', e);
  }
};

const mapAdRow = (row: any): Ad => ({
  id: row.id,
  storeName: row.store_name,
  offerText: row.offer_text,
  imageUrl: row.image_url,
  phoneNumber: row.phone_number,
  whatsapp: row.whatsapp ?? undefined,
  placement: row.placement ?? 'all',
  priority: row.priority ?? 1,
  isActive: row.is_active ?? true,
  startDate: row.start_date ?? undefined,
  endDate: row.end_date ?? undefined,
  clicks: row.clicks ?? 0,
  whatsappClicks: row.whatsapp_clicks ?? row.whatsappClicks ?? 0,
  adFee: row.ad_fee ?? row.adFee ?? 0,
  dailyImpressionLimit: row.daily_impression_limit ?? row.dailyImpressionLimit ?? 0,
  impressions: row.impressions ?? 0,
  createdAt: row.created_at ?? new Date().toISOString(),
});

const adToRow = (ad: Partial<Ad>) => ({
  store_name: ad.storeName,
  offer_text: ad.offerText,
  image_url: ad.imageUrl,
  phone_number: ad.phoneNumber,
  whatsapp: ad.whatsapp ?? null,
  placement: ad.placement ?? 'all',
  priority: ad.priority ?? 1,
  is_active: ad.isActive ?? true,
  start_date: ad.startDate ?? null,
  end_date: ad.endDate ?? null,
  ad_fee: ad.adFee ?? 0,
  daily_impression_limit: ad.dailyImpressionLimit ?? 0,
  whatsapp_clicks: ad.whatsappClicks ?? 0,
});

export const fetchAds = async (): Promise<Ad[]> => {
  try {
    const { data, error } = await supabase
      .from('ads')
      .select('*')
      .order('is_active', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      return data.map(mapAdRow);
    }
  } catch (err: any) {
    console.warn('Could not fetch ads from Supabase:', err.message);
  }
  return getLocalAds();
};

export const fetchActiveAdsForPlacement = async (placement: 'home' | 'waiting' | 'popup'): Promise<Ad[]> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('ads')
      .select('*')
      .eq('is_active', true)
      .or(`placement.eq.all,placement.eq.${placement}`)
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      return data.map(mapAdRow);
    }
  } catch (err: any) {
    console.warn('Could not fetch active ads:', err.message);
  }
  const local = getLocalAds();
  const today = new Date().toISOString().slice(0, 10);
  return local.filter((a) => a.isActive && (a.placement === 'all' || a.placement === placement) && (!a.endDate || a.endDate >= today));
};

const ADS_ADMIN_URL = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/ads-admin`;

const getAdminCreds = () => {
  const phone = localStorage.getItem('ezz_admin_phone') || '';
  const password = localStorage.getItem('ezz_admin_password') || '';
  return { phone, password };
};

export const saveAd = async (ad: Partial<Ad> & { id?: string }): Promise<Ad | null> => {
  let savedAd: Ad | null = null;
  
  // 1. Try Edge function
  try {
    const { phone, password } = getAdminCreds();
    if (phone && password) {
      const res = await fetch(ADS_ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert', adminPhone: phone, adminPassword: password, ad }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.ad) savedAd = mapAdRow(body.ad);
      }
    }
  } catch (err: any) {
    console.warn('Edge function saveAd failed:', err.message);
  }

  // 2. Try direct Supabase table upsert if edge function was not available
  if (!savedAd) {
    try {
      const row = adToRow(ad);
      const id = ad.id || `ad_${Date.now()}`;
      const { data, error } = await supabase.from('ads').upsert({ id, ...row }).select().single();
      if (!error && data) {
        savedAd = mapAdRow(data);
      }
    } catch (err: any) {
      console.warn('Direct table saveAd failed:', err.message);
    }
  }

  // 3. Fallback to local storage (Guarantees success)
  const currentLocal = getLocalAds();
  const newAd: Ad = savedAd || {
    id: ad.id || `ad_local_${Date.now()}`,
    storeName: ad.storeName || '',
    offerText: ad.offerText || '',
    imageUrl: ad.imageUrl || '',
    phoneNumber: ad.phoneNumber || '',
    whatsapp: ad.whatsapp || undefined,
    placement: ad.placement || 'all',
    priority: ad.priority || 1,
    isActive: ad.isActive ?? true,
    startDate: ad.startDate || undefined,
    endDate: ad.endDate || undefined,
    clicks: ad.clicks || 0,
    adFee: ad.adFee || 0,
    dailyImpressionLimit: ad.dailyImpressionLimit || 0,
    impressions: ad.impressions || 0,
    createdAt: new Date().toISOString(),
  };

  const existingIndex = currentLocal.findIndex(a => a.id === newAd.id);
  if (existingIndex >= 0) {
    currentLocal[existingIndex] = newAd;
  } else {
    currentLocal.unshift(newAd);
  }
  saveLocalAds(currentLocal);

  return newAd;
};

export const deleteAd = async (id: string): Promise<boolean> => {
  try {
    const { phone, password } = getAdminCreds();
    if (phone && password) {
      await fetch(ADS_ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', adminPhone: phone, adminPassword: password, id }),
      });
    }
  } catch {}

  try {
    await supabase.from('ads').delete().eq('id', id);
  } catch {}

  const currentLocal = getLocalAds().filter(a => a.id !== id);
  saveLocalAds(currentLocal);
  return true;
};

export const incrementAdClick = async (id: string): Promise<void> => {
  try {
    await supabase.rpc('increment_ad_click', { ad_id: id });
  } catch {}
  const current = getLocalAds();
  const found = current.find((a) => a.id === id);
  if (found) {
    found.clicks = (found.clicks || 0) + 1;
    saveLocalAds(current);
  }
};

export const incrementAdWhatsappClick = async (id: string): Promise<void> => {
  try {
    await supabase.rpc('increment_ad_whatsapp', { ad_id: id });
  } catch {}
  const current = getLocalAds();
  const found = current.find((a) => a.id === id);
  if (found) {
    found.whatsappClicks = (found.whatsappClicks || 0) + 1;
    saveLocalAds(current);
  }
};

export const incrementAdImpression = async (id: string): Promise<void> => {
  try {
    await supabase.rpc('increment_ad_impression', { ad_id: id });
  } catch {}
  const current = getLocalAds();
  const found = current.find((a) => a.id === id);
  if (found) {
    found.impressions = (found.impressions || 0) + 1;
    saveLocalAds(current);
  }
};
