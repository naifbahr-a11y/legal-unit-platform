# نشر منصة الوحدة القانونية من ملف ZIP

## المتطلبات على السيرفر

- Ubuntu 20.04+ (أو أي Linux يدعم Docker)
- Docker 24+ و Docker Compose v2
- 2 GB RAM على الأقل (4 GB موصى به)
- منفذ 3000 (أو 80 مع Nginx)

---

## خطوات النشر

### 1) رفع وفك الضغط

```bash
# على السيرفر
sudo mkdir -p /opt/legal-unit-platform
sudo chown -R $USER:$USER /opt/legal-unit-platform
cd /opt/legal-unit-platform

# ارفع legal-unit-platform.zip ثم:
unzip legal-unit-platform.zip -d /opt/legal-unit-platform
# أو إذا كان المجلد داخل zip:
# unzip legal-unit-platform.zip && mv legal-unit-platform/* .
```

### 2) إعداد ملف البيئة

```bash
cp env.template .env
nano .env
```

**غيّر هذه القيم إلزامياً:**

- `JWT_SECRET` — سلسلة عشوائية طويلة (32+ حرف)
- `MYSQL_ROOT_PASSWORD` — كلمة مرور root لقاعدة البيانات
- `MYSQL_PASSWORD` — كلمة مرور مستخدم قاعدة البيانات
- `DATABASE_URL` — يجب أن تطابق كلمة مرور MySQL (مشفّرة في الرابط)

مثال `DATABASE_URL` (إذا كانت كلمة المرور `Rafidain@2024`):

```
DATABASE_URL=mysql://rafidain:Rafidain%402024@db:3306/legal_unit
```

### 3) تشغيل التطبيق

```bash
docker compose up -d --build
```

انتظر 3–10 دقائق للبناء الأول.

### 4) التحقق

```bash
docker compose ps
docker compose logs -f app
curl http://localhost:3000/api/health
```

يجب أن ترى: `{"ok":true,"status":"healthy"}`

### 5) الدخول

- الرابط: `http://IP-SERVER:3000`
- المستخدم الافتراضي: `nayef`
- كلمة المرور: `admin1987`
- **غيّر كلمة المرور فوراً بعد الدخول**

---

## Nginx (اختياري — المنفذ 80)

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/legal-unit
```

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/legal-unit /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| صفحة بيضاء | `docker compose logs app` — تأكد من اكتمال البناء |
| خطأ قاعدة البيانات | تحقق من `DATABASE_URL` و `.env` |
| 502 Bad Gateway | التطبيق لم يبدأ — `docker compose restart app` |

---

## النسخ الاحتياطي

```bash
docker compose exec db mysqldump -u rafidain -p legal_unit > backup.sql
```
