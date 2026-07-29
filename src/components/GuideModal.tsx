import React, { useState } from 'react';
import {
  X,
  BookOpen,
  UserCheck,
  Car,
  BellRing,
  Volume2,
  MapPin,
  ShieldCheck,
  Smartphone,
  PhoneCall,
  CheckCircle2,
  Code2,
  Award,
  Sparkles,
  Zap,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { playNotificationSound, speakText, triggerVibration } from '../utils/notifications';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'rider' | 'driver' | 'about';
  lang?: 'ar' | 'en';
}

export const GuideModal: React.FC<GuideModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'rider',
  lang = 'ar',
}) => {
  const [activeTab, setActiveTab] = useState<'rider' | 'driver' | 'about'>(defaultTab);
  const [testAudioPlayed, setTestAudioPlayed] = useState(false);

  if (!isOpen) return null;

  const handleTestSound = () => {
    try {
      playNotificationSound('new_trip');
      triggerVibration([200, 100, 200]);
      if (lang === 'ar') {
        speakText('تنبيه كابتن عز! الصوت يعمل بنجاح');
      } else {
        speakText('Captain Ezz Notification sound test successful');
      }
      setTestAudioPlayed(true);
      setTimeout(() => setTestAudioPlayed(false), 3000);
    } catch (e) {
      console.warn('Test audio error:', e);
    }
  };

  const isAr = lang === 'ar';

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>{isAr ? 'دليل الاستخدام والتعليمات' : 'User & Driver Guide'}</span>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {isAr ? 'تفاعلي' : 'Interactive'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'كل ما تحتاجه لاستخدام تطبيق كابتن عز بكفاءة وسهولة'
                  : 'Everything you need to master Captain Ezz platform'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors pointer-events-auto cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-950/50 p-2 border-b border-slate-800 flex gap-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('rider')}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'rider'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>{isAr ? 'دليل الراكب 🚖' : 'Rider Guide'}</span>
          </button>

          <button
            onClick={() => setActiveTab('driver')}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'driver'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>{isAr ? 'دليل الكابتن 🚗' : 'Driver Guide'}</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'about'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isAr ? 'المطور وصاحب المشروع ℹ️' : 'About & Owner'}</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm leading-relaxed">
          
          {/* TAB 1: RIDER GUIDE */}
          {activeTab === 'rider' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200 leading-normal">
                  {isAr
                    ? 'أهلاً بك في كابتن عز! يمكنك طلب مشوار في ثوانٍ معدودة وبدون أي تعقيد. اتبع الخطوات التالية لحجز رحلتك الأولى.'
                    : 'Welcome to Captain Ezz! Book your ride seamlessly in seconds with these simple steps.'}
                </p>
              </div>

              {/* Step 1 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-amber-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400 font-black">1</span>
                  <MapPin className="w-4 h-4" />
                  <h4>{isAr ? 'تحديد مكان الانطلاق والوصول' : 'Select Pickup & Dropoff'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'اختر موقعك الحالي ومكان الوجهة من القائمة أو باستخدام الخريطة التفاعلية. يمكنك الاختيار من المناطق المجهزة مثل العياط، دهشور، المتانيا، والمراكز المجاورة.'
                    : 'Choose your pickup location and destination from predefined areas or directly using the map.'}
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-amber-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400 font-black">2</span>
                  <Car className="w-4 h-4" />
                  <h4>{isAr ? 'اختيار نوع المركبة والسعر' : 'Select Vehicle Type & Rate'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'اختر المركبة المناسبة لحاجتك:'
                    : 'Choose the vehicle option that suits your trip:'}
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 pr-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[11px]">
                    <span className="font-bold text-amber-400 block">🛺 توك توك (TukTuk)</span>
                    <span className="text-slate-400 text-[10px]">{isAr ? 'للمسافات القريبة والقرى' : 'Short inner-village trips'}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[11px]">
                    <span className="font-bold text-amber-400 block">🚗 ملاكي (Private Car)</span>
                    <span className="text-slate-400 text-[10px]">{isAr ? 'للراحات والمشاوير المباشرة' : 'Direct comfortable rides'}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[11px]">
                    <span className="font-bold text-amber-400 block">🛵 موتوسيكل (Scooter)</span>
                    <span className="text-slate-400 text-[10px]">{isAr ? 'للتنقل الفردي السريع' : 'Fast single passenger'}</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[11px]">
                    <span className="font-bold text-amber-400 block">🚐 فانيلا (Van)</span>
                    <span className="text-slate-400 text-[10px]">{isAr ? 'للمجموعات والعائلات' : 'Group & family trips'}</span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-amber-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400 font-black">3</span>
                  <PhoneCall className="w-4 h-4" />
                  <h4>{isAr ? 'تأكيد الطلب ومتابعة الكابتن' : 'Confirm & Track Driver'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'اضغط "تأكيد وطلب الرحلة". سيتلقى أقرب كابتن التنبيه فوراً، وعند قبوله يمكنك رؤية اسمه وموقعه على الخريطة ومحادثته عبر الدردشة الفورية أو الهاتف.'
                    : 'Tap Confirm. Nearest driver gets notified instantly. Once accepted, track their live location and call/chat with them directly.'}
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-amber-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-400 font-black">4</span>
                  <CheckCircle2 className="w-4 h-4" />
                  <h4>{isAr ? 'الدفع والتقييم' : 'Payment & Rating'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'عند الوصول بسلامة، ادفع المبلغ المحدد نقدياً أو عبر المحفظة الإلكترونية، ثم قم بتقييم الكابتن بـ 5 نجوم لمساعدتنا في الحفاظ على أعلى مستوى للخدمة.'
                    : 'Pay cash or wallet on arrival, and rate your driver with 5 stars to maintain premier service quality.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: DRIVER GUIDE */}
          {activeTab === 'driver' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-200 leading-normal">
                  {isAr
                    ? 'مرحباً بك يا كابتن! لضمان استلام الطلبات فور صدورها وعدم تفويت أي مشوار، يرجى قراءة الخطوات التالية بعناية.'
                    : 'Hello Captain! Follow these guidelines to never miss a ride alert, even when in background.'}
                </p>
              </div>

              {/* Step 1 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-black">1</span>
                  <Smartphone className="w-4 h-4" />
                  <h4>{isAr ? 'تفعيل وضع "متصل" واستقبال الطلبات' : 'Go Online & Turn On Reception'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'تأكد من فتح شاشة الكابتن وتحويل الحالة إلى "🟢 متصل الآن". تأكد من منح التطبيق صلاحية الوصول للموقع الجغرافي (GPS) لربطك بطلبات القرى القريبة.'
                    : 'Toggle your state to "Online". Ensure GPS permission is granted so nearest riders match with you.'}
                </p>
              </div>

              {/* Step 2 & Interactive Sound Tester */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-black">2</span>
                  <BellRing className="w-4 h-4" />
                  <h4>{isAr ? 'ضمان التنبيهات الصوتية في الخلفية' : 'Background Audio & Push Alerts'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'يعتمد النظام على نغمة رنين عالية ونطق صوتي باسم الركاب وجهتهم. اضغط الزر أدناه لتجربة الصوت والتأكد من تفعيله في متصفحك:'
                    : 'The platform triggers loud audio chimes and voice announcements. Click below to test your audio setup:'}
                </p>
                <div className="pr-8 pt-1">
                  <button
                    onClick={handleTestSound}
                    className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer pointer-events-auto"
                  >
                    <Volume2 className="w-4 h-4 animate-bounce" />
                    <span>
                      {testAudioPlayed
                        ? (isAr ? '🔊 تم تشغيل نغمة الاختبار بنجاح!' : '🔊 Sound Played Successfully!')
                        : (isAr ? '🔊 اختبار نغمة التنبيه والنطق الصوتي الآن' : '🔊 Test Alarm Sound & Voice Now')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-black">3</span>
                  <CheckCircle2 className="w-4 h-4" />
                  <h4>{isAr ? 'قبول المشوار والانطلاق' : 'Accept Ride & Start Trip'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'عند ظهور الشاشة الصفراء المنبهة، راجع مكان التحميل والوصول والسعر المقدر، ثم اضغط "قبول المشوار". يتوقف الصوت فوراً وتفتح الخريطة للتوجه للراكب.'
                    : 'Review pickup, dropoff, and fare on incoming alert modal. Click Accept to stop chime and open live route map.'}
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-xs">
                  <span className="w-6 h-6 rounded-lg bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-black">4</span>
                  <CheckCircle2 className="w-4 h-4" />
                  <h4>{isAr ? 'تأكيد الوصول وإنهاء المشوار' : 'Arrive & Finish Trip'}</h4>
                </div>
                <p className="text-xs text-slate-300 pr-8">
                  {isAr
                    ? 'عند الوصول لمكان الراكب اضغط "وصلت لمكان الراكب". وعند الركوب اضغط "بدء الرحلة"، وعند الوصول اضغط "إنهاء المشوار" وتحصيل الفاتورة.'
                    : 'Click "Arrived" on pickup, "Start Trip" on passenger onboard, and "Finish Trip" to collect fare.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: ABOUT & OWNER & DEVELOPER INFO */}
          {activeTab === 'about' && (
            <div className="space-y-4 animate-fade-in">
              
              {/* Project Platform Details */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-400 font-black text-sm border-b border-slate-800 pb-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3>{isAr ? 'عن مشروع ومنصة كابتن عز' : 'About Captain Ezz Platform'}</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isAr
                    ? 'منصة كابتن عز هي الأولى المتخصصة في تقديم خدمات النقل الذكي والمباشر لقرى ومراكز محافظة الجيزة (العياط، دهشور، المتانيا، والمناطق المجاورة). تهدف المنصة إلى ربط الركاب بالسائقين المحليين الموثوقين بأعلى سرعة وأقل تكلفة.'
                    : 'Captain Ezz is the premier ride-hailing service engineered specifically for villages and suburban towns across Giza Governorate (El Ayat, Dahshur, El Matania, etc.).'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-slate-400 text-[10px] block">{isAr ? 'إدارة المنصة:' : 'Management:'}</span>
                    <span className="font-extrabold text-amber-400">إدارة منصة كابتن عز الذكية</span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-slate-400 text-[10px] block">{isAr ? 'نطاق الخدمة:' : 'Coverage:'}</span>
                    <span className="font-extrabold text-amber-400">العياط - دهشور - الجيزة</span>
                  </div>
                </div>
              </div>

              {/* Developer & Technical Specs */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-sky-400 font-black text-sm border-b border-slate-800 pb-2">
                  <Code2 className="w-5 h-5 text-sky-400" />
                  <h3>{isAr ? 'بيانات المطور والدعم الفني' : 'Developer & Tech Specs'}</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isAr
                    ? 'تم تطوير وبناء التطبيق باستخدام أحدث تقنيات الويب التقدمية (PWA) والمعالجة المباشرة (Real-time Latency < 1s) لتوفير أقصى استقرار للرحلات والتنبيهات.'
                    : 'Built with cutting-edge Progressive Web App technology and real-time socket architecture guaranteeing sub-second response times.'}
                </p>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">{isAr ? 'إصدار المنصة:' : 'Engine Version:'}</span>
                    <span className="font-mono text-amber-400 font-bold">v2.4.0 High-Performance</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">{isAr ? 'المطور المسؤول:' : 'Lead Developer:'}</span>
                    <span className="font-bold text-sky-400">فريق الهندسة والتطوير التقني 💻</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">{isAr ? 'حماية البيانات:' : 'Encryption Status:'}</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isAr ? 'مشفّر 256-bit SSL' : '256-bit Encrypted'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Contact & Emergency Support */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-amber-300">{isAr ? 'هل تحتاج إلى مساعدة إضافية؟' : 'Need Further Support?'}</h4>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {isAr ? 'تواصل مع الدعم الفني المباشر لحل أي استفسار' : 'Reach out to direct support for any queries'}
                  </p>
                </div>
                <a
                  href="tel:01000000000"
                  className="px-3.5 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 pointer-events-auto"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{isAr ? 'الدعم الفني' : 'Support'}</span>
                </a>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>{isAr ? 'كابتن عز - خدمة 24/7' : 'Captain Ezz - 24/7 Service'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors pointer-events-auto cursor-pointer"
          >
            {isAr ? 'إغلاق الدليل' : 'Close Guide'}
          </button>
        </div>

      </div>
    </div>
  );
};
