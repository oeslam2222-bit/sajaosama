# TODO - إصلاح الدردشة والـ Refresh

## إصلاحات الدردشة
- [x] تعديل RiderView.tsx - إظهار الدردشة من ACCEPTED
- [x] تعديل DriverView.tsx - إظهار الدردشة من ACCEPTED
- [x] إضافة جدول chat_messages في SQL Schema
- [x] إضافة دوال fetchChatMessages / saveChatMessage في supabaseService.ts
- [x] تعديل App.tsx لحفظ الرسائل في جدول chat_messages

## إصلاح Refresh
- [x] تعديل App.tsx لضبط currentScreen بعد تحميل الجلسة

- [ ] 9. تعديل RiderView.tsx - إضافة خطوة اختيار المدينة وإظهار السائقين حسب المدينة

## التعديلات القادمة:
- تم الانتهاء من جميع التعديلات في App.tsx و types.ts و constants.ts و supabaseService.ts
- المتبقي: واجهات المستخدم في AdminView و DriverView و RiderView

## ملاحظات:
- ✅ `Driver.serviceAreas` موجود فعلاً في `types.ts`
- ✅ `AVAILABLE_CITIES` موجود فعلاً في `constants.ts`
- ✅ دعم `service_areas` موجود فعلاً في `supabaseService.ts` (mapDriverFromDB, mapDriverToDB)
- ✅ `handleRequestRide` في App.tsx: يستخدم GPS + Haversine + فلتر مسافة + ترتيب سائقين

## الملفات المعدلة:
- [x] src/types.ts
- [x] src/constants.ts
- [x] src/supabaseService.ts
- [x] src/App.tsx
- [ ] src/components/AdminView.tsx
- [ ] src/components/DriverView.tsx
- [ ] src/components/RiderView.tsx
