import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Location, Trip } from '../types';

interface GoogleMapProps {
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
  apiKey: string;
  distanceKm?: number;
  etaMinutes?: number;
  isRealRoute?: boolean;
}

declare global {
  interface Window {
    google: any;
  }
}

export const GoogleMap: React.FC<GoogleMapProps> = ({
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
  apiKey,
  distanceKm,
  etaMinutes,
  isRealRoute,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLineRef = useRef<any>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapMode, setMapMode] = useState<'PICKUP' | 'DROPOFF'>('PICKUP');
  const mapModeRef = useRef(mapMode);
  useEffect(() => { mapModeRef.current = mapMode; }, [mapMode]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [showTraffic, setShowTraffic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const langRef = useRef(lang);
  const onUpdateLocationsRef = useRef(onUpdateLocations);
  const onSelectPickupRef = useRef(onSelectPickup);
  const onSelectDropoffRef = useRef(onSelectDropoff);
  const locationsRef = useRef(locations);
  const activeTripRef = useRef(activeTrip);
  const selectedPickupRef = useRef(selectedPickup);
  const selectedDropoffRef = useRef(selectedDropoff);
  const routeGeometryRef = useRef(routeGeometry);
  const showTrafficRef = useRef(showTraffic);

  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { onUpdateLocationsRef.current = onUpdateLocations; }, [onUpdateLocations]);
  useEffect(() => { onSelectPickupRef.current = onSelectPickup; }, [onSelectPickup]);
  useEffect(() => { onSelectDropoffRef.current = onSelectDropoff; }, [onSelectDropoff]);
  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);
  useEffect(() => { selectedPickupRef.current = selectedPickup; }, [selectedPickup]);
  useEffect(() => { selectedDropoffRef.current = selectedDropoff; }, [selectedDropoff]);
  useEffect(() => { routeGeometryRef.current = routeGeometry; }, [routeGeometry]);
  useEffect(() => { showTrafficRef.current = showTraffic; }, [showTraffic]);

  const getMarkerIcon = (type: 'pickup' | 'dropoff' | 'driver', vehicleType?: string, color?: string) => {
    const symbol = type === 'pickup' ? '🟢' : type === 'dropoff' ? '🔴' : '🚖';
    const label = type === 'pickup' ? 'P' : type === 'dropoff' ? 'D' : '';
    return {
      url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50"><ellipse cx="20" cy="42" rx="12" ry="6" fill="rgba(0,0,0,0.3)"/><path d="M20 5 C10 5 5 15 5 25 C5 35 20 45 20 45 C20 45 35 35 35 25 C35 15 30 5 20 5Z" fill="${color || '#3b82f6'}" stroke="white" stroke-width="2.5"/><text x="20" y="28" font-size="16" text-anchor="middle" fill="white">${symbol}</text></svg>`)}`,
      scaledSize: new window.google.maps.Size(40, 50),
      anchor: new window.google.maps.Point(20, 45),
    };
  };

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const defaultCenter = { lat: 30.0444, lng: 31.2357 };

    const map = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });

    const trafficLayer = new window.google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    mapInstanceRef.current = { map, trafficLayer };

    map.addListener('click', (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (!onSelectPickupRef.current || !onSelectDropoffRef.current) return;

      if (mapModeRef.current === 'PICKUP') {
        handleAddLocation('pickup', lang === 'ar' ? `نقطة التقاط ${Date.now().toString(36)}` : `Pickup ${Date.now().toString(36)}`, lat, lng);
      } else {
        handleAddLocation('dropoff', lang === 'ar' ? `نقطة إنزال ${Date.now().toString(36)}` : `Dropoff ${Date.now().toString(36)}`, lat, lng);
      }
    });

    setIsMapReady(true);
  }, [apiKey]);

  const handleAddLocation = (type: 'pickup' | 'dropoff', name: string, lat: number, lng: number) => {
    if (!onUpdateLocationsRef.current) return;
    const newLoc: Location = {
      id: `loc_${Date.now()}`,
      nameAr: name,
      nameEn: name,
      lat,
      lng,
    };
    onUpdateLocationsRef.current(prev => [...prev, newLoc]);
    if (type === 'pickup' && onSelectPickupRef.current) {
      onSelectPickupRef.current(newLoc.id);
    } else if (type === 'dropoff' && onSelectDropoffRef.current) {
      onSelectDropoffRef.current(newLoc.id);
    }
  };

  useEffect(() => {
    if (!window.google?.maps && apiKey) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      script.onerror = () => setError(lang === 'ar' ? 'فشل تحميل Google Maps' : 'Failed to load Google Maps');
      document.head.appendChild(script);
      return () => { document.head.removeChild(script); };
    } else if (window.google?.maps) {
      initMap();
    }
  }, [apiKey, initMap]);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const { map, trafficLayer } = mapInstanceRef.current;
    trafficLayer.setMap(showTrafficRef.current ? map : null);

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const pLoc = locations.find(l => l.id === selectedPickup);
    const dLoc = locations.find(l => l.id === selectedDropoff);

    if (pLoc) {
      const marker = new window.google.maps.Marker({
        position: { lat: pLoc.lat, lng: pLoc.lng },
        map,
        icon: getMarkerIcon('pickup', undefined, '#22c55e'),
        title: pLoc.nameAr || pLoc.nameEn,
        zIndex: 1000,
      });
      marker.addListener('click', () => {});
      markersRef.current.push(marker);
    }

    if (dLoc) {
      const marker = new window.google.maps.Marker({
        position: { lat: dLoc.lat, lng: dLoc.lng },
        map,
        icon: getMarkerIcon('dropoff', undefined, '#ef4444'),
        title: dLoc.nameAr || dLoc.nameEn,
        zIndex: 1000,
      });
      markersRef.current.push(marker);
    }

    if (pLoc && dLoc) {
      if (routeGeometryRef.current && routeGeometryRef.current.length > 1) {
        const path = routeGeometryRef.current.map(([lat, lng]) => ({ lat, lng }));
        if (routeLineRef.current) routeLineRef.current.setMap(null);
        routeLineRef.current = new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: activeTripRef.current ? '#3b82f6' : '#10b981',
          strokeOpacity: 0.85,
          strokeWeight: 5,
          icons: [{
            icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
            offset: '0%',
            repeat: '50px',
          }],
        });
        routeLineRef.current.setMap(map);
      } else {
        if (routeLineRef.current) routeLineRef.current.setMap(null);
        routeLineRef.current = new window.google.maps.Polyline({
          path: [{ lat: pLoc.lat, lng: pLoc.lng }, { lat: dLoc.lat, lng: dLoc.lng }],
          geodesic: true,
          strokeColor: activeTripRef.current ? '#3b82f6' : '#10b981',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          dashArray: ['8, 8'],
        });
        routeLineRef.current.setMap(map);
      }
    }

    if (pLoc && dLoc) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: pLoc.lat, lng: pLoc.lng });
      bounds.extend({ lat: dLoc.lat, lng: dLoc.lng });
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [isMapReady, locations, selectedPickup, selectedDropoff, routeGeometry, activeTrip, showTraffic]);

  const handleSearch = async () => {
    if (!searchText.trim() || !window.google?.maps?.places) return;
    setIsSearching(true);
    setSearchResults([]);

    try {
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions({ input: searchText, types: ['geocode'] }, (predictions: any[], status: string) => {
        if (status === 'OK' && predictions) {
          setSearchResults(predictions);
        }
        setIsSearching(false);
      });
    } catch {
      setIsSearching(false);
    }
  };

  const handlePlaceSelect = (placeId: string, description: string) => {
    if (!window.google?.maps?.places) return;
    const service = new window.google.maps.places.PlacesService(mapInstanceRef.current.map);
    service.getDetails({ placeId }, (place: any, status: string) => {
      if (status === 'OK' && place.geometry) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        handleAddLocation(mapModeRef.current === 'PICKUP' ? 'pickup' : 'dropoff', description, lat, lng);
        mapInstanceRef.current.map.panTo({ lat, lng });
        setSearchText('');
        setSearchResults([]);
      }
    });
  };

  const safeActiveTrip = activeTrip ?? null;

  return (
    <div className={`relative ${height} rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-100`}>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-[9999]">
          <div className="text-center p-6">
            <p className="text-red-600 font-bold text-lg mb-2">⚠️ {error}</p>
            <p className="text-red-500 text-sm">{lang === 'ar' ? 'تأكد من مفتاح Google Maps API في الإعدادات' : 'Check Google Maps API key in settings'}</p>
          </div>
        </div>
      )}

      <div ref={mapRef} className="w-full h-full" />


      {typeof distanceKm === 'number' && distanceKm > 0 && (
        <div className="absolute top-4 left-4 z-[1001] flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-xl text-[10px] font-black shadow-2xl">
          <span className="text-[12px] font-extrabold">{distanceKm.toFixed(2)} {lang === 'ar' ? 'كم' : 'km'}</span>
          <span className="text-[8px] text-blue-100 font-bold">
            {isRealRoute ? (lang === 'ar' ? '🛣️ بالطريق' : '🛣️ Road') : (lang === 'ar' ? '↔️ تقديري' : '↔️ Est')}
            {etaMinutes ? ` • ${etaMinutes} ${lang === 'ar' ? 'د' : 'min'}` : ''}
          </span>
        </div>
      )}

      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white rounded-lg shadow-lg p-1.5 flex flex-col gap-1">
          <button
            onClick={() => setMapMode('PICKUP')}
            className={`px-3 py-2 rounded-md text-xs font-bold transition ${mapMode === 'PICKUP' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {lang === 'ar' ? '📍 نقطة التقاط' : '📍 Pickup'}
          </button>
          <button
            onClick={() => setMapMode('DROPOFF')}
            className={`px-3 py-2 rounded-md text-xs font-bold transition ${mapMode === 'DROPOFF' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {lang === 'ar' ? '🏁 نقطة إنزال' : '🏁 Dropoff'}
          </button>
        </div>

        <button
          onClick={() => setShowTraffic(!showTraffic)}
          className={`px-3 py-2 rounded-lg shadow-md text-xs font-bold transition ${showTraffic ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
        >
          🚦 {lang === 'ar' ? 'المرور' : 'Traffic'}
        </button>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-[1000]">
        <div className="bg-white rounded-lg shadow-lg p-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={lang === 'ar' ? 'ابحث عن عنوان...' : 'Search address...'}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {isSearching ? '...' : (lang === 'ar' ? 'بحث' : 'Search')}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-md">
              {searchResults.map((result) => (
                <button
                  key={result.place_id}
                  onClick={() => handlePlaceSelect(result.place_id, result.description)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
                >
                  {result.description}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
