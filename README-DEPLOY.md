# دليل نشر منصة الوحدة القانونية - مصرف الرافدين

## متطلبات السيرفر

| المتطلب | الحد الأدنى | الموصى به |
|---------|------------|-----------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB | 50 GB |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| Docker | 24+ | أحدث إصدار |
| Docker Compose | v2+ | أحدث إصدار |

---

## طريقة النشر باستخدام Docker Compose (الأسرع)

### 1. تثبيت Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 2. رفع الملفات إلى السيرفر
```bash
scp -r legal-unit-platform.zip user@YOUR_SERVER_IP:/opt/
ssh user@YOUR_SERVER_IP
cd /opt && unzip legal-unit-platform.zip && cd legal-unit-platform
```

### 3. إعداد متغيرات البيئة
```bash
cp env.template .env
nano .env   # عدّل القيم المطلوبة
```

**القيم الإلزامية التي يجب تغييرها:**
- `JWT_SECRET` — سلسلة عشوائية طويلة (32 حرف على الأقل)
- `MYSQL_ROOT_PASSWORD` — كلمة مرور قوية لقاعدة البيانات
- `MYSQL_PASSWORD` — كلمة مرور مستخدم قاعدة البيانات
- `VITE_APP_ID` — معرّف تطبيق Manus OAuth
- `OAUTH_SERVER_URL` — عنوان خادم Manus OAuth
- `BUILT_IN_FORGE_API_KEY` — مفتاح Manus Storage API

### 4. تشغيل التطبيق
```bash
docker compose up -d --build
```

### 5. تشغيل migrations قاعدة البيانات (أول مرة فقط)
```bash
docker compose exec app node -e "
const { drizzle } = require('drizzle-orm/mysql2');
const mysql = require('mysql2/promise');
// يتم تشغيل migrations تلقائياً عند بدء التطبيق
console.log('Migrations applied automatically on startup');
"
```

### 6. التحقق من التشغيل
```bash
docker compose ps
docker compose logs -f app
```

---

## طريقة النشر اليدوي (بدون Docker)

### المتطلبات
```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm

# MySQL 8
sudo apt install -y mysql-server
```

### خطوات التثبيت
```bash
cd legal-unit-platform

# تثبيت الاعتماديات
pnpm install --prod

# بناء التطبيق
pnpm build

# إعداد قاعدة البيانات
mysql -u root -p -e "CREATE DATABASE legal_unit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'rafidain'@'localhost' IDENTIFIED BY 'Rafidain@2024';"
mysql -u root -p -e "GRANT ALL ON legal_unit.* TO 'rafidain'@'localhost';"

# تشغيل التطبيق
NODE_ENV=production node dist/index.js
```

### تشغيل كـ Service (systemd)
```bash
sudo nano /etc/systemd/system/legal-unit.service
```

```ini
[Unit]
Description=Legal Unit Platform - Rafidain Bank
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/legal-unit-platform
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/legal-unit-platform/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable legal-unit
sudo systemctl start legal-unit
```

---

## إعداد Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

---

## النسخ الاحتياطي لقاعدة البيانات

```bash
# نسخ احتياطي يومي تلقائي
echo "0 2 * * * mysqldump -u rafidain -pRafidain@2024 legal_unit > /backup/legal_unit_\$(date +\%Y\%m\%d).sql" | crontab -
```

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| التطبيق لا يبدأ | تحقق من `docker compose logs app` |
| خطأ في قاعدة البيانات | تحقق من `DATABASE_URL` في ملف `.env` |
| صفحة بيضاء | تأكد من بناء التطبيق بـ `pnpm build` |
| خطأ 502 | تأكد من أن التطبيق يعمل على المنفذ 3000 |

---

## الدعم الفني

للاستفسارات التقنية، تواصل مع فريق الوحدة القانونية لمصرف الرافدين.
