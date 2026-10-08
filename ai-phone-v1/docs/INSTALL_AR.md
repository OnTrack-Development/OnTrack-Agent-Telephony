# دليل تجربة OnTrack AI Phone على Windows 11 وAndroid

**النسخة POC وليست جاهزة للعميل التجاري أو للرد الحقيقي دون إشراف.** مفيش أي نتيجة مؤكدة حتى الآن عن توصيل مكالمة Xiaomi بالـGemini.

## 1) تركيب Android
1. افتح أحدث Build ناجح في GitHub Actions للفرع `feature/ai-phone-v1-from-scratch`.
2. نزّل Artifact باسم `OnTrackAIPhone-Android-debug-POC` لو البناء نجح.
3. فك ZIP وثبّت APK على هاتفك التجريبي بعد التحقق من المصدر. قد تحتاج السماح بالتثبيت اليدوي؛ **لا تزيل تطبيق الاتصال الأساسي**.
4. افتح OnTrack AI Phone ثم `Choose as Default Phone app` واقبل الإذن، وبعدها فعّل الإشعارات.
5. احفظ وضع `Delayed` ومدة `10` ثوانٍ. ساعات العمل غير مُفعلة فعليًا حتى تضبط بدء/انتهاء الدوام وتؤشر `Activate configured...`.
6. جرّب مع رقم اختباري تملكه: رد يدوي قبل 10 ثوانٍ، رفض، وإغلاق المتصل؛ راقب إلغاء المؤقت.

## 2) برنامج Windows
1. من GitHub Actions نزّل `OnTrackAIPhone-Windows-POC-Setup` إذا نجح Windows build، شغّل Setup تحت حساب مستخدم عادي.
2. قبل تشغيل البرنامج، عرّف متغير بيئة `GEMINI_API_KEY` من PowerShell محليًا فقط:
   `$env:GEMINI_API_KEY = Read-Host "Enter Gemini API Key"`
   ثم شغّل البرنامج من نفس نافذة PowerShell (لأن تغيير المتغير غير دائم):
   `& "$env:LOCALAPPDATA\Programs\OnTrack\AI Phone\OnTrackAIPhone.exe"`
   **ملاحظة**: إن كان مسار المثبّت مختلفًا افتحه من قائمة Start بعد ضبط المتغير عبر Windows Environment Variables بدلًا من ذلك.
3. اختر الموديل المتاح لحسابك، ثم اختر إدخال/إخراج الصوت. اضغط Start Gemini session للتحقق من الصوت باستخدام أجهزة الكمبيوتر **بعيدًا عن مكالمة SIM في البداية**.
4. للحصول على readiness control أثناء التجربة، وصّل USB مع تفعيل Developer Options وUSB debugging على الموبايل، وثبّت Android Platform Tools من Google على Windows ثم نفّذ:
   `adb devices`
   `adb reverse tcp:8765 tcp:8765`
   اكتب التوكن المعروض في برنامج Windows داخل إعدادات Android واحفظه.
5. **ممنوع تفعيل** مربع `I physically verified BOTH directions...` قبل اختبار فعلي لصوت العميل وصوت الكمبيوتر في مكالمة حقيقية. اختيار سماعة عامة أو Phone Link مش إثبات.
6. عند عدم وجود مسار صوت مؤكد، يظل خيار AI auto-answer مقفول تلقائيًا. الرد اليدوي متاح.

## 3) اختبارات القبول قبل الإنتاج
- تأكد أن المحادثة نفسها مسموعة في الاتجاهين رقميًا بين جهاز الصوت المحدد والمتصل بالـSIM، من غير استرجاع صوت الميكروفون العادي بدل صوت العميل.
- تأكد من التأخير (10 ثوانٍ) وإلغاء المؤقت بعد الرد اليدوي، وفشل الـAI بدون سقوط مكالمة الشريحة.
- اختبر تتابع الرنين والرد تحت قفل الشاشة وعلى Xiaomi MIUI/HyperOS.
- **استلام المستخدم للمكالمة من الـAI لم يُنفّذ بعد**؛ لا تختبره بوصفه ميزة متاحة.

## 4) التراجع
غير Default Phone App إلى تطبيق الهاتف الأصلي في Settings > Apps > Default apps > Phone app ثم أزل نسخة POC. لا تمس بيانات المشروع القديم.
