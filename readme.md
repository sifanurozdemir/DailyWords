# 📘 DailyWords - Proje Kurulum ve Çalıştırma Rehberi

Bu rehber, projenin hem Backend hem de Frontend kısımlarını sıfırdan kurup çalıştırmanız için hazırlanmıştır.

---

## 🛠️ 1. Ön Hazırlık: Gerekli Programlar

Projeyi başlatmadan önce şu araçların bilgisayarınızda kurulu olduğundan emin olun:

* VS Code (Kod düzenleyici)
* Python 3.10+ (Kurulumda "Add Python to PATH" işaretlenmelidir)
* Node.js LTS (Frontend motoru için şarttır)
* PostgreSQL & pgAdmin 4 (Veritabanı yönetimi)
* Git (Versiyon kontrolü)
* Expo Go (Telefonunuza indirilmiş olmalıdır)

---

## 🚀 2. Aşama: Backend (Sunucu) Kurulumu

Yeni bir terminal açın. Şu an ana klasördesiniz (DailyWords-Repo/).

### 2.1. Klasör Seçimi ve Sanal Ortam

Önce backend klasörüne girmeli ve izole bir çalışma alanı oluşturmalısınız:

```bash
cd backend
```

Şu an DailyWords-Repo/backend klasöründesiniz.

Sanal ortamı oluşturun:

```bash
python -m venv venv
```

Sanal ortamı aktif edin (Windows):

```bash
.\venv\Scripts\activate
```

---

### 2.2. Kütüphane Kurulumu

Konum: DailyWords-Repo/backend klasöründe olduğunuzdan emin olun.

```bash
pip install -r requirements.txt
```

---

### 2.3. Veritabanı ve .env Yapılandırması

* pgAdmin'de `dailywords_db` adında bir veritabanı oluşturun.
* DailyWords-Repo/backend klasöründeki `.env.example` dosyasını kopyalayıp adını `.env` yapın.
* `.env` içindeki kullanıcı adı ve şifre kısımlarını kendi bilgilerinizle doldurun.

---

### 2.4. Veritabanını Doldurma (Seed)

Konum: DailyWords-Repo/backend

```bash
python seed.py
```

---

### 2.5. Backend Sunucusunu Başlatma

Konum: DailyWords-Repo/backend

```bash
.\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 📱 3. Aşama: Frontend (Mobil Uygulama) Kurulumu

İkinci bir terminal açın. Şu an ana klasördesiniz (DailyWords-Repo/).

---

### 3.1. Klasör Seçimi ve Yükleme

```bash
cd frontend
```

Şu an DailyWords-Repo/frontend klasöründesiniz.

```bash
npm install
```

---

### 3.2. IP Adresi Ayarı (Çok Önemli)

Telefonun backend'e bağlanması için bilgisayarınızın yerel IP'sini girmelisiniz:

* Yeni bir terminale `ipconfig` yazın ve IPv4 Address (Örn: 192.168.1.x) değerini kopyalayın.
* `DailyWords-Repo\frontend\src\api\client.js` dosyasını açın.
* `baseURL` kısmına kendi IP'nizi yazın:

```javascript
baseURL: "http://192.168.x.x:8000"
```

---

### 3.3. Uygulamayı Başlatma

Konum: DailyWords-Repo/frontend

```bash
npx expo start
```

Terminaldeki QR kodu telefonunuzdaki Expo Go uygulamasıyla taratın.
