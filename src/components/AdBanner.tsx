import React, { useState, useEffect } from 'react';
import { Phone, MessageSquare, X } from 'lucide-react';
import { Ad } from '../types';
import { incrementAdClick, incrementAdWhatsappClick, incrementAdImpression } from '../supabaseService';

type Variant = 'waiting' | 'home' | 'popup';

interface AdBannerProps {
  ads: Ad[];
  variant: Variant;
  lang: 'ar' | 'en';
  onClose?: () => void;
  lowDataMode?: boolean;
}

// Client-side expiry filter (defense-in-depth on top of the server filter).
const filterActive = (ads: Ad[]): Ad[] => {
  const today = new Date().toISOString().slice(0, 10);
  return ads.filter((a) => !a.endDate || a.endDate >= today);
};

export const AdBanner: React.FC<AdBannerProps> = ({ ads, variant, lang, onClose, lowDataMode = false }) => {
  const activeAds = filterActive(ads);
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);

  // Auto-rotate only when NOT in low-data mode and more than one ad is present.
  useEffect(() => {
    if (lowDataMode || activeAds.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % activeAds.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [activeAds.length, lowDataMode]);

  const ad = activeAds.length > 0 ? activeAds[lowDataMode ? 0 : index % activeAds.length] : null;

  // Track impressions
  useEffect(() => {
    if (ad && !closed) {
      incrementAdImpression(ad.id);
    }
  }, [ad?.id, closed]);

  if (closed || !ad || activeAds.length === 0) return null;

  const handleCall = () => {
    incrementAdClick(ad.id);
    window.location.href = `tel:${ad.phoneNumber}`;
  };

  const handleWhatsApp = () => {
    incrementAdWhatsappClick(ad.id);
    const num = (ad.whatsapp || ad.phoneNumber).replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${num}`, '_blank', 'noopener,noreferrer');
  };

  const t = {
    sponsored: lang === 'ar' ? 'إعلان مميز' : 'Featured Ad',
    call: lang === 'ar' ? 'اتصل الآن' : 'Call',
    hide: lang === 'ar' ? 'إخفاء الإعلان' : 'Hide Ad',
  };

  // Full-screen popup
  if (variant === 'popup') {
    return (
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 border border-slate-100">
          <button
            type="button"
            onClick={() => { setClosed(true); onClose?.(); }}
            className="absolute top-3 left-3 z-10 bg-white/90 hover:bg-slate-100 text-slate-700 px-2 py-1 rounded-full text-[10px] font-bold shadow-md cursor-pointer flex items-center gap-1"
            title={t.hide}
          >
            <X className="w-3.5 h-3.5 text-slate-600" />
            <span>{t.hide}</span>
          </button>
          <div className="relative h-48 bg-slate-100">
            <img src={ad.imageUrl} alt={ad.storeName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            <span className="absolute top-3 right-3 bg-slate-900/80 text-amber-300 text-[9px] font-black px-2.5 py-1 rounded-full border border-amber-400/30">
              {t.sponsored}
            </span>
          </div>
          <div className="p-4 space-y-3 text-right">
            <div>
              <h3 className="text-base font-black text-slate-900">{ad.storeName}</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">{ad.offerText}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCall}
                className="flex-1 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Phone className="w-4 h-4" />
                {t.call}
              </button>
              {ad.whatsapp && (
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  واتساب
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Large prominent banner card for waiting screen / home screen
  const isWaiting = variant === 'waiting';

  return (
    <div
      className={`relative bg-gradient-to-br from-white via-slate-50 to-teal-50/20 border border-teal-100/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all p-3`}
    >
      {/* Hide Ad Button */}
      <button
        type="button"
        onClick={() => { setClosed(true); onClose?.(); }}
        className="absolute top-2 left-2 z-10 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/60 rounded-lg px-1.5 py-0.5 text-[9px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
        title={t.hide}
      >
        <X className="w-3 h-3" />
        <span className="hidden sm:inline">{t.hide}</span>
      </button>

      <div className="flex items-center gap-3">
        {/* Large Prominent Image */}
        <div className={`shrink-0 ${isWaiting ? 'w-20 h-20' : 'w-16 h-16'} rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shadow-2xs relative`}>
          <img src={ad.imageUrl} alt={ad.storeName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0 text-right pr-1">
          <div className="flex items-center gap-1.5 justify-end">
            <h4 className={`font-black text-slate-900 truncate ${isWaiting ? 'text-xs' : 'text-[11px]'}`}>
              {ad.storeName}
            </h4>
            <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[7px] font-black px-1.5 py-0.5 rounded shrink-0">
              {t.sponsored}
            </span>
          </div>
          <p className={`text-slate-600 font-medium leading-tight ${isWaiting ? 'text-[10px]' : 'text-[9px]'} mt-1 line-clamp-2`}>
            {ad.offerText}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-1.5 shrink-0 pt-3">
          <button
            type="button"
            onClick={handleCall}
            className={`bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs ${
              isWaiting ? 'px-3 py-1.5 text-[10px]' : 'px-2.5 py-1.5 text-[9px]'
            }`}
            aria-label={t.call}
          >
            <Phone className="w-3 h-3" />
            <span>{t.call}</span>
          </button>

          {ad.whatsapp && (
            <button
              type="button"
              onClick={handleWhatsApp}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-extrabold rounded-xl px-2.5 py-1.5 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
              aria-label="WhatsApp"
              title="تواصل واتساب"
            >
              <MessageSquare className="w-3 h-3 text-emerald-600" />
              <span>واتساب</span>
            </button>
          )}
        </div>
      </div>

      {/* Rotation indicators */}
      {!lowDataMode && activeAds.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {activeAds.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === index % activeAds.length ? 'w-4 bg-teal-600' : 'w-1 bg-slate-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
