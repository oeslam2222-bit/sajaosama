import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Location, Driver, Trip, Rider, SystemStats, TripStatus, Region, Ad } from './types';
import { RiderView } from './components/RiderView';
import { DriverView } from './components/DriverView';
import { AdminView } from './components/AdminView';
import { Smartphone, Globe, RotateCcw, Award, Shield, Car, Check, ChevronDown, MessageSquare, Upload, Lock, User, Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateHaversineDistance, estimateDrivingDistance, calculateDynamicFare, getVehiclePricing, calculateVehicleFare, calculateFullTripFare, RouteResult, RouteStep } from './utils/haversine';
import { 
  checkSupabaseConnection, 
  fetchDrivers, 
  saveDriver, 
  fetchRiders, 
  saveRider, 
  fetchActiveTrip, 
  saveActiveTrip, 
  fetchTripsHistory, 
  saveTripToHistory,
  clearTripsHistoryInDB,
  clearAllRidersInDB,
  clearAllDriversInDB,
  fetchStats,
  saveStats,
  fetchLocations,
  saveLocationInDB,
  authenticateAdmin,
  deleteDriverInDB,
  deleteRiderInDB,
  SQL_SCHEMA,
  fetchTripsHistoryPaginated,
  fetchTripsHistoryFilteredPaginated,
  fetchTripsHistoryCount,
  subscribeToActiveTrips,
  saveSession,
  loadSession,
  clearSession,
  markPromoCodeAsUsed,
  fetchRegions,
  fetchAds,
  fetchPendingTrips,
  saveChatMessage,
  fetchChatMessages
} from './supabaseService';
import {
  requestNotificationPermission,
  sendNativeNotification,
  playNotificationSound,
  startTitleFlash,
  stopTitleFlash,
  speakText,
  startLoudRepeatingAlarm,
  stopLoudRepeatingAlarm,
  triggerVibration,
  notifyDriverWithAudioFirst,
  unlockAudioContext,
  initFirebaseFCM
} from './utils/notifications';
import { FirebaseFcmModal } from './components/FirebaseFcmModal';
import {
  getInitialDataSaverState,
  setDataSaverState,
  getAdaptivePollingInterval,
  getCachedRoute,
  setCachedRoute
} from './utils/dataSaver';
import { LegalModal } from './components/LegalModal';
import { GuideModal } from './components/GuideModal';
import { hashPassword, verifyPassword, isSecureHash } from './utils/security';
import { auditLogger } from './utils/auditLog';
import { riderAuthLimiter, driverAuthLimiter, adminAuthLimiter } from './utils/security';
import { supabase } from './supabaseClient';

// Support secure data storage with password obfuscation / encryption
const obfuscatePassword = (password: string): string => {
  if (!password) return '';
  try {
    return btoa(unescape(encodeURIComponent(password))).split('').reverse().join('');
  } catch {
    return password;
  }
};

const deobfuscatePassword = (obfuscated: string): string => {
  if (!obfuscated) return '';
  try {
    return decodeURIComponent(escape(atob(obfuscated.split('').reverse().join(''))));
  } catch {
    return obfuscated;
  }
};

export default function App() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [supabaseConnected, setSupabaseConnected] = useState<boolean>(false);
  const [showSqlWizard, setShowSqlWizard] = useState<boolean>(false);
  
  // Custom screen state (Mobile-First Homepage request)
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'RIDER_AUTH' | 'RIDER_DASHBOARD' | 'DRIVER_AUTH' | 'DRIVER_DASHBOARD' | 'ADMIN'>(() => {
    try {
      const stored = sessionStorage.getItem('ezz_current_screen');
      if (stored === 'RIDER_AUTH' || stored === 'RIDER_DASHBOARD' || stored === 'DRIVER_AUTH' || stored === 'DRIVER_DASHBOARD' || stored === 'ADMIN') {
        return stored as 'RIDER_AUTH' | 'RIDER_DASHBOARD' | 'DRIVER_AUTH' | 'DRIVER_DASHBOARD' | 'ADMIN';
      }
    } catch {}
    return 'HOME';
  });
  const [sessionLoaded, setSessionLoaded] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem('ezz_current_screen', currentScreen);
    } catch {}
  }, [currentScreen]);
  // Guards the stats auto-save effect: it must NOT run until the initial
  // stats have been loaded from Supabase, otherwise the default values would
  // overwrite the admin's saved prices on every refresh.
  const statsLoadedRef = useRef(false);

  // Shared state is sourced entirely from Supabase (no localStorage)
  const [locations, setLocations] = useState<Location[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rider, setRider] = useState<Rider & { isLoggedIn: boolean }>({
    id: '', name: '', phone: '', password: '', balance: 0, rating: 5.0, totalTrips: 0, isLoggedIn: false,
  });
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const dismissedTripIdsRef = useRef<Set<string>>(new Set());
  const lastTripCompletedRef = useRef(false);
  const lastTripCancelledRef = useRef(false);
  const [noAvailableDrivers, setNoAvailableDrivers] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [tripsHistory, setTripsHistory] = useState<Trip[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    commissionRate: 15,
    totalRevenue: 0,
    totalCommission: 0,
    totalCompletedTrips: 0,
    fixedCommission: 10,
    pricePerKm: 8,
    baseFare: 20,
    distanceBuffer: 1.25,
    additionalKm: 0.0,
    supportWhatsApp: '201015555555',
    freeKmThreshold: 2.0,
    distanceMultiplier: 1.27,
    peakHourMultiplier: 1.0,
    nightMultiplier: 1.0,
    peakStartHour: 7,
    peakEndHour: 9,
    nightStartHour: 22,
    nightEndHour: 5,
    carBaseFare: 20,
    carPricePerKm: 8,
    carMinFare: 2,
    carPricePerKm20to50: 8,
    carPricePerKm50plus: 8,
    motorcycleBaseFare: 12,
    motorcyclePricePerKm: 5,
    motorcycleMinFare: 2,
    motorcyclePricePerKm20to50: 5,
    motorcyclePricePerKm50plus: 5,
    toktokBaseFare: 10,
    toktokPricePerKm: 4,
    toktokMinFare: 2,
    toktokPricePerKm20to50: 4,
    toktokPricePerKm50plus: 4,
    tricycleBaseFare: 10,
    tricyclePricePerKm: 4,
    tricycleMinFare: 2,
    tricyclePricePerKm20to50: 4,
    tricyclePricePerKm50plus: 4,
    incomingCommission: 5,
    outgoingCommission: 5,
  });

  // lowDataMode is now sourced from Supabase stats (not localStorage)
  const [lowDataMode, setLowDataMode] = useState<boolean>(true);

  const enableLowData = async () => {
    setLowDataMode(true);
    setDataSaverMode(true);
    setDataSaverState(true);
    if (supabaseConnected) {
      await saveStats({ ...stats, lowDataMode: true });
    }
  };

  // Handler: Transfer trip to next offered driver when current driver cancels/requests transfer
  const handleTransferTrip = () => {
    const currentTrip = activeTrip;
    if (!currentTrip) return;
    const currentDriverId = currentTrip.driverId;
    const currentIdx = currentTrip.offeredDriverIds?.indexOf(currentDriverId || '') ?? -1;
    const nextDriverId = (currentTrip.offeredDriverIds && currentIdx !== -1 && currentIdx + 1 < currentTrip.offeredDriverIds.length)
      ? currentTrip.offeredDriverIds[currentIdx + 1]
      : undefined;

    if (nextDriverId) {
      const nextDrv = drivers.find(d => d.id === nextDriverId);
      const updatedTrip = {
        ...currentTrip,
        status: 'SEARCHING' as TripStatus,
        driverId: undefined,
        driverName: undefined,
        currentOfferedDriverId: nextDriverId,
      };
      setActiveTripWithTracking(updatedTrip);
      setDrivers((prev) => prev.map((d) => (d.id === currentDriverId ? { ...d, status: 'AVAILABLE' } : d)));
      if (supabaseConnected) {
        saveActiveTrip(updatedTrip).then((ok) => console.log('[handleTransferTrip] saved updated trip:', ok));
      }
      if (nextDrv) {
        sendNativeNotification(
          lang === 'ar' ? 'طلب رحلة جديد فوري 🚖' : 'New Instant Ride 🚖',
          lang === 'ar'
            ? `أنت الكابتن الأقرب التالي للرحلة! قبول الرحلة مقابل ${currentTrip.fare} ج.م`
            : `You are the next closest Captain! Accept ride for ${currentTrip.fare} EGP`,
          '🚖'
        );
        playNotificationSound('new_trip');
      }
    } else {
      // No next driver -> cancel the trip
      handleCancelRide();
    }
  };

  const disableLowData = async () => {
    setLowDataMode(false);
    setDataSaverMode(false);
    setDataSaverState(false);
    if (supabaseConnected) {
      await saveStats({ ...stats, lowDataMode: false });
    }
  };

  const [routeCache, setRouteCache] = useState<Record<string, RouteResult>>({});

  const getRealRoute = useCallback(async (pickup: Location, dropoff: Location): Promise<RouteResult | null> => {
    const cacheKey = `${pickup.lat.toFixed(4)}_${pickup.lng.toFixed(4)}_${dropoff.lat.toFixed(4)}_${dropoff.lng.toFixed(4)}`;
    const cached = routeCache[cacheKey] || getCachedRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    if (cached && cached.distance > 0) return cached;

    const coordStr = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;

    // Free routing providers (no API key required).
    // Tried in order until one returns a real road path.
    const providers: Array<{ name: string; build: (coords: string) => { url: string; init?: RequestInit } }> = [
      {
        name: 'OSRM-1',
        build: (coords) => ({ url: `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true` }),
      },
      {
        name: 'OSRM-2',
        build: (coords) => ({ url: `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true` }),
      },
      {
        name: 'OSRM-3',
        build: (coords) => ({ url: `https://valhalla1.openstreetmap.de/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true` }),
      },
    ];

    try {
      for (const provider of providers) {
        try {
          const { url, init } = provider.build(coordStr);
          const res = await fetch(url, init);
          if (!res.ok) {
            console.warn(`[route] ${provider.name} responded ${res.status}`);
            continue;
          }
          const data = await res.json();
          let geometry: [number, number][] | undefined;
          let distance = 0;
          let durationSeconds: number | undefined;
          let steps: RouteStep[] | undefined;

          if (data.features && data.features.length > 0) {
            const f = data.features[0];
            distance = parseFloat((f.properties.summary.distance / 1000).toFixed(2));
            const coords = f.geometry.coordinates as [number, number][];
            geometry = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
            durationSeconds = f.properties.summary.duration ? Math.round(f.properties.summary.duration) : undefined;
            if (f.properties.steps) {
              steps = f.properties.steps.map((step: any) => ({
                instruction: step.maneuver?.instruction || '',
                name: step.name || (lang === 'ar' ? 'طريق بدون اسم' : 'Unnamed road'),
                distance: parseFloat((step.distance / 1000).toFixed(2)),
                duration: step.duration ? Math.round(step.duration) : 0,
                maneuver: step.maneuver ? {
                  type: step.maneuver.type || 'continue',
                  modifier: step.maneuver.modifier || undefined,
                } : undefined,
              }));
            }
          } else if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            distance = parseFloat((route.distance / 1000).toFixed(2));
            const coords = route.geometry.coordinates as [number, number][];
            geometry = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
            durationSeconds = route.duration ? Math.round(route.duration) : undefined;
            if (route.legs && route.legs[0]?.steps) {
              steps = route.legs[0].steps.map((step: any) => ({
                instruction: step.maneuver?.instruction || '',
                name: step.name || (lang === 'ar' ? 'طريق بدون اسم' : 'Unnamed road'),
                distance: parseFloat((step.distance / 1000).toFixed(2)),
                duration: step.duration ? Math.round(step.duration) : 0,
                maneuver: step.maneuver ? {
                  type: step.maneuver.type || 'continue',
                  modifier: step.maneuver.modifier || undefined,
                } : undefined,
              }));
            }
          }
          if (distance > 0 && geometry && geometry.length > 1) {
            const result: RouteResult = { distance, geometry, durationSeconds, steps };
            setCachedRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, result);
            setRouteCache(prev => {
              const updated = { ...prev, [cacheKey]: result };
              return updated;
            });
            console.log(`[route] ${provider.name} OK: ${distance} km, ${geometry.length} pts, ${steps?.length || 0} steps`);
            return result;
          }
        } catch (err) {
          console.warn(`[route] ${provider.name} error:`, err);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, [routeCache, lang]);

  // Navigation route: driver current position -> pickup -> dropoff
  const getNavigationRoute = useCallback(async (
    driverLat: number,
    driverLng: number,
    pickup: Location,
    dropoff: Location
  ): Promise<RouteResult | null> => {
    const cacheKey = `nav_${driverLat.toFixed(4)}_${driverLng.toFixed(4)}_${pickup.lat.toFixed(4)}_${pickup.lng.toFixed(4)}_${dropoff.lat.toFixed(4)}_${dropoff.lng.toFixed(4)}`;
    const cached = routeCache[cacheKey] || getCachedRoute(driverLat, driverLng, pickup.lat, pickup.lng);
    if (cached && cached.distance > 0) return cached;

    const coordStr = `${driverLng},${driverLat};${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;

    const providers: Array<{ name: string; build: (coords: string) => { url: string; init?: RequestInit } }> = [
      {
        name: 'OSRM-NAV-1',
        build: (coords) => ({ url: `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true` }),
      },
      {
        name: 'OSRM-NAV-2',
        build: (coords) => ({ url: `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true` }),
      },
    ];

    try {
      for (const provider of providers) {
        try {
          const { url, init } = provider.build(coordStr);
          const res = await fetch(url, init);
          if (!res.ok) {
            console.warn(`[nav] ${provider.name} responded ${res.status}`);
            continue;
          }
          const data = await res.json();
          let geometry: [number, number][] | undefined;
          let distance = 0;
          let durationSeconds: number | undefined;
          let steps: RouteStep[] = [];

          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            distance = parseFloat((route.distance / 1000).toFixed(2));
            const coords = route.geometry.coordinates as [number, number][];
            geometry = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
            durationSeconds = route.duration ? Math.round(route.duration) : undefined;

            if (route.legs) {
              route.legs.forEach((leg: any) => {
                if (leg.steps) {
                  leg.steps.forEach((step: any) => {
                    steps.push({
                      instruction: step.maneuver?.instruction || '',
                      name: step.name || (lang === 'ar' ? 'طريق بدون اسم' : 'Unnamed road'),
                      distance: parseFloat((step.distance / 1000).toFixed(2)),
                      duration: step.duration ? Math.round(step.duration) : 0,
                      maneuver: step.maneuver ? {
                        type: step.maneuver.type || 'continue',
                        modifier: step.maneuver.modifier || undefined,
                      } : undefined,
                    });
                  });
                }
              });
            }
          } else if (data.features && data.features.length > 0) {
            const f = data.features[0];
            distance = parseFloat((f.properties.summary.distance / 1000).toFixed(2));
            const coords = f.geometry.coordinates as [number, number][];
            geometry = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
            durationSeconds = f.properties.summary.duration ? Math.round(f.properties.summary.duration) : undefined;
            if (f.properties.steps) {
              steps = f.properties.steps.map((step: any) => ({
                instruction: step.maneuver?.instruction || '',
                name: step.name || (lang === 'ar' ? 'طريق بدون اسم' : 'Unnamed road'),
                distance: parseFloat((step.distance / 1000).toFixed(2)),
                duration: step.duration ? Math.round(step.duration) : 0,
                maneuver: step.maneuver ? {
                  type: step.maneuver.type || 'continue',
                  modifier: step.maneuver.modifier || undefined,
                } : undefined,
              }));
            }
          }

          if (distance > 0 && geometry && geometry.length > 1) {
            const result: RouteResult = { distance, geometry, durationSeconds, steps };
            setRouteCache(prev => {
              const updated = { ...prev, [cacheKey]: result };
              return updated;
            });
            console.log(`[nav] ${provider.name} OK: ${distance} km, ${geometry.length} pts, ${steps.length} steps`);
            return result;
          }
        } catch (err) {
          console.warn(`[nav] ${provider.name} error:`, err);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, [routeCache, lang]);

  // Convert relative XY (0-100 grid) to GPS around the service area (El-Ayyat / Giza)
  const getCoordsFromXY = (x: number, y: number) => {
    const latBase = 29.6197;
    const lngBase = 31.2561;
    const lat = latBase + (y - 50) * 0.0025;
    const lng = lngBase + (x - 50) * 0.0025;
    return { lat, lng };
  };

  const [tripDateFrom, setTripDateFrom] = useState<string>('');
  const [tripDateTo, setTripDateTo] = useState<string>('');
  const [tripPage, setTripPage] = useState<number>(0);
  const [tripHasMore, setTripHasMore] = useState<boolean>(true);
  const [isLoadingTrips, setIsLoadingTrips] = useState<boolean>(false);
  const [displayedTrips, setDisplayedTrips] = useState<Trip[]>([]);

  // Selected points in the Booking Form
  const [selectedPickup, setSelectedPickup] = useState<string>('1');
  const [selectedDropoff, setSelectedDropoff] = useState<string>('2');

  // Driver selected inside the Driver role screen
  const [selectedDriverId, setSelectedDriverId] = useState<string>('drv_1');

  const lastNavDriverLatRef = useRef<number | null>(null);
  const lastNavDriverLngRef = useRef<number | null>(null);
  const lastLocationSavedAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!activeTrip || !activeTrip.driverId) return;
    if (activeTrip.driverId !== selectedDriverId) return;

    const drv = drivers.find(d => d.id === selectedDriverId);
    if (!drv?.lat || !drv?.lng) return;

    const prevLat = lastNavDriverLatRef.current;
    const prevLng = lastNavDriverLngRef.current;

    if (prevLat !== null && prevLng !== null) {
      const dLat = Math.abs(drv.lat - prevLat);
      const dLng = Math.abs(drv.lng - prevLng);
      if (dLat > 0.0001 || dLng > 0.0001) {
        setRouteCache(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(key => {
            if (key.startsWith('nav_')) delete next[key];
          });
          return next;
        });
      }
    }

    lastNavDriverLatRef.current = drv.lat;
    lastNavDriverLngRef.current = drv.lng;
  }, [drivers, selectedDriverId, activeTrip?.driverId, activeTrip?.status]);

  // Terms and conditions accordion state
  const [termsOpen, setTermsOpen] = useState(false);

  // Registered riders list (sourced from Supabase)
  const [registeredRiders, setRegisteredRiders] = useState<Rider[]>([]);

  // App visitors count (sourced from Supabase stats)
  const [visitorCount, setVisitorCount] = useState<number>(0);

  // Rider auth form state
  const [riderFormMode, setRiderFormMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [riderFormName, setRiderFormName] = useState('');
  const [riderFormPhone, setRiderFormPhone] = useState('');
  const [riderFormPassword, setRiderFormPassword] = useState('');
  const [riderFormAgreed, setRiderFormAgreed] = useState(false);
  const [riderFormError, setRiderFormError] = useState('');
  const [riderLoginPhone, setRiderLoginPhone] = useState('');
  const [riderLoginPassword, setRiderLoginPassword] = useState('');

  // Driver auth form state
  const [drvFormMode, setDrvFormMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [drvFormName, setDrvFormName] = useState('');
  const [drvFormPhone, setDrvFormPhone] = useState('');
  const [drvFormPassword, setDrvFormPassword] = useState('');
  const [drvFormVehicleType, setDrvFormVehicleType] = useState<'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE'>('CAR');
  const [drvFormVehicleName, setDrvFormVehicleName] = useState('');
  const [drvFormNationalId, setDrvFormNationalId] = useState('');
  const [drvFormLicense, setDrvFormLicense] = useState('');
  const [drvFormPersonalPhoto, setDrvFormPersonalPhoto] = useState<string>('');
  const [drvFormNationalIdImage, setDrvFormNationalIdImage] = useState<string>('');
  const [drvFormLicenseImage, setDrvFormLicenseImage] = useState<string>('');
  const [drvFormVehicleLicenseImage, setDrvFormVehicleLicenseImage] = useState<string>('');
  const [drvFormAgreed, setDrvFormAgreed] = useState(false);
  const [drvFormError, setDrvFormError] = useState('');
  const [drvLoginPhone, setDrvLoginPhone] = useState('');
  const [drvLoginPassword, setDrvLoginPassword] = useState('');

  // PWA installation helper states
  const [installDismissed, setInstallDismissed] = useState<boolean>(false);
  const [showInstallWizard, setShowInstallWizard] = useState<boolean>(false);

  // Driver actively logged in state (persisted locally)
  const [driverIsLoggedIn, setDriverIsLoggedIn] = useState<boolean>(false);

  // Admin login states (persisted locally)
  const [adminIsLoggedIn, setAdminIsLoggedIn] = useState<boolean>(false);
  const [adminPhone, setAdminPhone] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [adminLoginError, setAdminLoginError] = useState('');

  // Legal Modal State (Terms & Conditions / Privacy Policy)
  const [showLegalModal, setShowLegalModal] = useState<boolean>(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy'>('terms');

  const openLegalTerms = () => {
    setLegalModalTab('terms');
    setShowLegalModal(true);
  };

  const openLegalPrivacy = () => {
    setLegalModalTab('privacy');
    setShowLegalModal(true);
  };

  // User & Driver Interactive Guide Modal State
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [guideModalTab, setGuideModalTab] = useState<'rider' | 'driver' | 'about'>('rider');

  const openGuideModal = (tab: 'rider' | 'driver' | 'about' = 'rider') => {
    setGuideModalTab(tab);
    setShowGuideModal(true);
  };

  // Data Saver state & Auto-detection for slow networks
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(getInitialDataSaverState);

  const handleToggleDataSaver = () => {
    setDataSaverMode((prev) => {
      const next = !prev;
      setDataSaverState(next);
      triggerToast(
        next ? (lang === 'ar' ? '⚡ تم تفعيل توفير البيانات' : '⚡ Data Saver Enabled') : (lang === 'ar' ? '⚡ تم إيقاف توفير البيانات' : '⚡ Data Saver Disabled'),
        next ? (lang === 'ar' ? 'تم تقليل استخدام الإنترنت للباقة مع الحفاظ على كافة المميزات' : 'Optimized data consumption for mobile network') : (lang === 'ar' ? 'تم العودة للوضع الطبيعي' : 'Returned to standard mode'),
        'success'
      );
      return next;
    });
  };
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedPickupRegion, setSelectedPickupRegion] = useState<string>('');
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [showFcmModal, setShowFcmModal] = useState<boolean>(false);

  // Initialize Firebase FCM token & listeners on mount
  useEffect(() => {
    initFirebaseFCM((payload) => {
      console.log('Foreground FCM received in App:', payload);
      triggerToast(
        payload.notification?.title || '🚨 إشعار جديد من فايربيز (FCM)',
        payload.notification?.body || 'تحديث جديد لرحلتك حالاً',
        'new_trip'
      );
    });
  }, []);

  // Premium In-App Strong Toast Notifications State
  const [toast, setToast] = useState<{ title: string; message: string; type: 'info' | 'success' | 'warning' | 'new_trip' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToast = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'new_trip' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ title, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // No localStorage persistence: state is sourced entirely from Supabase.

  // Live GPS geolocation watcher for online drivers
  const currentDriverIsOnline = drivers.find(d => d.id === selectedDriverId)?.isOnline ?? false;
  useEffect(() => {
    if (!driverIsLoggedIn || !selectedDriverId) return;

    const currentDriver = drivers.find(d => d.id === selectedDriverId);
    if (!currentDriver || !currentDriver.isOnline) return;

    if (!navigator.geolocation || !window.isSecureContext) {
      console.warn('Geolocation is blocked: requires HTTPS or secure context. Simulated position will be used instead.');
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setDrivers(prev =>
        prev.map(d =>
          d.id === selectedDriverId
            ? { ...d, lat: latitude, lng: longitude }
            : d
        )
      );
    };

    const handleError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        console.warn('Geolocation permission denied by user.');
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        console.warn('Geolocation position unavailable.');
      } else if (error.code === error.TIMEOUT) {
        console.warn('Geolocation request timed out.');
      } else {
        console.warn('Geolocation error:', error.message);
      }
    };

    const watcherId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: !lowDataMode,
      maximumAge: lowDataMode ? 30000 : 10000,
      timeout: lowDataMode ? 30000 : 15000,
    });

    return () => {
      navigator.geolocation.clearWatch(watcherId);
    };
  }, [driverIsLoggedIn, selectedDriverId, currentDriverIsOnline, lowDataMode]);

  // Screen access guard: redirect to HOME if user tries to access a protected screen without login
  useEffect(() => {
    if (!sessionLoaded) return;
    if (currentScreen === 'RIDER_DASHBOARD' && !rider.isLoggedIn) {
      setCurrentScreen('HOME');
    } else if (currentScreen === 'DRIVER_DASHBOARD' && !driverIsLoggedIn) {
      setCurrentScreen('HOME');
    } else if (currentScreen === 'HOME' && sessionLoaded) {
      if (rider.isLoggedIn && activeTrip && activeTrip.riderId === rider.id) {
        setCurrentScreen('RIDER_DASHBOARD');
      } else if (driverIsLoggedIn && activeTrip && activeTrip.driverId === selectedDriverId) {
        setCurrentScreen('DRIVER_DASHBOARD');
      }
    }
  }, [currentScreen, rider.isLoggedIn, driverIsLoggedIn, sessionLoaded, activeTrip, selectedDriverId]);

  // No localStorage persistence: state is sourced entirely from Supabase.

  // --- ONLINE DIRECT SUPABASE SYNC SYSTEM ---

  // 1. Initial Load from Supabase on mount
  useEffect(() => {
    requestNotificationPermission();

    const initSupabase = async () => {
      const isConnected = await checkSupabaseConnection();
      if (isConnected) {
        setSupabaseConnected(true);
        console.log('⚡ Connected to Supabase directly!');

        const dbLocations = await fetchLocations();
        if (dbLocations && dbLocations.length > 0) {
          setLocations(dbLocations);
        }

        const dbDrivers = await fetchDrivers();
        if (dbDrivers && dbDrivers.length > 0) {
          setDrivers(dbDrivers);
        }

        const dbRiders = await fetchRiders();
        if (dbRiders && dbRiders.length > 0) {
          setRegisteredRiders(dbRiders);
        }

        // Load regions so they appear for admin, riders, and drivers everywhere
        const dbRegions = await fetchRegions();
        if (dbRegions) {
          setRegions(dbRegions);
        }

        const dbAds = await fetchAds();
        if (dbAds) {
          setAds(dbAds);
        }

        const dbActiveTrip = await fetchActiveTrip(driverIsLoggedIn ? selectedDriverId : undefined, driverIsLoggedIn ? 'driver' : undefined);
        if (dbActiveTrip && dbActiveTrip !== 'NO_TABLE') {
          let enrichedTrip = dbActiveTrip;
          if (supabaseConnected && enrichedTrip.id) {
            const remoteChat = await fetchChatMessages(enrichedTrip.id);
            if (remoteChat.length > 0) {
              const remoteMap = new Map(remoteChat.map(m => [m.id, m]));
              const localMsgs = enrichedTrip.chatMessages || [];
              const merged = [...localMsgs];
              remoteChat.forEach(rm => {
                if (!merged.find(lm => lm.id === rm.id)) {
                  merged.push(rm);
                }
              });
              merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              enrichedTrip = { ...enrichedTrip, chatMessages: merged };
            }
          }
          setActiveTripWithTracking(enrichedTrip);
        }

        // Load session BEFORE fetching trips so we can filter by user
        const session = await loadSession();

        if (session) {
          if (session.role === 'ADMIN') {
            // Admin uses their own filtered queries in AdminView
          } else {
            const userRole = session.role.toLowerCase() as 'rider' | 'driver';
            const dbHistory = await fetchTripsHistory({ userId: session.userId, role: userRole });
            if (dbHistory && dbHistory.length > 0) {
              setTripsHistory(dbHistory);
            }
          }
        }

        const dbStats = await fetchStats();
       if (dbStats) {
         // Merge remote stats over the local defaults so any missing/new columns
         // are backfilled, then persist the merged row once so saved admin
         // values never fall back to defaults after a refresh.
         const merged = { ...stats, ...dbStats };
         // Mark stats as loaded BEFORE setStats so the auto-save effect that
         // fires on this state change persists the loaded values, not defaults.
         statsLoadedRef.current = true;
         setStats(merged);
         setLowDataMode(!!dbStats.lowDataMode);
         if (JSON.stringify(merged) !== JSON.stringify(dbStats)) {
           await saveStats(merged);
         }
       } else {
         // If we can't fetch stats, ensure we have a singleton row
         try {
           const { data, error } = await supabase
             .from('ezz_stats')
             .upsert({ id: 'singleton', commission_rate: 15, total_revenue: 0, total_commission: 0, total_completed_trips: 0, fixed_commission: 10, price_per_km: 8, base_fare: 20, distance_buffer: 1.25, created_at: new Date().toISOString() })
             .select('id')
             .single();
           if (error) throw error;
          } catch (err: any) {
            console.warn('Could not create singleton stats row:', err?.message || err);
          }
          // No saved stats existed; the singleton row above holds defaults.
          // Allow future admin edits to persist.
          statsLoadedRef.current = true;
       }

        // Restore last login session info for convenience,
        // and restore the last viewed screen if the session is still valid.
        if (session) {
          if (session.role === 'RIDER') {
            const r = dbRiders?.find(x => x.id === session.userId);
            if (r) {
              setRider({ ...r, isLoggedIn: true });
            }
          } else if (session.role === 'DRIVER') {
            const d = dbDrivers?.find(x => x.id === session.userId);
            if (d) {
              setSelectedDriverId(d.id);
              setDriverIsLoggedIn(true);
            }
          } else if (session.role === 'ADMIN') {
            setAdminIsLoggedIn(true);
          }
        }
        setSessionLoaded(true);

        // If user is logged in and has an active trip, ensure they land on the correct dashboard
        if (session && activeTrip) {
          if (session.role === 'RIDER' && activeTrip.riderId === session.userId && currentScreen !== 'RIDER_DASHBOARD') {
            setCurrentScreen('RIDER_DASHBOARD');
          } else if (session.role === 'DRIVER' && activeTrip.driverId === session.userId && currentScreen !== 'DRIVER_DASHBOARD') {
            setCurrentScreen('DRIVER_DASHBOARD');
          }
        }
      } else {
        setSupabaseConnected(false);
        console.warn('⚠️ Supabase tables not created yet or credentials offline. Using secure LocalStorage engine.');
      }
    };

    initSupabase();
  }, []);

  const TRIP_STATUS_ORDER: Record<string, number> = {
    'IDLE': 0,
    'SEARCHING': 1,
    'ACCEPTED': 2,
    'ARRIVED': 3,
    'STARTED': 4,
    'COMPLETED': 5,
    'CANCELLED': 6,
  };

  const lastLocalStatusChangeRef = useRef<{ status: string; timestamp: number } | null>(null);

  const markLocalStatusChange = (status: string) => {
    lastLocalStatusChangeRef.current = { status, timestamp: Date.now() };
  };

  const shouldSkipPollingUpdate = (remoteStatus: string): boolean => {
    const last = lastLocalStatusChangeRef.current;
    if (!last) return false;
    const secondsSinceChange = (Date.now() - last.timestamp) / 1000;
    if (secondsSinceChange > 3) {
      lastLocalStatusChangeRef.current = null;
      return false;
    }
    const remoteOrder = TRIP_STATUS_ORDER[remoteStatus] ?? 0;
    const localOrder = TRIP_STATUS_ORDER[last.status] ?? 0;
    return remoteOrder <= localOrder;
  };

  const setActiveTripWithTracking = (updater: React.SetStateAction<Trip | null>) => {
    setActiveTrip((prev) => {
      const next = typeof updater === 'function' ? (updater as (prev: Trip | null) => Trip | null)(prev) : updater;
      if (next && next.status !== prev?.status) {
        markLocalStatusChange(next.status);
      }
      return next;
    });
  };

  // 1b. Realtime subscription: deliver new ride requests to the driver's device instantly
  useEffect(() => {
    if (!supabaseConnected) return;
    const sub = subscribeToActiveTrips((trip) => {
      setActiveTripWithTracking((prev) => {
        if (!trip || trip.status === 'CANCELLED') {
          if (prev && prev.status === 'COMPLETED' && !dismissedTripIdsRef.current.has(prev.id)) {
            return prev;
          }
          return null;
        }
        // If driver is logged in and another driver accepted this trip, clear it from this driver's screen
        if (driverIsLoggedIn && trip.status === 'ACCEPTED' && trip.driverId && trip.driverId !== selectedDriverId) {
          return null;
        }
        if (dismissedTripIdsRef.current.has(trip.id)) {
          return null;
        }
        if (!prev) return trip;
        if (prev.id !== trip.id) return trip;

        if (prev.status === 'COMPLETED' || trip.status === 'COMPLETED') {
          return {
            ...prev,
            ...trip,
            riderRatingToDriver: trip.riderRatingToDriver ?? prev.riderRatingToDriver,
            riderFeedbackTags: trip.riderFeedbackTags?.length ? trip.riderFeedbackTags : prev.riderFeedbackTags,
            riderFeedbackComment: trip.riderFeedbackComment || prev.riderFeedbackComment,
            driverRatingToRider: trip.driverRatingToRider ?? prev.driverRatingToRider,
            driverFeedbackTags: trip.driverFeedbackTags?.length ? trip.driverFeedbackTags : prev.driverFeedbackTags,
            driverFeedbackComment: trip.driverFeedbackComment || prev.driverFeedbackComment,
          };
        }

        if (prev.status !== trip.status) {
          const prevOrder = TRIP_STATUS_ORDER[prev.status] ?? 0;
          const tripOrder = TRIP_STATUS_ORDER[trip.status] ?? 0;
          if (tripOrder <= prevOrder) return prev;
        }
        return trip;
      });
    }, driverIsLoggedIn ? selectedDriverId : undefined, driverIsLoggedIn ? 'driver' : 'rider');
    return () => sub.unsubscribe();
  }, [supabaseConnected, driverIsLoggedIn, selectedDriverId]);

  // 1c. Dedicated polling for active trip — works even when tab is in background
  useEffect(() => {
    if (!supabaseConnected) return;

    const pollInterval = getAdaptivePollingInterval(3000, dataSaverMode, !!activeTrip);

    const interval = setInterval(async () => {
      try {
        const remoteActiveTrip = await fetchActiveTrip(driverIsLoggedIn ? selectedDriverId : undefined, driverIsLoggedIn ? 'driver' : undefined);
        if (!remoteActiveTrip || remoteActiveTrip === 'NO_TABLE') {
          setActiveTripWithTracking((prev) => {
            if (prev && prev.status === 'COMPLETED' && !dismissedTripIdsRef.current.has(prev.id)) {
              return prev;
            }
            if (prev && prev.status === 'CANCELLED') {
              return null;
            }
            return prev;
          });
          return;
        }

        if (dismissedTripIdsRef.current.has(remoteActiveTrip.id)) {
          setActiveTripWithTracking((prev) => {
            if (prev && prev.id === remoteActiveTrip.id) return null;
            return prev;
          });
          return;
        }

        if (remoteActiveTrip.status === 'CANCELLED') {
          setActiveTripWithTracking((prev) => {
            if (prev && prev.id === remoteActiveTrip.id) return null;
            return prev;
          });
          return;
        }

        setActiveTripWithTracking((prev) => {
          if (!prev) {
            if (remoteActiveTrip.status === 'COMPLETED' && dismissedTripIdsRef.current.has(remoteActiveTrip.id)) {
              return null;
            }
            markLocalStatusChange(remoteActiveTrip.status);
            return remoteActiveTrip;
          }
          if (prev.id !== remoteActiveTrip.id) return remoteActiveTrip;

          if (prev.status === 'COMPLETED' || remoteActiveTrip.status === 'COMPLETED') {
            return {
              ...prev,
              ...remoteActiveTrip,
              riderRatingToDriver: remoteActiveTrip.riderRatingToDriver ?? prev.riderRatingToDriver,
              riderFeedbackTags: remoteActiveTrip.riderFeedbackTags?.length ? remoteActiveTrip.riderFeedbackTags : prev.riderFeedbackTags,
              riderFeedbackComment: remoteActiveTrip.riderFeedbackComment || prev.riderFeedbackComment,
              driverRatingToRider: remoteActiveTrip.driverRatingToRider ?? prev.driverRatingToRider,
              driverFeedbackTags: remoteActiveTrip.driverFeedbackTags?.length ? remoteActiveTrip.driverFeedbackTags : prev.driverFeedbackTags,
              driverFeedbackComment: remoteActiveTrip.driverFeedbackComment || prev.driverFeedbackComment,
            };
          }

          if (prev.status !== remoteActiveTrip.status) {
            if (shouldSkipPollingUpdate(remoteActiveTrip.status)) {
              console.log('[Polling] Skipping stale DB update:', remoteActiveTrip.status, 'local is newer:', prev.status);
              return prev;
            }
            const prevOrder = TRIP_STATUS_ORDER[prev.status] ?? 0;
            const remoteOrder = TRIP_STATUS_ORDER[remoteActiveTrip.status] ?? 0;
            if (remoteOrder < prevOrder) return prev;
          }

          // Preserve / merge chat messages if remote has newer or more messages
          const remoteMsgs = remoteActiveTrip.chatMessages || [];
          const localMsgs = prev.chatMessages || [];
          if (remoteMsgs.length > localMsgs.length || JSON.stringify(remoteMsgs) !== JSON.stringify(localMsgs)) {
            markLocalStatusChange(remoteActiveTrip.status);
            return { ...remoteActiveTrip, chatMessages: remoteMsgs };
          }

          markLocalStatusChange(remoteActiveTrip.status);
          return remoteActiveTrip;
        });
      } catch (err) {
        console.warn('Active trip polling error:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [supabaseConnected, dataSaverMode, !!activeTrip]);

  // 1d. Dedicated polling for drivers list — keeps driver screen updated in background
  const activeTripRefForPolling = useRef<Trip | null>(null);
  activeTripRefForPolling.current = activeTrip;

  useEffect(() => {
    if (!supabaseConnected) return;

    const pollInterval = getAdaptivePollingInterval(3000, dataSaverMode, false);

    const interval = setInterval(async () => {
      try {
        const remoteDrivers = await fetchDrivers();
        console.log('[Drivers Polling] Fetched', remoteDrivers?.length || 0, 'drivers from DB');
        if (remoteDrivers && remoteDrivers.length > 0) {
          const availableCount = remoteDrivers.filter(d => d.approvalStatus === 'APPROVED' && d.isOnline && d.status === 'AVAILABLE').length;
          console.log('[Drivers Polling] Available drivers:', availableCount);
          const currentTrip = activeTripRefForPolling.current;
          setDrivers((localDrivers) => {
            return remoteDrivers.map((rd) => {
              const ld = localDrivers.find((l) => l.id === rd.id);
              if (ld) {
                const isActiveTripDriver = currentTrip && currentTrip.driverId === rd.id && (currentTrip.status === 'ACCEPTED' || currentTrip.status === 'STARTED');
                return {
                  ...rd,
                  currentX: isActiveTripDriver ? ld.currentX : rd.currentX,
                  currentY: isActiveTripDriver ? ld.currentY : rd.currentY,
                  isOnline: ld.isOnline,
                  status: ld.isOnline ? ld.status : rd.status,
                };
              }
              return rd;
            });
          });
        }

        // Fetch pending trip requests for drivers list view
        const remotePending = await fetchPendingTrips();
        if (remotePending) {
          setPendingTrips(remotePending);
        }
      } catch (err) {
        console.warn('Drivers polling error:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [supabaseConnected, dataSaverMode]);

  // 2. General-purpose sync (riders + stats) — still paused when tab hidden to save bandwidth
  const pricingSaveGuardUntilRef = useRef<number>(0);

  useEffect(() => {
    if (!supabaseConnected) return;

    let syncInterval = 30000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const runSync = async () => {
      try {
        const remoteRiders = await fetchRiders();
        if (remoteRiders && remoteRiders.length > 0) {
          setRegisteredRiders(remoteRiders);
        }

        const now = Date.now();
        const shouldSkipPricingSync = now < pricingSaveGuardUntilRef.current;

        if (!shouldSkipPricingSync) {
          const remoteStats = await fetchStats();
          if (remoteStats) {
            setStats((prev) => {
              const next = { ...prev };
              (Object.keys(remoteStats) as (keyof SystemStats)[]).forEach((k) => {
                if (remoteStats[k] !== undefined) {
                  (next as any)[k] = (remoteStats as any)[k];
                }
              });
              return next;
            });
          }
        }
      } catch (err) {
        console.warn('Sync loop error:', err);
      }
    };

    const scheduleNext = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        if (document.hidden) {
          scheduleNext();
          return;
        }
        await runSync();
        scheduleNext();
      }, syncInterval);
    };

    scheduleNext();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timeoutId) clearTimeout(timeoutId);
      } else {
        runSync();
        scheduleNext();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [supabaseConnected]);


  // 2.5 Unified Reactive Notification & Strong Alerts Watcher with Deduplication
  const notifiedEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeTrip) {
      if (notifiedEventsRef.current.has('had_trip') && !notifiedEventsRef.current.has('cancelled_notified')) {
        notifiedEventsRef.current.add('cancelled_notified');
        if (lastTripCompletedRef.current) {
          lastTripCompletedRef.current = false;
          return;
        }
        if (lastTripCancelledRef.current) {
          lastTripCancelledRef.current = false;
          return;
        }
        playNotificationSound('alert');
        sendNativeNotification('⚠️ تم إلغاء الرحلة', 'تم إلغاء المشوار الحالي من قبل الطرف الآخر.', '❌');
        triggerToast('⚠️ تم إلغاء الرحلة', 'تم إلغاء المشوار الحالي من قبل الطرف الآخر.', 'warning');
      }
      return;
    }

    notifiedEventsRef.current.add('had_trip');
    notifiedEventsRef.current.delete('cancelled_notified');

    const currentTripId = activeTrip.id;
    const currentStatus = activeTrip.status;

    const statusEventKey = `${currentTripId}_status_${currentStatus}`;

     if (!notifiedEventsRef.current.has(statusEventKey)) {
       notifiedEventsRef.current.add(statusEventKey);

       if (currentStatus === 'SEARCHING' && driverIsLoggedIn) {
         lastTripCompletedRef.current = false;
         lastTripCancelledRef.current = false;
         sendNativeNotification(
           '🚖 طلب رحلة جديد متاح!',
           `العميل ${activeTrip.riderName} يطلب رحلة من ${activeTrip.pickup.nameAr} إلى ${activeTrip.dropoff.nameAr}.`,
           '🚗'
         );
         startTitleFlash('🚨 طلب رحلة جديد!');
         triggerToast(
           '🚖 طلب رحلة جديد متاح!',
           `العميل ${activeTrip.riderName} يطلب رحلة من ${activeTrip.pickup.nameAr} إلى ${activeTrip.dropoff.nameAr}.`,
           'new_trip'
         );
       } else if (currentStatus === 'ACCEPTED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? `تم قبول رحلتك، الكابتن ${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.`
             : `Your ride has been accepted. Captain ${activeTrip.driverName || 'Ezz'} is on the way.`,
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '🚗 تم قبول رحلتك!',
           `الكابتن ${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.`,
           '✅'
         );
         startTitleFlash('🚗 الكابتن قادم!');
         setTimeout(stopTitleFlash, 5000);
         triggerVibration([200, 100, 200, 100, 300]);
         triggerToast(
           '🚗 تم قبول رحلتك!',
           `الكابتن ${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.`,
           'success'
         );
       } else if (currentStatus === 'ARRIVED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? 'وصل الكابتن إلى موقعك وهو في انتظارك الآن.'
             : 'The captain has arrived at your location.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '📍 الكابتن وصل!',
           'الكابتن متواجد في نقطة الركوب الآن بانتظارك.',
           '⭐'
         );
         triggerToast(
           '📍 الكابتن وصل!',
           'الكابتن متواجد في نقطة الركوب الآن بانتظارك.',
           'info'
         );
       } else if (currentStatus === 'STARTED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? 'بدأت الرحلة الآن، نتمنى لك مشواراً آمناً.'
             : 'The ride has started, wish you a safe trip.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         triggerToast(
           '🚀 بدأت الرحلة الآن!',
           'نتمنى لك رحلة سعيدة وآمنة مع كابتن عز.',
           'success'
         );
       } else if (currentStatus === 'COMPLETED') {
         lastTripCompletedRef.current = true;
         playNotificationSound('trip_completed');
         speakText(
           lang === 'ar'
             ? 'حمد لله على السلامة، تم إكمال الرحلة بنجاح وشكراً لاختيارك عز.'
             : 'Welcome back, trip completed successfully. Thank you for choosing Ezz.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '🎉 وصلت بالسلامة!',
           'تم إكمال الرحلة بنجاح. شكراً لك على اختيارك كابتن عز!',
           '✨'
         );
         startTitleFlash('✨ وصلت بالسلامة!');
         setTimeout(stopTitleFlash, 5000);
         triggerToast(
           '🎉 وصلت بالسلامة!',
           'تم إكمال الرحلة بنجاح. شكراً لك على اختيارك كابتن عز!',
           'success'
         );
       } else if (currentStatus === 'CANCELLED') {
         lastTripCancelledRef.current = true;
         playNotificationSound('alert');
         speakText(
           lang === 'ar'
             ? 'تم إلغاء الرحلة بسبب عدم قبول أي سائق. يمكنك طلب رحلة جديدة.'
             : 'The ride was cancelled because no driver accepted. You can request a new ride.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '❌ تم إلغاء الرحلة',
           lang === 'ar'
             ? 'لم يقبل أي سائق الرحلة. يمكنك طلب رحلة جديدة.'
             : 'No driver accepted the ride. You can request a new ride.',
           '❌'
         );
         triggerToast(
           '❌ تم إلغاء الرحلة',
           lang === 'ar'
             ? 'لم يقبل أي سائق الرحلة. يمكنك طلب رحلة جديدة.'
             : 'No driver accepted the ride. You can request a new ride.',
           'warning'
         );
       }
     }

    // Chat Message Notifications
    if (activeTrip.chatMessages && activeTrip.chatMessages.length > 0) {
      activeTrip.chatMessages.forEach((msg) => {
        const msgEventKey = `${currentTripId}_msg_${msg.id}`;
        if (!notifiedEventsRef.current.has(msgEventKey)) {
          notifiedEventsRef.current.add(msgEventKey);
          playNotificationSound('chat_message');
          sendNativeNotification(
            `💬 رسالة جديدة من ${msg.sender === 'DRIVER' ? 'الكابتن' : 'العميل'}`,
            msg.text,
            '💬'
          );
          triggerToast(
            `💬 رسالة جديدة من ${msg.sender === 'DRIVER' ? 'الكابتن' : 'العميل'}`,
            msg.text,
            'info'
          );
        }
      });
    }
  }, [activeTrip, driverIsLoggedIn, lang]);

  // 1.5. Loud Alarm Handler Loop for Driver Ride Requests
  useEffect(() => {
    if (activeTrip && activeTrip.status === 'SEARCHING' && driverIsLoggedIn && activeTrip.currentOfferedDriverId === selectedDriverId) {
      // Silent text-only notification handled by reactive watcher / background poller
    } else {
      // No active offered trip for this driver, stop any ringing alarm
      stopLoudRepeatingAlarm();
    }

    return () => {
      stopLoudRepeatingAlarm();
    };
  }, [activeTrip?.id, activeTrip?.status, activeTrip?.currentOfferedDriverId, driverIsLoggedIn, selectedDriverId]);

  // PWA Service Worker Registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered successfully with scope:', registration.scope);

          // Request push notification permission
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  // 3. Background notification poller — keeps driver alerts alive even when tab is hidden
  useEffect(() => {
    if (!supabaseConnected || !driverIsLoggedIn) return;

    // Auto-request notification permission when driver logs in
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    let lastNotifiedTripId: string | null = null;
    let lastNotifiedOfferedDriverId: string | null = null;
    const interval = setInterval(async () => {
      try {
        const remoteActiveTrip = await fetchActiveTrip(selectedDriverId, 'driver');
        if (!remoteActiveTrip || remoteActiveTrip === 'NO_TABLE') return;

        // If trip is no longer SEARCHING, clear notification state and stop alarm
        if (remoteActiveTrip.status !== 'SEARCHING') {
          if (lastNotifiedTripId !== null) {
            console.log('[BackgroundPoller] Trip left SEARCHING, clearing notifications');
            stopLoudRepeatingAlarm();
            lastNotifiedTripId = null;
            lastNotifiedOfferedDriverId = null;
          }
          return;
        }

        // Only notify if this is a NEW trip or the offered driver changed
        const isNewTrip = remoteActiveTrip.id !== lastNotifiedTripId;
        const offeredDriverChanged = remoteActiveTrip.currentOfferedDriverId !== lastNotifiedOfferedDriverId;
        
        if ((isNewTrip || offeredDriverChanged) && remoteActiveTrip.status === 'SEARCHING') {
          // Check if this driver is eligible for this trip
          const isEligible = remoteActiveTrip.offeredDriverIds?.includes(selectedDriverId);
          if (!isEligible) {
            // Driver is no longer eligible, stop alarm
            if (lastNotifiedTripId === remoteActiveTrip.id) {
              stopLoudRepeatingAlarm();
              lastNotifiedTripId = null;
              lastNotifiedOfferedDriverId = null;
            }
            return;
          }

          // Only notify if we haven't already notified about this specific trip+driver combo
          const notificationKey = `${remoteActiveTrip.id}-${remoteActiveTrip.currentOfferedDriverId}`;
          if (notificationKey !== `${lastNotifiedTripId}-${lastNotifiedOfferedDriverId}`) {
            console.log('[BackgroundPoller] New notification for trip:', remoteActiveTrip.id, 'driver:', remoteActiveTrip.currentOfferedDriverId);
            lastNotifiedTripId = remoteActiveTrip.id;
            lastNotifiedOfferedDriverId = remoteActiveTrip.currentOfferedDriverId || null;
            
            const speechMsg = lang === 'ar'
              ? `طلب رحلة جديد بقيمة ${remoteActiveTrip.fare} جنيه فقط`
              : `طلب رحلة جديد بقيمة ${remoteActiveTrip.fare} جنيه فقط`;

            // Audio-First Priority: Sound & Speech FIRST, then ServiceWorker/Native Notification SECOND
            notifyDriverWithAudioFirst({
              title: lang === 'ar' ? '🚖 طلب مشوار جديد!' : '🚖 New Ride Request!',
              body: `طلب رحلة جديد بقيمة ${remoteActiveTrip.fare} جنيه فقط (${remoteActiveTrip.pickup.nameAr || remoteActiveTrip.pickup.nameEn} ← ${remoteActiveTrip.dropoff.nameAr || remoteActiveTrip.dropoff.nameEn})`,
              soundType: 'new_trip',
              speechText: speechMsg,
              lang: 'ar-EG',
              tag: `trip-${remoteActiveTrip.id}`,
            });
          }
        }
      } catch (err) {
        console.warn('Background notification poll error:', err);
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      stopLoudRepeatingAlarm();
    };
  }, [supabaseConnected, driverIsLoggedIn, selectedDriverId, lang]);

  // 4. Reactive Push Sync to Supabase upon state updates (debounced)
  const driversSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pricingSaveWriteGuardUntilRef = useRef<number>(0);

  const lastSyncedDriversRef = useRef<Record<string, Partial<Driver>>>({});

  const syncDriversToSupabase = async (driverList: Driver[]) => {
    if (!supabaseConnected) return;
    const changedDrivers = driverList.filter((d) => {
      const last = lastSyncedDriversRef.current[d.id];
      if (!last) return true;
      return (
        d.currentX !== last.currentX ||
        d.currentY !== last.currentY ||
        d.isOnline !== last.isOnline ||
        d.status !== last.status ||
        d.totalEarnings !== last.totalEarnings ||
        d.totalCommissionPaid !== last.totalCommissionPaid ||
        d.totalTrips !== last.totalTrips ||
        d.rating !== last.rating
      );
    });
    if (changedDrivers.length === 0) return;
    await Promise.allSettled(changedDrivers.map((d) => saveDriver(d)));
    changedDrivers.forEach((d) => {
      lastSyncedDriversRef.current[d.id] = {
        currentX: d.currentX,
        currentY: d.currentY,
        isOnline: d.isOnline,
        status: d.status,
        totalEarnings: d.totalEarnings,
        totalCommissionPaid: d.totalCommissionPaid,
        totalTrips: d.totalTrips,
        rating: d.rating,
      };
    });
  };

  useEffect(() => {
    if (!supabaseConnected || drivers.length === 0) return;
    if (driversSyncTimerRef.current) clearTimeout(driversSyncTimerRef.current);
    driversSyncTimerRef.current = setTimeout(() => {
      syncDriversToSupabase(drivers);
    }, 3000);
    return () => {
      if (driversSyncTimerRef.current) clearTimeout(driversSyncTimerRef.current);
    };
  }, [drivers, supabaseConnected]);

  const lastSavedTripRef = useRef<string | null>(null);
  const lastSavedTripSnapshotRef = useRef<string>('');

   useEffect(() => {
     if (!supabaseConnected || !activeTrip) return;
     
     const snapshot = JSON.stringify(activeTrip);
     if (lastSavedTripSnapshotRef.current === snapshot) return;
     lastSavedTripSnapshotRef.current = snapshot;

     const chatMessagesKey = activeTrip.chatMessages?.length
       ? `${activeTrip.chatMessages.length}-${activeTrip.chatMessages[activeTrip.chatMessages.length - 1].id}`
       : '0';

     const currentTripKey = JSON.stringify({
       id: activeTrip.id,
       status: activeTrip.status,
       offeredDriverIds: activeTrip.offeredDriverIds,
       currentOfferedDriverId: activeTrip.currentOfferedDriverId,
       chatMessagesKey,
     });
     
     if (lastSavedTripRef.current === currentTripKey) return;
     
     lastSavedTripRef.current = currentTripKey;
     saveActiveTrip(activeTrip).then((ok) => {
       console.log('[saveActiveTrip useEffect] Saved trip:', activeTrip.id, 'status:', activeTrip.status, 'result:', ok);
     });
   }, [supabaseConnected, activeTrip]);

  // Clear saved trip when activeTrip becomes null (cancelled/completed)
  useEffect(() => {
    if (!supabaseConnected) return;
    if (!activeTrip && lastSavedTripRef.current !== null) {
      lastSavedTripRef.current = null;
      saveActiveTrip(null).then((ok) => {
        console.log('[saveActiveTrip useEffect] Cleared active trip, result:', ok);
      });
    }
  }, [activeTrip, supabaseConnected]);

  useEffect(() => {
    if (supabaseConnected && registeredRiders.length > 0) {
      registeredRiders.forEach(r => saveRider(r));
    }
  }, [registeredRiders, supabaseConnected]);

  useEffect(() => {
    // Only persist once the initial stats have been loaded from Supabase.
    // This prevents the default values from overwriting saved admin prices
    // during the brief window before fetchStats() completes on load/refresh.
    if (supabaseConnected && stats && statsLoadedRef.current) {
      saveStats(stats);
    }
  }, [stats, supabaseConnected]);

  useEffect(() => {
    if (supabaseConnected && locations.length > 0) {
      locations.forEach(l => saveLocationInDB(l));
    }
  }, [locations, supabaseConnected]);

  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'SEARCHING' || !activeTrip.currentOfferedDriverId) return;

    const timer = setInterval(() => {
      setActiveTripWithTracking((prev) => {
        if (!prev || prev.status !== 'SEARCHING' || !prev.currentOfferedDriverId) {
          clearInterval(timer);
          return prev;
        }

        const currentTimer = prev.dispatchTimer !== undefined ? prev.dispatchTimer : 180;

         if (currentTimer <= 1) {
           clearInterval(timer);
           return {
             ...prev,
             status: 'CANCELLED' as TripStatus,
             currentOfferedDriverId: undefined,
             dispatchTimer: 0,
           };
         }

         if (currentTimer === 30) {
           sendNativeNotification(
             '⏰ الرحلة ستلغى قريباً',
             lang === 'ar'
               ? 'لم يقبل أي سائق الرحلة خلال 30 ثانية. ستلغى الرحلة قريباً.'
               : 'No driver accepted the ride within 30 seconds. The ride will be cancelled soon.',
             '⏰'
           );
         }

         return {
           ...prev,
           dispatchTimer: currentTimer - 1,
         };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTrip?.status, activeTrip?.currentOfferedDriverId]);

  // GPS Movement Simulation loop (remains active background feature)
  useEffect(() => {
    if (!activeTrip || !activeTrip.driverId) return;

    let targetX = 0;
    let targetY = 0;

    if (activeTrip.status === 'ACCEPTED') {
      targetX = activeTrip.pickup.x || 50;
      targetY = activeTrip.pickup.y || 50;
    } else if (activeTrip.status === 'STARTED') {
      targetX = activeTrip.dropoff.x || 50;
      targetY = activeTrip.dropoff.y || 50;
    } else {
      return;
    }

    let saveCounter = 0;

    const interval = setInterval(() => {
      setDrivers((prevDrivers) => {
        let reached = false;
        const next = prevDrivers.map((drv) => {
          if (drv.id !== activeTrip.driverId) return drv;

          const dx = targetX - drv.currentX;
          const dy = targetY - drv.currentY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 4) {
            reached = true;
            const coords = getCoordsFromXY(targetX, targetY);
            return {
              ...drv,
              currentX: targetX,
              currentY: targetY,
              lat: coords.lat,
              lng: coords.lng,
            };
          }

          const step = 4;
          const moveX = (dx / dist) * step;
          const moveY = (dy / dist) * step;
          const newX = drv.currentX + moveX;
          const newY = drv.currentY + moveY;
          const coords = getCoordsFromXY(newX, newY);

          return {
            ...drv,
            currentX: newX,
            currentY: newY,
            lat: coords.lat,
            lng: coords.lng,
          };
        });

        if (reached) {
          clearInterval(interval);
        }

        // Save driver location to DB every 6 ticks (~1.2s) for live tracking
        saveCounter++;
        if (saveCounter % 6 === 0 && supabaseConnected) {
          const updatedDriver = next.find((d) => d.id === activeTrip.driverId);
          if (updatedDriver && updatedDriver.lat && updatedDriver.lng) {
            saveDriver(updatedDriver);
          }
        }

        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [activeTrip?.status, activeTrip?.id, activeTrip?.driverId]);

  // Auto-complete trip after 2 minutes when started (simulating ride completion)
  useEffect(() => {
    if (!activeTrip || activeTrip.status !== 'STARTED') return;
    const timer = setTimeout(() => {
      handleRateDriver(5, ['good', 'safe'], 'Auto-completed trip');
    }, 120000);
    return () => clearTimeout(timer);
  }, [activeTrip?.status, activeTrip?.id]);

  // Handler: Request Ride with dynamic commission rate calculation by mileage (distance-based commission request)
  const handleRequestRide = async (
    requestedVehicleType: 'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE' = 'CAR',
    pickupLandmark?: string,
    promoCode?: string,
    promoCodeId?: string
  ) => {
    // 🛡️ Multi-booking protection: Prevent rider from requesting another trip if they already have an active one
    if (activeTrip && activeTrip.riderId === rider.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status)) {
      triggerToast(
        lang === 'ar' ? 'لديك رحلة جارية بالفعل' : 'Active Ride In Progress',
        lang === 'ar' ? 'لا يمكنك طلب رحلة جديدة حتى إنهاء الرحلة الحالية.' : 'You cannot request a new trip until your current trip ends.',
        'warning'
      );
      return;
    }

    if (!selectedPickup || !selectedDropoff) return;
    const pLoc = locations.find((l) => l.id === selectedPickup);
    const dLoc = locations.find((l) => l.id === selectedDropoff);
    if (!pLoc || !dLoc) return;
    setNoAvailableDrivers(false);

    // Use ONLY real road distance from cache or ORS/OSRM API
    let distance: number | null = null;
    let etaMinutes: number | undefined;
    let routeGeometry: [number, number][] | undefined;
    const cacheKey = `${pLoc.lat.toFixed(4)}_${pLoc.lng.toFixed(4)}_${dLoc.lat.toFixed(4)}_${dLoc.lng.toFixed(4)}`;
    const cachedRoute = routeCache[cacheKey];
    if (cachedRoute && cachedRoute.distance > 0) {
      distance = Math.max(1, parseFloat(cachedRoute.distance.toFixed(2)));
      etaMinutes = cachedRoute.durationSeconds ? Math.max(1, Math.round(cachedRoute.durationSeconds / 60)) : undefined;
      routeGeometry = cachedRoute.geometry;
    } else {
      try {
        const realRoute = await getRealRoute(pLoc, dLoc);
        if (realRoute && realRoute.distance > 0) {
          distance = Math.max(1, parseFloat(realRoute.distance.toFixed(2)));
          etaMinutes = realRoute.durationSeconds ? Math.max(1, Math.round(realRoute.durationSeconds / 60)) : undefined;
          routeGeometry = realRoute.geometry;
        }
      } catch {
        // ignore
      }
    }

    // Fallback: if real route unavailable, use estimated distance so trip still proceeds
    if (!distance) {
      const directDistance = calculateHaversineDistance(pLoc.lat, pLoc.lng, dLoc.lat, dLoc.lng);
      const fallbackDistance = estimateDrivingDistance(directDistance, stats.distanceBuffer ?? 1.25) + (stats.additionalKm ?? 0.0);
      distance = Math.max(1, parseFloat(fallbackDistance.toFixed(2)));
    }

    let appliedDiscount = 0;
    let appliedPromoCode: string | undefined;
    let appliedPromoDiscount: number | undefined;

    if (promoCode && promoCodeId) {
      appliedDiscount = 0;
      appliedPromoCode = promoCode;
      appliedPromoDiscount = 0;
    } else if (promoCode && stats?.promoCode && promoCode.trim().toUpperCase() === stats.promoCode.trim().toUpperCase()) {
      appliedDiscount = stats.promoValue || 5;
      appliedPromoCode = promoCode;
      appliedPromoDiscount = appliedDiscount;
    }

    const { baseFare, commission, finalFare } = calculateFullTripFare(distance, requestedVehicleType, stats, appliedDiscount);
    const fare = finalFare;

    // Broadcast dispatch to up to 50 available drivers in the region simultaneously.
    // The first driver to accept wins the ride. 3-minute acceptance window (180s).
    const MAX_OFFERED_DRIVERS = 50;
    const DISPATCH_TIMER_SECONDS = 180;

    let currentOfferedDriverId: string | undefined = undefined;
    let offeredDriverIds: string[] = [];
    
    // Always fetch latest drivers from Supabase to avoid stale empty list
    let eligibleDrivers: Driver[] = [];
    if (supabaseConnected) {
      try {
        const freshDrivers = await fetchDrivers();
        if (freshDrivers && freshDrivers.length > 0) {
          eligibleDrivers = freshDrivers.filter(d => d.approvalStatus === 'APPROVED' && d.isOnline && d.status === 'AVAILABLE');
        }
      } catch (e) {
        console.warn('Could not fetch fresh drivers for dispatch, falling back to local list:', e);
        eligibleDrivers = drivers.filter(d => d.approvalStatus === 'APPROVED' && d.isOnline && d.status === 'AVAILABLE');
      }
    } else {
      eligibleDrivers = drivers.filter(d => d.approvalStatus === 'APPROVED' && d.isOnline && d.status === 'AVAILABLE');
    }

    // Filter drivers by the pickup region selected by rider.
    // Only drivers whose coverage areas include the selected region receive the request.
    const selectedRegion = regions.find(r => r.id === selectedPickupRegion);
    if (selectedRegion && selectedRegion.id !== 'all') {
      eligibleDrivers = eligibleDrivers.filter(d => {
        if (!d.serviceAreas || d.serviceAreas.length === 0) return true; // covers all regions by default
        return d.serviceAreas.some(
          sa =>
            sa === selectedRegion.nameAr ||
            sa === selectedRegion.nameEn ||
            sa === selectedRegion.id ||
            sa === 'جميع المناطق' ||
            sa === 'All Regions' ||
            sa === 'كل المناطق' ||
            sa.includes('بني سويف')
        );
      });
    }

    const dispatchTimer = DISPATCH_TIMER_SECONDS;
    const dispatchTimerMax = DISPATCH_TIMER_SECONDS;

    if (eligibleDrivers.length > 0) {
      // Sort drivers by precise Haversine distance to pickup location
      const sortedDrivers = eligibleDrivers
        .map((d) => {
          const dCoords = getCoordsFromXY(d.currentX, d.currentY);
          const dist = calculateHaversineDistance(
            dCoords.lat,
            dCoords.lng,
            pLoc.lat,
            pLoc.lng
          );
          return { driver: d, distance: dist };
        })
        .sort((a, b) => a.distance - b.distance);

      offeredDriverIds = sortedDrivers.slice(0, MAX_OFFERED_DRIVERS).map((item) => item.driver.id);
      currentOfferedDriverId = offeredDriverIds[0];

      // Send push notification to all offered drivers immediately
      const notifiedDrivers = drivers.filter(d => offeredDriverIds.includes(d.id));
      notifiedDrivers.forEach((drv) => {
        const driverDist = sortedDrivers.find(s => s.driver.id === drv.id)?.distance ?? 0;
        const etaMins = Math.max(1, Math.round(driverDist * 2.5));
        sendNativeNotification(
          lang === 'ar' ? 'طلب رحلة جديد 🚖' : 'New Ride Request 🚖',
          lang === 'ar'
            ? `طلب رحلة من ${pLoc.nameAr} إلى ${dLoc.nameAr} بقيمة ${fare} ج.م. المسافة لك ${driverDist.toFixed(1)} كم (${etaMins} دقيقة).`
            : `Ride from ${pLoc.nameEn} to ${dLoc.nameEn} for ${fare} EGP. You are ${driverDist.toFixed(1)} km away (${etaMins} mins).`,
          '🚖'
        );
      });
      playNotificationSound('new_trip');

      const newTrip: Trip = {
        id: `trip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        riderId: rider.id,
        riderName: rider.name,
        riderPhone: rider.phone,
        pickup: pLoc,
        dropoff: dLoc,
        pickupLandmark,
        status: 'SEARCHING',
        fare,
        commission,
        distance,
        routeGeometry,
        etaMinutes,
        requestedVehicleType,
        createdAt: new Date().toISOString(),
        chatMessages: [],
        currentOfferedDriverId,
        offeredDriverIds,
        dispatchTimer,
        dispatchTimerMax,
        appliedPromoCode,
        appliedPromoDiscount,
        pickupRegionId: selectedRegion?.id,
        pickupRegionName: selectedRegion?.nameAr,
      };

      setActiveTripWithTracking(newTrip);

      if (supabaseConnected) {
        saveActiveTrip(newTrip).then((ok) => {
          console.log('[handleRequestRide] saveActiveTrip result:', ok);
          if (ok && promoCodeId) {
            markPromoCodeAsUsed(promoCodeId, newTrip.id).catch(() => {});
          }
        });
      }
    } else {
      setNoAvailableDrivers(true);
      triggerToast(
        lang === 'ar' ? 'لا يوجد سائقين متاحين' : 'No available drivers',
        lang === 'ar'
          ? 'عذراً، لا يوجد سائقين متاحين في منطقتك حالياً. يرجى المحاولة مرة أخرى لاحقاً.'
          : 'Sorry, there are no available drivers in your area right now. Please try again later.',
        'warning'
      );
      return;
    }
  };

  // Handler: Send Chat Message in Active Trip
  const handleSendChatMessage = (text: string, sender: 'RIDER' | 'DRIVER') => {
    if (!activeTrip) return;

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    setActiveTripWithTracking((prev) => {
      if (!prev) return null;
      const chatMessages = prev.chatMessages ? [...prev.chatMessages, newMessage] : [newMessage];
      const updated = { ...prev, chatMessages };
      if (supabaseConnected) {
        saveActiveTrip(updated).catch(() => {});
        saveChatMessage(activeTrip.id, newMessage).catch(() => {});
      }
      return updated;
    });
  };

  // Handler: Cancel Ride
  const handleCancelRide = () => {
    if (activeTrip) {
      dismissedTripIdsRef.current.add(activeTrip.id);
      const { driverId } = activeTrip;

      if (driverId) {
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, status: 'AVAILABLE' } : d))
        );
      }

      const cancelledTrip = { 
        ...activeTrip, 
        status: 'CANCELLED' as TripStatus, 
        completedAt: new Date().toISOString() 
      };

      // Save cancelled trip to history so it shows in طلبات الرحلات
      setTripsHistory((prev) => [cancelledTrip, ...prev]);

      if (supabaseConnected) {
        saveTripToHistory(cancelledTrip);
        saveActiveTrip(null).then((ok) => {
          console.log('[handleCancelRide] Cleared active trip from DB, result:', ok);
        });
      }
    }

    setActiveTripWithTracking(null);
    setNoAvailableDrivers(false);
    setPendingRequestCount(0);
  };

  // Handler: Driver Toggle Online
  const handleToggleOnline = (driverId: string) => {
    setDrivers((prev) => {
      const updated = prev.map((d) => {
        if (d.id !== driverId) return d;
        const nextOnline = !d.isOnline;
        // When going online, also set status to AVAILABLE so the rider sees the driver as available
        return { ...d, isOnline: nextOnline, status: nextOnline ? 'AVAILABLE' as const : d.status };
      });
      const driver = updated.find((d) => d.id === driverId);
      if (driver && supabaseConnected) {
        saveDriver(driver);
      }
      return updated;
    });
  };

  const handleUpdateDriverLocation = (driverId: string, lat: number, lng: number, x: number, y: number) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === driverId ? { ...d, currentX: x, currentY: y, lat, lng } : d))
    );

    // Throttled persistence to Supabase to avoid excessive writes
    try {
      const now = Date.now();
      const last = lastLocationSavedAtRef.current[driverId] || 0;
      const timeSince = now - last;
      const SHOULD_SAVE_MS = 5000; // at most once every 5s per driver
      if (supabaseConnected && (timeSince >= SHOULD_SAVE_MS)) {
        const drv = drivers.find(d => d.id === driverId);
        if (drv) {
          const toSave = { ...drv, lat, lng, currentX: x, currentY: y };
          saveDriver(toSave).then((ok) => {
            if (ok) {
              lastLocationSavedAtRef.current[driverId] = Date.now();
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[handleUpdateDriverLocation] persistence error:', err);
    }
  };

  // Handler: Update arbitrary driver fields (used by DriverView toggles)
  const handleUpdateDriver = (driver: Driver) => {
    setDrivers((prev) => prev.map((d) => d.id === driver.id ? driver : d));
    if (supabaseConnected) {
      saveDriver(driver).then((ok) => console.log('[handleUpdateDriver] saveDriver result:', ok));
    }
  };

  // Handler: Driver Accepts Trip Manually
  const handleAcceptTrip = async (tripIdOrDriverId: string) => {
    let driverId = selectedDriverId;
    let targetTrip = activeTrip;

    // If tripId was passed, match target trip from pendingTrips or activeTrip
    if (tripIdOrDriverId && tripIdOrDriverId.startsWith('trip_')) {
      const foundPending = pendingTrips.find((t) => t.id === tripIdOrDriverId);
      if (foundPending) {
        targetTrip = foundPending;
      }
    } else if (tripIdOrDriverId && drivers.some((d) => d.id === tripIdOrDriverId)) {
      driverId = tripIdOrDriverId;
    }

    if (!driverId) return;
    const drv = drivers.find((d) => d.id === driverId);

    // 🛡️ Guard 1: Prevent offline drivers from accepting trips
    if (!drv?.isOnline) {
      triggerToast(
        lang === 'ar' ? 'أنت غير متصل حالياً' : 'Driver Offline',
        lang === 'ar' ? 'قم بتفعيل زر الاتصال (أونلاين) أولاً لقبول المشوار.' : 'Please go online first to accept rides.',
        'warning'
      );
      return;
    }

    // 🛡️ Guard 2: Prevent driver over-assignment (driver cannot accept a new trip until current trip ends)
    if (activeTrip && activeTrip.driverId === driverId && ['ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status)) {
      triggerToast(
        lang === 'ar' ? 'لديك رحلة جارية بالفعل' : 'Active Ride in Progress',
        lang === 'ar' ? 'لا يمكنك قبول رحلة جديدة حتى إنهاء رحلتك الحالية.' : 'You cannot accept a new trip until your current trip ends.',
        'warning'
      );
      return;
    }

    if (!targetTrip || targetTrip.status !== 'SEARCHING') return;

    // mark driver busy locally and persist
    setDrivers((prev) =>
      prev.map((d) => (d.id === driverId ? { ...d, status: 'BUSY' } : d))
    );

    const acceptedTrip: Trip = {
      ...targetTrip,
      status: 'ACCEPTED',
      driverId,
      driverName: drv?.name,
    };

    // set accepted state immediately for optimistic UX and save to Supabase
    setActiveTripWithTracking(acceptedTrip);
    setPendingTrips((prev) => prev.filter((t) => t.id !== acceptedTrip.id));

    if (supabaseConnected) {
      if (drv) {
        saveDriver({ ...drv, status: 'BUSY' }).catch(() => {});
      }
      saveActiveTrip(acceptedTrip, true).then((ok) => {
        console.log('[handleAcceptTrip] saveActiveTrip ACCEPTED result:', ok);
        if (!ok) {
          // Race condition lost — another driver accepted first! Revert local state.
          console.warn('[handleAcceptTrip] Race lost to another driver.');
          setActiveTripWithTracking(null);
          setDrivers((prev) =>
            prev.map((d) => (d.id === driverId ? { ...d, status: 'AVAILABLE' } : d))
          );
          if (drv) saveDriver({ ...drv, status: 'AVAILABLE' }).catch(() => {});
          triggerToast(
            lang === 'ar' ? '⚠️ المشوار لم يعد متاحاً' : '⚠️ Ride No Longer Available',
            lang === 'ar' ? 'عذراً، قام سائق آخر بقبول هذه الرحلة قبلك بنفس اللحظة!' : 'Sorry, another driver accepted this ride first!',
            'warning'
          );
        }
      });
    }

    // compute navigation route (async) and save to active trip so rider can see it
    try {
      const driverLat = drv?.lat ?? (drv ? getCoordsFromXY(drv.currentX, drv.currentY).lat : undefined);
      const driverLng = drv?.lng ?? (drv ? getCoordsFromXY(drv.currentX, drv.currentY).lng : undefined);

      if (driverLat !== undefined && driverLng !== undefined) {
        const route = await getNavigationRoute(driverLat, driverLng, acceptedTrip.pickup, acceptedTrip.dropoff);
        if (route) {
          const routeUpdated: Trip = {
            ...acceptedTrip,
            routeGeometry: route.geometry,
            etaMinutes: route.durationSeconds ? Math.ceil(route.durationSeconds / 60) : acceptedTrip.etaMinutes,
          };
          setActiveTripWithTracking(routeUpdated);
          if (supabaseConnected) {
            saveActiveTrip(routeUpdated).then((ok) => console.log('[handleAcceptTrip] saveActiveTrip route result:', ok));
          }
        }
      }
    } catch (err) {
      console.warn('[handleAcceptTrip] route calculation failed:', err);
    }

    if (drv) {
      playNotificationSound('trip_accepted');
      speakText(
        lang === 'ar'
          ? `تم قبول الرحلة بنجاح! العميل ${acceptedTrip.riderName || ''} بانتظارك.`
          : `Ride accepted successfully! Client ${acceptedTrip.riderName || ''} is waiting for you.`,
        lang === 'ar' ? 'ar-EG' : 'en-US'
      );
      sendNativeNotification(
        lang === 'ar' ? '✅ تم قبول الرحلة!' : '✅ Ride Accepted!',
        lang === 'ar'
          ? `أنت الآن في الطريق إلى العميل من ${acceptedTrip.pickup.nameAr} إلى ${acceptedTrip.dropoff.nameAr}.`
          : `You are now heading to the client from ${acceptedTrip.pickup.nameEn} to ${acceptedTrip.dropoff.nameEn}.`,
        '🚗'
      );
      startTitleFlash(lang === 'ar' ? '🚗 تم قبول الرحلة!' : '🚗 Ride Accepted!');
      setTimeout(stopTitleFlash, 5000);
      triggerVibration([200, 100, 200, 100, 300]);
      triggerToast(
        lang === 'ar' ? '✅ تم قبول الرحلة!' : '✅ Ride Accepted!',
        lang === 'ar'
          ? `أنت الآن في الطريق إلى العميل.`
          : `You are now heading to the client.`,
        'success'
      );
    }
  };

  const handleRejectTrip = () => {
    const currentTrip = activeTrip;
    if (!currentTrip || currentTrip.status !== 'SEARCHING' || !currentTrip.currentOfferedDriverId) return;

    const currentIdx = currentTrip.offeredDriverIds?.indexOf(currentTrip.currentOfferedDriverId) ?? -1;
    const nextDriverId = (currentTrip.offeredDriverIds && currentIdx !== -1 && currentIdx + 1 < currentTrip.offeredDriverIds.length)
      ? currentTrip.offeredDriverIds[currentIdx + 1]
      : undefined;

    if (nextDriverId) {
      const nextDrv = drivers.find(d => d.id === nextDriverId);
      if (nextDrv) {
        sendNativeNotification(
          lang === 'ar' ? 'طلب رحلة جديد فوري 🚖' : 'New Instant Ride Request 🚖',
          lang === 'ar'
            ? `أنت الكابتن الأقرب التالي للرحلة! قبول الرحلة مقابل ${currentTrip.fare} ج.م`
            : `You are the next closest Captain! Accept ride for ${currentTrip.fare} EGP`,
          '🚖'
        );
        playNotificationSound('new_trip');
      }

      const updatedTrip = { ...currentTrip, currentOfferedDriverId: nextDriverId };
      setActiveTripWithTracking(updatedTrip);
      if (supabaseConnected) {
        saveActiveTrip(updatedTrip).then((ok) => {
          console.log('[handleRejectTrip] Advanced to next driver, result:', ok);
        });
      }
    } else {
      const rejectingDriverId = currentTrip.currentOfferedDriverId;
      const updatedTrip = {
        ...currentTrip,
        status: 'CANCELLED' as TripStatus,
        currentOfferedDriverId: undefined,
        offeredDriverIds: [],
      };
      setActiveTripWithTracking(updatedTrip);
      setDrivers((prev) =>
        prev.map((d) => (d.id === rejectingDriverId ? { ...d, status: 'AVAILABLE' } : d))
      );
      if (supabaseConnected) {
        saveActiveTrip(updatedTrip).then((ok) => {
          console.log('[handleRejectTrip] Cancelled trip, result:', ok);
        });
      }
    }
  };

  const handleArrivedAtPickup = () => {
    setActiveTripWithTracking((prev) => {
      if (!prev) return null;
      const updated = { ...prev, status: 'ARRIVED' as TripStatus };
      if (supabaseConnected) {
        saveActiveTrip(updated);
      }
      return updated;
    });
  };

  const handleStartTrip = () => {
    setActiveTripWithTracking((prev) => {
      if (!prev || prev.status !== 'ARRIVED') return prev;
      const pickupX = prev.pickup.x ?? 50;
      const pickupY = prev.pickup.y ?? 50;
      setDrivers((ds) =>
        ds.map((d) =>
          d.id === prev.driverId
            ? {
                ...d,
                currentX: pickupX,
                currentY: pickupY,
                lat: (() => {
                  const latBase = 29.6197;
                  const lngBase = 31.2561;
                  return latBase + (pickupY - 50) * 0.0025;
                })(),
                lng: (() => {
                  const latBase = 29.6197;
                  const lngBase = 31.2561;
                  return lngBase + (pickupX - 50) * 0.0025;
                })(),
              }
            : d
        )
      );
      const updated = { ...prev, status: 'STARTED' as TripStatus };
      if (supabaseConnected) {
        saveActiveTrip(updated);
      }
      return updated;
    });
  };

  const handleEndTrip = () => {
    setActiveTripWithTracking((prev) => {
      if (!prev || prev.status !== 'STARTED') return prev;

      const { driverId, fare, commission } = prev;
      const netEarnings = fare - commission;

      // Deduct rider balance
      setRider((r) => ({
        ...r,
        balance: Math.max(0, r.balance - fare),
      }));

      // Update driver stats: add net earnings, add commission paid, set status AVAILABLE
      if (driverId) {
        setDrivers((ds) =>
          ds.map((d) => {
            if (d.id !== driverId) return d;
            return {
              ...d,
              status: 'AVAILABLE',
              totalTrips: d.totalTrips + 1,
              totalEarnings: d.totalEarnings + netEarnings,
              totalCommissionPaid: d.totalCommissionPaid + commission,
            };
          })
        );
      }

      // Update system admin statistics
      setStats((s) => ({
        ...s,
        totalRevenue: s.totalRevenue + fare,
        totalCommission: s.totalCommission + commission,
        totalCompletedTrips: s.totalCompletedTrips + 1,
      }));

      const completed: Trip = {
        ...prev,
        status: 'COMPLETED' as TripStatus,
        completedAt: new Date().toISOString(),
      };

      setRouteCache((cache) => {
        const { pickup, dropoff } = completed;
        const key = `${pickup.lat.toFixed(4)}_${pickup.lng.toFixed(4)}_${dropoff.lat.toFixed(4)}_${dropoff.lng.toFixed(4)}`;
        const next = { ...cache };
        delete next[key];
        return next;
      });

      setTripsHistory((history) => [completed, ...history]);

      if (supabaseConnected) {
        saveActiveTrip(completed);
        saveTripToHistory(completed);
      }

      return completed;
    });
  };

   // Handler: Rider rates driver
   const handleRateDriver = (rating: number, tags?: string[], comment?: string) => {
     if (!activeTrip || !activeTrip.driverId) return;

     const { driverId } = activeTrip;

     // Update driver rating with proper average based on number of trips
     setDrivers((prev) =>
       prev.map((d) => {
         if (d.id !== driverId) return d;
         const totalTrips = d.totalTrips || 1;
         const nextRating = parseFloat(((d.rating * (totalTrips - 1) + rating) / totalTrips).toFixed(1));
         const updatedDrv = {
           ...d,
           rating: nextRating,
         };
         if (supabaseConnected) {
           saveDriver(updatedDrv);
         }
         return updatedDrv;
       })
     );

     const updatedTrip: Trip = {
       ...activeTrip,
       riderRatingToDriver: rating,
       riderFeedbackTags: tags,
       riderFeedbackComment: comment,
     };

     setActiveTripWithTracking(updatedTrip);
     setNoAvailableDrivers(false);

     setTripsHistory((prev) =>
       prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
     );

     if (supabaseConnected) {
       saveActiveTrip(updatedTrip);
       saveTripToHistory(updatedTrip);
     }

     // Announce rating to both driver and rider via speech
     speakText('تم التقييم. شكراً لاستخدام تطبيق الكابتن، رحلة سعيدة!', 'ar-EG');

     // Notify driver about the rating via native notification
     sendNativeNotification(
       lang === 'ar' ? '⭐ تقييم جديد من العميل' : '⭐ New Rating from Rider',
       lang === 'ar'
         ? `لقد قيّمك العميل ${activeTrip.riderName} بـ ${rating} نجوم.`
         : `Rider ${activeTrip.riderName} rated you ${rating} stars.`,
       '⭐'
     );
   };

   // Handler: Driver rates rider
   const handleRateRider = (rating: number, tags?: string[], comment?: string) => {
     if (!activeTrip) return;

     // Update rider rating with proper average based on number of trips
     setRider((prev) => {
       const totalTrips = prev.totalTrips || 1;
       const currentRating = prev.rating || 5.0;
       const nextRating = parseFloat(((currentRating * (totalTrips - 1) + rating) / totalTrips).toFixed(1));
       const updatedRider = {
         ...prev,
         rating: nextRating,
         totalTrips: totalTrips,
       };
       if (supabaseConnected) {
         saveRider(updatedRider);
       }
       return updatedRider;
     });

     const updatedTrip: Trip = {
       ...activeTrip,
       driverRatingToRider: rating,
       driverFeedbackTags: tags,
       driverFeedbackComment: comment,
     };

     setActiveTripWithTracking(updatedTrip);

     setTripsHistory((prev) =>
       prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
     );

     if (supabaseConnected) {
       saveActiveTrip(updatedTrip);
       saveTripToHistory(updatedTrip);
     }

     // Announce rating to both driver and rider via speech
     speakText('تم التقييم. شكراً لاستخدام تطبيق الكابتن، رحلة سعيدة!', 'ar-EG');

     // Notify rider about the rating via native notification
     sendNativeNotification(
       lang === 'ar' ? '⭐ تقييم جديد من الكابتن' : '⭐ New Rating from Driver',
       lang === 'ar'
         ? `لقد قيّمك الكابتن ${activeTrip.driverName || 'عز الدين'} بـ ${rating} نجوم.`
         : `Driver ${activeTrip.driverName || 'Ezz'} rated you ${rating} stars.`,
       '⭐'
     );
   };

  // Handler: Dismiss completed trip and reset active view
  const handleDismissCompletedTrip = () => {
    if (activeTrip) {
      dismissedTripIdsRef.current.add(activeTrip.id);
    }
    setActiveTripWithTracking(null);
    setNoAvailableDrivers(false);
    if (supabaseConnected) {
      saveActiveTrip(null);
    }
  };

  const handleUpdateCommissionRate = (rate: number) => {
    setStats((prev) => ({ ...prev, commissionRate: rate }));
  };

  const handleUpdatePricingStats = (updatedStats: Partial<SystemStats>) => {
    setStats((prev) => ({ ...prev, ...updatedStats }));
  };

  const handleSavePricingStats = async (updatedStats: SystemStats) => {
    console.log('Saving pricing stats:', updatedStats);
    setStats(updatedStats);
    // Prevent the background sync loop from immediately overwriting
    // the freshly-saved pricing values while the server persists them.
    pricingSaveGuardUntilRef.current = Date.now() + 10000; // 10s guard
    if (supabaseConnected) {
      const saved = await saveStats(updatedStats);
      console.log('saveStats result:', saved);
      if (saved) {
        triggerToast(
          lang === 'ar' ? 'تم حفظ الأسعار بنجاح' : 'Pricing saved',
          lang === 'ar' ? 'تم تحديث الأسعار والعمولات بنجاح' : 'Fares and commissions updated successfully',
          'success'
        );
        // Force re-fetch to confirm the save persisted
        const refetched = await fetchStats();
        if (refetched) {
          setStats(refetched);
        }
      } else {
        triggerToast(
          lang === 'ar' ? 'خطأ في الحفظ' : 'Save failed',
          lang === 'ar' ? 'فشل حفظ التغييرات في قاعدة البيانات' : 'Failed to save pricing changes',
          'warning'
        );
      }
    } else {
      triggerToast(
        lang === 'ar' ? 'غير متصل' : 'Offline',
        lang === 'ar' ? 'لم يتم الحفظ - الاتصال مفصول' : 'Not saved - offline mode',
        'warning'
      );
    }
  };

  const handleSettleDriverCommissions = (driverId: string) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === driverId ? { ...d, totalCommissionPaid: 0 } : d))
    );
  };

  // Handler: Update Regions (admin areas management)
  const handleUpdateRegions = (newRegions: Region[]) => {
    setRegions(newRegions);
  };

  // Handler: Update Driver Service Areas
  const handleUpdateServiceAreas = (driverId: string, areas: string[]) => {
    setDrivers((prev) =>
      prev.map((d) =>
        d.id === driverId ? { ...d, serviceAreas: areas } : d
      )
    );
    const driver = drivers.find((d) => d.id === driverId);
    if (driver && supabaseConnected) {
      saveDriver({ ...driver, serviceAreas: areas });
    }
  };

  // Account verification workflows called by Administrator
  const handleApproveDriver = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    console.log('Approve driver clicked:', driverId, driver?.approvalStatus, 'supabaseConnected:', supabaseConnected);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, approvalStatus: 'APPROVED' } : d));
    if (driver && supabaseConnected) {
      const updated = { ...driver, approvalStatus: 'APPROVED' as const };
      console.log('Saving approved driver to Supabase:', updated.id, updated.approvalStatus);
      try {
        const saved = await saveDriver(updated);
        console.log('saveDriver result:', saved);
        if (!saved) {
          triggerToast(
            lang === 'ar' ? 'خطأ في الحفظ' : 'Save error',
            lang === 'ar' ? 'فشل حفظ التغيير في قاعدة البيانات' : 'Failed to save changes to database',
            'warning'
          );
        } else {
          triggerToast(
            lang === 'ar' ? 'تم القبول بنجاح' : 'Approved successfully',
            lang === 'ar' ? 'تم تفعيل السائق بنجاح' : 'Driver activated successfully',
            'success'
          );
        }
      } catch (e) {
        console.error('Error saving driver approval:', e);
        triggerToast(
          lang === 'ar' ? 'خطأ' : 'Error',
          lang === 'ar' ? 'حدث خطأ أثناء حفظ الموافقة' : 'Error occurred while saving approval',
          'warning'
        );
      }
    } else if (!supabaseConnected) {
      console.warn('Supabase not connected - approval saved locally only');
      triggerToast(
        lang === 'ar' ? 'غير متصل' : 'Offline',
        lang === 'ar' ? 'السجل محفوظ محلياً فقط' : 'Saved locally only',
        'warning'
      );
    }
  };

  const handleRejectDriver = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, approvalStatus: 'REJECTED' } : d));
    if (driver && supabaseConnected) {
      try {
        const saved = await saveDriver({ ...driver, approvalStatus: 'REJECTED' as const });
        if (!saved) {
          triggerToast(lang === 'ar' ? 'خطأ في الحفظ' : 'Save error', lang === 'ar' ? 'فشل حفظ الرفض' : 'Failed to save rejection', 'warning');
        }
      } catch (e) {
        console.error('Error rejecting driver:', e);
      }
    }
  };

  const handleFreezeDriver = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, approvalStatus: 'FROZEN', isOnline: false } : d));
    if (driver && supabaseConnected) {
      try {
        const saved = await saveDriver({ ...driver, approvalStatus: 'FROZEN' as const, isOnline: false });
        if (!saved) {
          triggerToast(lang === 'ar' ? 'خطأ في الحفظ' : 'Save error', lang === 'ar' ? 'فشل حفظ التجميد' : 'Failed to save freeze', 'warning');
        }
      } catch (e) {
        console.error('Error freezing driver:', e);
      }
    }
  };

  const handleUnfreezeDriver = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, approvalStatus: 'APPROVED' } : d));
    if (driver && supabaseConnected) {
      try {
        const saved = await saveDriver({ ...driver, approvalStatus: 'APPROVED' as const });
        if (!saved) {
          triggerToast(lang === 'ar' ? 'خطأ في الحفظ' : 'Save error', lang === 'ar' ? 'فشل حفظ إعادة التفعيل' : 'Failed to save unfreeze', 'warning');
        }
      } catch (e) {
        console.error('Error unfreezing driver:', e);
      }
    }
  };

  const handleDeleteDriver = async (driverId: string) => {
    setDrivers(prev => prev.filter(d => d.id !== driverId));
    await deleteDriverInDB(driverId);
  };

  const handleAddBalanceToDriver = async (driverId: string, amount: number) => {
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return;
    const newBal = (driver.walletBalance ?? 0) + amount;
    setDrivers((prev) =>
      prev.map((d) => (d.id === driverId ? { ...d, walletBalance: newBal } : d))
    );
    if (supabaseConnected) {
      await saveDriver({ ...driver, walletBalance: newBal });
    }
    triggerToast(
      lang === 'ar' ? 'تم شحن المحفظة' : 'Wallet Charged',
      lang === 'ar' ? `تم إضافة ${amount} ج.م إلى محفظة كابتن ${driver.name}` : `Added ${amount} EGP to ${driver.name}'s wallet`,
      'success'
    );
  };

  // Rider account management workflows called by Administrator
  const handleFreezeRider = (riderId: string) => {
    setRegisteredRiders(prev => prev.map(r => r.id === riderId ? { ...r, approvalStatus: 'FROZEN' } : r));
    const frozenRider = registeredRiders.find(r => r.id === riderId);
    if (frozenRider) saveRider({ ...frozenRider, approvalStatus: 'FROZEN' });
  };

  const handleUnfreezeRider = (riderId: string) => {
    setRegisteredRiders(prev => prev.map(r => r.id === riderId ? { ...r, approvalStatus: 'APPROVED' } : r));
    const unfrozenRider = registeredRiders.find(r => r.id === riderId);
    if (unfrozenRider) saveRider({ ...unfrozenRider, approvalStatus: 'APPROVED' });
  };

  const handleBlockRider = (riderId: string) => {
    setRegisteredRiders(prev => prev.map(r => r.id === riderId ? { ...r, approvalStatus: 'BLOCKED' } : r));
    const blockedRider = registeredRiders.find(r => r.id === riderId);
    if (blockedRider) saveRider({ ...blockedRider, approvalStatus: 'BLOCKED' });
  };

  const handleUnblockRider = (riderId: string) => {
    setRegisteredRiders(prev => prev.map(r => r.id === riderId ? { ...r, approvalStatus: 'APPROVED' } : r));
    const unblockedRider = registeredRiders.find(r => r.id === riderId);
    if (unblockedRider) saveRider({ ...unblockedRider, approvalStatus: 'APPROVED' });
  };

  const handleDeleteRider = async (riderId: string) => {
    setRegisteredRiders(prev => prev.filter(r => r.id !== riderId));
    await deleteRiderInDB(riderId);
  };

  const handleAddBalanceToRider = async (riderId: string, amount: number) => {
    setRegisteredRiders(prev => prev.map(r => r.id === riderId ? { ...r, balance: r.balance + amount } : r));
    const targetRider = registeredRiders.find(r => r.id === riderId);
    if (targetRider) {
      await saveRider({ ...targetRider, balance: targetRider.balance + amount });
    }
  };

  const handleClearAllFakeData = async () => {
    if (!confirm(lang === 'ar' ? 'تحذير: هذا سيمسح جميع بيانات الركاب والسائقين الوهمية نهائياً من السيرفر والجهاز. هل أنت متأكد؟' : 'WARNING: This will permanently delete ALL fake riders and drivers data from server and device. Are you sure?')) {
      return;
    }
    if (!confirm(lang === 'ar' ? 'تأكيد نهائي: جميع الحسابات الوهمية ستُحذف ولا يمكن استرجاعها!' : 'Final confirmation: ALL fake accounts will be deleted and cannot be recovered!')) {
      return;
    }

    setDrivers([]);
    setRegisteredRiders([]);

    await Promise.allSettled([
      clearAllDriversInDB(),
      clearAllRidersInDB(),
      clearTripsHistoryInDB()
    ]);

    alert(lang === 'ar' ? 'تم مسح جميع البيانات الوهمية نهائياً' : 'All fake data has been permanently cleared');
  };

  // Rider auth submission
  const handleRiderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRiderFormError('');

    if (riderFormMode === 'LOGIN') {
      if (!riderLoginPhone.trim() || !riderLoginPassword.trim()) {
        setRiderFormError(lang === 'ar' ? 'يرجى إدخال رقم الهاتف وكلمة المرور' : 'Please enter phone and password');
        return;
      }

      if (!riderAuthLimiter.isAllowed(riderLoginPhone.trim())) {
        const retryAfter = riderAuthLimiter.getRetryAfter(riderLoginPhone.trim());
        setRiderFormError(lang === 'ar'
          ? `تم تجاوز محاولات تسجيل الدخول. يرجى المحاولة بعد ${retryAfter} ثانية`
          : `Too many login attempts. Please try again in ${retryAfter} seconds`);
        auditLogger.log('rider_login', riderLoginPhone.trim(), 'rider', 'Rate limited', false, 'Rate limit exceeded');
        return;
      }

      const verifyPasswordHash = async (storedPassword: string | undefined, inputPassword: string): Promise<boolean> => {
        if (!storedPassword) return false;
        if (storedPassword === inputPassword) return true;
        if (storedPassword === obfuscatePassword(inputPassword)) return true;
        if (deobfuscatePassword(storedPassword) === inputPassword) return true;
        if (isSecureHash(storedPassword)) {
          try {
            return await verifyPassword(inputPassword, storedPassword);
          } catch {
            return false;
          }
        }
        return false;
      };

      if (driverIsLoggedIn || adminIsLoggedIn) {
        setRiderFormError(lang === 'ar' ? 'يوجد حساب سائق/مدير مسجل حالياً. يرجى تسجيل الخروج أولاً.' : 'A driver/admin account is already logged in. Please logout first.');
        auditLogger.log('rider_login', riderLoginPhone.trim(), 'rider', 'Blocked - other role active', false, 'Another role already logged in');
        return;
      }

      const found = registeredRiders.find(
        r => r.phone.trim() === riderLoginPhone.trim()
      );

      if (!found || !(await verifyPasswordHash(found.password, riderLoginPassword.trim()))) {
        setRiderFormError(lang === 'ar' ? 'رقم الهاتف أو كلمة المرور غير صحيحة!' : 'Incorrect phone or password!');
        auditLogger.log('rider_login', riderLoginPhone.trim(), 'rider', 'Login failed - invalid credentials', false);
        return;
      }

      auditLogger.log('rider_login', found.id, 'rider', 'Login successful', true);
      riderAuthLimiter.reset(riderLoginPhone.trim());
      setRider({ ...found, isLoggedIn: true });
      if (supabaseConnected) {
        await clearSession('DRIVER');
        await clearSession('ADMIN');
        await saveSession('RIDER', found.id);
      }
      setCurrentScreen('RIDER_DASHBOARD');
    } else {
      // SIGNUP mode
      if (!riderFormName.trim() || !riderFormPhone.trim() || !riderFormPassword.trim()) {
        setRiderFormError(lang === 'ar' ? 'الرجاء ملء جميع الحقول المطلوبة' : 'Please fill all fields');
        return;
      }
      
      // Validate Name is Dual (الاسم ثنائي)
      const nameParts = riderFormName.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        setRiderFormError(lang === 'ar' ? 'الرجاء إدخال الاسم ثنائي بالكامل (الاسم الأول واللقب)' : 'Please enter full dual name (First + Last name)');
        return;
      }

      if (riderFormPassword.trim().length < 3) {
        setRiderFormError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 3 أحرف على الأقل' : 'Password must be at least 3 characters');
        return;
      }

      // Check for duplicate phone
      const phoneExists = registeredRiders.some(r => r.phone.trim() === riderFormPhone.trim());
      if (phoneExists) {
        setRiderFormError(lang === 'ar' ? 'رقم الهاتف هذا مسجل بالفعل! جرب تسجيل الدخول' : 'This phone number is already registered! Try logging in');
        return;
      }

      if (!riderFormAgreed) {
        setRiderFormError(lang === 'ar' ? 'يجب الموافقة على سياسات الراكب للاستمرار' : 'Please accept the Rider Policies');
        return;
      }

      const hashedPassword = await hashPassword(riderFormPassword.trim());

      const newRider: Rider = {
        id: `rider_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: riderFormName.trim(),
        phone: riderFormPhone.trim(),
        password: hashedPassword,
        balance: 0,
        rating: 5.0,
        totalTrips: 0
      };

      setRegisteredRiders(prev => [newRider, ...prev]);
      setRider({ ...newRider, isLoggedIn: true });
      setCurrentScreen('RIDER_DASHBOARD');
    }
  };

  // Driver onboarding submission
  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrvFormError('');

    if (drvFormMode === 'LOGIN') {
      if (!drvLoginPhone.trim() || !drvLoginPassword.trim()) {
        setDrvFormError(lang === 'ar' ? 'يرجى إدخال رقم الهاتف وكلمة المرور' : 'Please enter phone and password');
        return;
      }

      if (!driverAuthLimiter.isAllowed(drvLoginPhone.trim())) {
        const retryAfter = driverAuthLimiter.getRetryAfter(drvLoginPhone.trim());
        setDrvFormError(lang === 'ar' 
          ? `تم تجاوز محاولات تسجيل الدخول. يرجى المحاولة بعد ${retryAfter} ثانية`
          : `Too many login attempts. Please try again in ${retryAfter} seconds`);
        auditLogger.log('driver_login', drvLoginPhone.trim(), 'driver', 'Rate limited - too many attempts', false, 'Rate limit exceeded');
        return;
      }

      const verifyPasswordHash = async (storedPassword: string | undefined, inputPassword: string): Promise<boolean> => {
        if (!storedPassword) return false;
        if (storedPassword === inputPassword) return true;
        if (storedPassword === obfuscatePassword(inputPassword)) return true;
        if (deobfuscatePassword(storedPassword) === inputPassword) return true;
        if (isSecureHash(storedPassword)) {
          try {
            return await verifyPassword(inputPassword, storedPassword);
          } catch {
            return false;
          }
        }
        return false;
      };

      const found = drivers.find(
        d => d.phone.trim() === drvLoginPhone.trim()
      );

      if (!found) {
        setDrvFormError(lang === 'ar' ? 'رقم الهاتف أو كلمة المرور غير صحيحة!' : 'Incorrect phone or password!');
        auditLogger.log('driver_login', drvLoginPhone.trim(), 'driver', 'Login failed - driver not found', false);
        return;
      }

      const passwordMatches = await verifyPasswordHash(found.password, drvLoginPassword.trim());
      if (!passwordMatches) {
        setDrvFormError(lang === 'ar' ? 'رقم الهاتف أو كلمة المرور غير صحيحة!' : 'Incorrect phone or password!');
        auditLogger.log('driver_login', drvLoginPhone.trim(), 'driver', 'Login failed - wrong password', false);
        return;
      }

      if (rider.isLoggedIn || adminIsLoggedIn) {
        setDrvFormError(lang === 'ar' ? 'يوجد حساب راكب/مدير مسجل حالياً. يرجى تسجيل الخروج أولاً.' : 'A rider/admin account is already logged in. Please logout first.');
        auditLogger.log('driver_login', drvLoginPhone.trim(), 'driver', 'Blocked - other role active', false, 'Another role already logged in');
        return;
      }

      setSelectedDriverId(found.id);
      setDriverIsLoggedIn(true);
      if (supabaseConnected) {
        await clearSession('RIDER');
        await clearSession('ADMIN');
        await saveSession('DRIVER', found.id);
        
        // Auto-set driver as online in Supabase so riders can see them
        const updatedDriver = { ...found, isOnline: true, status: 'AVAILABLE' as const };
        await saveDriver(updatedDriver);
        setDrivers(prev => prev.map(d => d.id === found.id ? updatedDriver : d));
        
        const freshDrivers = await fetchDrivers();
        if (freshDrivers && freshDrivers.length > 0) {
          setDrivers(freshDrivers);
        }
      }
      setCurrentScreen('DRIVER_DASHBOARD');
    } else {
      // SIGNUP mode
      if (!drvFormName.trim() || !drvFormPhone.trim() || !drvFormPassword.trim() || !drvFormVehicleName.trim() || !drvFormNationalId.trim() || !drvFormLicense.trim()) {
        setDrvFormError(lang === 'ar' ? 'الرجاء ملء جميع الحقول وتقديم المستندات' : 'Please provide all driver documents');
        return;
      }

      // Validate Name is at least Dual (الاسم ثنائي على الأقل)
      const nameParts = drvFormName.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        setDrvFormError(lang === 'ar' ? 'الرجاء إدخال الاسم ثنائي أو ثلاثي بالكامل' : 'Please enter full name (First + Last name)');
        return;
      }

      if (drvFormPassword.trim().length < 3) {
        setDrvFormError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 3 أحرف على الأقل' : 'Password must be at least 3 characters');
        return;
      }

      if (drvFormNationalId.trim().length < 10) {
        setDrvFormError(lang === 'ar' ? 'رقم البطاقة الشخصية غير صحيح (يجب ألا يقل عن 10 أرقام)' : 'National ID is too short (must be at least 10 digits)');
        return;
      }

      // Check for duplicate phone
      const phoneExists = drivers.some(d => d.phone.trim() === drvFormPhone.trim());
      if (phoneExists) {
        setDrvFormError(lang === 'ar' ? 'رقم الهاتف هذا مسجل بالفعل لكابتن آخر!' : 'This phone number is already registered for another captain');
        return;
      }

      if (!drvFormAgreed) {
        setDrvFormError(lang === 'ar' ? 'يجب الموافقة على شروط الانضمام ونظام العمولات' : 'You must agree to onboarding terms');
        return;
      }

      const newId = `drv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Default placeholder images if none were uploaded
      const defaultPersonal = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop';
      const defaultNational = 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
      const defaultLicense = 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';
      const defaultVehicle = 'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400';

      const hashedPassword = await hashPassword(drvFormPassword.trim());

      const newDriver: Driver = {
        id: newId,
        name: drvFormName.trim(),
        phone: drvFormPhone.trim(),
        password: hashedPassword,
        carModel: drvFormVehicleName.trim(),
        carPlate: `ع ز ${Math.round(1000 + Math.random() * 8999)}`,
        vehicleType: drvFormVehicleType,
        vehicleName: drvFormVehicleName.trim(),
        nationalId: drvFormNationalId.trim(),
        driverLicense: drvFormLicense.trim(),
        personalPhoto: drvFormPersonalPhoto || defaultPersonal,
        nationalIdImage: drvFormNationalIdImage || defaultNational,
        driverLicenseImage: drvFormLicenseImage || defaultLicense,
        vehicleLicenseImage: drvFormVehicleLicenseImage || defaultVehicle,
        isOnline: true,
        status: 'AVAILABLE',
        approvalStatus: 'PENDING', // Saved as PENDING for admin approval request!
        rating: 5.0,
        totalTrips: 0,
        totalEarnings: 0,
        totalCommissionPaid: 0,
        currentX: 50 + (Math.random() - 0.5) * 30,
        currentY: 50 + (Math.random() - 0.5) * 30,
        agreedToTerms: true,
        serviceAreas: []
      };

      setDrivers(prev => [newDriver, ...prev]);
      // Persist to Supabase immediately so the admin panel can review the application
      if (supabaseConnected) {
        const saved = await saveDriver(newDriver);
        if (!saved) console.warn('Driver signup saved locally but Supabase sync failed');
      }
      setSelectedDriverId(newId);
      setDriverIsLoggedIn(true);
      setCurrentScreen('DRIVER_DASHBOARD');
    };
  };

  const t = {
    ar: {
      title: 'كابتن عز 🚖',
      subtitle: 'تطبيق التوصيل الأوفر لقرى الجيزة وبني سويف',
      mapHeader: 'خارطة التوصيل المباشرة لكابتن عز 🗺️',
      mapDesc: 'تحديث حي وتفاعلي لنقاط الركوب والوجهات ومواقع الكباتن النشطين.',
      langToggle: 'English',
      footer: 'كابتن عز - نظام متكامل يخدم أهالينا بالقرى والمراكز بكفاءة تامة وشفافية كاملة. برمجة: أسامه إسلام بسيوني',
    },
    en: {
      title: 'Captain Ezz 🚖',
      subtitle: 'The Best Taxi App for Giza & Beni Suef Villages',
      mapHeader: 'Captain Ezz Live Vector Map 🗺️',
      mapDesc: 'Real-time interactive rendering of rural stations and active captain fleets.',
      langToggle: 'العربية',
      footer: 'Captain Ezz - Proudly serving rural communities with optimized routes and fair rates. Developed by: Osama Islam Basiony',
    }
  };

  const currentT = t[lang];

  const footerText = lang === 'ar' ? 'برمجة: أسامه إسلام بسيوني' : 'Developed by: Osama Islam Basiony';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-black">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 py-3.5 px-4 md:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
              CAPTAIN EZZ
            </span>
            <h1 className="text-base font-extrabold text-white tracking-tight">
              {currentT.title}
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{currentT.subtitle}</p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => openGuideModal('rider')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer pointer-events-auto"
          >
            <span>📖</span>
            <span>{lang === 'ar' ? 'دليل الاستخدام' : 'User Guide'}</span>
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors pointer-events-auto"
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentT.langToggle}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start overflow-hidden">
        
        {/* Left Side: Center-focused smartphone frame running the mobile first app */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full max-w-[390px] bg-slate-950 rounded-[50px] p-4 border-[8px] border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] aspect-[9/19] flex flex-col relative overflow-hidden">
            
            {/* Phone Speaker Notch */}
            <div className="absolute top-2.5 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-950 rounded-full z-30 flex items-center justify-center gap-1">
              <div className="w-10 h-1 bg-slate-800 rounded-full" />
              <div className="w-2.5 h-2.5 bg-slate-900 rounded-full" />
            </div>

            {/* Virtual Phone Screen Content */}
            <div className="flex-1 bg-white rounded-[36px] overflow-hidden flex flex-col relative z-10 pt-3">
              
              {/* STATUS BAR WITH NAVIGATION TO HOME */}
              <div className="bg-slate-950 text-white px-3 py-1.5 flex items-center justify-between text-[10px] font-bold shadow-xs select-none shrink-0">
                <div className="flex items-center gap-1">
                  <span>كابتن عز 🚖</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openGuideModal(currentScreen.includes('DRIVER') ? 'driver' : 'rider')}
                    className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all flex items-center gap-0.5 cursor-pointer pointer-events-auto shadow-xs"
                    title={lang === 'ar' ? 'دليل الاستخدام' : 'Guide'}
                  >
                    <span>📖</span>
                    <span>{lang === 'ar' ? 'الدليل' : 'Guide'}</span>
                  </button>
                  {currentScreen !== 'HOME' && (
                    <button
                      onClick={() => setCurrentScreen('HOME')}
                      className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all flex items-center gap-0.5 cursor-pointer pointer-events-auto shadow-xs"
                    >
                      <span>◀</span>
                      <span>{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* PWA Install Promo Banner (Ultra Compact) */}
              {!installDismissed && (
                <div className="bg-slate-900 text-white py-1 px-2.5 border-b border-amber-400/30 flex items-center justify-between gap-1.5 shrink-0 animate-fade-in relative z-20">
                  <div className="flex items-center gap-1.5 text-right min-w-0">
                    <div className="w-6 h-6 rounded-md bg-amber-400 flex items-center justify-center text-xs shadow-xs shrink-0">
                      🚖
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-amber-400 leading-tight truncate">
                        {lang === 'ar' ? 'تثبيت كابتن عز كأيقونة 📱' : 'Install Captain Ezz 📱'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setShowInstallWizard(true)}
                      className="px-2 py-0.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-[8px] rounded-md shadow-2xs pointer-events-auto cursor-pointer flex items-center gap-0.5"
                    >
                      <span>⚡</span>
                      <span>{lang === 'ar' ? 'تثبيت' : 'Install'}</span>
                    </button>
                    <button
                      onClick={() => setInstallDismissed(true)}
                      className="text-slate-400 hover:text-white p-0.5 pointer-events-auto text-[9px] leading-none"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* PWA Step-by-Step Installation Wizard Overlay */}
              {showInstallWizard && (
                <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xs z-50 p-5 flex flex-col justify-between text-white animate-fade-in">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📱</span>
                        <h3 className="text-xs font-black text-amber-400">
                          {lang === 'ar' ? 'دليل تثبيت كابتن عز' : 'Captain Ezz Installation'}
                        </h3>
                      </div>
                      <button
                        onClick={() => setShowInstallWizard(false)}
                        className="text-slate-400 hover:text-white p-1 pointer-events-auto cursor-pointer font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="text-center space-y-1">
                      <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-lg border-2 border-white/20 animate-bounce">
                        🚖
                      </div>
                      <h4 className="text-xs font-bold mt-2">
                        {lang === 'ar' ? 'تثبيت التطبيق على الشاشة الرئيسية' : 'Add App to Home Screen'}
                      </h4>
                      <p className="text-[9px] text-slate-400">
                        {lang === 'ar'
                          ? 'استمتع بتجربة تطبيق موبايل حقيقية وسريعة بدون استهلاك لمساحة جهازك.'
                          : 'Enjoy a true native experience with zero device storage overhead.'}
                      </p>
                    </div>

                    {/* Step-by-Step instructions tabs */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
                      <p className="text-[10px] font-bold text-amber-300 border-b border-slate-800 pb-1.5 flex items-center gap-1.5 justify-start">
                        <span>🤖</span>
                        <span>{lang === 'ar' ? 'طريقة التثبيت لأجهزة أندرويد (Chrome):' : 'For Android Devices (Chrome):'}</span>
                      </p>
                      <ol className="text-[9px] text-slate-300 space-y-2 list-decimal list-inside leading-relaxed text-right pr-1">
                        {lang === 'ar' ? (
                          <>
                            <li>اضغط على زر <strong>القائمة (⋮)</strong> في أعلى أو أسفل المتصفح.</li>
                            <li>اختر <strong>«التثبيت»</strong> أو <strong>«الإضافة إلى الشاشة الرئيسية»</strong>.</li>
                            <li>ستظهر أيقونة سيارة التاكسي الجميلة على هاتفك فوراً!</li>
                          </>
                        ) : (
                          <>
                            <li>Tap the <strong>browser menu (⋮)</strong> icon.</li>
                            <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                            <li>The beautiful taxi icon will appear on your device launcher!</li>
                          </>
                        )}
                      </ol>

                      <p className="text-[10px] font-bold text-amber-300 border-b border-slate-800 pt-1 pb-1.5 flex items-center gap-1.5 justify-start">
                        <span>🍎</span>
                        <span>{lang === 'ar' ? 'طريقة التثبيت لأجهزة آيفون (Safari):' : 'For iPhone Devices (Safari):'}</span>
                      </p>
                      <ol className="text-[9px] text-slate-300 space-y-2 list-decimal list-inside leading-relaxed text-right pr-1">
                        {lang === 'ar' ? (
                          <>
                            <li>اضغط على زر <strong>المشاركة (Square with arrow)</strong> في أسفل متصفح سفاري.</li>
                            <li>مرر لأسفل القائمة ثم اختر <strong>«الإضافة للشاشة الرئيسية»</strong>.</li>
                            <li>اضغط على <strong>«إضافة»</strong> في الزاوية العلوية لتثبيت التطبيق.</li>
                          </>
                        ) : (
                          <>
                            <li>Tap the <strong>Share (square with arrow)</strong> icon in Safari.</li>
                            <li>Scroll down and select <strong>"Add to Home Screen"</strong>.</li>
                            <li>Tap <strong>"Add"</strong> in the top-right corner to complete!</li>
                          </>
                        )}
                      </ol>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowInstallWizard(false);
                      setInstallDismissed(true);
                    }}
                    className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
                  >
                    {lang === 'ar' ? 'فهمت، سأقوم بالتثبيت الآن 👍' : 'Got it, installing now 👍'}
                  </button>
                </div>
              )}

              {/* RENDER VIEWS BASED ON SELECTED MOBILE SCREEN */}
              <div className="flex-1 overflow-hidden relative">
                
                {/* 1. HOMEPAGE VIEW (الصفحة الرئيسية للموبايل) */}
                {currentScreen === 'HOME' && (
                  <div className="h-full flex flex-col justify-between p-4 bg-slate-50 overflow-y-auto space-y-4">
                    <div className="space-y-4 text-center">
                      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-md relative overflow-hidden">
                        <div className="absolute right-0 bottom-0 text-white/5 font-bold text-5xl">EZZ</div>
                        <h2 className="text-sm font-extrabold text-amber-400">{lang === 'ar' ? 'تطبيق كابتن عز للتوصيل' : 'Captain Ezz Delivery'}</h2>
                         <p className="text-[10px] text-slate-300 mt-1">
                           {lang === 'ar' ? 'التطبيق الأول والأنسب لقرى العياط وبني سويف والمراكز المجاورة' : 'The optimized transport system for rural communities'}
                         </p>
                         <p className="text-[9px] text-slate-400 mt-1">
                           {lang === 'ar' ? 'برمجة: أسامه إسلام بسيوني' : 'Developed by: Osama Islam Basiony'}
                         </p>
                        
                        {/* Interactive counters */}
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10 text-center">
                          <div>
                            <span className="block text-xs font-black text-amber-300">500+</span>
                            <span className="text-[8px] text-slate-300">{lang === 'ar' ? 'محطة ريفية مفعلة' : 'Rural Stations'}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-black text-emerald-400">
                              {drivers.filter(d => d.approvalStatus === 'APPROVED' && d.isOnline).length}
                            </span>
                            <span className="text-[8px] text-slate-300">{lang === 'ar' ? 'كابتن متصل الآن' : 'Active Fleets'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Role selection card list */}
                      <div className="space-y-2.5">
                        <button
                          onClick={() => {
                            if (rider.isLoggedIn) {
                              setCurrentScreen('RIDER_DASHBOARD');
                            } else {
                              setCurrentScreen('RIDER_AUTH');
                            }
                          }}
                          className="w-full p-3.5 bg-white border border-slate-100 hover:border-amber-300 rounded-2xl shadow-xs text-right flex items-center justify-between transition-transform hover:scale-[1.01] pointer-events-auto cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-lg font-bold">🚖</div>
                            <div className="text-left">
                              <h3 className="text-xs font-black text-slate-800">{lang === 'ar' ? 'أنا راكب - احجز رحلة' : 'I am a Rider'}</h3>
                              <p className="text-[9px] text-slate-400">{lang === 'ar' ? 'اطلب سيارة أو موتوسيكل بأسعار مخفضة' : 'Request ride with dynamic pricing'}</p>
                            </div>
                          </div>
                          <span className="text-slate-400">◀</span>
                        </button>

                        <button
                          onClick={() => {
                            if (driverIsLoggedIn) {
                              setCurrentScreen('DRIVER_DASHBOARD');
                            } else {
                              setCurrentScreen('DRIVER_AUTH');
                            }
                          }}
                          className="w-full p-3.5 bg-white border border-slate-100 hover:border-amber-300 rounded-2xl shadow-xs text-right flex items-center justify-between transition-transform hover:scale-[1.01] pointer-events-auto cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-lg font-bold">🏍️</div>
                            <div className="text-left">
                              <h3 className="text-xs font-black text-slate-800">{lang === 'ar' ? 'أنا كابتن - ابدأ العمل وجني الأرباح' : 'I am a Captain (Driver)'}</h3>
                              <p className="text-[9px] text-slate-400">{lang === 'ar' ? 'سجل حسابك وابدأ باستقبال مشاوير القرى' : 'Register details to accept bookings'}</p>
                            </div>
                          </div>
                          <span className="text-slate-400">◀</span>
                        </button>

                        <button
                          onClick={() => setCurrentScreen('ADMIN')}
                          className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-2xl text-center text-xs font-bold text-indigo-700 transition-colors pointer-events-auto cursor-pointer"
                        >
                          📊 {lang === 'ar' ? 'لوحة تحكم المدير وتفعيل السائقين' : 'Admin & Commissions Panel'}
                        </button>
                      </div>

                      {/* WhatsApp Support Button */}
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-900 font-bold text-[11px] justify-center">
                          <span className="text-emerald-600 text-sm">💬</span>
                          <span>{lang === 'ar' ? 'هل تواجه أي مشكلة؟ دعم كابتن عز' : 'WhatsApp Support'}</span>
                        </div>
                        <a
                          href={`https://wa.me/${(stats?.supportWhatsApp || '201015555555').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            lang === 'ar'
                              ? 'مرحباً إدارة كابتن عز، أود التواصل مع الدعم الفني للاستفسار بخصوص التطبيق.'
                              : 'Hello Ezz Captain support, I would like to query about the app.'
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg text-center shadow-xs transition-transform hover:scale-[1.01] pointer-events-auto"
                        >
                          {lang === 'ar' ? 'تواصل معنا مباشرة عبر واتساب' : 'Chat via WhatsApp'}
                        </a>
                      </div>
                    </div>

                    {/* Legal Terms & Privacy Section */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shrink-0 space-y-2 shadow-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 border-b border-slate-100 pb-2">
                        <span className="flex items-center gap-1">⚖️ {lang === 'ar' ? 'الشروط والسياسات الرسمية' : 'Terms & Privacy'}</span>
                        <span className="text-[9px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {lang === 'ar' ? 'محدثة لعام 2026' : 'Updated 2026'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={openLegalTerms}
                          className="py-2 px-2.5 bg-amber-50 hover:bg-amber-100/80 text-amber-900 border border-amber-200/80 rounded-xl text-[10px] font-bold transition-all text-center flex items-center justify-center gap-1 pointer-events-auto cursor-pointer"
                        >
                          <span>⚖️</span>
                          <span>{lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={openLegalPrivacy}
                          className="py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200/80 rounded-xl text-[10px] font-bold transition-all text-center flex items-center justify-center gap-1 pointer-events-auto cursor-pointer"
                        >
                          <span>🔒</span>
                          <span>{lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</span>
                        </button>
                      </div>

                      <p className="text-[9px] text-slate-500 text-center leading-relaxed">
                        {lang === 'ar' 
                          ? 'استخدام التطبيق يتضمن موافقتك الكاملة على شروط الخدمة وحماية الخصوصية.' 
                          : 'Using the app constitutes acceptance of terms and privacy policy.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. RIDER LOGIN / SIGNUP SCREEN */}
                {currentScreen === 'RIDER_AUTH' && (
                  <div className="h-full bg-slate-50 p-5 flex flex-col justify-between overflow-y-auto">
                    <div className="space-y-4">
                      <div className="text-center">
                        <span className="text-3xl">🚖</span>
                        <h3 className="text-sm font-black text-slate-900 mt-2">
                          {lang === 'ar' ? 'بوابة ركاب كابتن عز' : 'Captain Ezz Rider Portal'}
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {lang === 'ar' ? 'سجل حسابك أو سجل دخولك لطلب الرحلات بأوفر سعر' : 'Access cheaper rides across Giza & Beni Suef'}
                        </p>
                      </div>

                      {/* Tab Selector */}
                      <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-xl pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setRiderFormMode('LOGIN');
                            setRiderFormError('');
                          }}
                          className={`py-2 text-[11px] font-black rounded-lg transition-all ${riderFormMode === 'LOGIN' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {lang === 'ar' ? 'تسجيل دخول' : 'Login'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRiderFormMode('SIGNUP');
                            setRiderFormError('');
                          }}
                          className={`py-2 text-[11px] font-black rounded-lg transition-all ${riderFormMode === 'SIGNUP' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {lang === 'ar' ? 'إنشاء حساب جديد' : 'Sign Up'}
                        </button>
                      </div>

                      <form onSubmit={handleRiderSubmit} className="space-y-3">
                        {riderFormError && (
                          <div className="p-2 bg-rose-50 text-rose-800 border border-rose-100 text-[10px] rounded-lg leading-relaxed">
                            ⚠️ {riderFormError}
                          </div>
                        )}

                        {riderFormMode === 'LOGIN' ? (
                          <>
                            {/* Login Fields */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block text-right">{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">📞</span>
                                <input
                                  type="tel"
                                  placeholder={lang === 'ar' ? 'مثال: 01512345678' : 'e.g. 015...'}
                                  value={riderLoginPhone}
                                  onChange={(e) => setRiderLoginPhone(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block text-right">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔒</span>
                                <input
                                  type="password"
                                  placeholder="•••"
                                  value={riderLoginPassword}
                                  onChange={(e) => setRiderLoginPassword(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>


                          </>
                        ) : (
                          <>
                            {/* Signup Fields */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block text-right">
                                {lang === 'ar' ? 'الاسم ثنائي (الاسم الأول واللقب)' : 'Full Dual Name'}
                              </label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">👤</span>
                                <input
                                  type="text"
                                  placeholder={lang === 'ar' ? 'مثال: أحمد عز الدين' : 'e.g. John Doe'}
                                  value={riderFormName}
                                  onChange={(e) => setRiderFormName(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block text-right">{lang === 'ar' ? 'رقم الهاتف المحمول' : 'Mobile Number'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">📞</span>
                                <input
                                  type="tel"
                                  placeholder={lang === 'ar' ? 'مثال: 01011112222' : 'e.g. 010...'}
                                  value={riderFormPhone}
                                  onChange={(e) => setRiderFormPhone(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block text-right">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔒</span>
                                <input
                                  type="password"
                                  placeholder={lang === 'ar' ? 'اختر كلمة مرور آمنة' : 'Choose password'}
                                  value={riderFormPassword}
                                  onChange={(e) => setRiderFormPassword(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>

                            {/* Rider Terms of service explicitly requested */}
                            <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-[8.5px] text-slate-600 space-y-1.5 leading-relaxed font-medium">
                              <div className="flex items-center justify-between font-extrabold text-slate-800 text-[9px]">
                                <span>⚖️ شروط وسياسات الراكب:</span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={openLegalTerms}
                                    className="text-amber-700 underline hover:text-amber-900 pointer-events-auto cursor-pointer"
                                  >
                                    الشروط والأحكام
                                  </button>
                                  <button
                                    type="button"
                                    onClick={openLegalPrivacy}
                                    className="text-emerald-700 underline hover:text-emerald-900 pointer-events-auto cursor-pointer"
                                  >
                                    سياسة الخصوصية
                                  </button>
                                </div>
                              </div>
                              <p>
                                يلتزم الراكب بإدخال بيانات الرحلة بشكل صحيح، واحترام السائق وعدم الإساءة إليه، وسداد قيمة الرحلة كما هي موضحة داخل التطبيق، والمحافظة على سلامة المركبة.
                              </p>
                              <div className="flex items-start gap-2 pt-1">
                                <input
                                  type="checkbox"
                                  id="riderAgreed"
                                  checked={riderFormAgreed}
                                  onChange={(e) => setRiderFormAgreed(e.target.checked)}
                                  className="mt-0.5 accent-amber-500 pointer-events-auto cursor-pointer"
                                />
                                <label htmlFor="riderAgreed" className="text-[8.5px] text-slate-700 font-extrabold cursor-pointer select-none">
                                  لقد قرأ سياسات الراكب بالكامل وأتعهد بالالتزام بها
                                </label>
                              </div>
                            </div>
                          </>
                        )}

                        <button
                          type="submit"
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs rounded-xl shadow-md transition-transform active:scale-95 mt-4 pointer-events-auto cursor-pointer"
                        >
                          {riderFormMode === 'LOGIN' 
                            ? (lang === 'ar' ? 'تسجيل الدخول ومتابعة الرحلات' : 'Log In & Continue') 
                            : (lang === 'ar' ? 'إنشاء الحساب والبدء بالطلب' : 'Sign Up & Start Requesting')}
                        </button>
                      </form>
                    </div>

                    <button
                      onClick={() => setCurrentScreen('HOME')}
                      className="text-[10px] text-slate-500 hover:text-slate-800 underline text-center pointer-events-auto"
                    >
                      {lang === 'ar' ? '← العودة للرئيسية' : '← Back to Home'}
                    </button>
                  </div>
                )}

                {/* 3. RIDER VIEW (DASHBOARD) */}
                {currentScreen === 'RIDER_DASHBOARD' && (
                     <RiderView
                       rider={rider}
                       stats={stats}
                       locations={locations}
                       regions={regions}
                       drivers={drivers}
                       tripsHistory={tripsHistory}
                       activeTrip={activeTrip}
                       ads={ads}
                       selectedPickup={selectedPickup}
                       selectedDropoff={selectedDropoff}
                       selectedPickupRegion={selectedPickupRegion}
                       setSelectedPickupRegion={setSelectedPickupRegion}
                       setSelectedPickup={setSelectedPickup}
                       setSelectedDropoff={setSelectedDropoff}
                        onRequestRide={handleRequestRide}
                        onCancelRide={handleCancelRide}
                        onDismissCompletedTrip={handleDismissCompletedTrip}
                        onRateDriver={handleRateDriver}
                       onUpdateLocations={setLocations}
                       lang={lang}
                       onSendChatMessage={handleSendChatMessage}
                        onCalculateRoute={getRealRoute}
                       lowDataMode={lowDataMode}
                       onEnableLowData={enableLowData}
                       onDisableLowData={disableLowData}
                       noAvailableDrivers={noAvailableDrivers}
                       onOpenGuide={openGuideModal}
                         onLogout={() => {
                            setRider(prev => ({ ...prev, isLoggedIn: false }));
                            clearSession('RIDER');
                            setCurrentScreen('HOME');
                          }}
                      />
                  )}

                {/* 4. DRIVER ONBOARDING / VERIFICATION FORM */}
                {currentScreen === 'DRIVER_AUTH' && (
                  <div className="h-full bg-slate-50 p-5 flex flex-col justify-between overflow-y-auto">
                    <div className="space-y-4">
                      <div className="text-center">
                        <span className="text-3xl">🏍️</span>
                        <h3 className="text-sm font-black text-slate-900 mt-2">
                          {lang === 'ar' ? 'بوابة كباتن تطبيق عز' : 'Captain Ezz Driver Gate'}
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {lang === 'ar' ? 'سجل حسابك ككابتن أو ادخل لمباشرة رحلاتك النشطة ومتابعة عمولاتك' : 'Join our high income fleet or manage your captain profile'}
                        </p>
                      </div>

                      {/* Tab Selector */}
                      <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-xl pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setDrvFormMode('LOGIN');
                            setDrvFormError('');
                          }}
                          className={`py-2 text-[11px] font-black rounded-lg transition-all ${drvFormMode === 'LOGIN' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {lang === 'ar' ? 'تسجيل دخول كابتن' : 'Captain Login'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrvFormMode('SIGNUP');
                            setDrvFormError('');
                          }}
                          className={`py-2 text-[11px] font-black rounded-lg transition-all ${drvFormMode === 'SIGNUP' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          {lang === 'ar' ? 'طلب انضمام جديد' : 'New Registration'}
                        </button>
                      </div>

                      <form onSubmit={handleDriverSubmit} className="space-y-3">
                        {drvFormError && (
                          <div className="p-2 bg-rose-50 text-rose-800 border border-rose-100 text-[10px] rounded-lg leading-relaxed">
                            ⚠️ {drvFormError}
                          </div>
                        )}

                        {drvFormMode === 'LOGIN' ? (
                          <>
                            {/* Driver Login */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block">{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">📞</span>
                                <input
                                  type="tel"
                                  placeholder={lang === 'ar' ? 'مثال: 01012345678' : 'e.g. 010...'}
                                  value={drvLoginPhone}
                                  onChange={(e) => setDrvLoginPhone(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 block">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                              <div className="relative">
                                <span className="absolute right-3 top-2.5 text-slate-400 text-xs">🔒</span>
                                <input
                                  type="password"
                                  placeholder="•••"
                                  value={drvLoginPassword}
                                  onChange={(e) => setDrvLoginPassword(e.target.value)}
                                  className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>
                            </div>


                          </>
                        ) : (
                          <>
                            {/* Driver Signup */}
                            <div className="space-y-2 text-right" dir="rtl">
                              {/* Name Input */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-600 block text-right">
                                  الاسم ثلاثي بالكامل <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                  <span className="absolute right-3 top-2 text-slate-400 text-xs">👤</span>
                                  <input
                                    type="text"
                                    placeholder="مثال: محمد أحمد عز"
                                    value={drvFormName}
                                    onChange={(e) => setDrvFormName(e.target.value)}
                                    className="w-full py-1.5 pl-3 pr-8 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {/* Phone */}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-600 block text-right">رقم الموبايل</label>
                                  <input
                                    type="tel"
                                    placeholder="010..."
                                    value={drvFormPhone}
                                    onChange={(e) => setDrvFormPhone(e.target.value)}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                  />
                                </div>

                                {/* Password */}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-600 block text-right">كلمة المرور</label>
                                  <input
                                    type="password"
                                    placeholder="•••"
                                    value={drvFormPassword}
                                    onChange={(e) => setDrvFormPassword(e.target.value)}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                  />
                                </div>
                              </div>

                              {/* Vehicle Type Selection */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-600 block text-right">نوع المركبة</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setDrvFormVehicleType('CAR')}
                                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all pointer-events-auto ${drvFormVehicleType === 'CAR' ? 'bg-slate-900 text-amber-400 border-slate-950 shadow-xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    🚖 سيارة
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDrvFormVehicleType('TOKTOK')}
                                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all pointer-events-auto ${drvFormVehicleType === 'TOKTOK' ? 'bg-slate-900 text-amber-400 border-slate-950 shadow-xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    🛺 توكتوك
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDrvFormVehicleType('MOTORCYCLE')}
                                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all pointer-events-auto ${drvFormVehicleType === 'MOTORCYCLE' ? 'bg-slate-900 text-amber-400 border-slate-950 shadow-xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    🏍️ موتوسيكل
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDrvFormVehicleType('TRICYCLE')}
                                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all pointer-events-auto ${drvFormVehicleType === 'TRICYCLE' ? 'bg-slate-900 text-amber-400 border-slate-950 shadow-xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                  >
                                    🚲 تروسيكل
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {/* Vehicle Name */}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-600 block text-right">ماركة واسم المركبة</label>
                                  <input
                                    type="text"
                                    placeholder="مثال: توكتوك بجاج أو فيرنا زرقاء"
                                    value={drvFormVehicleName}
                                    onChange={(e) => setDrvFormVehicleName(e.target.value)}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                  />
                                </div>

                                {/* License plate */}
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-600 block text-right">رقم رخصة السيارة</label>
                                  <input
                                    type="text"
                                    placeholder="أرقام وحروف"
                                    value={drvFormLicense}
                                    onChange={(e) => setDrvFormLicense(e.target.value)}
                                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                  />
                                </div>
                              </div>

                              {/* National ID */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-600 block text-right">رقم البطاقة الشخصية (14 رقماً)</label>
                                <input
                                  type="text"
                                  maxLength={14}
                                  placeholder="مثال: 29812231234567"
                                  value={drvFormNationalId}
                                  onChange={(e) => setDrvFormNationalId(e.target.value)}
                                  className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-400 pointer-events-auto"
                                />
                              </div>

                              {/* Document Uploads Header */}
                              <div className="pt-2 border-t border-slate-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-slate-700">المستندات المطلوبة (صورة واضحة):</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrvFormPersonalPhoto('https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop');
                                      setDrvFormNationalIdImage('https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400');
                                      setDrvFormLicenseImage('https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400');
                                      setDrvFormVehicleLicenseImage('https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?w=400');
                                    }}
                                    className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded text-[8px] font-bold transition-colors pointer-events-auto cursor-pointer"
                                  >
                                    ✨ تعبئة مستندات تجريبية
                                  </button>
                                </div>

                                {/* Files Grid */}
                                <div className="grid grid-cols-2 gap-2 mt-2" dir="rtl">
                                  {/* Personal photo */}
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-bold text-slate-500 block text-right">صورة شخصية للبروفايل</span>
                                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-1.5 text-center flex flex-col items-center justify-center bg-white cursor-pointer transition-colors text-[9px] pointer-events-auto min-h-[48px]">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const r = new FileReader();
                                            r.onload = () => setDrvFormPersonalPhoto(r.result as string);
                                            r.readAsDataURL(file);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      {drvFormPersonalPhoto ? (
                                        <img src={drvFormPersonalPhoto} alt="Personal" className="w-8 h-8 rounded-full object-cover" />
                                      ) : (
                                        <>
                                          <Upload className="w-3.5 h-3.5 text-slate-400 mb-0.5" />
                                          <span className="text-[8px] text-slate-500 font-bold">ارفع صورة</span>
                                        </>
                                      )}
                                    </label>
                                  </div>

                                  {/* National ID image */}
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-bold text-slate-500 block text-right">صورة بطاقة الرقم القومي</span>
                                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-1.5 text-center flex flex-col items-center justify-center bg-white cursor-pointer transition-colors text-[9px] pointer-events-auto min-h-[48px]">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const r = new FileReader();
                                            r.onload = () => setDrvFormNationalIdImage(r.result as string);
                                            r.readAsDataURL(file);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      {drvFormNationalIdImage ? (
                                        <div className="text-emerald-600 font-extrabold flex items-center gap-0.5 text-[8px]"><Check className="w-3 h-3" /> تم الرفع</div>
                                      ) : (
                                        <>
                                          <Upload className="w-3.5 h-3.5 text-slate-400 mb-0.5" />
                                          <span className="text-[8px] text-slate-500 font-bold">ارفع صورة</span>
                                        </>
                                      )}
                                    </label>
                                  </div>

                                  {/* Driving license */}
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-bold text-slate-500 block text-right">صورة رخصة القيادة</span>
                                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-1.5 text-center flex flex-col items-center justify-center bg-white cursor-pointer transition-colors text-[9px] pointer-events-auto min-h-[48px]">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const r = new FileReader();
                                            r.onload = () => setDrvFormLicenseImage(r.result as string);
                                            r.readAsDataURL(file);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      {drvFormLicenseImage ? (
                                        <div className="text-emerald-600 font-extrabold flex items-center gap-0.5 text-[8px]"><Check className="w-3 h-3" /> تم الرفع</div>
                                      ) : (
                                        <>
                                          <Upload className="w-3.5 h-3.5 text-slate-400 mb-0.5" />
                                          <span className="text-[8px] text-slate-500 font-bold">ارفع صورة</span>
                                        </>
                                      )}
                                    </label>
                                  </div>

                                  {/* Vehicle license */}
                                  <div className="space-y-1">
                                    <span className="text-[8px] font-bold text-slate-500 block text-right">صورة رخصة العربية</span>
                                    <label className="border border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-1.5 text-center flex flex-col items-center justify-center bg-white cursor-pointer transition-colors text-[9px] pointer-events-auto min-h-[48px]">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const r = new FileReader();
                                            r.onload = () => setDrvFormVehicleLicenseImage(r.result as string);
                                            r.readAsDataURL(file);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      {drvFormVehicleLicenseImage ? (
                                        <div className="text-emerald-600 font-extrabold flex items-center gap-0.5 text-[8px]"><Check className="w-3 h-3" /> تم الرفع</div>
                                      ) : (
                                        <>
                                          <Upload className="w-3.5 h-3.5 text-slate-400 mb-0.5" />
                                          <span className="text-[8px] text-slate-500 font-bold">ارفع صورة</span>
                                        </>
                                      )}
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {/* Driver Terms Box with precise statement from user */}
                              <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-[8px] text-slate-600 space-y-1.5 leading-relaxed font-medium">
                                <div className="flex items-center justify-between font-extrabold text-slate-800 text-[9px]">
                                  <span>⚖️ الشروط والأحكام الخاصة بالكباتن:</span>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={openLegalTerms}
                                      className="text-amber-700 underline hover:text-amber-900 pointer-events-auto cursor-pointer"
                                    >
                                      الشروط والأحكام
                                    </button>
                                    <button
                                      type="button"
                                      onClick={openLegalPrivacy}
                                      className="text-emerald-700 underline hover:text-emerald-900 pointer-events-auto cursor-pointer"
                                    >
                                      سياسة الخصوصية
                                    </button>
                                  </div>
                                </div>
                                <p className="text-slate-500 text-justify">
                                  أوافق على أن هذه البيانات سرية ولا يجوز التعامل مع العملاء بطريقة غير شرعية، وعدم خيانة الأمانة، وعدم مضايقة العملاء بأي شكل، وممنوع منعاً باتاً التجاوز الجنسي أو اللفظي، وفي حالة طلب بيانات الساق تكون فقط من خلال الجهات الحكومية والجهات الرسمية المختصة. كما أوافق على الالتزام بدفع العمولات المستمرة أولاً بأول بهدف تطوير التطبيق ومواصلة جذب العملاء. وفي حالة مخالفة أي بند سيتم إيقاف الحساب نهائياً.
                                </p>
                                <div className="flex items-start gap-2 pt-1">
                                  <input
                                    type="checkbox"
                                    id="drvAgreed"
                                    checked={drvFormAgreed}
                                    onChange={(e) => setDrvFormAgreed(e.target.checked)}
                                    className="mt-0.5 accent-emerald-600 pointer-events-auto"
                                  />
                                  <label htmlFor="drvAgreed" className="text-[8px] text-emerald-950 font-extrabold cursor-pointer select-none">
                                    أوافق على جميع الشروط وأتعهد بالالتزام التام بالأمانة والمهنية
                                  </label>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <button
                          type="submit"
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-transform active:scale-95 mt-2 pointer-events-auto cursor-pointer"
                        >
                          {drvFormMode === 'LOGIN' 
                            ? (lang === 'ar' ? 'تسجيل دخول وتصفح طلبات الركوب' : 'Captain Login') 
                            : (lang === 'ar' ? 'إرسال طلب الانضمام للقرية' : 'Submit Application')}
                        </button>
                      </form>
                    </div>

                    <button
                      onClick={() => setCurrentScreen('HOME')}
                      className="text-[10px] text-slate-500 hover:text-slate-800 underline text-center pointer-events-auto mt-2"
                    >
                      {lang === 'ar' ? '← العودة للرئيسية' : '← Back to Home'}
                    </button>
                  </div>
                )}

                 {/* 5. DRIVER VIEW */}
                {currentScreen === 'DRIVER_DASHBOARD' && (
                    <DriverView
                      drivers={drivers}
                      tripsHistory={tripsHistory}
                      pendingTrips={pendingTrips}
                      selectedDriverId={selectedDriverId}
                      setSelectedDriverId={setSelectedDriverId}
                      onUpdateDriver={handleUpdateDriver}
                      activeTrip={activeTrip}
                      locations={locations}
                      regions={regions}
                      commissionRate={stats.commissionRate}
                      onToggleOnline={handleToggleOnline}
                      onUpdateDriverLocation={handleUpdateDriverLocation}
                      onUpdateServiceAreas={handleUpdateServiceAreas}
                      onAcceptTrip={handleAcceptTrip}
                     onRejectTrip={handleRejectTrip}
                     onArrivedAtPickup={handleArrivedAtPickup}
                     onStartTrip={handleStartTrip}
                     onEndTrip={handleEndTrip}
                     onRateRider={handleRateRider}
                     onDismissCompletedTrip={handleDismissCompletedTrip}
                     lang={lang}
                     onSendChatMessage={handleSendChatMessage}
                     stats={stats}
                     lowDataMode={lowDataMode}
                     onEnableLowData={enableLowData}
                     onDisableLowData={disableLowData}
                     driverLat={drivers.find(d => d.id === selectedDriverId)?.lat}
                     driverLng={drivers.find(d => d.id === selectedDriverId)?.lng}
                     onCalculateNavigationRoute={getNavigationRoute}
                     onOpenGuide={openGuideModal}
                       onLogout={() => {
                          // Auto-set driver offline in Supabase
                          if (supabaseConnected && selectedDriverId) {
                            saveDriver({ ...drivers.find(d => d.id === selectedDriverId), isOnline: false, status: 'AVAILABLE' } as Driver);
                            setDrivers(prev => prev.map(d => d.id === selectedDriverId ? { ...d, isOnline: false } : d));
                          }
                          setDriverIsLoggedIn(false);
                          clearSession('DRIVER');
                          setCurrentScreen('HOME');
                        }}
                   />
                 )}

                {/* 6. ADMIN PANEL VIEW */}
                {currentScreen === 'ADMIN' && (
                  !adminIsLoggedIn ? (
                    <div className="h-full bg-slate-900 p-5 flex flex-col justify-between overflow-y-auto text-slate-100">
                      <div className="space-y-6 my-auto">
                        <div className="text-center space-y-2">
                          <div className="w-16 h-16 bg-amber-400 text-slate-950 rounded-full flex items-center justify-center mx-auto text-3xl font-extrabold shadow-lg animate-pulse">
                            🔑
                          </div>
                          <h3 className="text-sm font-black text-amber-400 mt-2">
                            {lang === 'ar' ? 'بوابة المدير السرية - كابتن عز' : 'Captain Ezz Secret Admin Portal'}
                          </h3>
                          <p className="text-[10px] text-slate-400 leading-relaxed max-w-[250px] mx-auto">
                            {lang === 'ar' ? 'هذه المنطقة محمية ومخصصة لإدارة العمليات فقط' : 'Protected area for application moderators only'}
                          </p>
                        </div>

                           <form 
                              onSubmit={async (e) => {
                                e.preventDefault();
                                setAdminLoginError('');
                                if (rider.isLoggedIn || driverIsLoggedIn) {
                                  setAdminLoginError(lang === 'ar' ? 'يوجد حساب راكب/سائق مسجل حالياً. يرجى تسجيل الخروج أولاً.' : 'A rider/driver account is already logged in. Please logout first.');
                                  return;
                                }
                                 const admin = await authenticateAdmin(adminPhone.trim(), adminPassword.trim());
                                 if (admin) {
                                   setAdminIsLoggedIn(true);
                                   if (supabaseConnected) {
                                    await clearSession('RIDER');
                                    await clearSession('DRIVER');
                                    await saveSession('ADMIN', admin.id);
                                  }
                                } else {
                                 setAdminLoginError(lang === 'ar' ? 'رقم الهاتف أو كلمة المرور غير صحيحة!' : 'Incorrect credentials!');
                                }
                              }} 
                           className="space-y-4 max-w-xs mx-auto"
                         >
                          {adminLoginError && (
                            <div className="p-2.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] rounded-lg text-center font-bold">
                              ⚠️ {adminLoginError}
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block text-right">{lang === 'ar' ? 'رقم موبايل المدير' : 'Admin Phone'}</label>
                            <input
                              type="tel"
                              placeholder="011********"
                              value={adminPhone}
                              onChange={(e) => setAdminPhone(e.target.value)}
                              className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 pointer-events-auto"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 block text-right">{lang === 'ar' ? 'كلمة المرور السرية' : 'Secret Password'}</label>
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              className="w-full py-2 px-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 pointer-events-auto"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-transform active:scale-95 pointer-events-auto cursor-pointer"
                          >
                            🔐 {lang === 'ar' ? 'تسجيل الدخول الآمن' : 'Secure Authorization'}
                          </button>
                        </form>
                      </div>

                      <button
                        onClick={() => setCurrentScreen('HOME')}
                        className="text-[10px] text-slate-400 hover:text-slate-100 underline text-center pointer-events-auto mt-4"
                      >
                        {lang === 'ar' ? '← العودة للرئيسية' : '← Back to Home'}
                      </button>
                    </div>
                  ) : (
                      <AdminView
                        stats={stats}
                        drivers={drivers}
                        locations={locations}
                        regions={regions}
                        riders={registeredRiders}
                        visitorCount={visitorCount}
                        onUpdateCommissionRate={handleUpdateCommissionRate}
                        onUpdatePricingStats={handleUpdatePricingStats}
                        onSavePricingStats={handleSavePricingStats}
                        onSettleDriverCommissions={handleSettleDriverCommissions}
                        onUpdateLocations={setLocations}
                        onUpdateRegions={setRegions}
                        onApproveDriver={handleApproveDriver}
                       onRejectDriver={handleRejectDriver}
                       onFreezeDriver={handleFreezeDriver}
                       onUnfreezeDriver={handleUnfreezeDriver}
                       onDeleteDriver={handleDeleteDriver}
                       onFreezeRider={handleFreezeRider}
                       onUnfreezeRider={handleUnfreezeRider}
                       onBlockRider={handleBlockRider}
                       onUnblockRider={handleUnblockRider}
                        onDeleteRider={handleDeleteRider}
                        onAddBalanceToRider={handleAddBalanceToRider}
                        onAddBalanceToDriver={handleAddBalanceToDriver}
                        onClearAllFakeData={handleClearAllFakeData}
                        lang={lang}
                         onLogout={() => {
                            setAdminIsLoggedIn(false);
                            if (supabaseConnected) clearSession('ADMIN');
                          }}
                        onTriggerToast={triggerToast}
                     />
                  )
                )}

              </div>
            </div>

            {/* Simulated Phone Home Indicator Bar */}
            <div className="w-28 h-1 bg-slate-800 rounded-full mx-auto mt-2 shrink-0 z-20" />
          </div>
        </div>

        {/* Right Side: Interactive City Vector Map & Optimized Guide Card */}
        <div className="lg:col-span-7 space-y-6">
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-3.5 px-4 text-center text-[10px] text-slate-500 shrink-0 space-y-2">
        <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-300">
          <button
            type="button"
            onClick={() => openGuideModal('rider')}
            className="hover:text-amber-400 underline underline-offset-4 transition-colors cursor-pointer text-amber-400 font-extrabold"
          >
            📖 {lang === 'ar' ? 'دليل الاستخدام والتعليمات' : 'User & Driver Guide'}
          </button>
          <span className="text-slate-600">•</span>
          <button
            type="button"
            onClick={openLegalTerms}
            className="hover:text-amber-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            ⚖️ {lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}
          </button>
          <span className="text-slate-600">•</span>
          <button
            type="button"
            onClick={openLegalPrivacy}
            className="hover:text-amber-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            🔒 {lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}
          </button>
        </div>
        <div>
          {currentT.footer}
        </div>
      </footer>

      {/* Interactive User & Driver Guide Modal */}
      <GuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        defaultTab={guideModalTab}
        lang={lang}
      />

      {/* Global Terms & Conditions & Privacy Policy Modal */}
      <LegalModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        defaultTab={legalModalTab}
        lang={lang}
      />

      {/* Supabase SQL Setup Wizard Dialog */}
      {showSqlWizard && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl text-right" dir="rtl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <h3 className="text-sm font-black text-amber-400">تفعيل الربط السحابي بـ Supabase</h3>
              </div>
              <button 
                onClick={() => setShowSqlWizard(false)}
                className="text-slate-400 hover:text-white font-bold p-1 pointer-events-auto cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              لقد قمنا ببرمجة وربط الكود بقاعدة بيانات <strong>Supabase</strong> مباشرة! لتشغيل الربط بنجاح وبدء تخزين المشاوير والكباتن والركاب سحابياً، يرجى اتباع الخطوات البسيطة التالية:
            </p>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex gap-2 items-start">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-amber-400 text-[10px] shrink-0">١</span>
                <p>افتح لوحة تحكم <strong>Supabase</strong> الخاصة بمشروعك.</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-amber-400 text-[10px] shrink-0">٢</span>
                <p>اذهب إلى قسم <strong>SQL Editor</strong> من القائمة الجانبية ثم اضغط <strong>New Query</strong>.</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-amber-400 text-[10px] shrink-0">٣</span>
                <p>انسخ الكود البرمجي أدناه بالكامل والصقه في المحرر ثم اضغط <strong>Run</strong>.</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                <span>SQL Schema Code:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(SQL_SCHEMA);
                    alert('📋 تم نسخ كود الـ SQL بنجاح!');
                  }}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-lg cursor-pointer pointer-events-auto shadow-xs text-[10px]"
                >
                  نسخ الكود الكلي
                </button>
              </div>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[9px] font-mono text-emerald-400 max-h-48 overflow-y-auto text-left whitespace-pre">
                {SQL_SCHEMA}
              </pre>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[10px] text-emerald-300 leading-relaxed text-center font-semibold">
              ✨ بمجرد إنشاء الجداول في مشروعك، سيتحول شريط الاتصال في أعلى واجهة الهاتف إلى اللون الأخضر (أونلاين 🟢) وتعمل المزامنة الفورية!
            </div>

            <button
              onClick={() => setShowSqlWizard(false)}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
            >
              مفهوم، العودة للتطبيق 👍
            </button>
          </div>
        </div>
      )}

      {/* Premium In-App Strong Floating Toast Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -80, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm pointer-events-auto"
            dir="rtl"
          >
            <div className={`rounded-2xl shadow-2xl border p-4 flex gap-3 overflow-hidden relative ${
              toast.type === 'success' 
                ? 'bg-slate-900/95 text-emerald-400 border-emerald-500/30 backdrop-blur-md' 
                : toast.type === 'warning'
                ? 'bg-slate-900/95 text-rose-400 border-rose-500/30 backdrop-blur-md'
                : toast.type === 'new_trip'
                ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-amber-400/20'
                : 'bg-slate-900/95 text-amber-400 border-slate-800 backdrop-blur-md'
            }`}>
              <div className="text-xl shrink-0">
                {toast.type === 'success' ? '✅' : toast.type === 'warning' ? '❌' : toast.type === 'new_trip' ? '🚖' : '🔔'}
              </div>
              <div className="flex-1 text-right min-w-0">
                <h4 className={`text-xs font-black tracking-tight ${toast.type === 'new_trip' ? 'text-slate-950' : 'text-white'}`}>
                  {toast.title}
                </h4>
                <p className={`text-[10px] mt-1 leading-normal ${toast.type === 'new_trip' ? 'text-slate-900 font-extrabold' : 'text-slate-300 font-medium'}`}>
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => setToast(null)}
                className={`p-1 rounded-full hover:bg-white/10 transition-colors shrink-0 pointer-events-auto cursor-pointer ${
                  toast.type === 'new_trip' ? 'text-slate-950 hover:bg-slate-950/10' : 'text-slate-400 hover:text-white'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Draining Timer Bar */}
              <motion.div 
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 5, ease: 'linear' }}
                className={`absolute bottom-0 right-0 h-1 ${
                  toast.type === 'new_trip' ? 'bg-slate-950' : 'bg-amber-400'
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Firebase Cloud Messaging (FCM) Setup Modal */}
      <FirebaseFcmModal
        isOpen={showFcmModal}
        onClose={() => setShowFcmModal(false)}
        lang={lang}
      />
    </div>
  );
}
