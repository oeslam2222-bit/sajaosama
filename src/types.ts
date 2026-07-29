export interface Location {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;      // Real GPS Latitude
  lng: number;      // Real GPS Longitude
  city?: string;    // City name (e.g. القاهرة, الإسكندرية, الرياض)
  country?: string; // Country name (e.g. مصر, السعودية)
  x?: number;       // Optional screen map X percentage
  y?: number;       // Optional screen map Y percentage
}

export interface Road {
  from: string;
  to: string;
}

export type TripStatus = 'IDLE' | 'SEARCHING' | 'ACCEPTED' | 'ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

export interface ChatMessage {
  id: string;
  sender: 'RIDER' | 'DRIVER';
  text: string;
  timestamp: string;
}

export interface Trip {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  driverId?: string;
  driverName?: string;
  pickup: Location;
  dropoff: Location;
  pickupLandmark?: string;
  status: TripStatus;
  fare: number;
  commission: number;
  distance: number;
  routeGeometry?: [number, number][];
  etaMinutes?: number;
  createdAt: string;
  completedAt?: string;
  requestedVehicleType?: 'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE';
  chatMessages?: ChatMessage[];
  riderRatingToDriver?: number;
  riderFeedbackTags?: string[];
  riderFeedbackComment?: string;
  driverRatingToRider?: number;
  driverFeedbackTags?: string[];
  driverFeedbackComment?: string;
  currentOfferedDriverId?: string;
  offeredDriverIds?: string[];
  dispatchTimer?: number;
  dispatchTimerMax?: number;
  appliedPromoCode?: string;
  appliedPromoDiscount?: number;
  appliedPromoCodeId?: string;
  pickupRegionId?: string;
  pickupRegionName?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountAmount: number;
  riderId?: string;
  tripId?: string;
  used: boolean;
  usedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  password?: string;
  carModel: string;
  carPlate: string;
  vehicleType: 'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE';
  vehicleName: string;
  nationalId: string;
  driverLicense: string;
  personalPhoto?: string;
  nationalIdImage?: string;
  driverLicenseImage?: string;
  vehicleLicenseImage?: string;
  isOnline: boolean;
  status: 'AVAILABLE' | 'BUSY';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FROZEN';
  rating: number;
  totalTrips: number;
  totalEarnings: number;
  totalCommissionPaid: number;
  currentX: number;
  currentY: number;
  lat?: number;
  lng?: number;
  agreedToTerms: boolean;
  serviceAreas: string[]; // المدن/المناطق اللي السائق بيخدمها (مثلاً: ["العياط", "بني سويف", "القاهرة"])
  autoAccept?: boolean; // هل يقبل الرحلات أوتوماتيكياً
  autoShowMap?: boolean; // هل يعرض الخريطة تلقائياً عند قبول الرحلة
  walletBalance?: number; // محفظة كابتن عز الشحن المسبق والعمولات
}

export interface RiderPreferences {
  favorites?: { id: string; name: string; lat: number; lng: number; type: 'pickup' | 'dropoff' }[];
  homeLocation?: { id: string; name: string; lat: number; lng: number } | null;
  workLocation?: { id: string; name: string; lat: number; lng: number } | null;
  recentDestinations?: { id: string; name: string; lat: number; lng: number }[];
  lastPickup?: string;
  lastDropoff?: string;
  autoShowMap?: boolean;
}

export interface Rider {
  id: string;
  name: string; // الاسم الثنائي
  phone: string;
  password?: string; // كلمة المرور
  balance: number;
  rating?: number;
  totalTrips?: number;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'FROZEN' | 'REJECTED' | 'BLOCKED';
  homeLocationId?: string;
  workLocationId?: string;
  preferences?: RiderPreferences;
}

export interface SystemStats {
  commissionRate: number;
  totalRevenue: number;
  totalCommission: number;
  totalCompletedTrips: number;
  fixedCommission?: number;
  pricePerKm?: number;
  baseFare?: number;
  minFare?: number;
  distanceBuffer?: number;
  additionalKm?: number;
  internalCommission?: number;
  externalCommission?: number;
  supportWhatsApp?: string;
  minRatingThreshold?: number; // حد أدنى للتقييم لحظر السائق تلقائياً أو التنبيه
  shortTripCommission?: number;
  longTripCommission?: number;
  freeKmThreshold?: number;
  distanceMultiplier?: number;
  peakHourMultiplier?: number;
  nightMultiplier?: number;
  peakStartHour?: number;
  peakEndHour?: number;
  nightStartHour?: number;
  nightEndHour?: number;
  carBaseFare?: number;
  carPricePerKm?: number;
  carMinFare?: number;
  carPricePerKm20to50?: number;
  carPricePerKm50plus?: number;
  motorcycleBaseFare?: number;
  motorcyclePricePerKm?: number;
  motorcycleMinFare?: number;
  motorcyclePricePerKm20to50?: number;
  motorcyclePricePerKm50plus?: number;
  toktokBaseFare?: number;
  toktokPricePerKm?: number;
  toktokMinFare?: number;
  toktokPricePerKm20to50?: number;
  toktokPricePerKm50plus?: number;
  tricycleBaseFare?: number;
  tricyclePricePerKm?: number;
  tricycleMinFare?: number;
  tricyclePricePerKm20to50?: number;
  tricyclePricePerKm50plus?: number;
  incomingCommission?: number;
  outgoingCommission?: number;
  incomingCommissionPercent?: number;
  outgoingCommissionPercent?: number;
  commissionMode?: 'fixed' | 'percent';
  promoCode?: string;
  promoValue?: number;
  promoCodes?: { code: string; discount: number; active: boolean }[];
  mapProvider?: 'leaflet' | 'google';
  googleMapsApiKey?: string;
  lowDataMode?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  userId: string;
  userType: 'rider' | 'driver' | 'admin' | 'system';
  details: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export interface Region {
  id: string;
  nameAr: string;
  nameEn: string;
  country: string;
  lat?: number;
  lng?: number;
  createdAt: string;
}

export interface Ad {
  id: string;
  storeName: string;
  offerText: string;
  imageUrl: string;
  phoneNumber: string;
  whatsapp?: string;
  placement: 'home' | 'waiting' | 'popup' | 'all';
  priority: number;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  adFee?: number; // رسوم الإعلان بالجنيه
  dailyImpressionLimit?: number; // الحد الأقصى للمشاهدات اليومية
  impressions?: number; // عدد مرات الظهور
  clicks: number; // عدد مرات الاتصال الهاتفي
  whatsappClicks?: number; // عدد مرات فتح الواتساب
  createdAt: string;
}

export interface Admin {
  id: string;
  name: string;
  phone: string;
  password: string;
  role: string;
}
