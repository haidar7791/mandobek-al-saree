# ForUs — WhatsApp Password-Reset Server

سيرفر مستقل يُرسل رابط إعادة تعيين كلمة المرور عبر الواتساب.

## الإعداد الأولي

### 1. مفتاح Firebase Admin
1. افتح [Firebase Console](https://console.firebase.google.com) → مشروع `mandobek-al-saree`
2. اذهب إلى **Project Settings → Service Accounts**
3. اضغط **Generate new private key** → حمّل الملف
4. انسخه إلى `whatsapp-server/serviceAccountKey.json`

### 2. ملف البيئة
```bash
cp .env.example .env
# عدّل PORT إن أردت (افتراضي 3001)
```

### 3. تثبيت الحزم
```bash
cd whatsapp-server
npm install
```

### 4. تشغيل السيرفر
```bash
node index.js
```

عند أول تشغيل، سيظهر **رمز QR** في الـ Terminal.  
افتح واتساب رقم **07827263200** → الأجهزة المرتبطة → امسح الرمز.

بعد المسح ستظهر الرسالة:
```
✅ WhatsApp: العميل جاهز لإرسال الرسائل
```

---

## استخدام الـ API

### فحص الحالة
```
GET /health
```
```json
{ "status": "ok", "whatsapp": "ready" }
```

### إرسال رابط إعادة التعيين
```
POST /api/reset-password
Content-Type: application/json

{ "phoneNumber": "07XXXXXXXXX" }
```

**ردود:**
| الحالة | المعنى |
|---|---|
| `200` | تم الإرسال بنجاح |
| `400` | رقم هاتف مفقود أو غير صحيح |
| `404` | لا يوجد حساب بهذا الرقم |
| `503` | WhatsApp لم يتصل بعد |
| `500` | خطأ داخلي |

---

## تكامل مع تطبيق ForUs

في ملف `app/login.tsx`، زر "نسيت كلمة المرور عبر الهاتف":

```ts
await fetch("http://YOUR_SERVER_IP:3001/api/reset-password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phoneNumber: contact.trim() }),
});
```

---

## ملاحظات
- الجلسة محفوظة في `.wwebjs_auth/` — لن تحتاج إعادة المسح عند كل تشغيل.
- السيرفر يعمل بشكل مستقل تماماً عن تطبيق Expo وعن Express backend الحالي.
- لا تنشر `serviceAccountKey.json` على GitHub.
