import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Driver, Trip, Location, SystemStats, Region } from '../types';
import { RouteResult } from '../utils/haversine';
import { ToggleLeft, ToggleRight, MapPin, Navigation, DollarSign, Wallet, Check, AlertTriangle, Users, Star, MessageSquare, Loader2, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';
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

  // Driver Trip History (paginated + filtered to last 24h by default for fast performance)
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [myTripsPage, setMyTripsPage] = useState(0);
  const [myTripsHasMore, setMyTripsHasMore] = useState(false);
  const [myTripDateFrom, setMyTripDateFrom] = useState(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return yesterday.toISOString().split('T')[0];
  });
  const [myTripDateTo, setMyTripDateTo] = useState('');
  const [isLoadingMyTrips, setIsLoadingMyTrips] = useState(false);

  // Optional map toggle (driver can show/hide the map on demand)
  const [showMap, setShowMap] = useState(false);

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
      const result = await fetchTripsHistoryPaginated({
        userId: currentDriver.id,
        role: 'driver',
        dateFrom: myTripDateFrom || undefined,
        dateTo: myTripDateTo || undefined,
        page,
        limit: 10,
      });
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
  }, [currentDriverId, myTripDateFrom, myTripDateTo]);

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
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 select-none font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Modern Top Header / Driver Profile Card */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sticky top-0 z-40 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-emerald-500/20">
                {currentDriver.name ? currentDriver.name[0] : 'ك'}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${currentDriver.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-black text-slate-900 leading-none">{currentDriver.name}</h4>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 text-[9px] font-extrabold flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span>{currentDriver.rating || 5.0}</span>
                </span>
                {pendingRequestCount > 0 && (
                  <span className="animate-pulse bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                    📞 {pendingRequestCount}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                {currentDriver.carModel} • <span className="font-mono">{currentDriver.carPlate}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online / Offline Status Button */}
            <button
              type="button"
              onClick={handleOnlineToggle}
              className={`p-1.5 px-3 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1.5 border shadow-xs ${
                currentDriver.isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${currentDriver.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{currentDriver.isOnline ? (lang === 'ar' ? 'متصل 🟢' : 'Online') : (lang === 'ar' ? 'غير متصل ⚪' : 'Offline')}</span>
            </button>

            {/* Low Data Mode Toggle */}
            <button
              type="button"
              onClick={() => {
                if (lowDataMode) {
                  onDisableLowData?.();
                } else {
                  onEnableLowData?.();
                }
              }}
              className={`p-2 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 border ${
                lowDataMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title={lang === 'ar' ? (lowDataMode ? 'توفير البيانات مفعل' : 'تفعيل توفير البيانات') : (lowDataMode ? 'Low Data Active' : 'Save Data')}
            >
              <span className="text-xs">📡</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={onLogout}
              className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1"
              title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
            >
              <span className="text-xs">🚪</span>
            </button>
          </div>
        </div>

        {/* Coverage Areas Section */}
        {currentDriver.approvalStatus === 'APPROVED' && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-indigo-500" />
                {lang === 'ar' ? 'مناطق تغطيتي:' : 'Coverage Areas:'}
              </span>
              {currentDriver.serviceAreas.length === 0 && (
                <span className="text-[8px] bg-rose-100 text-rose-700 font-black px-1.5 py-0.5 rounded-full animate-pulse">
                  {lang === 'ar' ? 'مطلوب تحديد منطقة' : 'Required'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {regions.length === 0 ? (
                <span className="text-[9px] text-amber-600 font-semibold">
                  {lang === 'ar' ? 'لا توجد مناطق معرفة — تواصل مع الإدارة' : 'No regions defined'}
                </span>
              ) : (
                regions.map((region) => {
                  const isSelected = currentDriver.serviceAreas.some(sa => sa === region.nameAr || sa === region.nameEn);
                  return (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => {
                        let newAreas: string[];
                        if (isSelected) {
                          newAreas = currentDriver.serviceAreas.filter(sa => sa !== region.nameAr && sa !== region.nameEn);
                        } else {
                          newAreas = [...currentDriver.serviceAreas, region.nameAr];
                        }
                        onUpdateServiceAreas?.(currentDriver.id, newAreas);
                        saveDriver({ ...currentDriver, serviceAreas: newAreas });
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 inline-block mr-0.5" />}
                      {region.nameAr}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
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
        {isCurrentlyDriving && (
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

            {/* Interactive driving steps */}
            {activeTrip.status === 'ACCEPTED' && (
              <>
                <button
                  type="button"
                  onClick={onArrivedAtPickup}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                >
                  {lang === 'ar' ? 'لقد وصلت لنقطة الركوب' : 'I have arrived at pickup'}
                </button>

                {onTransferTrip && (
                  <button
                    type="button"
                    onClick={onTransferTrip}
                    className="w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 font-bold text-[10px] rounded-xl transition-all cursor-pointer"
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
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                {lang === 'ar' ? 'بدء الرحلة الآن' : 'Start the Trip'}
              </button>
            )}

            {activeTrip.status === 'STARTED' && (
              <button
                type="button"
                onClick={onEndTrip}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                {lang === 'ar' ? `إنهاء الرحلة وتحصيل ${activeTrip.fare} ج.م` : `End Ride & Collect ${activeTrip.fare} EGP`}
              </button>
            )}

            {/* Live Trip Map for driver — auto-shows when navigating, toggle to hide */}
            {activeTrip && ['ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status) && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowMap(prev => !prev)}
                  className={`w-full py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    showMap
                      ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {showMap
                    ? (lang === 'ar' ? 'إخفاء الخريطة' : 'Hide Map')
                    : (lang === 'ar' ? 'عرض الخريطة والملاحة' : 'Show Map & Navigation')}
                </button>

                {showMap && (
                  <Suspense
                    fallback={
                      <div className="w-full h-64 flex items-center justify-center bg-slate-100 rounded-2xl">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                      </div>
                    }
                  >
                    <CityMap
                      locations={locations}
                      activeTrip={activeTrip}
                      selectedPickup={activeTrip.pickup.id}
                      selectedDropoff={activeTrip.dropoff.id}
                      lang={lang}
                      onUpdateLocations={() => {}}
                      onSelectPickup={() => {}}
                      onSelectDropoff={() => {}}
                      height="h-[260px]"
                      distanceKm={activeTrip.distance}
                      etaMinutes={activeTrip.etaMinutes}
                      isRealRoute={!!activeTrip.routeGeometry}
                      readOnly
                      currentDriverPosition={driverLat && driverLng ? { lat: driverLat, lng: driverLng } : null}
                      navigationRoute={navigationRoute?.geometry || null}
                    />
                  </Suspense>
                )}
                
                {/* Turn-by-Turn Navigation Directions */}
                {navigationRoute?.steps && navigationRoute.steps.length > 0 && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    {/* Current Instruction Banner */}
                    <div className="bg-blue-600 text-white p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0 text-xl">
                        {getManeuverEmoji(navigationRoute.steps[0] || {})}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-blue-100 uppercase tracking-wide">
                          {lang === 'ar' ? 'التعليمات التالية' : 'Next Instruction'}
                        </p>
                        <p className="text-xs font-bold truncate">
                          {navigationRoute.steps[0]?.instruction || (lang === 'ar' ? 'استمر في الطريق' : 'Continue straight')}
                        </p>
                        <p className="text-[10px] text-blue-200">
                          {navigationRoute.steps[0]?.name} • {navigationRoute.steps[0]?.distance} km
                        </p>
                      </div>
                    </div>
                    
                    {/* Upcoming Steps List */}
                    <div className="max-h-[150px] overflow-y-auto p-2 space-y-1">
                      {navigationRoute.steps.slice(1, 8).map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                          <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm">
                            {getManeuverEmoji(step)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-slate-200 truncate">
                              {step.instruction || (lang === 'ar' ? 'استمر' : 'Continue')}
                            </p>
                            <p className="text-[8px] text-slate-400 truncate">
                              {step.name} • {step.distance} km
                            </p>
                          </div>
                        </div>
                      ))}
                      {navigationRoute.steps.length > 8 && (
                        <p className="text-[9px] text-slate-500 text-center py-1">
                          +{navigationRoute.steps.length - 8} {lang === 'ar' ? 'تعليمات إضافية' : 'more steps'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {isCalculatingRoute && (
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-2 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-[10px] text-slate-500 font-medium">
                      {lang === 'ar' ? 'جاري حساب مسار الملاحة...' : 'Calculating navigation route...'}
                    </span>
                  </div>
                )}
              </div>
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
                    <p className="text-[10px] font-bold text-slate-500 text-center uppercase">
                      {lang === 'ar' ? 'كيف تقيم العميل؟' : 'Rate this customer'}
                    </p>
                    
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
                        {lang === 'ar' ? 'ملاحظات إضافية (اختياري)' : 'Additional Notes (Optional)'}
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
                  <div className="border-t border-emerald-100/60 pt-2 text-center space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-700 bg-white border border-emerald-100 rounded-lg p-1.5 flex items-center justify-center gap-1.5">
                      <span>✅</span>
                      <span>
                        {lang === 'ar'
                          ? `تم إرسال تقييمك (${activeTrip.driverRatingToRider} نجوم) بنجاح.`
                          : `Rating submitted (${activeTrip.driverRatingToRider} stars) successfully.`}
                      </span>
                    </p>
                    <p className="text-[9px] text-slate-400 animate-pulse leading-normal">
                      {lang === 'ar'
                        ? 'بانتظار تأكيد الراكب للتقييم من حسابه لإغلاق المشوار والبدء باستقبال رحلات جديدة...'
                        : 'Waiting for rider to rate and dismiss to clear from screen...'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* State 3: Static waiting for requests */}
        {!isEligibleForRequest && !isCurrentlyDriving && (
          <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
            <div className="w-10 h-10 bg-slate-50 border border-slate-200 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <Navigation className="w-5 h-5 rotate-45" />
            </div>
            {currentDriver.isOnline ? (
              <>
                <p className="text-xs font-bold text-slate-700">
                  {lang === 'ar' ? 'بانتظار طلبات جديدة...' : 'Waiting for incoming rides...'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {lang === 'ar'
                    ? 'سيظهر هنا فور طلب راكب رحلة مطابقة لموقعك.'
                    : 'Requests will show here automatically when a passenger books.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-600">
                  {lang === 'ar' ? 'أنت غير متصل حالياً' : 'You are currently offline'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {lang === 'ar'
                    ? 'يرجى تفعيل زر الاتصال من الأعلى لاستلام طلبات الركاب.'
                    : 'Please turn on your online status to receive rides.'}
                </p>
              </>
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

        {/* Driver Trip History (Paginated + Date Filtered to last 24h by default for data savings) */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-right">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
            <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
              <span>⚡</span>
              <span>{lang === 'ar' ? 'عرض آخر 24 ساعة (لتوفير البيانات والسرعة)' : 'Last 24 Hours (Low Data)'}</span>
            </span>
            <h3 className="text-[11px] font-black text-slate-800 flex items-center gap-1">
              <span>🕒 {lang === 'ar' ? 'سجل رحلاتي' : 'My Trips History'}</span>
              {pendingRequestCount > 0 && (
                <span className="animate-pulse bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none">
                  {lang === 'ar' ? `📞 ${pendingRequestCount} جديد` : `📞 ${pendingRequestCount} new`}
                </span>
              )}
            </h3>
          </div>
          
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
