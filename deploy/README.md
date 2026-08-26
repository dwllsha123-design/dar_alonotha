# نشر دار الأنوثة على VPS

المتجر `/` · الإدارة `/admin` · API `/api/v1`  
مناسب لسيرفر **1 vCPU / 2GB RAM** (SQLite — بدون حاوية قاعدة بيانات منفصلة).

الدليل المختصر في الجذر: [README.md](../README.md).

## قبل أي شيء على سيرفر 2GB

فعّل **Swap 2GB** (انظر README الجذر) ثم ثبّت Docker.

```bash
cp ../.env.example .env   # من داخل مجلد deploy/
# أو من جذر المشروع:
# cp .env.example deploy/.env
nano .env   # عدّل النطاق و JWT_SECRET
```

## Docker (موصى به)

من جذر المشروع:

```bash
docker compose up -d --build
curl -s http://127.0.0.1/api/v1/health
```

حدود الذاكرة مضبوطة في `docker-compose.yml`:

- `api` ≈ 512MB
- `web` (Nginx) ≈ 64MB

### Nginx → API upstream

- Compose يضبط `API_UPSTREAM=api:3000` لخدمة `web`.
- على Railway اضبط متغير الخدمة (web/nginx):
  - `API_UPSTREAM=backend.railway.internal:3000`  
    (استبدل `backend` باسم خدمة الـ Nest الفعلية في المشروع إن اختلف)
  - تأكد أن Private Networking مفعّل بين خدمتَي web و backend.
  - **لا تضبطي PORT=443** ولا SSL داخل الحاوية: Railway ينهي HTTPS على الحافة ويحوّل HTTP إلى `$PORT` داخل Nginx.
  - Nginx يعيد توجيه `http://` → `https://` عندما يرسل Railway `X-Forwarded-Proto: http`، مع رأس HSTS.
  - Health check مقترح للخدمة web: مسار `/healthz`

بعد أول دخول غيّر كلمة سر المدير واضبط `ALLOW_SEED=false`.

## بدون Docker — Node + Nginx + PM2

```bash
sudo mkdir -p /opt/dar-alunotha /var/www/dar-alunotha
# ارفع المشروع إلى /opt/dar-alunotha
cd /opt/dar-alunotha/backend
cp ../deploy/.env.example .env
# DATABASE_URL="file:./prod.db"
npm ci
npx prisma generate
npx prisma migrate deploy
NODE_ENV=production ALLOW_SEED=true npm run prisma:seed
npm run build

cd ../admin
VITE_API_URL=/api/v1 VITE_BASE=/admin/ npm ci && npm run build
sudo mkdir -p /var/www/dar-alunotha/admin
sudo cp -r dist/* /var/www/dar-alunotha/admin/

cd ../storefront
VITE_API_URL=/api/v1 npm ci && npm run build
sudo cp -r dist/* /var/www/dar-alunotha/

sudo cp /opt/dar-alunotha/deploy/nginx.host.conf /etc/nginx/sites-available/dar-alunotha
sudo ln -sf /etc/nginx/sites-available/dar-alunotha /etc/nginx/sites-enabled/dar-alunotha
sudo nginx -t && sudo systemctl reload nginx

cd /opt/dar-alunotha
npx pm2 start deploy/ecosystem.config.cjs
npx pm2 save && npx pm2 startup
```

PM2 يحدّ الذاكرة (~450MB) عبر `ecosystem.config.cjs`.

## بعد الإطلاق

1. `https://YOUR-DOMAIN/admin` — غيّر كلمة السر
2. جرّب طلباً من المتجر ورفع صورة
3. جدولة `deploy/backup.sh` يومياً
