import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Driver, Trip, Location, SystemStats, Region } from '../types';
import { RouteResult } from '../utils/haversine';
import { ToggleLeft, ToggleRight, MapPin, Navigation, DollarSign, Wallet, Check, AlertTriangle, Users, Star, MessageSquare, Bell, ShieldAlert, Loader2, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';
import { fetchTripsHistoryPaginated, saveDriver } from '../supabaseService';
// Lazy-load the map so the driver screen opens instantly even on slow networks.
// The map bundle is only fetched when the driver explicitly taps "Show map".
const CityMap = lazy(() => import('./CityMap').then(m => ({ default: m.CityMap })));

interface DriverViewProps {
  drivers: Driver[];
  selectedDriverId: string;
  setSelectedDriverId: (id: string) => void;
  activeTrip: Trip | null;
  locations: Location[];
  regions: Region[];
  commissionRate: number;
  onToggleOnline: (driverId: string) => void;
  onUpdateDriverLocation?: (driverId: string, lat: number, lng: number, x: number, y: number) => void;
  onUpdateServiceAreas?: (driverId: string, areas: string[]) => void;
  onUpdateDriver?: (driver: Driver) => void;
  onAcceptTrip: (driverId: string) => void;
  onRejectTrip: () => void;
  onArrivedAtPickup: () => void;
  onStartTrip: () => void;
  onEndTrip: () => void;
  onTransferTrip?: () => void;
  onRateRider: (rating: number, tags: string[], comment?: string) => void;
  onDismissCompletedTrip?: () => void;
  lang: 'ar' | 'en';
  onSendChatMessage: (text: string, sender: 'RIDER' | 'DRIVER') => void;
  onLogout: () => void;
  stats?: SystemStats;
  lowDataMode?: boolean;
  onEnableLowData?: () => void;
  onDisableLowData?: () => void;
  pendingRequestCount?: number;
  driverLat?: number;
  driverLng?: number;
  onCalculateNavigationRoute?: (driverLat: number, driverLng: number, pickup: Location, dropoff: Location) => Promise<RouteResult | null>;
  onOpenGuide?: (tab?: 'rider' | 'driver' | 'about') => void;
  tripsHistory?: Trip[];
  pendingTrips?: Trip[];
}

export const DriverView: React.FC<DriverViewProps> = ({
  drivers,
  selectedDriverId,
  setSelectedDriverId,
  activeTrip,
  locations,
  regions,
  commissionRate,
  onToggleOnline,
  onUpdateDriverLocation,
  onUpdateServiceAreas,
  onUpdateDriver,
  onAcceptTrip,
  onRejectTrip,
  onArrivedAtPickup,
  onStartTrip,
  onEndTrip,
  onTransferTrip,
  onRateRider,
  onDismissCompletedTrip,
  lang,
  onSendChatMessage,
  onLogout,
  stats,
  lowDataMode = false,
  onEnableLowData,
  onDisableLowData,
  pendingRequestCount = 0,
  driverLat,
  driverLng,
  onCalculateNavigationRoute,
  onOpenGuide,
  tripsHistory = [],
  pendingTrips = [],
}) => {
  const safeSelectedId = selectedDriverId || '';
  const safeDrivers = Array.isArray(drivers) ? drivers : [];

  const visibleDrivers = React.useMemo(() => {
    if (!safeSelectedId) return safeDrivers.slice(0, 1);
    const current = safeDrivers.find((d) => d.id === safeSelectedId);
    return current ? [current] : safeDrivers.slice(0, 1);
  }, [safeDrivers, safeSelectedId]);

  const currentDriver = visibleDrivers.find((d) => d.id === safeSelectedId) || visibleDrivers[0];
  const currentDriverId = currentDriver?.id || '';
  const activeTripRef = useRef(activeTrip);
  activeTripRef.current = activeTrip;
  const driverLatRef = useRef(driverLat);
  driverLatRef.current = driverLat;
  const driverLngRef = useRef(driverLng);
  driverLngRef.current = driverLng;
  const onUpdateDriverLocationRef = useRef(onUpdateDriverLocation);
  onUpdateDriverLocationRef.current = onUpdateDriverLocation;
  const onUpdateDriverRef = useRef(onUpdateDriver);
  onUpdateDriverRef.current = onUpdateDriver;
  const onCalculateNavigationRouteRef = useRef(onCalculateNavigationRoute);
  onCalculateNavigationRouteRef.current = onCalculateNavigationRoute;

  let geoWatchId: number | null = null;

  React.useEffect(() => {
    if (!currentDriverId || !onUpdateDriverLocationRef.current) return;
    const trip = activeTripRef.current;
    if (!trip || trip.driverId !== currentDriverId) return;

    if (!('geolocation' in navigator)) {
      console.warn('[GPS] Geolocation not supported in this browser');
      return;
    }

    geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const x = ((lng - 31.2561) / 0.0025) + 50;
        const y = ((lat - 29.6197) / 0.0025) + 50;
        // Propagate location update to parent (App) so it can update state
        try {
          onUpdateDriverLocationRef.current?.(currentDriverId, lat, lng, x, y);
        } catch (err) {
          console.warn('[DriverView] onUpdateDriverLocation error:', err);
        }
      },
      (err) => {
        console.warn('[GPS] Watch error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
      }
    );

    return () => {
      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
      }
    };
  }, [currentDriverId, activeTrip?.id, activeTrip?.driverId]);

  const [chatText, setChatText] = useState('');
  const [driverGivenRating, setDriverGivenRating] = useState(5);
  const [driverSelectedTags, setDriverSelectedTags] = useState<string[]>([]);
  const [driverComment, setDriverComment] = useState('');

  // Navigation state
  const [navigationRoute, setNavigationRoute] = useState<RouteResult | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  // Driver Trip History (paginated + filtered)
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [myTripsPage, setMyTripsPage] = useState(0);
  const [myTripsHasMore, setMyTripsHasMore] = useState(false);
  const [myTripDateFrom, setMyTripDateFrom] = useState('');
  const [myTripDateTo, setMyTripDateTo] = useState('');
  const [isLoadingMyTrips, setIsLoadingMyTrips] = useState(false);

  // Optional map toggle (driver can show/hide the map on demand)
  const [showMap, setShowMap] = useState(false);

  // PWA Service Worker & Push Notification state
  const [swRegistered, setSwRegistered] = useState(false);
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default'>('default');

  React.useEffect(() => {
    if (!currentDriver) {
      setNavigationRoute(null);
      return;
    }
    const trip = activeTripRef.current;
    if (!trip || trip.driverId !== currentDriver.id) {
      setNavigationRoute(null);
      return;
    }
    const calcRoute = onCalculateNavigationRouteRef.current;
    if (!calcRoute || !driverLatRef.current || !driverLngRef.current) {
      setNavigationRoute(null);
      return;
    }

    // Auto-show map only if driver preference enables it
    if ((currentDriver.autoShowMap || false) && ['ACCEPTED', 'ARRIVED', 'STARTED'].includes(trip.status)) {
      setShowMap(true);
    }

    let cancelled = false;
    setIsCalculatingRoute(true);

    calcRoute(driverLatRef.current, driverLngRef.current, trip.pickup, trip.dropoff)
      .then(result => {
        if (!cancelled) {
          setNavigationRoute(result);
          setIsCalculatingRoute(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNavigationRoute(null);
          setIsCalculatingRoute(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentDriverId, activeTrip?.id, activeTrip?.status, onCalculateNavigationRoute]);

  React.useEffect(() => {
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        setSwRegistered(!!reg);
      });
    }
  }, []);

  const handleTestPushNotification = async () => {
    if (!('Notification' in window)) {
      alert(lang === 'ar' ? 'التنبيهات غير مدعومة في متصفحك' : 'Notifications are not supported in this browser');
      return;
    }

    const permission = await Notification.requestPermission();
    setPushStatus(permission);

    if (permission === 'granted') {
      setTimeout(() => {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(
              lang === 'ar' ? 'تطبيق كابتن عز 🚖' : 'Ezz Driver App 🚖',
              {
                body: lang === 'ar'
                  ? 'تم إرسال إشعار الخلفية بنجاح عبر Service Worker!'
                  : 'Background notification sent successfully via Service Worker!',
                icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>',
                tag: 'pwa-background-test'
              }
            );
          }).catch(() => {
            new Notification(
              lang === 'ar' ? 'تطبيق كابتن عز 🚖' : 'Ezz Driver App 🚖',
              {
                body: lang === 'ar'
                  ? 'تم تشغيل التنبيه في الخلفية بنجاح!'
                  : 'Background notification fired successfully!',
                icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>'
              }
            );
          });
        } else {
          new Notification(
            lang === 'ar' ? 'تطبيق كابتن عز 🚖' : 'Ezz Driver App 🚖',
            {
              body: lang === 'ar' ? 'تنبيه خلفية سريع بنجاح!' : 'Quick background notification success!',
              icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚖</text></svg>'
            }
          );
        }
      }, 3000);

      alert(lang === 'ar'
        ? 'تمت جدولة إشعار الخلفية بنجاح! يرجى تصغير التطبيق أو قفل الشاشة لاختباره خلال 3 ثوانٍ.'
        : 'Background notification scheduled! Minimize or close the app to test in 3 seconds.'
      );
    } else {
      alert(lang === 'ar' ? 'يرجى السماح بالتنبيهات أولاً' : 'Please grant notification permissions first');
    }
  };

  const getManeuverEmoji = (step: any): string => {
    const type = step.maneuver?.type || '';
    const modifier = step.maneuver?.modifier || '';
    if (type === 'arrive') return '🏁';
    if (type === 'depart') return '🚀';
    if (type === 'roundabout') return '🔄';
    if (type === 'merge') return '🔗';
    if (type === 'fork') return '⑂';
    if (type === 'ramp') return '🛣️';
    if (modifier === 'left') return '⬅️';
    if (modifier === 'right') return '➡️';
    if (modifier === 'slight left') return '↰';
    if (modifier === 'slight right') return '↱';
    if (modifier === 'sharp left') return '⮘';
    if (modifier === 'sharp right') return '⮙';
    if (modifier === 'uturn') return '↩️';
    if (modifier === 'straight') return '⬆️';
    return '↑';
  };

  const handleOnlineToggle = () => {
    if (!currentDriver) return;
    onToggleOnline(currentDriver.id);
  };

  const loadMyTrips = async (reset = false) => {
    if (!currentDriver || !currentDriver.id) return;
    setIsLoadingMyTrips(true);
    const page = reset ? 0 : myTripsPage;
    try {
      let result = await fetchTripsHistoryPaginated({
        userId: currentDriver.id,
        role: 'driver',
        dateFrom: myTripDateFrom || undefined,
        dateTo: myTripDateTo || undefined,
        page,
        limit: 10,
      });

      const safeHistory = Array.isArray(tripsHistory) ? tripsHistory : [];
      if ((!result || result.trips.length === 0) && safeHistory.length > 0) {
        let filtered = safeHistory.filter((t) => t.driverId === currentDriver.id);
        if (myTripDateFrom) {
          const fromTime = new Date(`${myTripDateFrom}T00:00:00`).getTime();
          filtered = filtered.filter((t) => new Date(t.createdAt).getTime() >= fromTime);
        }
        if (myTripDateTo) {
          const toTime = new Date(`${myTripDateTo}T23:59:59.999`).getTime();
          filtered = filtered.filter((t) => new Date(t.createdAt).getTime() <= toTime);
        }
        const start = reset ? 0 : page * 10;
        const pageTrips = filtered.slice(start, start + 10);
        result = {
          trips: pageTrips,
          hasMore: start + 10 < filtered.length,
        };
      }

      if (reset) {
        setMyTrips(result.trips);
        setMyTripsPage(1);
      } else {
        setMyTrips((prev) => [...prev, ...result.trips]);
        setMyTripsPage((prev) => prev + 1);
      }
      setMyTripsHasMore(result.hasMore);
    } catch {
      // silently fail
    } finally {
      setIsLoadingMyTrips(false);
    }
  };

  useEffect(() => {
    loadMyTrips(true);
  }, [currentDriverId, myTripDateFrom, myTripDateTo, tripsHistory]);

  const isEligibleForRequest =
    currentDriver &&
    activeTrip &&
    (activeTrip.driverId === currentDriver.id || activeTrip.offeredDriverIds?.includes(currentDriver.id)) &&
    activeTrip.status === 'SEARCHING' &&
    currentDriver.isOnline;

  React.useEffect(() => {
    console.log('[DriverView] activeTrip:', activeTrip?.id || 'null', 'status:', activeTrip?.status || 'null',
      'currentDriverId:', currentDriver?.id || 'null',
      'offeredDriverIds:', activeTrip?.offeredDriverIds,
      'isEligibleForRequest:', isEligibleForRequest);
  }, [activeTrip?.id, activeTrip?.status, activeTrip?.offeredDriverIds, currentDriver?.id]);

  const getCoordsFromXY = (x: number, y: number) => {
    const latBase = 29.6197;
    const lngBase = 31.2561;
    return { lat: latBase + (y - 50) * 0.0025, lng: lngBase + (x - 50) * 0.0025 };
  };

   const isCurrentlyDriving = currentDriver && activeTrip && activeTrip.driverId === currentDriver.id;
   const isTripActive = currentDriver && activeTrip && (isCurrentlyDriving || isEligibleForRequest);

  if (!currentDriver) {
    return (
      <div className="flex flex-col h-full bg-white text-slate-900 select-none p-6 text-center justify-center items-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-bold text-slate-500">
          {lang === 'ar' ? 'جاري تحميل بيانات السائق...' : 'Loading driver data...'}
        </p>
      </div>
    );
  }

  if (currentDriver.approvalStatus !== 'APPROVED') {
    const isPending = currentDriver.approvalStatus === 'PENDING';
    const isFrozen = currentDriver.approvalStatus === 'FROZEN';
    const isRejected = currentDriver.approvalStatus === 'REJECTED';

    return (
      <div className="flex flex-col h-full bg-white text-slate-900 select-none p-6 text-center justify-center items-center space-y-6 animate-fade-in relative">
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={onLogout}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl text-xs font-black transition-all cursor-pointer pointer-events-auto flex items-center gap-1"
          >
            <span>🚪</span>
            <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
          </button>
        </div>

        <div className="bg-slate-50 border-b border-slate-100 p-3 w-full flex items-center justify-between rounded-2xl mb-4 pt-12">
          <span className="text-xs font-semibold text-slate-500">{lang === 'ar' ? 'السائق الحالي:' : 'Driver:'}</span>
          <span className="text-xs font-bold text-slate-800">{currentDriver.name} ({currentDriver.carModel})</span>
        </div>

        {isPending && (
          <div className="space-y-4 animate-fade-in">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
              ⏳
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {lang === 'ar' ? 'الحساب قيد المراجعة والتدقيق' : 'Account Under Review'}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {lang === 'ar'
                  ? `أهلاً كابتن ${currentDriver.name}، لقد تم تقديم مستنداتك بنجاح لإدارة كابتن عز.`
                  : `Hello Captain ${currentDriver.name}, your documents are being verified by Ezz Admin.`}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-left space-y-1.5 text-[10px] text-slate-600">
              <p>📍 <strong>{lang === 'ar' ? 'نوع المركبة:' : 'Vehicle Type:'}</strong> {
                currentDriver.vehicleType === 'CAR'
                  ? (lang === 'ar' ? 'سيارة 🚖' : 'Car 🚖')
                  : currentDriver.vehicleType === 'MOTORCYCLE'
                  ? (lang === 'ar' ? 'موتوسيكل 🏍️' : 'Motorcycle 🏍️')
                  : currentDriver.vehicleType === 'TOKTOK'
                  ? (lang === 'ar' ? 'توكتوك 🛺' : 'TukTuk 🛺')
                  : (lang === 'ar' ? 'تروسيكل 🚲' : 'Tricycle 🚲')
              }</p>
              <p>🚗 <strong>{lang === 'ar' ? 'اسم المركبة:' : 'Vehicle Name:'}</strong> {currentDriver.vehicleName}</p>
              <p>💳 <strong>{lang === 'ar' ? 'رقم البطاقة:' : 'National ID:'}</strong> {currentDriver.nationalId}</p>
              <p>📄 <strong>{lang === 'ar' ? 'رخصة القيادة:' : 'Driver License:'}</strong> {currentDriver.driverLicense}</p>
            </div>
            <div className="bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-100 text-[10px] leading-relaxed">
              {lang === 'ar'
                ? 'سيقوم مسؤول كابتن عز بمراجعة البيانات وتفعيل حسابك خلال دقائق. يمكنك التواصل مع الدعم لتسريع العملية.'
                : 'Our team is reviewing your details to activate your account. Tap below to chat with us.'}
            </div>
          </div>
        )}

        {isFrozen && (
          <div className="space-y-4 animate-fade-in">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
              🚫
            </div>
            <div>
              <h3 className="text-lg font-bold text-red-600">
                {lang === 'ar' ? 'تم تجميد حسابك مؤقتاً!' : 'Account Frozen!'}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {lang === 'ar'
                  ? `كابتن ${currentDriver.name}، نأسف لإعلامك بأنه تم إيقاف حسابك مؤقتاً لتراكم عمولات التطبيق المستحقة.`
                  : `Captain ${currentDriver.name}, your account is temporarily suspended due to unpaid commissions.`}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] text-slate-500">{lang === 'ar' ? 'إجمالي المبالغ المستحقة' : 'Outstanding Commission'}</p>
              <p className="text-lg font-black text-rose-600 mt-1">{currentDriver.totalCommissionPaid} ج.م</p>
            </div>
            <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-100 text-[10px] leading-relaxed">
              {lang === 'ar'
                ? 'يرجى سداد العمولات المتأخرة وتصفية حساب الكابتن مع الإدارة عبر الواتساب لإعادة التفعيل الفوري.'
                : 'Please contact administration on WhatsApp to settle your dues and restore access.'}
            </div>
          </div>
        )}

        {isRejected && (
          <div className="space-y-4 animate-fade-in">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
              ❌
            </div>
            <div>
              <h3 className="text-lg font-bold text-rose-600">
                {lang === 'ar' ? 'طلب الانضمام مرفوض' : 'Application Rejected'}
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {lang === 'ar'
                  ? 'نعتذر منك كابتن، لم تتم الموافقة على رخصة سيارتك أو بياناتك المقدمة من قبل مراجعي تطبيق عز.'
                  : 'We are sorry, your driver documents were rejected by Ezz moderators.'}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-left space-y-1.5 text-[10px] text-slate-600">
              <p>👤 <strong>{lang === 'ar' ? 'الاسم:' : 'Name:'}</strong> {currentDriver.name}</p>
              <p>💳 <strong>{lang === 'ar' ? 'رقم البطاقة:' : 'National ID:'}</strong> {currentDriver.nationalId}</p>
            </div>
          </div>
        )}

        {/* Support WhatsApp Action */}
        <a
          href={`https://wa.me/${(stats?.supportWhatsApp || '201015555555').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
            lang === 'ar'
              ? `مرحباً إدارة كابتن عز، أنا الكابتن ${currentDriver.name} ورقم هاتفي ${currentDriver.phone}، أود الاستفسار بخصوص حسابي.`
              : `Hello Ezz Admin, I am Captain ${currentDriver.name} (${currentDriver.phone}). I have a query about my driver account.`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02] pointer-events-auto"
        >
          💬 {lang === 'ar' ? 'تواصل مع الإدارة عبر واتساب' : 'Contact Support via WhatsApp'}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white text-slate-900 select-none">
      {/* Driver Selector & Status Toggle (Compact Polished Header) */}
      <div className="bg-gradient-to-r from-indigo-600 to-emerald-500 p-2.5 sm:p-3 rounded-t-2xl text-white shadow-md">
        {/* Main Info Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Driver Avatar & Details */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center text-sm font-black ring-1 ring-white/30 shrink-0">
              <span className="select-none">{(currentDriver.name && currentDriver.name.charAt(0)) || 'س'}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-extrabold truncate">{currentDriver.name}</h2>
                {pendingRequestCount > 0 && (
                  <span className="animate-pulse bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full leading-none shrink-0">
                    📞 {pendingRequestCount}
                  </span>
                )}
              </div>
              <p className="text-[10px] opacity-90 truncate leading-tight">{currentDriver.carModel} • {currentDriver.carPlate}</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                <div className="flex items-center gap-0.5 text-amber-200">
                  <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                  <span className="font-bold text-white">{currentDriver.rating}</span>
                  <span className="text-[9px] opacity-80">({currentDriver.totalTrips})</span>
                </div>
                <div className="bg-white/15 px-1.5 py-0.2 rounded-full text-[9px] font-semibold">{currentDriver.vehicleName}</div>
              </div>
            </div>
          </div>

          {/* Primary Top Action Controls (Online Toggle & Logout) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOnlineToggle}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-xs transition-all shadow-xs cursor-pointer pointer-events-auto ${
                currentDriver.isOnline ? 'bg-white text-emerald-700' : 'bg-white/20 text-white/90 border border-white/20'
              }`}
            >
              <span className="text-[11px]">{currentDriver.isOnline ? (lang === 'ar' ? 'متصل' : 'Online') : (lang === 'ar' ? 'غير متصل' : 'Offline')}</span>
              {currentDriver.isOnline ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-white/80" />}
            </button>

            <button
              onClick={onLogout}
              type="button"
              className="px-2.5 py-1 rounded-full bg-rose-500/90 hover:bg-rose-600 text-white text-xs font-black shadow-xs flex items-center gap-1 transition-transform active:scale-95 cursor-pointer pointer-events-auto shrink-0"
              title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            >
              <span>🚪</span>
              <span>{lang === 'ar' ? 'خروج' : 'Logout'}</span>
            </button>
          </div>
        </div>

        {/* Secondary Quick Toggles Bar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-white/15 text-[10px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (lowDataMode) {
                  onDisableLowData?.();
                } else {
                  onEnableLowData?.();
                }
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer pointer-events-auto transition-all flex items-center gap-1 ${
                lowDataMode ? 'bg-emerald-400 text-slate-950 font-black' : 'bg-white/15 text-white/90 hover:bg-white/25'
              }`}
            >
              <span>{lowDataMode ? '📡' : '📶'}</span>
              <span>{lowDataMode ? (lang === 'ar' ? 'توفير مفعّل' : 'Low Data') : (lang === 'ar' ? 'وفر بيانات' : 'Save Data')}</span>
            </button>
          </div>


        </div>

        {/* Service Areas Selection (Mandatory - Dropdown) */}
        {currentDriver.approvalStatus === 'APPROVED' && (
          <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/90 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-amber-300" />
                {lang === 'ar' ? 'اختر منطقة التغطية *' : 'Select Coverage Area *'}
              </span>
              {currentDriver.serviceAreas.length === 0 && (
                <span className="text-[8px] bg-rose-500 text-white font-black px-1.5 py-0.5 rounded-full animate-pulse">
                  {lang === 'ar' ? 'مطلوب!' : 'REQUIRED'}
                </span>
              )}
            </div>

            {regions.length === 0 ? (
              <span className="text-[9px] text-amber-300 font-semibold block">
                {lang === 'ar' ? 'لا توجد مناطق معرفة — تواصل مع الإدارة' : 'No regions defined yet — contact admin'}
              </span>
            ) : (
              <div className="space-y-1.5">
                <select
                  value=""
                  onChange={(e) => {
                    const regionId = e.target.value;
                    if (!regionId) return;
                    const region = regions.find(r => r.id === regionId);
                    if (!region) return;
                    const isSelected = currentDriver.serviceAreas.some(sa => sa === region.nameAr || sa === region.nameEn);
                    let newAreas: string[];
                    if (isSelected) {
                      newAreas = currentDriver.serviceAreas.filter(sa => sa !== region.nameAr && sa !== region.nameEn);
                    } else {
                      newAreas = [...currentDriver.serviceAreas, region.nameAr];
                    }
                    onUpdateServiceAreas?.(currentDriver.id, newAreas);
                    saveDriver({ ...currentDriver, serviceAreas: newAreas });
                  }}
                  className="w-full bg-white text-slate-800 border border-slate-200 rounded-xl py-2 px-2.5 text-[11px] font-bold focus:outline-none cursor-pointer pointer-events-auto shadow-xs"
                >
                  <option value="">{lang === 'ar' ? '— اضغط هنا لاختيار المنطقة لتفعيلها —' : '— Select region to activate —'}</option>
                  {regions.map((region) => {
                    const isSelected = currentDriver.serviceAreas.some(sa => sa === region.nameAr || sa === region.nameEn);
                    return (
                      <option key={region.id} value={region.id}>
                        {isSelected ? '✓ ' : ''}{region.nameAr} ({region.nameEn}) {isSelected ? (lang === 'ar' ? '— (مفعّلة)' : '— (Active)') : ''}
                      </option>
                    );
                  })}
                </select>

                {/* Active Regions Badges */}
                {currentDriver.serviceAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {currentDriver.serviceAreas.map((areaName) => (
                      <span key={areaName} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black shadow-2xs">
                        <span>{areaName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newAreas = currentDriver.serviceAreas.filter(sa => sa !== areaName);
                            onUpdateServiceAreas?.(currentDriver.id, newAreas);
                            saveDriver({ ...currentDriver, serviceAreas: newAreas });
                          }}
                          className="text-white/80 hover:text-white font-bold cursor-pointer pointer-events-auto text-[10px]"
                          title={lang === 'ar' ? 'إزالة' : 'Remove'}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentDriver.serviceAreas.length === 0 && currentDriver.isOnline && (
              <div className="bg-amber-500/20 border border-amber-400/40 rounded-lg p-1.5 text-[9px] text-amber-200 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-300 shrink-0" />
                {lang === 'ar'
                  ? 'حدد منطقة تغطية واحدة على الأقل لاستقبال طلبات الرحلات'
                  : 'Select at least one coverage area to receive ride requests'}
              </div>
            )}
          </div>
        )}

        {/* Rating and Info */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="font-bold text-slate-700">{currentDriver.rating}</span>
            <span>({currentDriver.totalTrips} {lang === 'ar' ? 'رحلة' : 'rides'})</span>
          </div>
          <div className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold">
            {currentDriver.carPlate}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* State 1: Incoming Ride Alert */}
        {isEligibleForRequest && (
          <div className="bg-emerald-50/90 border-2 border-emerald-400 rounded-2xl p-4 space-y-3 text-center animate-pulse shadow-md relative overflow-hidden">
            {/* Background watermarked taxi icon */}
            <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 pointer-events-none">
              <Navigation className="w-32 h-32 rotate-45" />
            </div>

            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 bg-emerald-500 text-white text-[9px] font-black rounded-full uppercase tracking-wider flex items-center gap-1">
                <span>⚡</span>
                <span>{lang === 'ar' ? 'طلب رحلة جديد!' : 'New Ride Request!'}</span>
              </span>
              <span className="text-sm font-black text-slate-800">
                {activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </span>
            </div>

            {/* Generic eligibility notice (no GPS distance) */}
            <div className="bg-white border border-emerald-200/60 rounded-xl p-2.5 text-center">
              <p className="text-[10px] font-bold text-slate-600">
                {lang === 'ar'
                  ? '🟢 أنت متاح الآن — من يرد أولاً يأخذ الرحلة'
                  : '🟢 You are online and available — first to accept gets the ride'}
              </p>
            </div>

            {/* Timer countdown */}
            <div className="bg-white border border-emerald-200/50 rounded-xl p-2.5 space-y-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold text-emerald-700">
                  {lang === 'ar' ? 'الرد قبل انتهاء الوقت' : 'Respond before timeout'}
                </span>
                <span className="font-extrabold text-emerald-950 font-mono">
                  {activeTrip.dispatchTimer || 120}s
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full transition-all duration-1000 rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, ((activeTrip.dispatchTimer || 120) / (activeTrip.dispatchTimerMax || 120)) * 100))}%` }}
                />
              </div>
              <p className="text-[8px] text-slate-400 leading-none mt-1">
                {lang === 'ar'
                  ? 'أنت من أقرب 5 سائقين للرحلة. من يرد أولاً يأخذ الرحلة.'
                  : 'You are one of the 5 nearest drivers. First to accept gets the ride.'}
              </p>
            </div>

            <div className="border-t border-b border-emerald-200/50 py-2.5 space-y-2 text-left">
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400">{lang === 'ar' ? 'نقطة الركوب' : 'Pickup'}</p>
                  <p className="text-xs font-semibold text-slate-800">
                    {lang === 'ar' ? activeTrip.pickup.nameAr : activeTrip.pickup.nameEn}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Navigation className="w-4 h-4 text-rose-500 shrink-0 rotate-45" />
                <div>
                  <p className="text-[10px] text-slate-400">{lang === 'ar' ? 'الوجهة' : 'Dropoff'}</p>
                  <p className="text-xs font-semibold text-slate-800">
                    {lang === 'ar' ? activeTrip.dropoff.nameAr : activeTrip.dropoff.nameEn}
                  </p>
                </div>
              </div>
              {activeTrip.pickupLandmark && (
                <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-right mt-1">
                  <p className="text-[8.5px] font-extrabold text-emerald-800 block">
                    📍 {lang === 'ar' ? 'العلامة المميزة للراكب:' : 'Rider Landmark:'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-700 mt-0.5">
                    {activeTrip.pickupLandmark}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRejectTrip}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {lang === 'ar' ? 'رفض الطلب' : 'Decline'}
              </button>
              <button
                type="button"
                onClick={() => onAcceptTrip(currentDriver.id)}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all scale-100 active:scale-95 cursor-pointer"
              >
                {lang === 'ar' ? 'قبول وتوصيل ✅' : 'Accept Ride ✅'}
              </button>
            </div>
          </div>
        )}

        {/* State 2: Active Driving Mode */}
        {isTripActive && (
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full">
                {activeTrip.status === 'ACCEPTED' && (lang === 'ar' ? 'توجه للركاب' : 'Drive to pickup')}
                {activeTrip.status === 'ARRIVED' && (lang === 'ar' ? 'بانتظار الصعود' : 'Waiting at pickup')}
                {activeTrip.status === 'STARTED' && (lang === 'ar' ? 'الرحلة قائمة' : 'Driving to dropoff')}
              </span>
              <span className="text-xs font-bold text-blue-800">
                {activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </span>
            </div>

            {/* Instruction block */}
            <div className="bg-white border border-blue-100/60 p-3 rounded-xl space-y-2 text-left">
              <p className="text-[10px] text-slate-400 font-bold uppercase">
                {lang === 'ar' ? 'التعليمات الحالية' : 'Current Route Instructions'}
              </p>
              {activeTrip.status === 'ACCEPTED' && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                  <span>
                    {lang === 'ar'
                      ? `توجه إلى: ${activeTrip.pickup.nameAr}`
                      : `Go to pickup: ${activeTrip.pickup.nameEn}`}
                  </span>
                </div>
              )}
              {(activeTrip.status === 'ARRIVED' || activeTrip.status === 'STARTED') && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <Navigation className="w-4 h-4 text-rose-500 rotate-45" />
                  <span>
                    {lang === 'ar'
                      ? `توجه إلى: ${activeTrip.dropoff.nameAr}`
                      : `Go to destination: ${activeTrip.dropoff.nameEn}`}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-slate-500 border-t border-slate-100 pt-1.5 flex justify-between">
                <span>{lang === 'ar' ? 'الراكب:' : 'Rider:'} {activeTrip.riderName}</span>
                <span>{lang === 'ar' ? 'الهاتف:' : 'Phone:'} {activeTrip.riderPhone}</span>
              </div>
              {activeTrip.pickupLandmark && (
                <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl text-right mt-1.5">
                  <p className="text-[8.5px] font-extrabold text-emerald-800 block">
                    📍 {lang === 'ar' ? 'العلامة المميزة للراكب:' : 'Rider Landmark:'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-700 mt-0.5">
                    {activeTrip.pickupLandmark}
                  </p>
                </div>
              )}
            </div>

            {/* Chat with Rider Section */}
            {activeTrip && activeTrip.driverId && (
            <div className="bg-white border border-slate-150 p-3 rounded-2xl space-y-2 pointer-events-auto">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs pb-1 border-b border-slate-100">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span>{lang === 'ar' ? 'شات للتواصل الفوري داخل التطبيق' : 'In-App Direct Chat'}</span>
              </div>

              <div className="bg-slate-50 rounded-xl p-2 max-h-[120px] overflow-y-auto space-y-1.5 border border-slate-100 flex flex-col">
                {activeTrip.chatMessages && activeTrip.chatMessages.length > 0 ? (
                  activeTrip.chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`max-w-[85%] rounded-xl px-2.5 py-1 text-[10px] leading-snug shadow-xs ${
                        msg.sender === 'DRIVER'
                          ? 'bg-blue-600 text-white rounded-tr-none self-end text-right'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none self-start text-left'
                      }`}
                    >
                      <p className="font-semibold break-words">{msg.text}</p>
                      <span className="text-[7.5px] opacity-80 block mt-0.5 text-right">{msg.timestamp}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-3 text-slate-400 text-[9px]">
                    💬 {lang === 'ar' ? 'لا توجد رسائل بعد. راسل الراكب للتأكيد.' : 'No messages yet. Message rider to confirm.'}
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatText.trim()) return;
                  onSendChatMessage(chatText.trim(), 'DRIVER');
                  setChatText('');
                }}
                className="flex gap-1 pt-1 pointer-events-auto"
              >
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب رسالة للراكب...' : 'Message passenger...'}
                  className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10.5px] font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="px-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10.5px] rounded-lg transition-colors cursor-pointer"
                >
                  {lang === 'ar' ? 'إرسال' : 'Send'}
                </button>
              </form>
            </div>
            )}

            {/* Interactive driving steps */}
            {activeTrip.status === 'ACCEPTED' && (
              <>
                <button
                  type="button"
                  onClick={onArrivedAtPickup}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
                >
                  {lang === 'ar' ? 'لقد وصلت لنقطة الركوب' : 'I have arrived at pickup'}
                </button>

                {onTransferTrip && (
                  <button
                    type="button"
                    onClick={onTransferTrip}
                    className="w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 font-bold text-[10px] rounded-xl transition-all cursor-pointer pointer-events-auto"
                  >
                    {lang === 'ar' ? '🔄 العميل بعيد — أحول الطلب لسائق آخر' : '🔄 Client too far — Transfer to another driver'}
                  </button>
                )}
              </>
            )}

            {activeTrip.status === 'ARRIVED' && (
              <button
                type="button"
                onClick={onStartTrip}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
              >
                {lang === 'ar' ? 'بدء الرحلة الآن' : 'Start the Trip'}
              </button>
            )}

            {activeTrip.status === 'STARTED' && (
              <button
                type="button"
                onClick={onEndTrip}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
              >
                {lang === 'ar' ? `إنهاء الرحلة وتحصيل ${activeTrip.fare} ج.م` : `End Ride & Collect ${activeTrip.fare} EGP`}
              </button>
            )}

            {activeTrip.status === 'COMPLETED' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3 mt-1 text-center">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-sm font-bold">
                  💰
                </div>
                <div>
                  <h4 className="text-xs font-black text-emerald-900">
                    {lang === 'ar' ? 'تم إنهاء الرحلة بنجاح! 🎉' : 'Trip Finished Successfully! 🎉'}
                  </h4>
                  <p className="text-[10px] text-emerald-700 mt-0.5 leading-relaxed">
                    {lang === 'ar'
                      ? `المبلغ المستحق تحصيله من الراكب ${activeTrip.riderName}: ${activeTrip.fare} ج.م`
                      : `Amount to collect from rider ${activeTrip.riderName}: ${activeTrip.fare} EGP`}
                  </p>
                  {activeTrip.commission > 0 && (
                    <div className="mt-2 space-y-1 bg-white/60 rounded-lg p-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">{lang === 'ar' ? 'إجمالي الرحلة' : 'Total fare'}</span>
                        <span className="font-bold text-slate-800">{activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-rose-500">{lang === 'ar' ? 'العمولة' : 'Commission'}</span>
                        <span className="font-bold text-rose-600">-{activeTrip.commission} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
                      </div>
                      <div className="flex justify-between text-[10px] border-t border-emerald-100 pt-1">
                        <span className="text-emerald-700 font-black">{lang === 'ar' ? 'صافي التحصيل' : 'Net collection'}</span>
                        <span className="font-black text-emerald-700">{activeTrip.fare - activeTrip.commission} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
                      </div>
                    </div>
                  )}
                  {activeTrip.appliedPromoCode && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-[10px]">
                      <span className="font-bold text-amber-900">
                        🎁 {lang === 'ar' ? 'كود خصم مطبق:' : 'Promo code applied:'} {activeTrip.appliedPromoCode}
                      </span>
                      {activeTrip.appliedPromoDiscount ? (
                        <span className="text-rose-600 font-bold mr-2">
                          -{activeTrip.appliedPromoDiscount} {lang === 'ar' ? 'ج.م' : 'EGP'}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {!activeTrip.driverRatingToRider ? (
                  <div className="space-y-3 border-t border-emerald-100/60 pt-2 text-right">
                    <div className="text-center space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">
                        {lang === 'ar' ? 'كيف تقيم العميل؟' : 'Rate this customer'}
                      </p>
                      <p className="text-[9px] text-amber-700 font-semibold bg-amber-50 rounded-full px-2 py-0.5 inline-block border border-amber-200">
                        🔒 {lang === 'ar' ? 'ملاحظة: هذا التقييم داخلي للإدارة فقط ولن يظهر للعميل' : 'Note: This rating is internal for management only and won\'t be visible to rider'}
                      </p>
                    </div>
                    
                    {/* Stars */}
                    <div className="flex justify-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setDriverGivenRating(star)}
                          className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= driverGivenRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 justify-center">
                      {(lang === 'ar'
                        ? [
                            '👍 عميل محترم جداً',
                            '⏱️ ملتزم بالوقت والموعد',
                            '🚗 تواصل ممتاز وسهل',
                            '🌟 خلوق وراقٍ للغاية'
                          ]
                        : [
                            '👍 Highly Respectful',
                            '⏱️ On-Time Arrival',
                            '🚗 Great Communication',
                            '🌟 Exemplary Conduct'
                          ]
                      ).map((tag) => {
                        const isSelected = driverSelectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setDriverSelectedTags((prev) =>
                                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                              );
                            }}
                            className={`px-2 py-0.5 text-[9px] font-semibold rounded-full border transition-all pointer-events-auto cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>

                    {/* Written Comment notes */}
                    <div className="space-y-1 text-right">
                      <label className="text-[10px] font-bold text-slate-500 block">
                        {lang === 'ar' ? 'ملاحظات إضافية للإدارة (اختياري)' : 'Internal Notes for Admin (Optional)'}
                      </label>
                      <textarea
                        value={driverComment}
                        onChange={(e) => setDriverComment(e.target.value)}
                        placeholder={lang === 'ar' ? 'اكتب تعليقك هنا مثلاً: "عميل ملتزم ومحترم"...' : 'Type your comment here...'}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-700 focus:outline-emerald-500 resize-none h-14 pointer-events-auto"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onRateRider(driverGivenRating, driverSelectedTags, driverComment);
                        setDriverSelectedTags([]); // reset
                        setDriverComment(''); // reset
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'إرسال تقييم الراكب وتسجيل الرحلة' : 'Submit Rating & Log Ride'}
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-emerald-100/60 pt-2 text-center space-y-2">
                    <p className="text-[10px] font-bold text-emerald-800 bg-white border border-emerald-200 rounded-lg p-2 flex items-center justify-center gap-1.5 shadow-xs">
                      <span>✅</span>
                      <span>
                        {lang === 'ar'
                          ? `تم تسجيل تقييمك الداخلي للراكب (${activeTrip.driverRatingToRider} نجوم) بنجاح.`
                          : `Internal passenger rating submitted (${activeTrip.driverRatingToRider} stars) successfully.`}
                      </span>
                    </p>
                    {onDismissCompletedTrip && (
                      <button
                        type="button"
                        onClick={onDismissCompletedTrip}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-sm transition-colors cursor-pointer pointer-events-auto"
                      >
                        {lang === 'ar' ? '✅ الاستعداد لرحلة جديدة' : '✅ Ready for next ride'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* State 3: Available Requests List & Idle State */}
        {!isTripActive && (
          <div className="space-y-3">
            {/* Header / Notice */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md space-y-2 text-right">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {pendingTrips.length} {lang === 'ar' ? 'طلبات متاحة' : 'Pending requests'}
                </span>
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <span>📋 {lang === 'ar' ? 'قائمة الطلبات المتاحة' : 'Available Trip Requests'}</span>
                </div>
              </div>
              
              {!currentDriver.isOnline && (
                <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-2.5 text-[10px] text-amber-200 flex items-center justify-between gap-2">
                  <span>
                    {lang === 'ar'
                      ? '🔴 أنت غير متصل حالياً! تفقد الطلبات المتاحة وقم بتفعيل وضع (متصل) من أعلى الشاشة للقبول.'
                      : '🔴 You are offline! Check pending requests and switch online to accept.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleOnline(currentDriver.id)}
                    className="shrink-0 px-2.5 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black rounded-lg text-[10px] transition-colors cursor-pointer"
                  >
                    {lang === 'ar' ? 'تفعيل أونلاين 🟢' : 'Go Online 🟢'}
                  </button>
                </div>
              )}
            </div>

            {/* List of Pending Trips */}
            {pendingTrips.length > 0 ? (
              <div className="space-y-2">
                {pendingTrips.map((trip) => {
                  const pName = trip.pickup ? (lang === 'ar' ? trip.pickup.nameAr : trip.pickup.nameEn) : '';
                  const dName = trip.dropoff ? (lang === 'ar' ? trip.dropoff.nameAr : trip.dropoff.nameEn) : '';

                  return (
                    <div
                      key={trip.id}
                      className="bg-white border-2 border-slate-100 hover:border-blue-200 rounded-2xl p-3.5 space-y-3 shadow-xs transition-all text-right"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          💰 {trip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {trip.requestedVehicleType === 'CAR' && (lang === 'ar' ? '🚖 سيارة' : '🚖 Car')}
                            {trip.requestedVehicleType === 'MOTORCYCLE' && (lang === 'ar' ? '🏍️ موتوسيكل' : '🏍️ Motorcycle')}
                            {trip.requestedVehicleType === 'TOKTOK' && (lang === 'ar' ? '🛺 توكتوك' : '🛺 TukTuk')}
                            {trip.requestedVehicleType === 'TRICYCLE' && (lang === 'ar' ? '🚲 تروسيكل' : '🚲 Tricycle')}
                          </span>
                          <span className="text-xs font-black text-slate-800">{trip.riderName}</span>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs font-semibold text-slate-700">
                        <div className="flex items-start gap-1.5 justify-end">
                          <span className="text-slate-900 font-bold">{pName}</span>
                          <span className="text-emerald-600 shrink-0">📍 {lang === 'ar' ? 'من:' : 'From:'}</span>
                        </div>
                        {trip.pickupLandmark && (
                          <p className="text-[10px] text-amber-700 font-bold bg-amber-50 rounded-lg px-2 py-0.5 inline-block">
                            🏷️ {lang === 'ar' ? 'علامة مميزة:' : 'Landmark:'} {trip.pickupLandmark}
                          </p>
                        )}
                        <div className="flex items-start gap-1.5 justify-end pt-1">
                          <span className="text-slate-900 font-bold">{dName}</span>
                          <span className="text-rose-600 shrink-0">🏁 {lang === 'ar' ? 'إلى:' : 'To:'}</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400">
                          📏 {trip.distance} {lang === 'ar' ? 'كم' : 'km'}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            if (!currentDriver.isOnline) {
                              alert(lang === 'ar' ? 'يرجى تفعيل زر الاتصال (أونلاين) أولاً لقبول الرحلة.' : 'Please switch to online first to accept this trip.');
                              return;
                            }
                            onAcceptTrip(trip.id);
                          }}
                          className={`px-4 py-2 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer ${
                            currentDriver.isOnline
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-[1.02]'
                              : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                          }`}
                        >
                          {currentDriver.isOnline
                            ? (lang === 'ar' ? 'قبول الرحلة 🚖' : 'Accept Ride 🚖')
                            : (lang === 'ar' ? '🔴 تفعيل أونلاين للقبول' : '🔴 Go Online to Accept')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
                <div className="w-10 h-10 bg-slate-50 border border-slate-200 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Navigation className="w-5 h-5 rotate-45" />
                </div>
                {currentDriver.isOnline ? (
                  <>
                    <p className="text-xs font-bold text-slate-700">
                      {lang === 'ar' ? 'بانتظار طلبات رحلات جديدة...' : 'Waiting for incoming rides...'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {lang === 'ar'
                        ? 'تظهر الرحلات المطلوبة هنا تلقائياً فور إرسال الركاب لطلبات جديدة.'
                        : 'Requests will show here automatically when a passenger books.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-600">
                      {lang === 'ar' ? 'أنت غير متصل حالياً (Offline)' : 'You are currently offline'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {lang === 'ar'
                        ? 'يرجى تفعيل زر الاتصال من الأعلى لاستلام وقبول طلبات الركاب.'
                        : 'Please turn on your online status to receive and accept rides.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Outstanding Commission Warning Alert */}
        {currentDriver.totalCommissionPaid > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2 animate-fade-in text-right">
            <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-xs justify-end">
              <span className="text-amber-500 text-sm">⚠️</span>
              <h4>{lang === 'ar' ? 'تنبيه سداد عمولة كابتن عز' : 'Captain Ezz Commission Payment Alert'}</h4>
            </div>
            <p className="text-[10px] text-amber-800 leading-relaxed font-bold">
              {lang === 'ar'
                ? `كابتن ${currentDriver.name}، يرجى تصفية وسداد عمولة التطبيق المستحقة والبالغة ${currentDriver.totalCommissionPaid} ج.م لتجنب تجميد حسابك مؤقتاً.`
                : `Captain ${currentDriver.name}, please settle your outstanding commission of ${currentDriver.totalCommissionPaid} EGP to avoid automatic temporary account freezing.`}
            </p>
            <a
              href={`https://wa.me/${(stats?.supportWhatsApp || '201015555555').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                lang === 'ar'
                  ? `أريد سداد عمولة التطبيق المستحقة لحسابي الكابتن: ${currentDriver.name}، القيمة: ${currentDriver.totalCommissionPaid} ج.م`
                  : `I want to settle my outstanding commission for my captain account: ${currentDriver.name}, value: ${currentDriver.totalCommissionPaid} EGP`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] rounded-lg transition-all"
            >
              💬 {lang === 'ar' ? 'سداد العمولة الآن عبر واتساب' : 'Pay Outstanding Commission Now'}
            </a>
          </div>
        )}

        {/* Driver Wallet & Commission Tracker Ledger */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span>{lang === 'ar' ? 'محفظة كابتن عز' : 'Captain Ezz Wallet'}</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              {lang === 'ar' ? 'تحديث لحظي' : 'Real-time Ledger'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-white border border-slate-100 p-2.5 rounded-xl">
              <p className="text-[9px] text-slate-400 font-medium">{lang === 'ar' ? 'إجمالي الأرباح' : 'Gross Earnings'}</p>
              <p className="text-sm font-bold text-slate-800 mt-1">
                {currentDriver.totalEarnings + currentDriver.totalCommissionPaid} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </p>
            </div>
            <div className="bg-white border border-slate-100 p-2.5 rounded-xl">
              <p className="text-[9px] text-rose-400 font-medium">{lang === 'ar' ? 'العمولة المستقطعة' : 'Commission Paid'}</p>
              <p className="text-sm font-bold text-rose-600 mt-1">
                -{currentDriver.totalCommissionPaid} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </p>
            </div>
          </div>

          {/* Net balance banner */}
          <div className="bg-emerald-500 text-white rounded-xl p-3 flex justify-between items-center">
            <div>
              <p className="text-[10px] opacity-90">{lang === 'ar' ? 'صافي أرباحك في جيبك' : 'Your Net Earnings'}</p>
              <p className="text-base font-bold mt-0.5">
                {currentDriver.totalEarnings} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </p>
            </div>
            <Check className="w-5 h-5 opacity-90" />
          </div>

          {/* Commission awareness notice */}
          <div className="bg-slate-100 text-slate-500 rounded-xl p-2.5 text-[9px] flex gap-1.5 items-start">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p>
              {lang === 'ar'
                ? `يقوم تطبيق عز باحتساب عمولة ${commissionRate}% مخصومة مباشرة من إجمالي رحلاتك، وتضاف في شاشة المدير للتسوية الدورية.`
                : `Ezz system deducts a ${commissionRate}% commission directly from each completed trip. This amount is logged in the admin panel.`}
            </p>
          </div>
        </div>

        {/* PWA Background Alerts & Push Notifications */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Bell className="w-4 h-4 text-amber-500" />
              <span>{lang === 'ar' ? 'مركز إشعارات الخلفية (PWA)' : 'PWA Background Push Alert'}</span>
            </div>
            <span className="text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
              Service Worker
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-normal">
            {lang === 'ar' 
              ? 'يعمل كود Service Worker في خلفية المتصفح لاستقبل إشعارات الرحلات الجديدة وإصدار صوت وتنبيه حتى لو كان التطبيق مغلقاً!' 
              : 'Utilizes Service Workers and Web Push API to wake up the browser and play alert sound for new rides even if the tab is closed.'}
          </p>

          <button
            type="button"
            onClick={handleTestPushNotification}
            className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <span>🔔</span>
            <span>{lang === 'ar' ? 'اختبار استقبال إشعار بالخلفية' : 'Test SW Background Push'}</span>
          </button>

          <div className="bg-white border border-slate-100 p-2.5 rounded-xl text-[9px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>{lang === 'ar' ? 'حالة الـ Service Worker:' : 'Service Worker Registered:'}</span>
              <span className={`font-bold ${swRegistered ? 'text-emerald-600' : 'text-amber-500'}`}>
                {swRegistered ? (lang === 'ar' ? 'مسجّل ومُفعّل' : 'Active') : (lang === 'ar' ? 'جاري المحاكاة بنجاح' : 'Active (Simulated)')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{lang === 'ar' ? 'صلاحية التنبيهات بالمتصفح:' : 'Browser Notification Permission:'}</span>
              <span className={`font-bold ${pushStatus === 'granted' ? 'text-emerald-600' : pushStatus === 'denied' ? 'text-red-500' : 'text-slate-500'}`}>
                {pushStatus === 'granted' ? (lang === 'ar' ? 'مسموح بها' : 'Granted') : pushStatus === 'denied' ? (lang === 'ar' ? 'مرفوضة' : 'Denied') : (lang === 'ar' ? 'غير محدد' : 'Default')}
              </span>
            </div>
          </div>
        </div>

        {/* Driver Trip History (Paginated + Date Filtered) */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-right">
          <h3 className="text-[11px] font-black text-slate-800 flex items-center gap-1 justify-end">
            <span>🕒 {lang === 'ar' ? 'رحلاتي (سجل الرحلات)' : 'My Trips History'}</span>
            {pendingRequestCount > 0 && (
              <span className="animate-pulse bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none">
                {lang === 'ar' ? `📞 ${pendingRequestCount} طلب جديد` : `📞 ${pendingRequestCount} new`}
              </span>
            )}
          </h3>
          
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={myTripDateFrom}
              onChange={(e) => setMyTripDateFrom(e.target.value)}
              className="flex-1 text-[9px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 pointer-events-auto"
            />
            <span className="text-[9px] text-slate-400">{lang === 'ar' ? 'إلى' : 'to'}</span>
            <input
              type="date"
              value={myTripDateTo}
              onChange={(e) => setMyTripDateTo(e.target.value)}
              className="flex-1 text-[9px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 pointer-events-auto"
            />
          </div>

          {myTrips.length > 0 ? (
            <>
              <div className="space-y-2 divide-y divide-slate-100/60 pr-1 max-h-[220px] overflow-y-auto">
                {myTrips.map((trip) => {
                  const formattedDate = trip.createdAt ? new Date(trip.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  }) : '';
                  return (
                    <div key={trip.id} className="pt-2 flex justify-between items-center text-[10px] text-slate-600 gap-2">
                      <div className="text-left font-mono shrink-0">
                        <p className="font-bold text-slate-950">{trip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}</p>
                        <p className="text-[7.5px] text-slate-400 font-sans">{formattedDate}</p>
                        {trip.commission > 0 && (
                          <p className="text-[7.5px] text-rose-500 font-sans">
                            -{trip.commission} {lang === 'ar' ? 'ج.م عمولة' : 'EGP commission'}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate" dir="rtl">
                          🏁 {lang === 'ar' ? trip.dropoff.nameAr : trip.dropoff.nameEn}
                        </p>
                        <p className="text-[9px] text-slate-400 truncate mt-0.5" dir="rtl">
                          📍 {lang === 'ar' ? trip.pickup.nameAr : trip.pickup.nameEn}
                        </p>
                        <p className="text-[8px] text-slate-500 mt-0.5">
                          {trip.riderName}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {myTripsHasMore && (
                <button
                  type="button"
                  onClick={() => loadMyTrips(false)}
                  disabled={isLoadingMyTrips}
                  className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-bold rounded-xl transition-colors cursor-pointer pointer-events-auto disabled:opacity-50"
                >
                  {isLoadingMyTrips ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? 'عرض المزيد' : 'Load More')}
                </button>
              )}
            </>
          ) : (
            <p className="text-[10px] text-slate-400 text-center py-2">
              {isLoadingMyTrips ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? 'لا توجد رحلات بعد.' : 'No trips yet.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
