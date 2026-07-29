
- [x] 2. تعديل types.ts - إضافة serviceAreas للـ Driver
- [x] 3. تعديل constants.ts - إضافة قائمة المدن المتاحة
- [x] 4. تعديل supabaseService.ts - دعم service_areas في التحويلات و SQL
- [x] 5. تعديل App.tsx - تغيير handleRequestRide
  - [x] 5.1 MAX_OFFERED_DRIVERS: 5 → 3
  - [x] 5.2 إضافة فلتر مسافة أقصى MAX_DISTANCE_KM = 10
  - [x] 5.3 استخدام GPS مباشر للسائقين (lat/lng) بدلاً من XY
  - [x] 5.4 حساب ETA تقديري
- [x] 6. تعديل App.tsx - إضافة handleUpdateDriverServiceAreas
- [ ] 7. تعديل AdminView.tsx - إضافة إدارة مناطق السائقين
- [ ] 8. تعديل DriverView.tsx - إضافة قسم اختيار مناطق التغطية
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
