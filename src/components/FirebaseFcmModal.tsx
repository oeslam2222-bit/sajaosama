import React, { useState, useEffect } from 'react';
import { Bell, Copy, Check, ShieldCheck, Smartphone, Volume2, Sparkles, RefreshCw, X } from 'lucide-react';
import { requestFCMToken, subscribeForegroundFCM } from '../firebase';
import { notifyDriverWithAudioFirst } from '../utils/notifications';

interface FirebaseFcmModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const FirebaseFcmModal: React.FC<FirebaseFcmModalProps> = ({ isOpen, onClose, lang }) => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const savedToken = localStorage.getItem('ezz_fcm_token');
      if (savedToken) {
        setFcmToken(savedToken);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGetToken = async () => {
    setLoading(true);
    setStatusMsg(lang === 'ar' ? 'جاري الاتصال بـ Firebase Cloud Messaging...' : 'Connecting to Firebase Cloud Messaging...');
    
    try {
      const token = await requestFCMToken();
      if (token) {
        setFcmToken(token);
        setStatusMsg(lang === 'ar' ? 'تم استخراج رمز FCM الجهاز بنجاح! 🟢' : 'FCM Token generated successfully! 🟢');
      } else {
        setStatusMsg(lang === 'ar' ? 'تعذر الحصول على الرمز. يرجى السماح بالإشعارات.' : 'Permission denied or FCM not supported.');
      }
    } catch (err: any) {
      setStatusMsg(lang === 'ar' ? `خطأ: ${err.message || 'فشل الاتصال'}` : `Error: ${err.message || 'Failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTestNotification = () => {
    notifyDriverWithAudioFirst({
      title: lang === 'ar' ? '🚨 تجربة إشعار Firebase FCM' : '🚨 Firebase FCM Test Alert',
      body: lang === 'ar' ? 'طلب مشوار جديد متاح للكابتن حالاً عبر إشعارات الفايربيز!' : 'New ride request available via Firebase notifications!',
      soundType: 'new_trip',
      speechText: lang === 'ar' ? 'تجربة إشعار الفايربيز بنجاح' : 'Firebase notification test success',
      lang: lang === 'ar' ? 'ar-EG' : 'en-US',
      tag: 'fcm-test-alert',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-amber-400">
                {lang === 'ar' ? 'إشعارات Firebase Cloud Messaging (FCM)' : 'Firebase Cloud Messaging (FCM)'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ar' ? 'ربط وتفعيل الإشعارات للـ PWA والتطبيق المغلق' : 'Push notifications for PWA & Background execution'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Firebase Info Banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-start space-x-3 rtl:space-x-reverse text-xs text-emerald-300">
          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">
              {lang === 'ar' ? 'خدمة مجانية 100% مدى الحياة' : '100% Free Forever Service'}
            </span>
            <p className="leading-relaxed text-slate-300">
              {lang === 'ar'
                ? 'تم إعداد ومشروع Firebase الخاص بالتطبيق مجاناً بالكامل دون أي رسوم. تصل الإشعارات للسائق والراكب حتى لو كان المتصفح/التطبيق مغلقاً.'
                : 'Firebase is configured for free without cost. Push notifications arrive even when browser/PWA is closed.'}
            </p>
          </div>
        </div>

        {/* Action / Token Status */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-300">
            {lang === 'ar' ? 'رمز الجهاز المخصص للإشعارات (FCM Device Token):' : 'FCM Device Token:'}
          </label>
          
          {fcmToken ? (
            <div className="space-y-2">
              <div className="flex items-center space-x-2 rtl:space-x-reverse bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="text"
                  readOnly
                  value={fcmToken}
                  className="bg-transparent text-xs text-amber-300 w-full outline-none font-mono truncate"
                />
                <button
                  onClick={handleCopyToken}
                  className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1 rtl:space-x-reverse transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : (lang === 'ar' ? 'نسخ الرمز' : 'Copy')}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1 rtl:space-x-reverse">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
                <span>{lang === 'ar' ? 'جهازك جاهز لاستقبال إشعارات الفايربيز 🟢' : 'Device ready to receive FCM notifications 🟢'}</span>
              </p>
            </div>
          ) : (
            <button
              onClick={handleGetToken}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? (lang === 'ar' ? 'جاري استخراج الرمز...' : 'Generating Token...')
                  : (lang === 'ar' ? 'تفعيل وتأكيد رمز FCM للجهاز 🔔' : 'Activate & Generate FCM Token 🔔')}
              </span>
            </button>
          )}

          {statusMsg && (
            <p className="text-xs text-center text-amber-400 font-medium animate-fade-in">{statusMsg}</p>
          )}
        </div>

        {/* Test Notification Button */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleTestNotification}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center space-x-2 rtl:space-x-reverse border border-slate-700 transition-colors cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>{lang === 'ar' ? 'تجربة إشعار الصوت والفايربيز 🔊' : 'Test Sound & FCM Alert 🔊'}</span>
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
