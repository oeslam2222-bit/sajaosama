const fs = require('fs');
const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

const marker1 = "     if (!notifiedEventsRef.current.has(statusEventKey)) {\n       notifiedEventsRef.current.add(statusEventKey);\n\n       if (currentStatus === 'SEARCHING' && driverIsLoggedIn) {";
const marker2 = "     // Chat Message Notifications";

const start = content.indexOf(marker1);
const end = content.indexOf(marker2);

if (start === -1 || end === -1) {
  console.error('Markers not found', { start, end });
  process.exit(1);
}

const replacement = `     if (!notifiedEventsRef.current.has(statusEventKey)) {
       notifiedEventsRef.current.add(statusEventKey);

       if (currentStatus === 'SEARCHING' && driverIsLoggedIn) {
         lastTripCompletedRef.current = false;
         lastTripCancelledRef.current = false;
         sendNativeNotification(
           '🚖 طلب رحلة جديد متاح!',
           \`العميل \${activeTrip.riderName} يطلب رحلة من \${activeTrip.pickup.nameAr} إلى \${activeTrip.dropoff.nameAr}.\`,
           '🚗'
         );
         startTitleFlash('🚨 طلب رحلة جديد!');
         triggerToast(
           '🚖 طلب رحلة جديد متاح!',
           \`العميل \${activeTrip.riderName} يطلب رحلة من \${activeTrip.pickup.nameAr} إلى \${activeTrip.dropoff.nameAr}.\`,
           'new_trip'
         );
       } else if (currentStatus === 'ACCEPTED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? \`تم قبول رحلتك، الكابتن \${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.\`
             : \`Your ride has been accepted. Captain \${activeTrip.driverName || 'Ezz'} is on the way.\`,
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '🚗 تم قبول رحلتك!',
           \`الكابتن \${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.\`,
           '✅'
         );
         startTitleFlash('🚗 الكابتن قادم!');
         setTimeout(stopTitleFlash, 5000);
         triggerVibration([200, 100, 200, 100, 300]);
         triggerToast(
           '🚗 تم قبول رحلتك!',
           \`الكابتن \${activeTrip.driverName || 'عز الدين'} في الطريق إليك الآن.\`,
           'success'
         );
       } else if (currentStatus === 'ARRIVED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? 'وصل الكابتن إلى موقعك وهو في انتظارك الآن.'
             : 'The captain has arrived at your location.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '📍 الكابتن وصل!',
           'الكابتن متواجد في نقطة الركوب الآن بانتظارك.',
           '⭐'
         );
         triggerToast(
           '📍 الكابتن وصل!',
           'الكابتن متواجد في نقطة الركوب الآن بانتظارك.',
           'info'
         );
       } else if (currentStatus === 'STARTED') {
         playNotificationSound('trip_accepted');
         speakText(
           lang === 'ar'
             ? 'بدأت الرحلة الآن، نتمنى لك مشواراً آمناً.'
             : 'The ride has started, wish you a safe trip.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         triggerToast(
           '🚀 بدأت الرحلة الآن!',
           'نتمنى لك رحلة سعيدة وآمنة مع كابتن عز.',
           'success'
         );
       } else if (currentStatus === 'COMPLETED') {
         lastTripCompletedRef.current = true;
         playNotificationSound('trip_completed');
         speakText(
           lang === 'ar'
             ? 'حمد لله على السلامة، تم إكمال الرحلة بنجاح وشكراً لاختيارك عز.'
             : 'Welcome back, trip completed successfully. Thank you for choosing Ezz.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '🎉 وصلت بالسلامة!',
           'تم إكمال الرحلة بنجاح. شكراً لك على اختيارك كابتن عز!',
           '✨'
         );
         startTitleFlash('✨ وصلت بالسلامة!');
         setTimeout(stopTitleFlash, 5000);
         triggerToast(
           '🎉 وصلت بالسلامة!',
           'تم إكمال الرحلة بنجاح. شكراً لك على اختيارك كابتن عز!',
           'success'
         );
       } else if (currentStatus === 'CANCELLED') {
         lastTripCancelledRef.current = true;
         playNotificationSound('alert');
         speakText(
           lang === 'ar'
             ? 'تم إلغاء الرحلة بسبب عدم قبول أي سائق. يمكنك طلب رحلة جديدة.'
             : 'The ride was cancelled because no driver accepted. You can request a new ride.',
           lang === 'ar' ? 'ar-EG' : 'en-US'
         );
         sendNativeNotification(
           '❌ تم إلغاء الرحلة',
           lang === 'ar'
             ? 'لم يقبل أي سائق الرحلة. يمكنك طلب رحلة جديدة.'
             : 'No driver accepted the ride. You can request a new ride.',
           '❌'
         );
         triggerToast(
           '❌ تم إلغاء الرحلة',
           lang === 'ar'
             ? 'لم يقبل أي سائق الرحلة. يمكنك طلب رحلة جديدة.'
             : 'No driver accepted the ride. You can request a new ride.',
           'warning'
         );
       }
     }

     // Chat Message Notifications`;

const newContent = content.substring(0, start) + replacement + content.substring(end);
fs.writeFileSync(path, newContent);
console.log('Replacement done');
