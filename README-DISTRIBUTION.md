# دليل النشر والتوزيع — سيرفر + EXE + APK

منصة الوحدة القانونية مصممة للعمل **مركزياً على سيرفر** مع عدة موظفين، مع عملاء لسطح المكتب والموبايل.

```
                    ┌─────────────────┐
                    │  السيرفر        │
                    │  Node + MySQL   │
                    │  (Docker)       │
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           │                 │                 │
     ┌─────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
     │  متصفح    │    │  EXE        │   │  APK        │
     │  الويب    │    │  Windows    │   │  Android    │
     └───────────┘    └─────────────┘   └─────────────┘
```

---

## 1) نشر السيرفر (الخطوة الأولى — إلزامية)

راجع `README-DEPLOY.md` للتفاصيل. ملخص سريع:

```bash
cp env.template .env
# عدّل: JWT_SECRET, MYSQL_*, CORS_ORIGINS=https://your-domain.com

docker compose up -d --build
docker compose logs -f app
```

بعد التشغيل:
```bash
docker compose exec app node scripts/apply-pending-migrations.mjs
docker compose exec app npx tsx scripts/setup-local.ts
```

افتح: `http://SERVER_IP:3000`

### إعدادات مهمة في `.env`

| المتغير | الغرض |
|---------|--------|
| `JWT_SECRET` | سر عشوائي 32+ حرف (إلزامي) |
| `CORS_ORIGINS` | دومين الموقع إن لزم |
| `USE_LOCAL_STORAGE=true` | تخزين الملفات على السيرفر |
| `APP_PORT=3000` | منفذ الوصول |

---

## 2) تطبيق Windows (EXE)

النسخة الحالية **عميل رفيع**: يفتح نافذة ويتصل بالسيرفر (تحديثات تلقائية من السيرفر).

### التطوير المحلي
```powershell
pnpm electron:dev
```

### بناء ملف التثبيت
```powershell
pnpm install
pnpm electron:build:win
```

الملفات في مجلد `release/`:
- `الوحدة القانونية Setup x.x.x.exe` — مثبّت
- `الوحدة القانونية x.x.x.exe` — نسخة محمولة

### تعيين عنوان السيرفر

**طريقة 1:** ملف `server-url.txt` بجانب البرنامج:
```
https://legal-unit.yourbank.iq
```

**طريقة 2:** متغير بيئة عند التشغيل:
```powershell
$env:ELECTRON_SERVER_URL="http://192.168.1.50:3000"
.\release\الوحدة\ القانونية.exe
```

---

## 3) تطبيق Android (APK)

### المتطلبات
- [Android Studio](https://developer.android.com/studio) (SDK + Java)
- متغير `ANDROID_HOME` مضبوط

### الطريقة أ — APK يحمّل السيرفر (موصى بها)

```powershell
$env:CAP_SERVER_URL="http://YOUR_SERVER_IP:3000"
pnpm install
pnpm cap:init          # مرة واحدة فقط
pnpm cap:sync
pnpm cap:open          # Build > Build APK في Android Studio
```

أو من سطر الأوامر:
```powershell
pnpm android:apk
```
الملف: `android/app/build/outputs/apk/debug/app-debug.apk`

### الطريقة ب — APK بواجهة مدمجة + API على السيرفر

```powershell
$env:VITE_API_URL="http://YOUR_SERVER_IP:3000"
pnpm build:mobile
pnpm cap:sync
pnpm android:apk
```

> في هذه الطريقة يُخزَّن رمز JWT محلياً بعد تسجيل الدخول.

---

## 4) توزيع على الموظفين

| المنصة | ما يُوزَّع | الإعداد |
|--------|-----------|---------|
| الحاسبة | ملف EXE + `server-url.txt` | عنوان السيرفر |
| الموبايل | ملف APK | نفس عنوان السيرفر مدمج عند البناء |
| الويب | رابط `https://...` | لا تثبيت |

**كل الموظفين يشاركون نفس البيانات** لأنها على السيرفر المركزي.

---

## 5) ترتيب التشغيل الموصى به

1. انشر السيرفر التجريبي (VPS أو داخلي)
2. أنشئ حساب المدير (`setup:local`)
3. اختبر من المتصفح
4. ابنِ EXE ووزّعه على حاسبتين للاختبار
5. ابنِ APK واختبره على جوال
6. بعد نجاح التجربة → انقل السيرفر للإنتاج

---

## 6) استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| EXE صفحة بيضاء | تحقق من `server-url.txt` والسيرفر يعمل |
| APK لا يتصل | تأكد من `CAP_SERVER_URL` أو `VITE_API_URL` عند البناء |
| تسجيل دخول يفشل على APK | استخدم الطريقة ب مع `VITE_API_URL` |
| رفع ملفات يفشل | تحقق من `USE_LOCAL_STORAGE` على السيرفر |
| 502 خلف Nginx | أضف `proxy_set_header X-Forwarded-Proto https;` |

---

## 7) الأمان قبل الإنتاج

- [ ] تغيير `JWT_SECRET` وكلمات مرور MySQL
- [ ] تفعيل HTTPS (Let's Encrypt + Nginx)
- [ ] إغلاق منفذ 3306 من الإنترنت
- [ ] نسخ احتياطي يومي لقاعدة البيانات
- [ ] عدم وضع بيانات حقيقية على السيرفر التجريبي
