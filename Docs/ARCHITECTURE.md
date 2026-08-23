# Docs — دار الأنوثة

## هيكل المشروع

```
backend/      → NestJS Central API
admin/        → Admin Dashboard (نظام الإدارة)  ≡ Frontend
storefront/   → Customer Store (متجر العملاء)
mobile/       → بنية تطبيق Android + iOS (Expo لاحقاً)
Docs/         → توثيق
README.md
```

## Store API (عامة للعملاء)

- `GET /api/v1/store/company`
- `GET /api/v1/store/categories`
- `GET /api/v1/store/products`
- `GET /api/v1/store/products/:id`
- `GET /api/v1/store/delivery-quote?city=`
- `POST /api/v1/store/checkout`
- `POST /api/v1/store/orders/track`
- `POST /api/v1/store/auth/register`
- `POST /api/v1/store/auth/login`
- `GET /api/v1/store/me` (JWT)
- `GET /api/v1/store/me/orders` (JWT)

## التوصيل

### القواعد
- **داخل طرابلس (`INTERNAL`)**: توصيل عبر مندوبي دار الأنوثة المسجّلين في النظام (دور `delivery_agent`).
- **خارج طرابلس (`EXTERNAL`)**: يُسجَّل الطلب كتوصيل خارجي **بدون اختيار شركة** حالياً — بانتظار API شركة التوصيل من المالك.
- **رسوم التوصيل**: تُحسب تلقائياً بعد اختيار **المدينة + المنطقة** عبر:
  - `GET /api/v1/store/delivery-options`
  - `GET /api/v1/store/delivery-quote?city=&area=`
  - `GET /api/v1/delivery/quote?city=&area=` (للإدارة)

الرسوم من Settings: `store.delivery_fee_tripoli` / `store.delivery_fee_external`

عند توفر بيانات الدخول لـ Accuratess (Mayar GraphQL):
```
ACCURATESS_ENABLED=true
ACCURATESS_ENDPOINT=https://mayar.lg.accuratess.com:8443/graphql
# إما توكن ثابت:
ACCURATESS_TOKEN=...
# أو تسجيل دخول (mutation login) مع تخزين التوكن في الذاكرة:
ACCURATESS_USERNAME=اسلام
ACCURATESS_PASSWORD=...
```
`AccuratessService` يوفّر `login()` / `request()` / `saveShipment()` / `getShipment()` و`GET /api/v1/delivery/accuratess/status` للتحقق.
يُرسل الطلب عبر `saveShipment` مع `refNumber` و`notes` متضمّنة `source_page` / اسم الصفحة ورقم الطلب.

## تتبع الصفحات (Multi-page)

- إنشاء صفحة من الإدارة → رابط فريد: `STORE_URL/?page={publicCode}`
- رابط مختصر: `APP_URL/r/{publicCode}` (أو `/r/{page}/{agent}`)
- المتجر يحفظ المصدر في localStorage ويربطه عند Checkout
- الطلب اليدوي يتطلب اختيار الصفحة
- فلتر الطلبات والتقارير: `GET /reports/by-page`

## سياسة الأسعار (Pricing)

- **سعر البيع (retailPrice):** يظهر لجميع الأدوار المخوّلة برؤية المنتجات.
- **سعر الجملة (wholesalePrice):** للمالك الرئيسي فقط (`super_admin`). يُحذف من استجابة API لأي دور آخر، ولا يُقبل عند الإنشاء/التعديل إلا من المالك.
- **سعر التكلفة (costPrice):** للإدارة والمخزن والصلاحيات `products.edit` / `settings.manage` (بدون إظهار الجملة لغير المالك).

## الموقع الحالي الخارجي

لم يتوفر كود موقع قديم داخل المجلد بعد. عند توفيره يُربط بنفس Store/Central API.

## تطبيقات Android و iOS

نفس Store API. البنية جاهزة في `mobile/` والتفاصيل في [MOBILE.md](./MOBILE.md).

- `GET /api/v1/mobile/bootstrap`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/mobile/devices`
