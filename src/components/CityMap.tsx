import React, { useEffect, useRef, useState } from 'react';
import { Location, Driver, Trip } from '../types';
import { MapPin, Navigation, Car, Compass, Crosshair, Layers, HelpCircle, Check, Loader2, ArrowLeftRight, Search, X } from 'lucide-react';

interface CityMapProps {
  locations: Location[];
  activeTrip: Trip | null;
  selectedPickup: string;
  selectedDropoff: string;
  lang: 'ar' | 'en';
  onUpdateLocations?: React.Dispatch<React.SetStateAction<Location[]>>;
  onSelectPickup?: (id: string) => void;
  onSelectDropoff?: (id: string) => void;
  height?: string;
  routeGeometry?: [number, number][];
  distanceKm?: number;
  etaMinutes?: number;
  isRealRoute?: boolean;
  readOnly?: boolean;
  currentDriverPosition?: { lat: number; lng: number } | null;
  navigationRoute?: [number, number][] | null;
  dataSaverMode?: boolean;
  onToggleDataSaver?: () => void;
}

export const CityMap: React.FC<CityMapProps> = ({
  locations,
  activeTrip,
  selectedPickup,
  selectedDropoff,
  lang,
  onUpdateLocations,
  onSelectPickup,
  onSelectDropoff,
  height = 'h-[500px]',
  routeGeometry,
  distanceKm,
  etaMinutes,
  isRealRoute,
  readOnly = false,
  currentDriverPosition,
  navigationRoute,
  dataSaverMode = false,
  onToggleDataSaver,
}) => {
  const [mapMode, setMapMode] = useState<'PICKUP' | 'DROPOFF'>('PICKUP');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingText, setGeocodingText] = useState('');
  const [showTraffic, setShowTraffic] = useState(true);
  const [mapSearchText, setMapSearchText] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const mapSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSearchQueryRef = useRef<string>('');

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  // Refs for callbacks to prevent stale closures in Leaflet events
  const mapModeRef = useRef(mapMode);
  const langRef = useRef(lang);
  const onUpdateLocationsRef = useRef(onUpdateLocations);
  const onSelectPickupRef = useRef(onSelectPickup);
  const onSelectDropoffRef = useRef(onSelectDropoff);
  const locationsRef = useRef(locations);
  const preventNextAutoCenterRef = useRef(false);
  const lastCenterPickupRef = useRef<string>('');
  const lastCenterDropoffRef = useRef<string>('');
  const lastCenterPickupCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastCenterDropoffCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const forceCenterRef = useRef<boolean>(true);

  useEffect(() => { mapModeRef.current = mapMode; }, [mapMode]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { onUpdateLocationsRef.current = onUpdateLocations; }, [onUpdateLocations]);
  useEffect(() => { onSelectPickupRef.current = onSelectPickup; }, [onSelectPickup]);
  useEffect(() => { onSelectDropoffRef.current = onSelectDropoff; }, [onSelectDropoff]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (mapSearchDebounceRef.current) {
        clearTimeout(mapSearchDebounceRef.current);
      }
    };
  }, []);

  // Map relative XY (0-100 grid) to GPS around the service area (El-Ayyat / Giza)
  // IMPORTANT: must match the inverse scale used in DriverView (gps -> grid uses / 0.0025)
  const getLatLngFromXY = (x: number, y: number, _locs?: Location[]) => {
    const latBase = 29.6197;
    const lngBase = 31.2561;
    const lat = latBase + (y - 50) * 0.0025;
    const lng = lngBase + (x - 50) * 0.0025;
    return { lat, lng };
  };

  // Click & Drag Handler: Performs real-time reverse geocoding to update address strings
  const handlePositionUpdate = async (lat: number, lng: number, isPickup: boolean) => {
    preventNextAutoCenterRef.current = true;
    setIsGeocoding(true);
    const text = langRef.current === 'ar' 
      ? 'جاري تحديد تفاصيل العنوان من الخريطة...' 
      : 'Resolving address from map...';
    setGeocodingText(text);

    let nameAr = isPickup ? 'موقع مخصص على الخريطة' : 'وجهة وصول مخصصة';
    let nameEn = isPickup ? 'Custom Pinned Location' : 'Custom Destination';
    let city = 'الجيزة';

    try {
      const res = await fetch(
        `/api/reverse?lat=${lat}&lon=${lng}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        const parts = data.display_name.split(',').map((s: string) => s.trim()).filter(Boolean);
        const address = data.address || {};
        const road = address.road || address.pedestrian || address.footway || address.highway || '';
        const neighbourhood = address.neighbourhood || address.suburb || address.village || address.city || '';
        const houseNumber = address.house_number || '';

        let mainName = '';
        if (road && houseNumber) {
          mainName = `${houseNumber} ${road}`;
        } else if (road) {
          mainName = road;
        } else if (neighbourhood) {
          mainName = neighbourhood;
        } else if (parts.length > 0 && /^[0-9]+$/.test(parts[0])) {
          mainName = parts.slice(0, 2).join('،');
        } else if (parts.length > 0) {
          mainName = parts[0];
        }

        city = address.city || address.town || address.village || address.suburb || 'الجيزة';
        if (mainName) {
          nameAr = `${mainName} (تحديد من الخريطة)`;
          nameEn = `${mainName} (Map Pin)`;
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    } finally {
      setIsGeocoding(false);
    }

    const updatedLoc: Location = {
      id: isPickup ? `map_pickup_${Date.now()}` : `map_dropoff_${Date.now()}`,
      nameAr,
      nameEn,
      lat,
      lng,
      city,
      country: 'مصر',
    };

    if (onUpdateLocationsRef.current) {
      onUpdateLocationsRef.current(prev => {
        const prefix = isPickup ? 'map_pickup_' : 'map_dropoff_';
        const filtered = prev.filter(l => !l.id.startsWith(prefix));
        return [updatedLoc, ...filtered];
      });
    }

    if (isPickup && onSelectPickupRef.current) {
      onSelectPickupRef.current(updatedLoc.id);
    } else if (!isPickup && onSelectDropoffRef.current) {
      onSelectDropoffRef.current(updatedLoc.id);
    }

    // Reset mode to PICKUP after selection so the next tap doesn't
    // accidentally land in DROPOFF mode.
    setMapMode('PICKUP');
  };

  // Initialize Leaflet Map
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || mapInstanceRef.current) return;

    // Center on El-Ayyat Main Station
    const map = L.map(mapRef.current, {
      center: [29.6197, 31.2561],
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    // Low-bandwidth optimized Map tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 18,
      updateWhenIdle: dataSaverMode,
      updateWhenZooming: !dataSaverMode,
      keepBuffer: dataSaverMode ? 1 : 2,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Custom positioned zoom controls (kept above our overlays)
    const zoomCtrl = L.control.zoom({ position: 'topright' });
    zoomCtrl.addTo(map);
    const zoomEl = zoomCtrl.getContainer();
    if (zoomEl) {
      zoomEl.style.zIndex = '1200';
      zoomEl.style.marginTop = '56px';
      zoomEl.style.boxShadow = '0 4px 14px rgba(0,0,0,0.25)';
      zoomEl.style.borderRadius = '12px';
      zoomEl.style.overflow = 'hidden';
    }

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    // Click on map sets pickup or dropoff depending on current mode
    map.on('click', (e: any) => {
      if (readOnly) return;
      const { lat, lng } = e.latlng;
      const isPickup = mapModeRef.current === 'PICKUP';
      handlePositionUpdate(lat, lng, isPickup);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Paths dynamically whenever dependencies change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    const L = (window as any).L;
    if (!map || !layerGroup || !L) return;

    layerGroup.clearLayers();

    const pLoc = locations.find(l => l.id === selectedPickup);
    const dLoc = locations.find(l => l.id === selectedDropoff);

    const pCoords = pLoc ? { lat: pLoc.lat, lng: pLoc.lng } : null;
    const dCoords = dLoc ? { lat: dLoc.lat, lng: dLoc.lng } : null;

    let shouldCenter = forceCenterRef.current;

    if (selectedPickup !== lastCenterPickupRef.current) {
      shouldCenter = true;
    } else if (pCoords && (!lastCenterPickupCoordsRef.current || lastCenterPickupCoordsRef.current.lat !== pCoords.lat || lastCenterPickupCoordsRef.current.lng !== pCoords.lng)) {
      shouldCenter = true;
    }

    if (selectedDropoff !== lastCenterDropoffRef.current) {
      shouldCenter = true;
    } else if (dCoords && (!lastCenterDropoffCoordsRef.current || lastCenterDropoffCoordsRef.current.lat !== dCoords.lat || lastCenterDropoffCoordsRef.current.lng !== dCoords.lng)) {
      shouldCenter = true;
    }

    if (preventNextAutoCenterRef.current) {
      shouldCenter = false;
      preventNextAutoCenterRef.current = false;
    }

    forceCenterRef.current = false;
    lastCenterPickupRef.current = selectedPickup;
    lastCenterDropoffRef.current = selectedDropoff;
    lastCenterPickupCoordsRef.current = pCoords;
    lastCenterDropoffCoordsRef.current = dCoords;

    // 1. Draw pre-defined stations (except selected ones)
    // Skip generic numbered defaults (id 1-8) to avoid confusing "مكان 1/2" labels on the map.
    locations.forEach(loc => {
      const isPickup = loc.id === selectedPickup;
      const isDropoff = loc.id === selectedDropoff;
      const isDefaultNumbered = /^[1-8]$/.test(loc.id);

      if (!isPickup && !isDropoff && !isDefaultNumbered) {
        const stationIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="flex flex-col items-center opacity-70 hover:opacity-100 transition-all cursor-pointer">
              <div class="w-5 h-5 rounded-full bg-slate-800 border-2 border-white text-white flex items-center justify-center shadow-lg">
                🏛️
              </div>
              <div class="bg-white/95 text-slate-800 border border-slate-200 px-1 py-0.2 rounded text-[7px] font-black shadow-xs whitespace-nowrap mt-0.5">
                ${lang === 'ar' ? loc.nameAr : loc.nameEn}
              </div>
            </div>
          `,
          iconSize: [20, 26],
          iconAnchor: [10, 13],
        });

        const stationMarker = L.marker([loc.lat, loc.lng], { icon: stationIcon });
        stationMarker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          const isPickupMode = mapModeRef.current === 'PICKUP';
          if (isPickupMode && onSelectPickupRef.current) {
            onSelectPickupRef.current(loc.id);
          } else if (!isPickupMode && onSelectDropoffRef.current) {
            onSelectDropoffRef.current(loc.id);
          }
        });
        stationMarker.addTo(layerGroup);
      }
    });

    // 2. Custom Icons styled perfectly with Tailwind
    const pickupIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="flex flex-col items-center">
          <span class="absolute inline-flex h-7 w-7 rounded-full bg-emerald-400 opacity-40 animate-ping"></span>
          <div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white text-white flex items-center justify-center shadow-xl font-bold">
            📍
          </div>
          <div class="bg-emerald-950 text-emerald-100 border border-emerald-800 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold shadow-lg whitespace-nowrap mt-1">
            ${lang === 'ar' ? 'الالتقاء' : 'Pickup'}
          </div>
        </div>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 35],
    });

    const dropoffIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="flex flex-col items-center">
          <div class="w-8 h-8 rounded-full bg-rose-500 border-2 border-white text-white flex items-center justify-center shadow-xl font-bold">
            🏁
          </div>
          <div class="bg-rose-950 text-rose-100 border border-rose-800 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold shadow-lg whitespace-nowrap mt-1">
            ${lang === 'ar' ? 'الوصول' : 'Dropoff'}
          </div>
        </div>
      `,
      iconSize: [30, 42],
      iconAnchor: [15, 35],
    });

    // 3. Add Pickup Marker
    if (pLoc) {
      const pickupMarker = L.marker([pLoc.lat, pLoc.lng], {
        icon: pickupIcon,
        draggable: true,
      });
      pickupMarker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        handlePositionUpdate(lat, lng, true);
      });
      pickupMarker.addTo(layerGroup);
    }

    // 4. Add Dropoff Marker
    if (dLoc) {
      const dropoffMarker = L.marker([dLoc.lat, dLoc.lng], {
        icon: dropoffIcon,
        draggable: true,
      });
      dropoffMarker.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        handlePositionUpdate(lat, lng, false);
      });
      dropoffMarker.addTo(layerGroup);
    }

    // 4.5. Add Driver Position Marker (for driver navigation)
    if (currentDriverPosition && readOnly) {
      const driverIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="flex flex-col items-center">
            <div class="w-10 h-10 rounded-full bg-blue-600 border-3 border-white text-white flex items-center justify-center shadow-2xl font-bold text-lg animate-pulse">
              🚖
            </div>
            <div class="bg-blue-950 text-blue-100 border border-blue-800 px-1.5 py-0.5 rounded text-[8px] font-extrabold shadow-lg whitespace-nowrap mt-1">
              ${lang === 'ar' ? 'أنت هنا' : 'You are here'}
            </div>
          </div>
        `,
        iconSize: [40, 52],
        iconAnchor: [20, 42],
      });
      const driverMarker = L.marker([currentDriverPosition.lat, currentDriverPosition.lng], {
        icon: driverIcon,
        zIndexOffset: 1000,
      });
      driverMarker.addTo(layerGroup);

      // If navigating, center map on driver and fit all points
      if (navigationRoute && navigationRoute.length > 1 && shouldCenter) {
        const allPoints = [currentDriverPosition, pLoc, dLoc].filter(Boolean) as { lat: number; lng: number }[];
        const latLngs = allPoints.map(p => [p.lat, p.lng] as [number, number]);
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [80, 80] });
      }
    }

    // 5. Draw navigation route (driver -> pickup -> dropoff) if provided
    if (navigationRoute && navigationRoute.length > 1) {
      L.polyline(navigationRoute, {
        color: '#3b82f6',
        weight: 6,
        dashArray: null,
        opacity: 0.9,
      }).addTo(layerGroup);
    }

    // 6. Connect pickup-dropoff with route path (fallback if no navigation route)
    if (!navigationRoute && pLoc && dLoc) {
      if (routeGeometry && routeGeometry.length > 1) {
        L.polyline(routeGeometry, {
          color: activeTrip ? '#3b82f6' : '#10b981',
          weight: 5,
          dashArray: activeTrip ? '8, 8' : '5, 5',
          opacity: 0.85,
        }).addTo(layerGroup);
      } else {
        L.polyline([[pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]], {
          color: activeTrip ? '#3b82f6' : '#10b981',
          weight: 5,
          dashArray: activeTrip ? '8, 8' : '5, 5',
          opacity: 0.85,
        }).addTo(layerGroup);
      }

      if (shouldCenter) {
        const bounds = L.latLngBounds([[pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]]);
        map.fitBounds(bounds, { padding: [60, 60] });
      }
    } else if (pLoc) {
      if (shouldCenter) {
        map.setView([pLoc.lat, pLoc.lng], 15);
      }
    } else if (dLoc) {
      if (shouldCenter) {
        map.setView([dLoc.lat, dLoc.lng], 15);
      }
    }

  }, [locations, selectedPickup, selectedDropoff, activeTrip, lang, routeGeometry, currentDriverPosition, navigationRoute]);

  const handleMapSearch = async (query: string) => {
    if (!query.trim()) {
      setMapSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const viewbox = '30.8,30.1,31.4,29.4';
      const res = await fetch(`/api/search?q=${encodeURIComponent(query + ', مصر')}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setMapSearchResults(data);
    } catch (err) {
      console.warn('Map search failed:', err);
      setMapSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleMapSearchResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const isPickup = mapModeRef.current === 'PICKUP';
    handlePositionUpdate(lat, lon, isPickup);
    setMapSearchText('');
    setMapSearchResults([]);
  };

  const handleCenterMap = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const pLoc = locations.find(l => l.id === selectedPickup);
    const dLoc = locations.find(l => l.id === selectedDropoff);
    if (pLoc && dLoc) {
      const bounds = (window as any).L.latLngBounds([[pLoc.lat, pLoc.lng], [dLoc.lat, dLoc.lng]]);
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (pLoc) {
      map.setView([pLoc.lat, pLoc.lng], 15);
    } else {
      map.setView([29.6197, 31.2561], 14);
    }
  };

  return (
    <div className={`relative w-full ${height} rounded-2xl overflow-hidden border border-slate-800 shadow-inner select-none transition-all duration-300`}>
      
      {/* Map Search Bar */}
      <div className="absolute top-3 left-3 right-3 z-20">
        <div className="relative">
          <input
            type="text"
            value={mapSearchText}
            onChange={(e) => {
              const value = e.target.value;
              setMapSearchText(value);
              
              // Debounce search: clear previous timer and set new one
              if (mapSearchDebounceRef.current) {
                clearTimeout(mapSearchDebounceRef.current);
              }
              
              if (!value.trim()) {
                setMapSearchResults([]);
                mapSearchDebounceRef.current = null;
                return;
              }
              
              setIsSearching(true);
              mapSearchDebounceRef.current = setTimeout(async () => {
                mapSearchQueryRef.current = value;
                try {
                  const res = await fetch(`/api/search?q=${encodeURIComponent(value + ', مصر')}`, {
                    headers: { 'Accept': 'application/json' }
                  });
                  if (!res.ok) throw new Error('Search failed');
                  const data = await res.json();
                  // Only update if this is still the latest search query
                  if (mapSearchQueryRef.current === value) {
                    setMapSearchResults(data);
                  }
                } catch (err) {
                  console.warn('Map search failed:', err);
                  if (mapSearchQueryRef.current === value) {
                    setMapSearchResults([]);
                  }
                } finally {
                  if (mapSearchQueryRef.current === value) {
                    setIsSearching(false);
                  }
                }
              }, 300); // 300ms debounce
            }}
            placeholder={lang === 'ar' ? 'ابحث عن مكان على الخريطة...' : 'Search for a place on the map...'}
            className="w-full bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-xs font-medium text-slate-800 shadow-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 pointer-events-auto"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          {mapSearchText && (
            <button
              type="button"
              onClick={() => {
                setMapSearchText('');
                setMapSearchResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 pointer-events-auto cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Search Results Dropdown */}
        {mapSearchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-[200px] overflow-y-auto divide-y divide-slate-100">
            {mapSearchResults.map((item, idx) => (
              <button
                key={`search-${idx}`}
                type="button"
                onClick={() => handleMapSearchResult(item)}
                className="w-full text-left px-3 py-2 text-[10px] text-slate-700 hover:bg-blue-50 flex flex-col gap-0.5 pointer-events-auto cursor-pointer border-b border-slate-100/40 last:border-b-0"
              >
                <span className="font-semibold text-slate-900 truncate">{item.display_name.split(',')[0]}</span>
                <span className="text-[8px] text-slate-400 truncate">{item.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Container Element */}
      <div id="leaflet-city-map" ref={mapRef} className="w-full h-full z-0 bg-[#f4f3f0]" />

      {/* Current mode indicator */}
      {!readOnly && (
        <div className={`absolute top-3 left-3 z-[999] px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg ${
          mapMode === 'PICKUP'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {mapMode === 'PICKUP'
            ? (lang === 'ar' ? '📌 وضع الالتقاء' : '📍 Pickup Mode')
            : (lang === 'ar' ? '🏁 وضع الوصول' : '🏁 Destination Mode')}
        </div>
      )}

      {/* Floating Mode Switch Selector Bar */}
      {!readOnly && (
        <div className="absolute bottom-14 left-4 right-4 bg-slate-950/95 backdrop-blur-md border border-slate-800 p-2.5 rounded-2xl flex items-center justify-between gap-3 shadow-2xl pointer-events-auto z-10">
          <div className="flex gap-1 bg-slate-900 p-1 rounded-xl w-full">
            <button
              onClick={() => setMapMode('PICKUP')}
              className={`flex-1 py-2 px-3 text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mapMode === 'PICKUP'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-xs">📍</span>
              <span>{lang === 'ar' ? 'تحديد الالتقاء' : 'Set Pickup'}</span>
            </button>
            <button
              onClick={() => setMapMode('DROPOFF')}
              className={`flex-1 py-2 px-3 text-[11px] font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mapMode === 'DROPOFF'
                  ? 'bg-rose-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-xs">🏁</span>
              <span>{lang === 'ar' ? 'تحديد الوجهة' : 'Set Destination'}</span>
            </button>
          </div>

          <button
            onClick={handleCenterMap}
            title={lang === 'ar' ? 'إعادة تركيز الخريطة' : 'Re-center Map'}
            className="p-2.5 bg-slate-900 text-amber-400 hover:text-white border border-slate-800 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real Road Distance & ETA Badge */}
      {typeof distanceKm === 'number' && distanceKm > 0 && (
        <div className="absolute top-14 right-3 z-30 flex items-center gap-2 bg-blue-600/95 backdrop-blur-md text-white px-3 py-2 rounded-xl text-[10px] font-black shadow-2xl border border-blue-400 pointer-events-none">
          <Navigation className="w-4 h-4 text-emerald-300" />
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-extrabold">
              {distanceKm.toFixed(2)} {lang === 'ar' ? 'كم' : 'km'}
            </span>
            <span className="text-[8px] text-blue-100 font-bold flex items-center gap-1">
              {isRealRoute ? (
                <>{lang === 'ar' ? '🛣️ مسافة بالطريق' : '🛣️ Road distance'}</>
              ) : (
                <>{lang === 'ar' ? '↔️ مسافة تقديرية' : '↔️ Estimated'}</>
              )}
              {etaMinutes ? ` • ${etaMinutes} ${lang === 'ar' ? 'د' : 'min'}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Dynamic Geocoding Address Loader */}
      {isGeocoding && (
        <div className="absolute inset-x-4 top-14 bg-slate-950/95 backdrop-blur-md border border-slate-800 py-2.5 px-4 rounded-xl flex items-center gap-2.5 text-white text-[10px] font-black shadow-2xl z-20 animate-pulse">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          <span className="text-slate-200">{geocodingText}</span>
        </div>
      )}

      {/* Guide Banner & Data Saver Indicator */}
      {!readOnly && (
        <div className="absolute top-3 left-3 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 pointer-events-auto z-10">
          <div className="flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md text-white px-2.5 py-1.5 rounded-lg text-[9px] font-black border border-slate-800 shadow-md pointer-events-none">
            <Compass className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
            <span>{lang === 'ar' ? 'اسحب الدبابيس أو اضغط على الخريطة مباشرة للتحديد' : 'DRAG PINS OR CLICK ON MAP TO SET'}</span>
          </div>

          {onToggleDataSaver && (
            <button
              type="button"
              onClick={onToggleDataSaver}
              className={`px-2 py-1 rounded-lg text-[9px] font-black shadow-md flex items-center gap-1 border transition-all cursor-pointer ${
                dataSaverMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title={lang === 'ar' ? 'تفعيل/إيقاف وضع توفير بيانات الهاتف' : 'Toggle Mobile Data Saver'}
            >
              <span>⚡</span>
              <span>
                {dataSaverMode
                  ? (lang === 'ar' ? 'توفير البيانات مفعل (80%)' : 'Data Saver ON (80%)')
                  : (lang === 'ar' ? 'توفير البيانات' : 'Data Saver')}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Map Legend Bar */}
      {!readOnly && (
        <div className="absolute bottom-3 left-4 right-4 bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-1.5 rounded-xl flex items-center justify-between text-[8px] text-slate-500 shadow-lg pointer-events-auto z-10">
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
            <span>{lang === 'ar' ? 'مكان الالتقاء (قابل للسحب)' : 'Pickup (Draggable)'}</span>
          </div>
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <span className="w-2 h-2 bg-rose-500 rounded-full inline-block"></span>
            <span>{lang === 'ar' ? 'مكان الوصول (قابل للسحب)' : 'Dropoff (Draggable)'}</span>
          </div>
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <span className="w-2.5 h-2.5 bg-slate-900 border border-slate-700 rounded-full inline-block flex items-center justify-center">
              <span className="w-1 h-1 bg-amber-400 rounded-full"></span>
            </span>
            <span>{lang === 'ar' ? 'الكابتن المتاح' : 'Available Captain'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
