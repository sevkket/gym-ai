# ============================================================================
# KUVVET.AI - BACKEND API
# ============================================================================
# Bu dosya spor salonu uygulamasının tüm API uç noktalarını içerir:
#   - Kullanıcı oturumu (kayıt, giriş, ben kimim)
#   - Yapay zeka araçları (antrenman, beslenme, vücut analizi, sohbet)
#   - Plan geçmişi (liste, detay)
#   - Antrenman ilerleme takibi (ekle, listele, sil)
#
# Teknolojiler:
#   - FastAPI   -> Asenkron HTTP sunucusu
#   - Motor     -> MongoDB için asenkron sürücü
#   - JWT       -> Token tabanlı kimlik doğrulama
#   - bcrypt    -> Parola şifreleme
#   - GPT-5.2   -> Yapay zeka içerik üretimi (emergentintegrations kütüphanesi)
# ============================================================================

from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
from pathlib import Path
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional

# Yapay zeka sohbet kütüphanesi (GPT-5.2 için)
from emergentintegrations.llm.chat import LlmChat, UserMessage

# .env dosyasını yükle (MONGO_URL, JWT_SECRET vb. değişkenler buradan gelir)
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Ortam değişkenleri - eksikse uygulama başlamaz (fail-fast)
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
JWT_SECRET = os.environ['JWT_SECRET']

# JWT token ayarları
JWT_ALGO = "HS256"        # Kullanılan şifreleme algoritması
JWT_EXPIRE_HOURS = 24 * 7 # Token geçerlilik süresi: 7 gün

# MongoDB bağlantısı
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# FastAPI uygulaması - tüm uç noktalar /api/ ön ekiyle sunulur
app = FastAPI(title="Kuvvet AI API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()  # Authorization: Bearer <token> başlığını okur

# Log ayarları
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============================================================================
# VERİ MODELLERİ (Pydantic)
# ============================================================================
# Gelen/giden JSON verilerinin şemasını ve doğrulamasını tanımlar.
# ============================================================================

# Kayıt olma isteği
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str

# Giriş isteği
class LoginInput(BaseModel):
    email: EmailStr
    password: str

# Giriş/kayıt başarılı cevabı
class AuthResponse(BaseModel):
    token: str
    user: dict

# Antrenman programı oluşturma isteği
class WorkoutInput(BaseModel):
    goal: str           # Kullanıcının hedefi: kilo verme, kas yapma, genel form...
    level: str          # Seviye: başlangıç, orta, ileri
    days_per_week: int  # Haftada kaç gün antrenman
    equipment: str      # Ekipman durumu: ev, spor salonu, minimum
    notes: Optional[str] = ""  # Sakatlık veya ek notlar (opsiyonel)

# Beslenme planı oluşturma isteği
class DietInput(BaseModel):
    goal: str           # Hedef: kilo verme, kas yapma vb.
    age: int            # Yaş
    weight: float       # Kilo (kg)
    height: float       # Boy (cm)
    gender: str         # Cinsiyet
    activity: str       # Günlük aktivite seviyesi
    restrictions: Optional[str] = ""  # Alerji/diyet kısıtlamaları

# Vücut analizi isteği
class BodyAnalysisInput(BaseModel):
    age: int
    gender: str
    weight: float
    height: float
    body_fat: Optional[float] = None  # Vücut yağ oranı (opsiyonel)
    goal: str
    timeframe: str      # Hedefe ulaşma süresi: 1 ay, 3 ay, 6 ay, 1 yıl

# Sohbet mesajı isteği
class ChatInput(BaseModel):
    session_id: Optional[str] = None  # İlk mesajda boş, sonra aynı oturumu devam ettirir
    message: str

# Antrenman kaydı (ilerleme takibi)
class ProgressInput(BaseModel):
    exercise: str               # Egzersiz adı (örn: Bench Press)
    weight: float               # Ağırlık (kg)
    reps: int                   # Tekrar sayısı
    sets: int                   # Set sayısı
    notes: Optional[str] = ""   # Notlar
    date: Optional[str] = None  # Antrenman tarihi (YYYY-MM-DD), boşsa bugün kabul edilir

# İletişim formu mesajı
class ContactInput(BaseModel):
    name: str
    email: EmailStr
    category: str               # sikayet, oneri, soru, destek, diger
    subject: str
    message: str

# Admin tarafından kullanıcı şifresi sıfırlama isteği
class AdminResetPasswordInput(BaseModel):
    new_password: str


# ============================================================================
# YARDIMCI FONKSİYONLAR - PAROLA VE TOKEN
# ============================================================================

# Düz metin parolayı bcrypt ile şifreler (tek yönlü hash)
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

# Düz metin parolanın, kayıttaki hash ile eşleşip eşleşmediğini kontrol eder
def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

# Kullanıcı ID'si içeren bir JWT token üretir. Token 7 gün geçerlidir.
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

# FastAPI Depends olarak kullanılır: Authorization başlığındaki token'ı
# doğrular ve ilgili kullanıcının bilgilerini döner. Geçersizse 401 döner.
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    # Parola alanını cevaba eklememek için projection ile _id ve password hariç tutulur
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    return user


# Sadece admin rolündeki kullanıcılar için koruma
async def get_current_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için admin yetkisi gerekir")
    return user


# Uygulama açılırken çalışır - sabit admin hesaplarını oluşturur
@app.on_event("startup")
async def admin_hesap_olustur():
    admin_hesaplari = [
        {"name": "Yunus Emre", "email": "yunusemre@kuvvet.ai", "password": "admin1234"},
        {"name": "Admin", "email": "admin@kuvvet.ai", "password": "admin1234"},
    ]
    for hesap in admin_hesaplari:
        varMi = await db.users.find_one({"email": hesap["email"]})
        if not varMi:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "name": hesap["name"],
                "email": hesap["email"],
                "password": hash_password(hesap["password"]),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Admin hesabı oluşturuldu: {hesap['email']}")


# ============================================================================
# YAPAY ZEKA YARDIMCISI
# ============================================================================
# emergentintegrations kütüphanesi ile GPT-5.2'ye istek atar.
# session_id ile sohbet geçmişi kütüphane tarafında saklanır.
# system_msg -> AI'ya rolünü ve tonunu anlatan sistem mesajı
# user_msg   -> Kullanıcıdan gelen gerçek prompt
# ============================================================================
async def ai_generate(session_id: str, system_msg: str, user_msg: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_msg,
    ).with_model("openai", "gpt-5.2")
    resp = await chat.send_message(UserMessage(text=user_msg))
    return resp


# ============================================================================
# UÇ NOKTALAR (API ROUTES)
# ============================================================================

# Sağlık kontrolü - API çalışıyor mu diye bakmak için
@api_router.get("/")
async def root():
    return {"message": "Kuvvet AI API çalışıyor", "status": "ok"}


# Yeni kullanıcı kaydı - e-posta tekil olmalı, parola bcrypt ile şifrelenir
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: RegisterInput):
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": data.name,
        "email": data.email.lower(),
        "password": hash_password(data.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id)
    return AuthResponse(token=token, user={"id": user_id, "name": data.name, "email": data.email.lower(), "role": "user"})


# Giriş - e-posta ve parola doğrulama, başarılıysa JWT token döner
@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: LoginInput):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    token = create_token(user["id"])
    return AuthResponse(
        token=token,
        user={"id": user["id"], "name": user["name"], "email": user["email"], "role": user.get("role", "user")},
    )


# Geçerli token sahibinin bilgilerini döner (ön yüzde oturum kontrolü için)
@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# Antrenman programı oluştur - kullanıcı girdilerini GPT-5.2'ye prompt olarak
# gönderir, AI'dan gelen markdown formatındaki cevabı veritabanına kaydeder.
@api_router.post("/ai/workout")
async def generate_workout(data: WorkoutInput, user=Depends(get_current_user)):
    # Sistem mesajı - AI'nın rolünü ve beklenen çıktı formatını belirtir
    sys = ("Sen profesyonel bir fitness koçusun. Kullanıcıya Türkçe, detaylı, "
           "haftalık antrenman programı oluştur. Her gün için egzersiz adı, set, "
           "tekrar, dinlenme süresi ve kısa teknik ipuçları ver. Markdown başlıkları kullan.")
    # Kullanıcı mesajı - form girdileri metne dönüştürülerek prompt olarak gönderilir
    prompt = (f"Hedef: {data.goal}\nSeviye: {data.level}\n"
              f"Haftada {data.days_per_week} gün antrenman\nEkipman: {data.equipment}\n"
              f"Ek notlar: {data.notes or '-'}\n\nHaftalık detaylı antrenman planı hazırla.")
    session_id = f"workout-{user['id']}-{uuid.uuid4().hex[:8]}"
    content = await ai_generate(session_id, sys, prompt)
    # Planı veritabanına kaydet (kullanıcı sonradan Profil'den görebilir)
    plan = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "workout",
        "input": data.model_dump(),
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.plans.insert_one(plan.copy())
    plan.pop("_id", None)  # Motor, _id alanını dict'e ekler; cevaba eklememek için siliyoruz
    return plan


# Beslenme planı oluştur - 7 günlük detaylı plan, makrolar ve kalori dahil
@api_router.post("/ai/diet")
async def generate_diet(data: DietInput, user=Depends(get_current_user)):
    sys = ("Sen deneyimli bir diyetisyensin. Türkçe, detaylı, günlük beslenme planı "
           "oluştur. Öğünler, makro besinler (protein/karb/yağ), kalori hesabı ve "
           "alternatif önerileri içer. Markdown kullan.")
    prompt = (f"Hedef: {data.goal}\nYaş: {data.age}, Cinsiyet: {data.gender}\n"
              f"Kilo: {data.weight}kg, Boy: {data.height}cm\n"
              f"Aktivite seviyesi: {data.activity}\n"
              f"Kısıtlamalar/alerjiler: {data.restrictions or '-'}\n\n"
              "7 günlük detaylı beslenme planı hazırla.")
    session_id = f"diet-{user['id']}-{uuid.uuid4().hex[:8]}"
    content = await ai_generate(session_id, sys, prompt)
    plan = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "diet",
        "input": data.model_dump(),
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.plans.insert_one(plan.copy())
    plan.pop("_id", None)
    return plan


# Vücut analizi - BMI sunucuda hesaplanır, AI yorum yapar
@api_router.post("/ai/body-analysis")
async def body_analysis(data: BodyAnalysisInput, user=Depends(get_current_user)):
    # BMI formülü: kilo / (boy_metre^2)
    bmi = round(data.weight / ((data.height / 100) ** 2), 1)
    sys = ("Sen fitness ve sağlık uzmanısın. Kullanıcının ölçülerine göre Türkçe, "
           "kısa ve motive edici bir vücut analizi yap. BMI yorumu, hedefe ulaşmak "
           "için haftalık adım adım öneri, olası riskler ve gerçekçi beklentileri yaz. "
           "Markdown kullan.")
    prompt = (f"Yaş: {data.age}, Cinsiyet: {data.gender}\n"
              f"Kilo: {data.weight}kg, Boy: {data.height}cm, BMI: {bmi}\n"
              f"Vücut yağ oranı: {data.body_fat if data.body_fat is not None else 'bilinmiyor'}\n"
              f"Hedef: {data.goal}\nSüre: {data.timeframe}\n\nVücut analizi ve yol haritası hazırla.")
    session_id = f"body-{user['id']}-{uuid.uuid4().hex[:8]}"
    content = await ai_generate(session_id, sys, prompt)
    plan = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "body_analysis",
        "input": {**data.model_dump(), "bmi": bmi},
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.plans.insert_one(plan.copy())
    plan.pop("_id", None)
    return plan


# Sohbet koçu - kullanıcı mesajı gönderir, AI cevap verir.
# Aynı session_id ile devam edildiğinde AI geçmişi hatırlar.
@api_router.post("/ai/chat")
async def ai_chat(data: ChatInput, user=Depends(get_current_user)):
    # İlk mesajsa yeni oturum oluştur, değilse mevcut oturumu kullan
    session_id = data.session_id or f"chat-{user['id']}-{uuid.uuid4().hex[:8]}"
    sys = ("Sen Kuvvet AI spor salonunun samimi, motive edici Türkçe spor koçusun. "
           "Kullanıcının sorularını kısa ve net yanıtla. Antrenman, beslenme, "
           "motivasyon ve toparlanma konularında uzman öneriler ver.")
    content = await ai_generate(session_id, sys, data.message)

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id, "role": "user", "content": data.message, "created_at": now},
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id, "role": "assistant", "content": content, "created_at": now},
    ])
    return {"session_id": session_id, "reply": content}


# Bir sohbet oturumunun tüm mesaj geçmişini getirir (en eskiden en yeniye)
@api_router.get("/ai/chat/{session_id}")
async def chat_history(session_id: str, user=Depends(get_current_user)):
    msgs = await db.chat_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return msgs


# Kullanıcının tüm planlarını en yeniden en eskiye sıralı döner
@api_router.get("/plans")
async def list_plans(user=Depends(get_current_user)):
    plans = await db.plans.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return plans


# Belirli bir plana göre detay getirir. Başka kullanıcının planı getirilemez.
@api_router.get("/plans/{plan_id}")
async def get_plan(plan_id: str, user=Depends(get_current_user)):
    plan = await db.plans.find_one({"id": plan_id, "user_id": user["id"]}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan bulunamadı")
    return plan


# ============================================================================
# ANTRENMAN İLERLEME TAKİBİ
# ============================================================================
# Kullanıcı egzersiz, ağırlık, tekrar, set bilgilerini kaydeder.
# Zaman içindeki gelişimi takip etmek ve kişisel rekorları görmek için kullanılır.
# ============================================================================

# Yeni antrenman kaydı ekle
@api_router.post("/progress")
async def log_progress(data: ProgressInput, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "exercise": data.exercise,
        "weight": data.weight,
        "reps": data.reps,
        "sets": data.sets,
        "notes": data.notes or "",
        "date": data.date or now.date().isoformat(),  # Tarih boşsa bugünü kullan
        "created_at": now.isoformat(),
    }
    await db.workout_logs.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


# Kullanıcının tüm antrenman kayıtlarını listeler (en yeniden en eskiye)
@api_router.get("/progress")
async def list_progress(user=Depends(get_current_user)):
    logs = await db.workout_logs.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return logs


# Belirli bir antrenman kaydını siler (sadece kayıt sahibi silebilir)
@api_router.delete("/progress/{log_id}")
async def delete_progress(log_id: str, user=Depends(get_current_user)):
    res = await db.workout_logs.delete_one({"id": log_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"ok": True}


# ============================================================================
# İLETİŞİM FORMU
# ============================================================================
# Kullanıcılar şikayet, öneri, soru veya destek mesajı gönderir.
# Mesajlar veritabanında saklanır ve admin panelinden incelenir.
# ============================================================================

@api_router.post("/contact")
async def iletisim_gonder(data: ContactInput):
    # İzin verilen kategoriler - admin panelinde filtrelemek için kullanılır
    kategoriler = {"sikayet", "oneri", "soru", "destek", "diger"}
    if data.category not in kategoriler:
        raise HTTPException(status_code=400, detail="Geçersiz kategori")
    mesaj = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "email": data.email.lower(),
        "category": data.category,
        "subject": data.subject,
        "message": data.message,
        "is_read": False,  # Admin okuyunca True yapılır
        "replied": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contact_messages.insert_one(mesaj.copy())
    mesaj.pop("_id", None)
    return {"ok": True, "id": mesaj["id"]}


# ============================================================================
# ADMİN UÇ NOKTALARI
# ============================================================================
# Hepsi get_current_admin ile korunur - sadece role == "admin" olan kullanıcılar
# erişebilir. Admin panelinde kullanıcılar, planlar ve iletişim mesajları
# detaylı incelenebilir.
# ============================================================================

# Admin panel özet istatistikleri
@api_router.get("/admin/stats")
async def admin_stats(admin=Depends(get_current_admin)):
    toplam_kullanici = await db.users.count_documents({"role": {"$ne": "admin"}})
    toplam_plan = await db.plans.count_documents({})
    toplam_ilerleme = await db.workout_logs.count_documents({})
    okunmamis_mesaj = await db.contact_messages.count_documents({"is_read": False})
    toplam_mesaj = await db.contact_messages.count_documents({})
    return {
        "toplam_kullanici": toplam_kullanici,
        "toplam_plan": toplam_plan,
        "toplam_ilerleme": toplam_ilerleme,
        "okunmamis_mesaj": okunmamis_mesaj,
        "toplam_mesaj": toplam_mesaj,
    }


# Tüm kullanıcıları listele - her biri için plan/ilerleme sayısı ile beraber
@api_router.get("/admin/users")
async def admin_users(admin=Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for u in users:
        u["plan_count"] = await db.plans.count_documents({"user_id": u["id"]})
        u["progress_count"] = await db.workout_logs.count_documents({"user_id": u["id"]})
        # Şifre hash'i gösterilir ama orijinal şifre güvenlik nedeniyle geri getirilemez
        # (bcrypt tek yönlü bir algoritmadır - hash'ten düz metin çözülemez)
        u["password_hash"] = u.pop("password", "")[:40] + "..."
    return users


# Belirli bir kullanıcının tüm detaylarını getir (planlar, ilerleme, sohbet sayısı)
@api_router.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, admin=Depends(get_current_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    plans = await db.plans.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    progress = await db.workout_logs.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    chat_count = await db.chat_messages.count_documents({"user_id": user_id})
    u["password_hash"] = u.pop("password", "")
    return {"user": u, "plans": plans, "progress": progress, "chat_count": chat_count}


# Admin bir kullanıcıyı siler (adminleri silemez - güvenlik)
@api_router.delete("/admin/users/{user_id}")
async def admin_user_delete(user_id: str, admin=Depends(get_current_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if u.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin hesapları silinemez")
    # Kullanıcıya ait tüm veriler de temizlenir (plan, ilerleme, sohbet)
    await db.users.delete_one({"id": user_id})
    await db.plans.delete_many({"user_id": user_id})
    await db.workout_logs.delete_many({"user_id": user_id})
    await db.chat_messages.delete_many({"user_id": user_id})
    return {"ok": True}


# Admin bir kullanıcının şifresini sıfırlar (yeni hash oluşturulur)
@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, data: AdminResetPasswordInput, admin=Depends(get_current_admin)):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalı")
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {"password": hash_password(data.new_password)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"ok": True}


# İletişim mesajlarını listele - opsiyonel kategori filtresi ile
@api_router.get("/admin/contact")
async def admin_contact_list(category: Optional[str] = None, admin=Depends(get_current_admin)):
    q = {}
    if category:
        q["category"] = category
    msgs = await db.contact_messages.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return msgs


# Bir mesajı okundu veya cevaplandı olarak işaretle
@api_router.patch("/admin/contact/{msg_id}")
async def admin_contact_update(msg_id: str, is_read: Optional[bool] = None, replied: Optional[bool] = None, admin=Depends(get_current_admin)):
    guncelle = {}
    if is_read is not None:
        guncelle["is_read"] = is_read
    if replied is not None:
        guncelle["replied"] = replied
    if guncelle:
        await db.contact_messages.update_one({"id": msg_id}, {"$set": guncelle})
    return {"ok": True}


# Admin mesaja yanıt yazar - yanıt metni mesaja kaydedilir ve replied=True olur
class AdminReplyInput(BaseModel):
    reply: str

@api_router.post("/admin/contact/{msg_id}/reply")
async def admin_contact_reply(msg_id: str, data: AdminReplyInput, admin=Depends(get_current_admin)):
    if not data.reply.strip():
        raise HTTPException(status_code=400, detail="Yanıt boş olamaz")
    res = await db.contact_messages.update_one(
        {"id": msg_id},
        {"$set": {
            "replied": True,
            "is_read": True,
            "admin_reply": data.reply,
            "replied_at": datetime.now(timezone.utc).isoformat(),
            "replied_by": admin["name"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mesaj bulunamadı")
    return {"ok": True}


# Mesajı sil
@api_router.delete("/admin/contact/{msg_id}")
async def admin_contact_delete(msg_id: str, admin=Depends(get_current_admin)):
    await db.contact_messages.delete_one({"id": msg_id})
    return {"ok": True}


# ============================================================================
# UYGULAMA KURULUMU
# ============================================================================

# Router'ı ana uygulamaya bağla (tüm uç noktalar /api/ ön ekiyle sunulur)
app.include_router(api_router)

# CORS ayarları - ön yüz farklı bir domain'de olduğu için gerekli
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uygulama kapanırken MongoDB bağlantısını düzgünce kapat
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
