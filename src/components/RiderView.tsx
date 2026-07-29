import React, { useState, useEffect, lazy, Suspense, Dispatch, SetStateAction } from 'react';
import { Location, Driver, Trip, Rider, Region, Ad } from '../types';
import { MapPin, ArrowRightLeft, Navigation, Phone, Star, DollarSign, Loader2, Sparkles, AlertCircle, Car, HelpCircle, MessageSquare, Search, Check } from 'lucide-react';
import { calculateHaversineDistance, estimateDrivingDistance, calculateDynamicFare, getVehiclePricing, calculateVehicleFare, calculateFullTripFare } from '../utils/haversine';
import { fetchTripsHistoryPaginated, saveRiderPreferences, validatePromoCode } from '../supabaseService';
import { RiderPreferences } from '../types';
import { AdBanner } from './AdBanner';

// Lazy-load the heavy map components so the rider page opens instantly on
// weak networks. The map bundle is only fetched when the user taps "Show map".
const CityMap = lazy(() => import('./CityMap').then(m => ({ default: m.CityMap })));
const GoogleMap = lazy(() => import('./GoogleMap').then(m => ({ default: m.GoogleMap })));

interface RiderViewProps {
  rider: Rider;
  stats: any;
  locations: Location[];
  regions: Region[];
  drivers: Driver[];
  tripsHistory: Trip[];
  activeTrip: Trip | null;
  ads?: Ad[];
  selectedPickup: string;
  selectedDropoff: string;
  selectedPickupRegion: string;
  setSelectedPickupRegion: (regionId: string) => void;
  setSelectedPickup: (id: string) => void;
  setSelectedDropoff: (id: string) => void;
  onRequestRide: (requestedVehicleType: 'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE', pickupLandmark?: string, promoCode?: string, promoCodeId?: string) => void;
  onCancelRide: () => void;
  onDismissCompletedTrip?: () => void;
  onRateDriver: (rating: number, tags?: string[], comment?: string) => void;
  onUpdateLocations?: Dispatch<SetStateAction<Location[]>>;
  lang: 'ar' | 'en';
  onSendChatMessage: (text: string, sender: 'RIDER' | 'DRIVER') => void;
  onLogout: () => void;
  onCalculateRoute?: (pickup: Location, dropoff: Location) => Promise<{ distance: number; geometry?: [number, number][] } | null>;
  lowDataMode?: boolean;
  onEnableLowData?: () => void;
  onDisableLowData?: () => void;
  noAvailableDrivers?: boolean;
  onOpenGuide?: (tab?: 'rider' | 'driver' | 'about') => void;
}

export const RiderView: React.FC<RiderViewProps> = ({
  rider,
  stats,
  locations,
  regions,
  drivers,
  tripsHistory = [],
  activeTrip,
  ads,
  selectedPickup,
  selectedDropoff,
  selectedPickupRegion,
  setSelectedPickupRegion,
  setSelectedPickup,
  setSelectedDropoff,
  onRequestRide,
  onCancelRide,
  onDismissCompletedTrip,
  onRateDriver,
  onUpdateLocations,
  lang,
  onSendChatMessage,
  onLogout,
  onCalculateRoute,
  lowDataMode = false,
  onEnableLowData,
  onDisableLowData,
  noAvailableDrivers = false,
  onOpenGuide,
}) => {
  const [requestedVehicleType, setRequestedVehicleType] = useState<'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE'>('CAR');
  const [givenRating, setGivenRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [riderComment, setRiderComment] = useState('');
  const [showMathExplanation, setShowMathExplanation] = useState(false);
  const [chatText, setChatText] = useState('');
  
  // Rider Trip History (paginated + filtered)
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [myTripsPage, setMyTripsPage] = useState(0);
  const [myTripsHasMore, setMyTripsHasMore] = useState(false);
  const [myTripDateFrom, setMyTripDateFrom] = useState('');
  const [myTripDateTo, setMyTripDateTo] = useState('');
  const [isLoadingMyTrips, setIsLoadingMyTrips] = useState(false);
  
  // Promo code states
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number; promoCodeId?: string } | null>(null);
  const [promoError, setPromoError] = useState('');
  
  // Landmark Details State
  const [pickupLandmark, setPickupLandmark] = useState('');

  // Real Road Distance (from OpenRouteService cache)
  const [realDistance, setRealDistance] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const lastCalculatedRouteRef = React.useRef<string | null>(null);

  const getCachedRouteDistance = (pickupId: string, dropoffId: string): number | null => {
    // Route cache is maintained in-memory at the App level (no local storage).
    return null;
  };

  const persistPreferences = (next: Partial<RiderPreferences>) => {
    if (!rider.id) return;
    const current: RiderPreferences = rider.preferences || {};
    const merged: RiderPreferences = { ...current, ...next };
    saveRiderPreferences(rider.id, merged);
  };

  // Starred / Favorite Locations State (sourced from Supabase rider preferences)
  const [favorites, setFavorites] = useState<{ id: string; name: string; lat: number; lng: number; type: 'pickup' | 'dropoff' }[]>(() => {
    return rider.preferences?.favorites || [];
  });

  const [homeLocation, setHomeLocation] = useState<{ id: string; name: string; lat: number; lng: number } | null>(() => {
    return rider.preferences?.homeLocation || null;
  });

  const [workLocation, setWorkLocation] = useState<{ id: string; name: string; lat: number; lng: number } | null>(() => {
    return rider.preferences?.workLocation || null;
  });

  const [recentDestinations, setRecentDestinations] = useState<{ id: string; name: string; lat: number; lng: number }[]>(() => {
    return rider.preferences?.recentDestinations || [];
  });

  const [showHomeModal, setShowHomeModal] = useState(false);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [homeInput, setHomeInput] = useState('');
  const [workInput, setWorkInput] = useState('');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmStep, setConfirmStep] = useState<'VEHICLE' | 'PRICE' | 'SENDING'>('VEHICLE');
  const [confirmVehicleType, setConfirmVehicleType] = useState<'CAR' | 'MOTORCYCLE' | 'TOKTOK' | 'TRICYCLE'>('CAR');
  const [confirmPickupLandmark, setConfirmPickupLandmark] = useState('');

  const [showFavModal, setShowFavModal] = useState<'pickup' | 'dropoff' | null>(null);
  const [favNameInput, setFavNameInput] = useState('');

  // Free-text place search (OSM) so the rider can type a place name to set pickup/dropoff
  const [placeSearchText, setPlaceSearchText] = useState('');
  const [placeSearchTarget, setPlaceSearchTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [placeSearchResults, setPlaceSearchResults] = useState<{ display_name: string; lat: number; lng: number; city: string }[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [showMap, setShowMap] = useState(() => !!rider.preferences?.autoShowMap);
  const placeSearchCacheRef = React.useRef<Record<string, { display_name: string; lat: number; lng: number; city: string }[]>>({});
  const placeSearchLastRef = React.useRef<{ q: string; t: number } | null>(null);
  const placeSearchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a clear, driver-friendly place name from Nominatim address data.
  // Prefers the closest recognizable landmark (village / hamlet / neighbourhood /
  // road) plus the administrative area (e.g. العياط، مزغونة، دهشور، متانية) so the
  // driver understands exactly where the rider is.
  const buildPlaceName = (data: any): { name: string; city: string } => {
    const address = data?.address || {};
    const parts = (data?.display_name || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const road = address.road || address.pedestrian || address.footway || address.highway || '';
    const houseNumber = address.house_number || '';
    const neighbourhood =
      address.neighbourhood || address.suburb || address.hamlet || address.village || address.quarter || '';
    const town = address.town || address.city || address.county || address.municipality || '';
    const state = address.state || address.governorate || '';

    // Closest recognizable point first
    let name = (lang === 'ar' ? 'موقعي الحالي' : 'My Location');
    if (road && houseNumber) {
      name = `${houseNumber} ${road}`;
    } else if (road) {
      name = road;
    } else if (neighbourhood) {
      name = neighbourhood;
    } else if (town) {
      name = town;
    } else if (parts.length > 0) {
      name = /^[0-9]+$/.test(parts[0]) ? parts.slice(0, 2).join('، ') : parts[0];
    }

    // Append the administrative area so the driver knows the broader location.
    const area = town || neighbourhood || (parts.length > 1 ? parts[1] : '');
    const fullName = area && area !== name ? `${name}، ${area}` : name;
    const city = town || neighbourhood || state || (lang === 'ar' ? 'منطقتي' : 'My Area');
    return { name: fullName, city };
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError(lang === 'ar' ? 'المتصفح لا يدعم تحديد الموقع' : 'Geolocation not supported');
      return;
    }
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let name = (lang === 'ar' ? 'موقعي الحالي' : 'My Location');
        let city = (lang === 'ar' ? 'منطقتي' : 'My Area');
        try {
          // Use our own serverless proxy to avoid browser CORS blocking.
          const res = await fetch(`/api/reverse?lat=${latitude}&lon=${longitude}`, {
            headers: { 'Accept': 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            const built = buildPlaceName(data);
            name = built.name;
            city = built.city;
          } else if (res.status === 429) {
            setGeoError(lang === 'ar' ? 'تم تجاوز الحد المسموح من البحث. يرجى المحاولة لاحقاً.' : 'Too many location requests. Please try again later.');
            return;
          }
        } catch {
          // Continue with fallback name even if reverse geocoding fails
        }
        const newLoc: Location = {
          id: `geo_${Date.now()}`,
          nameAr: name,
          nameEn: name,
          lat: latitude,
          lng: longitude,
          city,
          country: 'مصر',
        };
        if (onUpdateLocations) {
          onUpdateLocations([newLoc, ...locations]);
        }
        setSelectedPickup(newLoc.id);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(lang === 'ar' ? 'رفضت صلاحية الموقع. يرجى تفعيلها من إعدادات المتصفح.' : 'Location permission denied. Please enable it in browser settings.');
        } else if (err.code === err.TIMEOUT) {
          setGeoError(lang === 'ar' ? 'انتهى وقت تحديد الموقع. يرجى المحاولة مرة أخرى.' : 'Location request timed out. Please try again.');
        } else {
          setGeoError(lang === 'ar' ? 'خطأ في تحديد الموقع. يرجى المحاولة مرة أخرى.' : 'Location error. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const handlePlaceSearch = async (text: string) => {
    const q = text.trim();
    if (!q) {
      setPlaceSearchResults([]);
      return;
    }
    const normalized = q.toLowerCase();
    const cached = placeSearchCacheRef.current[normalized];
    if (cached) {
      setPlaceSearchResults(cached);
      return;
    }
    const now = Date.now();
    if (placeSearchLastRef.current && placeSearchLastRef.current.q === normalized && now - placeSearchLastRef.current.t < 3000) {
      return;
    }
    placeSearchLastRef.current = { q: normalized, t: now };
    setPlaceSearchLoading(true);
    try {
      // Use our own serverless proxy to avoid browser CORS blocking.
      const res = await fetch(`/api/search?q=${encodeURIComponent(q + ', مصر')}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      const results = (data || []).map((item: any) => {
        const built = buildPlaceName(item);
        return {
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          city: built.city,
        };
      });
      placeSearchCacheRef.current[normalized] = results;
      setPlaceSearchResults(results);
    } catch {
      setPlaceSearchResults([]);
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const applyPlaceResult = (item: { display_name: string; lat: number; lng: number; city: string }) => {
    const parts = item.display_name.split(',').map((s: string) => s.trim()).filter(Boolean);
    const address = (item as any).address || {};
    const road = address.road || address.pedestrian || address.footway || address.highway || '';
    const neighbourhood = address.neighbourhood || address.suburb || address.village || address.city || '';
    const houseNumber = address.house_number || '';

    let name = '';
    if (road && houseNumber) {
      name = `${houseNumber} ${road}`;
    } else if (road) {
      name = road;
    } else if (neighbourhood) {
      name = neighbourhood;
    } else if (parts.length > 0 && /^[0-9]+$/.test(parts[0])) {
      name = parts.slice(0, 2).join('،');
    } else if (parts.length > 0) {
      name = parts[0];
    }

    const newLoc: Location = {
      id: `search_${Date.now()}_${Math.round(Math.random() * 1000)}`,
      nameAr: name || (lang === 'ar' ? 'مكان مخصص' : 'Custom place'),
      nameEn: name || (lang === 'ar' ? 'مكان مخصص' : 'Custom place'),
      lat: item.lat,
      lng: item.lng,
      city: item.city,
      country: 'مصر',
    };
    onUpdateLocations?.([newLoc, ...locations]);
    if (placeSearchTarget === 'pickup') {
      setSelectedPickup(newLoc.id);
    } else {
      setSelectedDropoff(newLoc.id);
    }
    setPlaceSearchResults([]);
    setPlaceSearchText('');
    // Reset target to pickup so the next search doesn't accidentally
    // fall into the wrong field (dropoff).
    setPlaceSearchTarget('pickup');
  };

  const pickupLoc = locations.find((l) => l.id === selectedPickup);
  const dropoffLoc = locations.find((l) => l.id === selectedDropoff);

  // Prefetch real road distance and route when both pickup and dropoff are selected
  useEffect(() => {
    if (!pickupLoc || !dropoffLoc || !onCalculateRoute) {
      setRouteGeometry(null);
      return;
    }
    // Always compute real road path (lowDataMode no longer blocks routing, only GPS accuracy)
    const routeKey = `${pickupLoc.id}_${dropoffLoc.id}`;
    if (lastCalculatedRouteRef.current === routeKey) return;
    lastCalculatedRouteRef.current = routeKey;

    const cachedDist = getCachedRouteDistance(pickupLoc.id, dropoffLoc.id);
    if (cachedDist) {
      console.log('[route] cache hit for', routeKey, cachedDist);
      setRealDistance(cachedDist);
      return;
    }

    console.log('[route] requesting real route for', routeKey);
    setIsCalculatingRoute(true);
    onCalculateRoute(pickupLoc, dropoffLoc).then(result => {
      if (result) {
        console.log('[route] got result distance=', result.distance, 'pts=', result.geometry?.length);
        setRealDistance(result.distance);
        if (result.geometry && result.geometry.length > 1) {
          setRouteGeometry(result.geometry);
        }
      } else {
        console.warn('[route] no result returned (all providers failed)');
      }
      setIsCalculatingRoute(false);
    });
  }, [pickupLoc?.id, dropoffLoc?.id, onCalculateRoute, lowDataMode]);

  const safeTripsHistory = Array.isArray(tripsHistory) ? tripsHistory : [];

  const recentDropoffs = safeTripsHistory
    .filter(t => t.riderId === rider.id && t.status === 'COMPLETED')
    .slice(0, 3)
    .map(t => ({
      id: t.id,
      name: t.dropoff.nameAr || t.dropoff.nameEn,
      lat: t.dropoff.lat,
      lng: t.dropoff.lng,
    }));

  const loadMyTrips = async (reset = false) => {
    const page = reset ? 0 : myTripsPage;
    setIsLoadingMyTrips(true);
    try {
      const result = await fetchTripsHistoryPaginated({
        userId: rider.id,
        role: 'rider',
        dateFrom: myTripDateFrom || undefined,
        dateTo: myTripDateTo || undefined,
        page,
        limit: 10,
      });
      if (result && result.trips.length > 0) {
        if (reset) {
          setMyTrips(result.trips);
          setMyTripsPage(1);
        } else {
          setMyTrips((prev) => [...prev, ...result.trips]);
          setMyTripsPage((prev) => prev + 1);
        }
        setMyTripsHasMore(result.hasMore);
        return;
      }

      // Local fallback filtering of tripsHistory prop
      let allTrips = safeTripsHistory.filter(t => t.riderId === rider.id);
      if (myTripDateFrom) {
        const fromTime = new Date(`${myTripDateFrom}T00:00:00`).getTime();
        allTrips = allTrips.filter(t => new Date(t.createdAt).getTime() >= fromTime);
      }
      if (myTripDateTo) {
        const toTime = new Date(`${myTripDateTo}T23:59:59.999`).getTime();
        allTrips = allTrips.filter(t => new Date(t.createdAt).getTime() <= toTime);
      }

      const start = reset ? 0 : page * 10;
      const pageTrips = allTrips.slice(start, start + 10);
      if (reset) {
        setMyTrips(pageTrips);
        setMyTripsPage(1);
      } else {
        setMyTrips((prev) => [...prev, ...pageTrips]);
        setMyTripsPage((prev) => prev + 1);
      }
      setMyTripsHasMore(start + 10 < allTrips.length);
    } catch {
      // silently fail
    } finally {
      setIsLoadingMyTrips(false);
    }
  };

  useEffect(() => {
    loadMyTrips(true);
  }, [rider.id, myTripDateFrom, myTripDateTo, tripsHistory]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (placeSearchDebounceRef.current) {
        clearTimeout(placeSearchDebounceRef.current);
      }
    };
  }, []);

  // Calculate estimated distance and fare using standard model
  let directDistance = 0;
  let distance = 0;
  let estimatedFare = 0;
  let originalFare = 0;
  let commissionRate = 10;

  const distanceBuffer = (stats?.distanceBuffer !== undefined && stats.distanceBuffer > 0) ? stats.distanceBuffer : 1.25;
  const additionalKm = stats?.additionalKm !== undefined ? stats.additionalKm : 0.0;
  const incomingCommission = stats?.incomingCommission ?? 5;
  const discountAmount = appliedPromo?.discount ?? 0;

  const computeTripFare = (dist: number, vehicleType: string, discount: number = 0) => {
    return calculateFullTripFare(dist, vehicleType, stats, discount).finalFare;
  };

  const calculateFareForLocation = (dropoff: { lat: number; lng: number }): number => {
    if (!pickupLoc) return 0;
    const direct = calculateHaversineDistance(pickupLoc.lat, pickupLoc.lng, dropoff.lat, dropoff.lng);
    const dist = estimateDrivingDistance(direct, distanceBuffer) + additionalKm;
    const finalDist = parseFloat(Math.max(1, dist).toFixed(2));
    return computeTripFare(finalDist, 'CAR', 0);
  };

  if (pickupLoc && dropoffLoc) {
    if (realDistance) {
      distance = realDistance;
    } else {
      directDistance = calculateHaversineDistance(pickupLoc.lat, pickupLoc.lng, dropoffLoc.lat, dropoffLoc.lng);
      distance = estimateDrivingDistance(directDistance, distanceBuffer) + additionalKm;
      distance = parseFloat(distance.toFixed(2));
      if (distance < 1) distance = 1;
    }
    originalFare = computeTripFare(distance, requestedVehicleType, 0);
    estimatedFare = computeTripFare(distance, requestedVehicleType, discountAmount);
    commissionRate = incomingCommission;
  }

  // When the rider has selected a pickup region, only show drivers whose
  // serviceAreas include that region. Drivers with no serviceAreas at all
  // are treated as serving all areas (backward compatibility).
  const selectedRegion = regions.find(r => r.id === selectedPickupRegion);
  const selectedRegionName = selectedRegion?.nameAr;

  const onlineDrivers = drivers.filter((d) => {
    if (!d.isOnline || d.approvalStatus !== 'APPROVED') return false;
    if (selectedRegionName && d.serviceAreas.length > 0) {
      return d.serviceAreas.some(sa => sa === selectedRegionName || sa === selectedRegion?.nameEn);
    }
    return true;
  });
  const availableDrivers = onlineDrivers.filter((d) => d.status === 'AVAILABLE' && d.vehicleType === requestedVehicleType);

  const swapLocations = () => {
    const temp = selectedPickup;
    setSelectedPickup(selectedDropoff);
    setSelectedDropoff(temp);
  };

  // 2. Favorite Locations Helpers
  const handleSaveFavorite = (type: 'pickup' | 'dropoff') => {
    const activeLoc = type === 'pickup' ? pickupLoc : dropoffLoc;
    if (!activeLoc) return;
    if (!favNameInput.trim()) {
      alert(lang === 'ar' ? 'يرجى كتابة اسم للمكان المميز' : 'Please type a label for this place');
      return;
    }

    const newFav = {
      id: `fav_${Date.now()}`,
      name: favNameInput.trim(),
      lat: activeLoc.lat,
      lng: activeLoc.lng,
      type,
    };

    const updated = [newFav, ...favorites];
    setFavorites(updated);
    persistPreferences({ favorites: updated });
    setFavNameInput('');
    setShowFavModal(null);
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = favorites.filter(f => f.id !== id);
    setFavorites(updated);
    persistPreferences({ favorites: updated });
  };

  const handleSelectFavorite = (fav: typeof favorites[0]) => {
    // Check if location already exists in local DB list, or add it as a new location
    const matched = locations.find(l => Math.abs(l.lat - fav.lat) < 0.0001 && Math.abs(l.lng - fav.lng) < 0.0001);
    let targetId = '';
    
    if (matched) {
      targetId = matched.id;
    } else {
      const newLoc: Location = {
        id: `fav_loc_${Date.now()}`,
        nameAr: fav.name,
        nameEn: fav.name,
        lat: fav.lat,
        lng: fav.lng,
        city: lang === 'ar' ? 'العياط' : 'El-Ayyat',
        country: 'مصر',
        x: Math.round(20 + Math.random() * 60),
        y: Math.round(20 + Math.random() * 60),
      };
      if (onUpdateLocations) {
        onUpdateLocations([newLoc, ...locations]);
      }
      targetId = newLoc.id;
    }

    if (fav.type === 'pickup') {
      setSelectedPickup(targetId);
    } else {
      setSelectedDropoff(targetId);
    }
  };

  const handleSetHome = () => {
    if (!pickupLoc) return;
    const home = { id: pickupLoc.id, name: lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn, lat: pickupLoc.lat, lng: pickupLoc.lng };
    setHomeLocation(home);
    persistPreferences({ homeLocation: home });
    setShowHomeModal(false);
  };

  const handleSetWork = () => {
    if (!pickupLoc) return;
    const work = { id: pickupLoc.id, name: lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn, lat: pickupLoc.lat, lng: pickupLoc.lng };
    setWorkLocation(work);
    persistPreferences({ workLocation: work });
    setShowWorkModal(false);
  };

   return (
    <div className="flex flex-col h-full bg-white text-slate-900 select-none">
      {/* Wallet Display */}
      <div className="bg-slate-50 border-b border-slate-100 p-3.5 flex items-center justify-between rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
            {rider.name[0]}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800">{lang === 'ar' ? rider.name : 'Ezz El-Din'}</h4>
            <p className="text-[10px] text-slate-400">{lang === 'ar' ? rider.phone : rider.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-400">{lang === 'ar' ? 'الرصيد' : 'Balance'}</p>
            <p className="text-xs font-black text-slate-800">{rider.balance} {lang === 'ar' ? 'ج.م' : 'EGP'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (lowDataMode) {
                onDisableLowData?.();
              } else {
                onEnableLowData?.();
              }
            }}
            className={`p-1 px-2.5 rounded-lg text-[9px] font-bold transition-all cursor-pointer pointer-events-auto flex items-center gap-1 ${
              lowDataMode
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
            }`}
            title={lang === 'ar' ? (lowDataMode ? 'الوضع الاقتصادي مفعل' : 'تفعيل الوضع الاقتصادي') : (lowDataMode ? 'Low Data Mode Active' : 'Enable Low Data Mode')}
          >
            <span>📡</span>
            <span>{lang === 'ar' ? (lowDataMode ? 'وضع توفير البيانات' : 'توفير بيانات') : (lowDataMode ? 'Low Data' : 'Save Data')}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="p-1 px-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg text-[9px] font-bold transition-all cursor-pointer pointer-events-auto flex items-center gap-1"
            title={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
          >
            <span>🚪</span>
            <span>{lang === 'ar' ? 'خروج' : 'Logout'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Home Location Modal */}
            {showHomeModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 text-right space-y-3 shadow-xl">
                  <h3 className="text-xs font-black text-slate-800">
                    🏠 {lang === 'ar' ? 'تحديد مكان المنزل' : 'Set Home Location'}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {lang === 'ar'
                      ? 'اختر مكان المنزل من القائمة أو احفظ الموقع الحالي'
                      : 'Choose home from the list or save current location'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (pickupLoc) {
                          const home = { id: pickupLoc.id, name: lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn, lat: pickupLoc.lat, lng: pickupLoc.lng };
                          setHomeLocation(home);
                          persistPreferences({ homeLocation: home });
                          setShowHomeModal(false);
                        }
                      }}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'حفظ الموقع الحالي كمنزل' : 'Save current as Home'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHomeModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Work Location Modal */}
            {showWorkModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 text-right space-y-3 shadow-xl">
                  <h3 className="text-xs font-black text-slate-800">
                    💼 {lang === 'ar' ? 'تحديد مكان العمل' : 'Set Work Location'}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {lang === 'ar'
                      ? 'اختر مكان العمل من القائمة أو احفظ الموقع الحالي'
                      : 'Choose work from the list or save current location'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (pickupLoc) {
                          const work = { id: pickupLoc.id, name: lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn, lat: pickupLoc.lat, lng: pickupLoc.lng };
                          setWorkLocation(work);
                          persistPreferences({ workLocation: work });
                          setShowWorkModal(false);
                        }
                      }}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'حفظ الموقع الحالي كعمل' : 'Save current as Work'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowWorkModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            )}

        {/* State 2: Active Trip In-Progress / Accepted (NOT cancelled) */}
        {activeTrip && activeTrip.riderId === rider.id && activeTrip.status !== 'COMPLETED' && activeTrip.status !== 'CANCELLED' && (
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                {activeTrip.status === 'SEARCHING' && (lang === 'ar' ? 'جاري البحث عن سائق...' : 'Searching for driver...')}
                {activeTrip.status === 'ACCEPTED' && (lang === 'ar' ? 'السائق في الطريق' : 'Driver on the way')}
                {activeTrip.status === 'ARRIVED' && (lang === 'ar' ? 'السائق وصل!' : 'Driver arrived!')}
                {activeTrip.status === 'STARTED' && (lang === 'ar' ? 'في الرحلة حالياً' : 'Trip in progress')}
              </span>
              <span className="text-xs font-bold text-slate-800">
                {activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}
              </span>
            </div>
            {activeTrip.status === 'SEARCHING' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-500 font-medium">
                    {(() => {
                      const timerVal = Math.max(0, activeTrip.dispatchTimer ?? 180);
                      const mins = Math.floor(timerVal / 60);
                      const secs = timerVal % 60;
                      const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;
                      return lang === 'ar'
                        ? `ينتهي البحث خلال 3 دقائق (${formattedTime})`
                        : `Search expires in 3 mins (${formattedTime})`;
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={onCancelRide}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-lg transition-all cursor-pointer pointer-events-auto"
                  >
                    {lang === 'ar' ? 'إلغاء الطلب' : 'Cancel Request'}
                  </button>
                </div>
                <div className="pt-1">
                  <AdBanner ads={ads || []} variant="waiting" lang={lang} lowDataMode={lowDataMode} />
                </div>
              </>
            )}
            {activeTrip.appliedPromoCode && activeTrip.appliedPromoDiscount ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[10px]">
                <span className="font-bold text-amber-900">
                  🎁 {lang === 'ar' ? 'كود خصم مطبق:' : 'Promo code applied:'} {activeTrip.appliedPromoCode}
                </span>
                <span className="text-rose-600 font-bold mr-2">
                  -{activeTrip.appliedPromoDiscount} {lang === 'ar' ? 'ج.م' : 'EGP'}
                </span>
              </div>
            ) : null}

            {/* Simulated Live status text & Dynamic Live ETA Badge */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {activeTrip.status === 'SEARCHING' ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping" />
                )}
                <p className="text-xs text-slate-600">
                  {activeTrip.status === 'SEARCHING' && (lang === 'ar' 
                    ? `جاري البحث عن سائق متاح (${drivers.filter(d => d.isOnline && d.approvalStatus === 'APPROVED' && d.status === 'AVAILABLE').length} سائق متاح).`
                    : `Searching for an available driver (${drivers.filter(d => d.isOnline && d.approvalStatus === 'APPROVED' && d.status === 'AVAILABLE').length} available).`)}
                  {activeTrip.status === 'ACCEPTED' && (lang === 'ar' ? `قبل ${activeTrip.driverName} رحلتك وهو يتجه الآن إليك.` : `${activeTrip.driverName} accepted your ride and is heading to your pickup location.`)}
                  {activeTrip.status === 'ARRIVED' && (lang === 'ar' ? 'السيارة تنتظرك بالخارج. تفضل بالركوب لتفعيل الرحلة.' : 'The driver has arrived at your location. Please board to start the trip.')}
                  {activeTrip.status === 'STARTED' && (lang === 'ar' ? `متجهون إلى ${lang === 'ar' ? activeTrip.dropoff.nameAr : activeTrip.dropoff.nameEn}. رحلة سعيدة!` : `Heading to ${activeTrip.dropoff.nameEn}. Wish you a safe ride!`)}
                </p>
              </div>

              {/* Dynamic live ETA calculated based on driver's physical coordinates on the grid */}
              {(() => {
                const matchedDriver = activeTrip ? drivers.find(d => d.id === activeTrip.driverId) : null;
                if (!matchedDriver || activeTrip.status === 'SEARCHING') return null;

                let etaMinutes = activeTrip.etaMinutes || 0;
                let badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                let etaLabel = '';

                if (activeTrip.status === 'ACCEPTED') {
                  if (!etaMinutes && matchedDriver.lat && matchedDriver.lng && activeTrip.pickup.lat && activeTrip.pickup.lng) {
                    const realDist = calculateHaversineDistance(matchedDriver.lat, matchedDriver.lng, activeTrip.pickup.lat, activeTrip.pickup.lng);
                    etaMinutes = Math.max(1, Math.round(realDist * 2));
                  } else if (!etaMinutes) {
                    const dx = matchedDriver.currentX - (activeTrip.pickup.x || 50);
                    const dy = matchedDriver.currentY - (activeTrip.pickup.y || 50);
                    const gridDist = Math.sqrt(dx * dx + dy * dy);
                    etaMinutes = Math.max(1, Math.ceil(gridDist / 3.5));
                  }
                  etaLabel = lang === 'ar' ? `⏰ الوقت المتوقع لوصول الكابتن: ${etaMinutes} دقيقة` : `⏰ Captain ETA: ${etaMinutes} mins`;
                  badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                } else if (activeTrip.status === 'ARRIVED') {
                  etaLabel = lang === 'ar' ? '🎉 الكابتن ينتظرك عند نقطة الركوب الآن!' : '🎉 Captain is waiting at pickup!';
                  badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                } else if (activeTrip.status === 'STARTED') {
                  if (!etaMinutes && matchedDriver.lat && matchedDriver.lng && activeTrip.dropoff.lat && activeTrip.dropoff.lng) {
                    const realDist = calculateHaversineDistance(matchedDriver.lat, matchedDriver.lng, activeTrip.dropoff.lat, activeTrip.dropoff.lng);
                    etaMinutes = Math.max(1, Math.round(realDist * 2));
                  } else if (!etaMinutes) {
                    const dx2 = matchedDriver.currentX - (activeTrip.dropoff.x || 50);
                    const dy2 = matchedDriver.currentY - (activeTrip.dropoff.y || 50);
                    const gridDist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    etaMinutes = Math.max(1, Math.ceil(gridDist2 / 3.5));
                  }
                  etaLabel = lang === 'ar' ? `📍 وقت الوصول التقريبي للوجهة: ${etaMinutes} دقيقة` : `📍 Destination ETA: ${etaMinutes} mins`;
                  badgeColor = 'bg-indigo-50 text-indigo-800 border-indigo-200';
                }

                return (
                  <div className={`p-2 rounded-xl border text-[11px] font-bold text-center ${badgeColor} animate-fade-in`}>
                    {etaLabel}
                  </div>
                );
              })()}
            </div>

            {/* Route Details */}
            <div className="border-t border-b border-slate-200/60 py-3 space-y-2">
              <div className="flex gap-2">
                <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-slate-400">{lang === 'ar' ? 'من (نقطة الركوب)' : 'From (Pickup)'}</p>
                  <p className="text-xs font-medium text-slate-800">
                    {lang === 'ar' ? activeTrip.pickup.nameAr : activeTrip.pickup.nameEn}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Navigation className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 rotate-45" />
                <div>
                  <p className="text-[10px] text-slate-400">{lang === 'ar' ? 'إلى (نقطة الوصول)' : 'To (Dropoff)'}</p>
                  <p className="text-xs font-medium text-slate-800">
                    {lang === 'ar' ? activeTrip.dropoff.nameAr : activeTrip.dropoff.nameEn}
                  </p>
                </div>
              </div>
            </div>

            {/* Driver Details if Assigned */}
            {activeTrip.driverId && (
              <div className="bg-white border border-slate-100 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{activeTrip.driverName}</h4>
                    <p className="text-[9px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="bg-amber-100 text-amber-800 text-[8px] font-extrabold px-1.5 py-0.5 rounded">
                        {(() => {
                          const driverType = drivers.find((d) => d.id === activeTrip.driverId)?.vehicleType;
                          if (driverType === 'CAR') return lang === 'ar' ? 'سيارة 🚖' : 'Car 🚖';
                          if (driverType === 'MOTORCYCLE') return lang === 'ar' ? 'موتوسيكل 🏍️' : 'Motorcycle 🏍️';
                          if (driverType === 'TOKTOK') return lang === 'ar' ? 'توكتوك 🛺' : 'TukTuk 🛺';
                          return lang === 'ar' ? 'تروسيكل 🚲' : 'Tricycle 🚲';
                        })()}
                      </span>
                      <span className="font-bold text-slate-700">
                        {drivers.find((d) => d.id === activeTrip.driverId)?.vehicleName}
                      </span>
                      <span>|</span>
                      <span className="font-mono text-[9px] font-bold bg-slate-100 px-1 py-0.2 rounded text-slate-700">
                        {drivers.find((d) => d.id === activeTrip.driverId)?.carPlate}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-0.5 text-amber-500 justify-end">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                    <span className="text-xs font-bold">
                      {drivers.find((d) => d.id === activeTrip.driverId)?.rating}
                    </span>
                  </div>
                  <a
                    href={`tel:${drivers.find((d) => d.id === activeTrip.driverId)?.phone}`}
                    className="inline-flex items-center gap-1 mt-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors pointer-events-auto"
                  >
                    <Phone className="w-2.5 h-2.5" />
                    <span>{lang === 'ar' ? 'اتصال' : 'Call'}</span>
                  </a>
                </div>
              </div>
            )}

            {/* Chat with Captain Section */}
            {activeTrip && activeTrip.status !== 'SEARCHING' && (
              <div className="bg-white border border-slate-150 p-3 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs pb-1 border-b border-slate-100">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                  <span>{lang === 'ar' ? 'شات للتواصل الفوري داخل التطبيق' : 'In-App Direct Chat'}</span>
                </div>

                <div className="bg-slate-50 rounded-xl p-2 max-h-[120px] overflow-y-auto space-y-1.5 border border-slate-100 flex flex-col pointer-events-auto">
                  {activeTrip.chatMessages && activeTrip.chatMessages.length > 0 ? (
                    activeTrip.chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`max-w-[85%] rounded-xl px-2.5 py-1 text-[10px] leading-snug shadow-xs ${
                          msg.sender === 'RIDER'
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
                      💬 {lang === 'ar' ? 'مرحبًا! راسل الكابتن للتنسيق وتأكيد نقطة اللقاء.' : 'Hi! Send a message to coordinate pickup.'}
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatText.trim()) return;
                    onSendChatMessage(chatText.trim(), 'RIDER');
                    setChatText('');
                  }}
                  className="flex gap-1 pt-1 pointer-events-auto"
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={lang === 'ar' ? 'اكتب رسالة للكابتن...' : 'Ask captain something...'}
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
          </div>
        )}

        {/* State 2a: CANCELLED Trip - Show dismiss button & re-request option */}
        {activeTrip && activeTrip.status === 'CANCELLED' && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3 text-center">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-lg font-black">
              ❌
            </div>
            <h4 className="text-xs font-black text-rose-800">
              {lang === 'ar' ? 'انتهت مهلة البحث (3 دقائق)' : 'Search Timeout (3 minutes)'}
            </h4>
            <p className="text-[10px] text-rose-600 leading-relaxed font-bold">
              {lang === 'ar'
                ? 'لم يتمكن أي سائق من قبول الطلب خلال 3 دقائق. هل ترغب في إعادة طلب الرحلة مرة أخرى؟'
                : 'No driver accepted your ride request within 3 minutes. Would you like to retry the request?'}
            </p>
            <div className="bg-white rounded-xl p-3 space-y-1.5 text-right border border-rose-100">
              <div className="flex gap-2 text-[10px]">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="font-medium text-slate-700">{lang === 'ar' ? activeTrip.pickup.nameAr : activeTrip.pickup.nameEn}</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <Navigation className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5 rotate-45" />
                <span className="font-medium text-slate-700">{lang === 'ar' ? activeTrip.dropoff.nameAr : activeTrip.dropoff.nameEn}</span>
              </div>
              <div className="flex justify-between text-[10px] border-t border-rose-100 pt-1.5 mt-1">
                <span className="font-black text-slate-500">{lang === 'ar' ? 'التكلفة:' : 'Fare:'}</span>
                <span className="font-black text-rose-600">{activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  const vType = activeTrip.requestedVehicleType || 'CAR';
                  const landmark = activeTrip.pickupLandmark;
                  const promo = activeTrip.appliedPromoCode;
                  const promoId = activeTrip.appliedPromoCodeId;
                  onCancelRide();
                  setTimeout(() => {
                    onRequestRide(vType, landmark, promo, promoId);
                  }, 150);
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto flex items-center justify-center gap-2"
              >
                <span>🔄</span>
                <span>{lang === 'ar' ? 'إعادة طلب الرحلة الآن (3 دقائق جديدة)' : 'Retry Ride Request Now (New 3 Mins)'}</span>
              </button>
              <button
                type="button"
                onClick={onCancelRide}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl transition-all cursor-pointer pointer-events-auto"
              >
                {lang === 'ar' ? 'العودة للصفحة الرئيسية' : 'Return to Home'}
              </button>
            </div>
          </div>
        )}

        {/* State 2b: Completed Trip - Rate Driver */}
        {activeTrip && activeTrip.riderId === rider.id && activeTrip.status === 'COMPLETED' && (
          !activeTrip.riderRatingToDriver ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="text-center">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-lg font-black">
                  ⭐
                </div>
                <h4 className="text-xs font-black text-amber-900 mt-2">
                  {lang === 'ar' ? 'كيف تقيم السائق؟' : 'Rate your driver'}
                </h4>
                <p className="text-[10px] text-amber-700 mt-0.5">
                  {lang === 'ar' ? `كيف كانت رحلتك مع ${activeTrip.driverName}؟` : `How was your ride with ${activeTrip.driverName}?`}
                </p>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setGivenRating(star)}
                    className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= givenRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 justify-center">
                {(lang === 'ar'
                  ? ['👍 سائق محترم', '🚗 قيادة ممتازة', '⏱️ ملتزم بالوقت', '🌟 رحلة مريحة']
                  : ['👍 Respectful driver', '🚗 Smooth driving', '⏱️ On time', '🌟 Comfortable ride']
                ).map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTags(prev => prev.filter(t => t !== tag));
                        } else {
                          setSelectedTags(prev => [...prev, tag]);
                        }
                      }}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {/* Comment */}
              <input
                type="text"
                value={riderComment}
                onChange={(e) => setRiderComment(e.target.value)}
                placeholder={lang === 'ar' ? 'تعليق إضافي (اختياري)' : 'Additional comment (optional)'}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium text-slate-800 focus:outline-none focus:border-amber-400 text-right"
              />

              {/* Submit */}
              <button
                type="button"
                onClick={() => {
                  onRateDriver(givenRating, selectedTags, riderComment);
                  setGivenRating(5);
                  setSelectedTags([]);
                  setRiderComment('');
                }}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                {lang === 'ar' ? '✅ إرسال التقييم' : '✅ Submit Rating'}
              </button>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3 text-center">
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-lg font-black">
                🎉
              </div>
              <h4 className="text-xs font-black text-emerald-900">
                {lang === 'ar' ? 'تم تسجيل تقييمك بنجاح! شكرًا لك' : 'Rating submitted! Thank you'}
              </h4>
              <p className="text-[10px] text-emerald-700">
                {lang === 'ar'
                  ? `تم حفظ تقييمك للسائق ${activeTrip.driverName} (${activeTrip.riderRatingToDriver} نجوم ⭐).`
                  : `Your rating for ${activeTrip.driverName} (${activeTrip.riderRatingToDriver} stars ⭐) has been saved.`}
              </p>
              <button
                type="button"
                onClick={onDismissCompletedTrip || onCancelRide}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto"
              >
                {lang === 'ar' ? '✅ العودة للصفحة الرئيسية وطلب رحلة جديدة' : '✅ Return to main screen & book new ride'}
              </button>
            </div>
          )
        )}

        {/* State 3: Booking Form (No active trip) */}
        {(!activeTrip || activeTrip.riderId !== rider.id) && (
          <div className="space-y-4">
            {/* Store Banner Advertisement */}
            <AdBanner ads={ads || []} variant="home" lang={lang} lowDataMode={lowDataMode} />

            {noAvailableDrivers && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 space-y-2 text-center animate-fade-in">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-lg font-black">
                  😔
                </div>
                <p className="text-xs font-bold text-rose-800">
                  {lang === 'ar' ? 'لا يوجد سائقين متاحين حالياً' : 'No available drivers right now'}
                </p>
                <p className="text-[10px] text-rose-600 leading-relaxed">
                  {lang === 'ar'
                    ? 'عذراً، لا يوجد سائقين متاحين في منطقتك. يرجى المحاولة مرة أخرى لاحقاً.'
                    : 'Sorry, there are no available drivers in your area. Please try again later.'}
                </p>
              </div>
            )}
            {/* Title / Greeting */}
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'ar' ? 'أين تريد الذهاب اليوم؟' : 'Where to today?'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'ar'
                  ? 'اختر نقطة الركوب والوصول للتحرك فورا مع الكابتن.'
                  : 'Choose pickup and dropoff to ride instantly with your captain.'}
              </p>
            </div>

            {/* Pickup Region Selection (Mandatory — Prominent standalone card) */}
            {!activeTrip && (
              <div className="bg-gradient-to-l from-indigo-50 to-white border-2 border-indigo-200 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] font-black text-slate-700 block">
                      {lang === 'ar' ? 'اختر منطقة الركوب' : 'Select Pickup Region'}
                    </label>
                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">
                      {lang === 'ar' ? 'حدد المنطقة لإيجاد أقرب الكباتن المتاحين لك' : 'Choose your area to find nearest available captains'}
                    </p>
                  </div>
                  {!selectedPickupRegion && (
                    <span className="text-[8px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-full animate-pulse shrink-0 border border-rose-200">
                      {lang === 'ar' ? 'مطلوب' : 'Required'}
                    </span>
                  )}
                </div>
                <select
                  value={selectedPickupRegion}
                  onChange={(e) => setSelectedPickupRegion(e.target.value)}
                  className={`w-full bg-white border-2 rounded-xl py-2.5 px-3 text-[12px] font-bold focus:outline-none cursor-pointer transition-all ${
                    selectedPickupRegion
                      ? 'border-indigo-300 text-slate-800'
                      : 'border-rose-200 text-slate-400'
                  }`}
                >
                  <option value="">{lang === 'ar' ? '— اختر المنطقة —' : '— Select region —'}</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.nameAr} ({region.nameEn})
                    </option>
                  ))}
                </select>
                {selectedRegion && (
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg w-fit border border-emerald-100">
                    <Check className="w-3 h-3" />
                    <span>{lang === 'ar' ? `تم اختيار: ${selectedRegion.nameAr}` : `Selected: ${selectedRegion.nameEn}`}</span>
                  </div>
                )}
              </div>
            )}

            {/* Free-text place search: type a place name to set pickup or dropoff */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px] justify-end">
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>{lang === 'ar' ? 'ابحث عن مكان بالاسم (الالتقاء أو الوصول)' : 'Search a place by name (pickup or dropoff)'}</span>
              </div>
              <div className="flex gap-1.5">
                <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPlaceSearchTarget('pickup')}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black transition-all ${placeSearchTarget === 'pickup' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
                  >
                    {lang === 'ar' ? '📍 التقاء' : '📍 Pickup'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaceSearchTarget('dropoff')}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black transition-all ${placeSearchTarget === 'dropoff' ? 'bg-rose-600 text-white' : 'text-slate-500'}`}
                  >
                    {lang === 'ar' ? '🏁 وصول' : '🏁 Drop'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[9px] font-black transition-all cursor-pointer pointer-events-auto flex items-center gap-1 shrink-0"
                  title={lang === 'ar' ? 'استخدم موقعي الحالي كنقطة التقاء' : 'Use my current location'}
                >
                  <span>📍</span>
                  <span>{lang === 'ar' ? 'موقعي' : 'My Loc'}</span>
                </button>

                <div className="relative flex-1">
                  <input
                    type="text"
                    value={placeSearchText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPlaceSearchText(value);
                      
                      // Debounce search: clear previous timer and set new one
                      if (placeSearchDebounceRef.current) {
                        clearTimeout(placeSearchDebounceRef.current);
                      }
                      
                      if (!value.trim()) {
                        setPlaceSearchResults([]);
                        placeSearchDebounceRef.current = null;
                        return;
                      }
                      
                      setPlaceSearchLoading(true);
                      placeSearchDebounceRef.current = setTimeout(async () => {
                        try {
                          const res = await fetch(`/api/search?q=${encodeURIComponent(value + ', مصر')}`, {
                            headers: { 'Accept': 'application/json' },
                          });
                          if (!res.ok) throw new Error('search failed');
                          const data = await res.json();
                          const results = (data || []).map((item: any) => {
                            const built = buildPlaceName(item);
                            return {
                              display_name: item.display_name,
                              lat: parseFloat(item.lat),
                              lng: parseFloat(item.lon),
                              city: built.city,
                            };
                          });
                          placeSearchCacheRef.current[value.toLowerCase()] = results;
                          setPlaceSearchResults(results);
                        } catch {
                          setPlaceSearchResults([]);
                        } finally {
                          setPlaceSearchLoading(false);
                        }
                      }, 300); // 300ms debounce
                    }}
                    placeholder={lang === 'ar' ? 'اكتب اسم المكان أو العنوان...' : 'Type a place or address...'}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-medium text-slate-800 focus:outline-none focus:border-blue-500 pointer-events-auto"
                  />
                  {placeSearchLoading && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
                  )}
                </div>
              </div>
              {placeSearchResults.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                  {placeSearchResults.map((item, idx) => (
                    <button
                      key={`place-${idx}`}
                      type="button"
                      onClick={() => applyPlaceResult(item)}
                      className="w-full text-right px-3 py-2 text-[10px] text-slate-700 hover:bg-blue-50 flex flex-col gap-0.5 pointer-events-auto cursor-pointer"
                    >
                      <span className="font-semibold text-slate-900 truncate">{item.display_name.split(',')[0]}</span>
                      <span className="text-[8px] text-slate-400 truncate">{item.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {geoError && (
                <p className="text-[9px] font-bold text-rose-600 text-right">{geoError}</p>
              )}
            </div>

            {/* Map for Pickup/Dropoff Selection — lazy loaded on demand */}
            {!showMap ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMap(true)}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  {lang === 'ar' ? 'عرض الخريطة لاختيار نقطة الالتقاء / الوصول' : 'Show map to pick pickup / destination'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !rider.preferences?.autoShowMap;
                    persistPreferences({ autoShowMap: next });
                    setShowMap(next);
                  }}
                  className={`px-3 py-2 rounded-xl text-[11px] font-bold border ${rider.preferences?.autoShowMap ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-200'}`}>
                  {rider.preferences?.autoShowMap ? (lang === 'ar' ? 'خريطة تلقائياً' : 'Auto Map') : (lang === 'ar' ? 'خريطة يدوي' : 'Manual Map')}
                </button>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="w-full h-64 flex items-center justify-center bg-slate-100 rounded-2xl">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                }
              >
                 {stats?.mapProvider === 'google' && stats?.googleMapsApiKey ? (
                  <GoogleMap
                    locations={locations}
                    activeTrip={activeTrip}
                    selectedPickup={selectedPickup}
                    selectedDropoff={selectedDropoff}
                    lang={lang}
                    onUpdateLocations={onUpdateLocations}
                    onSelectPickup={setSelectedPickup}
                    onSelectDropoff={setSelectedDropoff}
                    routeGeometry={activeTrip?.routeGeometry || routeGeometry || undefined}
                    apiKey={stats.googleMapsApiKey}
                    distanceKm={distance}
                    isRealRoute={!!realDistance}
                  />
                ) : (
                  <CityMap
                    locations={locations}
                    activeTrip={activeTrip}
                    selectedPickup={selectedPickup}
                    selectedDropoff={selectedDropoff}
                    lang={lang}
                    onUpdateLocations={onUpdateLocations}
                    onSelectPickup={setSelectedPickup}
                    onSelectDropoff={setSelectedDropoff}
                    routeGeometry={activeTrip?.routeGeometry || routeGeometry || undefined}
                    distanceKm={distance}
                    isRealRoute={!!realDistance}
                    readOnly={!!activeTrip}
                    currentDriverPosition={activeTrip?.driverId ? (() => {
                      const drv = drivers.find(d => d.id === activeTrip.driverId);
                      return drv?.lat && drv?.lng ? { lat: drv.lat, lng: drv.lng } : null;
                    })() : null}
                    dataSaverMode={lowDataMode}
                    onToggleDataSaver={lowDataMode ? onDisableLowData : onEnableLowData}
                  />
                )}
              </Suspense>
            )}

            {/* Starred / Favorite Locations Section */}
            {favorites.length > 0 && (
              <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 space-y-2 text-right">
                <p className="text-[10px] font-extrabold text-amber-800 flex items-center gap-1 justify-end">
                  <span>⭐ أماكني المميزة والمفضلة المحفوظة</span>
                </p>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {favorites.map((fav) => (
                    <button
                      key={fav.id}
                      type="button"
                      onClick={() => handleSelectFavorite(fav)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] bg-white text-slate-700 hover:bg-amber-100 border border-slate-200/60 hover:border-amber-200 rounded-full transition-all cursor-pointer pointer-events-auto"
                      title={lang === 'ar' ? `انقر لتعيين كـ ${fav.type === 'pickup' ? 'ركوب' : 'وصول'}` : `Set as ${fav.type}`}
                    >
                      <span>{fav.type === 'pickup' ? '📍' : '🏁'}</span>
                      <span className="font-bold">{fav.name}</span>
                      <span
                        onClick={(e) => handleDeleteFavorite(fav.id, e)}
                        className="text-red-500 hover:text-red-700 font-extrabold ml-1 cursor-pointer text-xs"
                        title={lang === 'ar' ? 'حذف' : 'Delete'}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Booking Fields — Pickup & Dropoff with connected route line */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1 relative z-30 shadow-sm">
              {/* Pickup */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">
                    {lang === 'ar' ? 'نقطة الركوب' : 'Pickup Location'}
                  </label>
                  <div className={`bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-medium min-h-[42px] flex items-center transition-colors ${
                    pickupLoc ? 'border-emerald-200 text-slate-800' : 'border-slate-200 text-slate-400'
                  }`}>
                    <span className="truncate">{pickupLoc ? (lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn) : (lang === 'ar' ? 'اضغط على الخريطة لتحديد نقطة الركوب' : 'Tap on map to set pickup')}</span>
                  </div>
                </div>
              </div>

              {/* Connected dashed route line + centered swap button */}
              <div className="flex items-center gap-3 py-0.5">
                <div className="w-10 flex justify-center shrink-0">
                  <div className="w-0.5 h-6 border-l-2 border-dashed border-slate-300" />
                </div>
                <div className="flex-1 flex justify-center">
                  <button
                    type="button"
                    onClick={swapLocations}
                    className="p-2 bg-white border border-slate-200 hover:border-slate-400 rounded-full text-slate-400 hover:text-slate-700 hover:scale-110 active:scale-95 transition-all cursor-pointer pointer-events-auto shadow-sm"
                    title={lang === 'ar' ? 'تبديل الركوب والوصول' : 'Swap pickup and dropoff'}
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                </div>
                <div className="w-10 shrink-0" />
              </div>

              {/* Dropoff */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Navigation className="w-5 h-5 rotate-45" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">
                    {lang === 'ar' ? 'وجهة الوصول' : 'Dropoff Location'}
                  </label>
                  <div className={`bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-medium min-h-[42px] flex items-center transition-colors ${
                    dropoffLoc ? 'border-rose-200 text-slate-800' : 'border-slate-200 text-slate-400'
                  }`}>
                    <span className="truncate">{dropoffLoc ? (lang === 'ar' ? dropoffLoc.nameAr : dropoffLoc.nameEn) : (lang === 'ar' ? 'اضغط على الخريطة لتحديد وجهة الوصول' : 'Tap on map to set dropoff')}</span>
                  </div>
                </div>
              </div>

              {/* Pickup Landmark / Specific Details input */}
              {pickupLoc && (
                <div className="mt-2.5 bg-emerald-50/40 border border-emerald-100/50 rounded-xl p-2.5 text-right">
                  <label className="text-[9px] font-extrabold text-emerald-700 block mb-1.5">
                    {lang === 'ar' ? '📍 علامة مميزة تساعد الكابتن في إيجادك' : '📍 Landmark to help your captain find you'}
                  </label>
                  <input
                    type="text"
                    value={pickupLandmark}
                    onChange={(e) => setPickupLandmark(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: أمام قهوة البورصة / بجوار صيدلية علي' : 'e.g., in front of Al-Borsa cafe...'}
                    className="w-full bg-white border border-emerald-200 rounded-lg py-1.5 px-2.5 text-[10px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 pointer-events-auto"
                  />
                </div>
              )}
            </div>

            {/* Vehicle Type Picker Grid */}
            {pickupLoc && dropoffLoc && (
              <div className="space-y-1.5" dir="rtl">
                <label className="text-[10px] font-extrabold text-slate-500 block text-right">
                  {lang === 'ar' ? 'اختر نوع المركبة المطلوبة:' : 'Select Vehicle Type:'}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'CAR', icon: '🚖', labelAr: 'سيارة', labelEn: 'Car', baseMod: 1.0, kmMod: 1.0 },
                    { id: 'TOKTOK', icon: '🛺', labelAr: 'توكتوك', labelEn: 'TukTuk', baseMod: 0.5, kmMod: 0.6 },
                    { id: 'MOTORCYCLE', icon: '🏍️', labelAr: 'موتوسيكل', labelEn: 'Motorcycle', baseMod: 0.6, kmMod: 0.5 },
                    { id: 'TRICYCLE', icon: '🚲', labelAr: 'تروسيكل', labelEn: 'Tricycle', baseMod: 0.7, kmMod: 0.7 },
                  ].map((v) => {
                    const vFare = computeTripFare(distance, v.id, discountAmount);
                    const isSelected = requestedVehicleType === v.id;
                    const countAvailable = onlineDrivers.filter((d) => d.status === 'AVAILABLE' && d.vehicleType === v.id).length;

                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setRequestedVehicleType(v.id as any)}
                        className={`p-1.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer pointer-events-auto ${
                          isSelected
                            ? 'bg-slate-900 border-slate-950 text-white shadow-md scale-[1.03]'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">{v.icon}</span>
                        <span className="text-[8px] font-black mt-1">{lang === 'ar' ? v.labelAr : v.labelEn}</span>
                        <span className={`text-[8.5px] font-black mt-0.5 ${isSelected ? 'text-amber-300' : 'text-blue-600'}`}>
                          {vFare} ج.م
                        </span>
                        <span className={`text-[7px] mt-0.5 px-1.5 py-0.2 rounded-full font-extrabold ${countAvailable > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                          {countAvailable > 0 ? `${countAvailable} متاح` : 'مغلق'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Estimation and Driver State Indicator */}
            {pickupLoc && dropoffLoc ? (
              <div className="bg-amber-400/10 border-2 border-amber-400 rounded-2xl p-4 space-y-3.5 shadow-md animate-fade-in text-right">
                <div className="flex justify-between items-center">
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      {lang === 'ar' ? 'المسافة الإجمالية' : 'Total Distance'}
                    </span>
                    <span className="text-sm font-black text-slate-800">
                      {distance} {lang === 'ar' ? 'كم' : 'km'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      {lang === 'ar' ? 'تكلفة الرحلة النهائية 💰' : 'Final Trip Fare 💰'}
                    </span>
                    <span className="text-2xl font-black text-amber-500 block leading-tight">
                      {appliedPromo && originalFare > estimatedFare ? (
                        <>
                          <span className="text-xs line-through text-slate-400 mr-1">{originalFare}</span>
                          <span>{estimatedFare}</span>
                        </>
                      ) : (
                        estimatedFare
                      )} {lang === 'ar' ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>

                {isCalculatingRoute && (
                  <div className="text-[10px] text-blue-600 font-bold animate-pulse flex items-center gap-1 justify-end">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{lang === 'ar' ? 'جاري حساب الطريق الحقيقي...' : 'Calculating real route...'}</span>
                  </div>
                )}

                {/* Promo Code Input */}
                <div className="bg-white/60 border border-slate-200/50 rounded-xl p-2.5 space-y-2 text-right">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-700">
                      {lang === 'ar' ? '🏷️ كود الخصم (بروموكود)' : '🏷️ Promo Code'}
                    </span>
                    {appliedPromo && (
                      <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        {lang === 'ar' ? `تم تطبيق خصم بقيمة ${appliedPromo.discount} ج.م` : `Applied ${appliedPromo.discount} EGP`}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoError('');
                      }}
                      placeholder={lang === 'ar' ? 'أدخل كود الخصم' : 'Enter promo code'}
                      className="flex-1 px-2.5 py-1 text-[11px] font-bold border border-slate-200 rounded-lg text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:border-slate-400 text-right"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!promoInput.trim()) return;
                        setPromoError('');
                        const validated = await validatePromoCode(promoInput.trim(), rider.id);
                        if (validated) {
                          setAppliedPromo({ code: validated.code, discount: validated.discountAmount, promoCodeId: validated.id });
                        } else {
                          setPromoError(lang === 'ar' ? 'كود الخصم غير صحيح أو مستخدم بالفعل!' : 'Invalid or already used promo code!');
                          setAppliedPromo(null);
                        }
                      }}
                      className="px-3 py-1 bg-slate-900 hover:bg-black text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'تطبيق' : 'Apply'}
                    </button>
                  </div>
                  {promoError && (
                    <p className="text-[9px] font-bold text-rose-500 text-right">{promoError}</p>
                  )}
                </div>

                <div className="bg-white/60 border border-amber-200/50 rounded-xl p-2.5 text-[10px] font-medium text-slate-600 leading-normal">
                  📌 {lang === 'ar' ? `من: ${pickupLoc.nameAr}` : `From: ${pickupLoc.nameEn}`}<br/>
                  🏁 {lang === 'ar' ? `إلى: ${dropoffLoc.nameAr}` : `To: ${dropoffLoc.nameEn}`}
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center space-y-1.5 animate-fade-in">
                <p className="text-xs font-black text-blue-900">
                  {lang === 'ar' ? '⚠️ لم يتم تحديد السعر بعد' : '⚠️ Price not calculated yet'}
                </p>
                <p className="text-[10.5px] text-blue-700 leading-relaxed font-bold">
                  {lang === 'ar' 
                    ? 'يرجى كتابة واختيار مكان الركوب ومكان الوصول من الاقتراحات ليظهر لك السعر بدقة فائقة 🚕.'
                    : 'Please search and select both pickup and destination from the dropdown list to see the exact trip fare 🚕.'}
                </p>
              </div>
            )}

            {/* System Status Indicators */}
            <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${onlineDrivers.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span>
                  {onlineDrivers.length} {lang === 'ar' ? 'كباتن متصلين' : 'Drivers online'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${availableDrivers.length > 0 ? 'bg-blue-500' : 'bg-slate-300'}`} />
                <span>
                  {availableDrivers.length} {lang === 'ar' ? 'متاح للطلب' : 'Available now'}
                </span>
              </div>
            </div>

            {/* Available drivers count */}
            {pickupLoc && dropoffLoc && (() => {
              const availableCount = onlineDrivers.filter(d => d.status === 'AVAILABLE').length;
              return (
                <div className={`p-2.5 rounded-xl border text-[10px] font-medium text-right ${availableCount > 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 block">
                        {lang === 'ar' ? 'السائقين المتاحين لاستلام الطلب:' : 'Available drivers to accept your request:'}
                      </span>
                      <span className="text-[10px] font-black text-slate-800">{availableCount} {lang === 'ar' ? 'سائق' : 'drivers'}</span>
                    </div>
                    <div className="text-left">
                      <span className={`text-[10px] font-black ${availableCount > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                        {availableCount > 0 
                          ? (lang === 'ar' ? '🟢 متاحون' : '🟢 Available')
                          : (lang === 'ar' ? '🔴 غير متاحين' : '🔴 Unavailable')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Active trip multi-booking guard banner */}
            {activeTrip && activeTrip.riderId === rider.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status) && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-right text-xs font-bold text-amber-900 flex items-center gap-2 shadow-xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>
                  {lang === 'ar'
                    ? '⚠️ لديك رحلة جارية بالفعل! لا يمكنك طلب رحلة جديدة بنفس الحساب حتى الانتهاء من الرحلة الحالية.'
                    : '⚠️ You already have an active trip! You cannot request a new ride until your current trip is completed.'}
                </span>
              </div>
            )}

            {/* Request Button */}
            <button
              type="button"
              disabled={
                !selectedPickup ||
                !selectedDropoff ||
                !selectedPickupRegion ||
                !!(activeTrip && activeTrip.riderId === rider.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status))
              }
                onClick={() => {
                  onRequestRide(requestedVehicleType, pickupLandmark, appliedPromo?.code, appliedPromo?.promoCodeId);
                  setPickupLandmark('');
                }}
              className="w-full py-3 bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-md disabled:shadow-none hover:scale-[1.01] transition-all cursor-pointer"
            >
              {activeTrip && activeTrip.riderId === rider.id && ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'STARTED'].includes(activeTrip.status)
                ? lang === 'ar'
                  ? 'لديك رحلة نشطة حالياً'
                  : 'You have an active trip'
                : availableDrivers.length === 0
                ? lang === 'ar'
                  ? 'تعذر العثور على سائق في الوقت الحالي'
                  : 'No drivers available in your area right now'
                : lang === 'ar'
                ? 'اطلب كابتن عز الآن'
                : 'Request Ezz Captain Now'}
            </button>

            {/* Two-Step Confirmation Modal */}
            {showConfirmModal && pickupLoc && dropoffLoc && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 text-right space-y-4 shadow-xl">
                  {confirmStep === 'VEHICLE' && (
                    <>
                      <h3 className="text-xs font-black text-slate-800">
                        {lang === 'ar' ? 'اختر نوع المركبة' : 'Select Vehicle Type'}
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        {lang === 'ar' ? 'اختر نوع المركبة المناسبة لرحلتك' : 'Choose the vehicle type for your trip'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'CAR', icon: '🚖', labelAr: 'سيارة', labelEn: 'Car' },
                          { id: 'MOTORCYCLE', icon: '🏍️', labelAr: 'موتوسيكل', labelEn: 'Motorcycle' },
                          { id: 'TOKTOK', icon: '🛺', labelAr: 'توكتوك', labelEn: 'TukTuk' },
                          { id: 'TRICYCLE', icon: '🚲', labelAr: 'تروسيكل', labelEn: 'Tricycle' },
                        ].map((v) => {
                          const vFare = computeTripFare(distance, v.id, discountAmount);
                          const isSelected = confirmVehicleType === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setConfirmVehicleType(v.id as any)}
                              className={`p-3 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-900 border-slate-950 text-white shadow-md scale-[1.03]'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-xl">{v.icon}</span>
                              <span className="text-[10px] font-black mt-1">{lang === 'ar' ? v.labelAr : v.labelEn}</span>
                              <span className={`text-[10px] font-black mt-0.5 ${isSelected ? 'text-amber-300' : 'text-blue-600'}`}>
                                {vFare} {lang === 'ar' ? 'ج.م' : 'EGP'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowConfirmModal(false)}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg cursor-pointer"
                        >
                          {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmStep('PRICE')}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg cursor-pointer"
                        >
                          {lang === 'ar' ? 'التالي' : 'Next'}
                        </button>
                      </div>
                    </>
                  )}

                  {confirmStep === 'PRICE' && (
                    <>
                      <h3 className="text-xs font-black text-slate-800">
                        {lang === 'ar' ? 'تأكيد الطلب' : 'Confirm Your Ride'}
                      </h3>
                      <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-right">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500">
                            {lang === 'ar' ? 'من:' : 'From:'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-800">{lang === 'ar' ? pickupLoc.nameAr : pickupLoc.nameEn}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500">
                            {lang === 'ar' ? 'إلى:' : 'To:'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-800">{lang === 'ar' ? dropoffLoc.nameAr : dropoffLoc.nameEn}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500">
                            {lang === 'ar' ? 'المسافة:' : 'Distance:'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-800">{distance} {lang === 'ar' ? 'كم' : 'km'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500">
                            {lang === 'ar' ? 'المركبة:' : 'Vehicle:'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-800">
                            {confirmVehicleType === 'CAR' && (lang === 'ar' ? '🚖 سيارة' : '🚖 Car')}
                            {confirmVehicleType === 'MOTORCYCLE' && (lang === 'ar' ? '🏍️ موتوسيكل' : '🏍️ Motorcycle')}
                            {confirmVehicleType === 'TOKTOK' && (lang === 'ar' ? '🛺 توكتوك' : '🛺 TukTuk')}
                            {confirmVehicleType === 'TRICYCLE' && (lang === 'ar' ? '🚲 تروسيكل' : '🚲 Tricycle')}
                          </span>
                        </div>
                        <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                          <span className="text-xs font-black text-slate-900">
                            {lang === 'ar' ? 'الإجمالي:' : 'Total:'}
                          </span>
                          <span className="text-lg font-black text-amber-500">
                            {estimatedFare} {lang === 'ar' ? 'ج.م' : 'EGP'}
                          </span>
                        </div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] font-medium text-slate-600 leading-normal">
                        ⚠️ {lang === 'ar' 
                          ? `سيتم إرسال الطلب لجميع السائقين المتاحين (${drivers.filter(d => d.isOnline && d.approvalStatus === 'APPROVED' && d.status === 'AVAILABLE').length} سائق). أول من يرد يأخذ الرحلة.`
                          : `Request will be sent to all available drivers (${drivers.filter(d => d.isOnline && d.approvalStatus === 'APPROVED' && d.status === 'AVAILABLE').length}). First to accept gets the ride.`}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmStep('VEHICLE')}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg cursor-pointer"
                        >
                          {lang === 'ar' ? 'رجوع' : 'Back'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmStep('SENDING');
                            onRequestRide(confirmVehicleType, confirmPickupLandmark || undefined, appliedPromo?.code, appliedPromo?.promoCodeId);
                            setPickupLandmark('');
                            setShowConfirmModal(false);
                          }}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg cursor-pointer"
                        >
                          {lang === 'ar' ? 'تأكيد وإرسال' : 'Confirm & Send'}
                        </button>
                      </div>
                    </>
                  )}

                  {confirmStep === 'SENDING' && (
                    <div className="text-center space-y-3 py-4">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                      <p className="text-xs font-black text-slate-800">
                        {lang === 'ar' ? 'جاري إرسال الطلب...' : 'Sending your request...'}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {lang === 'ar' ? 'جاري إرسال الطلب لجميع السائقين المتاحين...' : 'Sending your request to all available drivers...'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rider Recent Trips (Paginated + Date Filtered) */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-2.5 text-right">
              <h3 className="text-[11px] font-black text-slate-800 flex items-center gap-1 justify-end">
                <span>🕒 {lang === 'ar' ? 'سجل رحلاتي' : 'My Trip History'}</span>
              </h3>
              
              {/* Date Filter */}
              <div className="flex items-center gap-2 text-right">
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
                      </div>
                          <div className="text-right flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate" dir="rtl">
                              🏁 {lang === 'ar' ? trip.dropoff.nameAr : trip.dropoff.nameEn}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate mt-0.5" dir="rtl">
                              📍 {lang === 'ar' ? trip.pickup.nameAr : trip.pickup.nameEn}
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
                  {isLoadingMyTrips ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? 'لم تقم بأي رحلات بعد.' : 'No trips taken yet.')}
                </p>
              )}
            </div>

            {/* Rate Driver Section (shown after trip ends) */}
            {activeTrip && activeTrip.status === 'COMPLETED' && activeTrip.driverId && !activeTrip.riderRatingToDriver && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 mt-3">
                <div className="text-center">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-lg font-black">
                    ⭐
                  </div>
                  <h4 className="text-xs font-black text-amber-900 mt-2">
                    {lang === 'ar' ? 'كيف تقيم السائق؟' : 'Rate your driver'}
                  </h4>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    {lang === 'ar' ? `كيف كانت رحلتك مع ${activeTrip.driverName}؟` : `How was your ride with ${activeTrip.driverName}?`}
                  </p>
                  {activeTrip.fare > 0 && (
                    <div className="mt-2 bg-white/70 rounded-lg p-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">{lang === 'ar' ? 'المبلغ المدفوع' : 'Amount paid'}</span>
                        <span className="font-bold text-slate-800">{activeTrip.fare} {lang === 'ar' ? 'ج.م' : 'EGP'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stars */}
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setGivenRating(star)}
                      className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= givenRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 justify-center">
                  {(lang === 'ar'
                    ? ['👍 سائق محترم', '🚗 قيادة ممتازة', '⏱️ ملتزم بالوقت', '🌟 رحلة مريحة']
                    : ['👍 Respectful driver', '🚗 Smooth driving', '⏱️ On time', '🌟 Comfortable ride']
                  ).map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTags(prev => prev.filter(t => t !== tag));
                          } else {
                            setSelectedTags(prev => [...prev, tag]);
                          }
                        }}
                        className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                {/* Comment */}
                <input
                  type="text"
                  value={riderComment}
                  onChange={(e) => setRiderComment(e.target.value)}
                  placeholder={lang === 'ar' ? 'تعليق إضافي (اختياري)' : 'Additional comment (optional)'}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium text-slate-800 focus:outline-none focus:border-amber-400 text-right"
                />

                {/* Submit */}
                <button
                  type="button"
                  onClick={() => {
                    onRateDriver(givenRating, selectedTags, riderComment);
                    setGivenRating(5);
                    setSelectedTags([]);
                    setRiderComment('');
                  }}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {lang === 'ar' ? '✅ إرسال التقييم' : '✅ Submit Rating'}
                </button>
              </div>
            )}

            {/* Favorite Modal Popup */}
            {showFavModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]">
                <div className="bg-white rounded-2xl w-full max-w-sm p-5 text-right space-y-3 shadow-xl">
                  <h3 className="text-xs font-black text-slate-800">
                    ⭐ {lang === 'ar' ? 'حفظ المكان كـ مكان مميز' : 'Save Place as Favorite'}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    {lang === 'ar'
                      ? 'اكتب اسماً مخصصاً لهذا المكان ليسهل عليك اختياره لاحقاً (مثال: منزلي، العمل، الجامعة)'
                      : 'Add a custom name for this place (e.g., Home, Work)'}
                  </p>
                  <input
                    type="text"
                    value={favNameInput}
                    onChange={(e) => setFavNameInput(e.target.value)}
                    placeholder={lang === 'ar' ? 'منزلي، العمل، بيت جدتي...' : 'My Home, Work...'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 pointer-events-auto"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveFavorite(showFavModal)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'حفظ الآن' : 'Save Now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFavModal(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] rounded-lg cursor-pointer pointer-events-auto"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
