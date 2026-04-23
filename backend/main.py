import os
import shutil
import math
import random
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy import or_
import bcrypt
from Levenshtein import distance as lev_distance, ratio as lev_ratio
from phonemizer.backend import EspeakBackend
import whisper

import models
from database import engine, SessionLocal
import services.acoustic_analysis as aa
from datetime import datetime, timedelta, date
from sqlalchemy import text
import google.generativeai as genai
import json




# --- SİSTEM AYARLARI ---
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = r'C:\Program Files\eSpeak NG\libespeak-ng.dll'
os.environ['PHONEMIZER_ESPEAK_PATH'] = r'C:\Program Files\eSpeak NG'

models.Base.metadata.create_all(bind=engine)

# Mevcut veritabanına yeni kolonları ekleme yaması (Eğer kolonlar yoksa)
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN streak_count INTEGER DEFAULT 0"))
        if hasattr(conn, 'commit'): conn.commit()
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN last_study_date TIMESTAMP"))
        if hasattr(conn, 'commit'): conn.commit()
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN highest_combo INTEGER DEFAULT 0"))
        if hasattr(conn, 'commit'): conn.commit()
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN penalty_total_xp INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE users ADD COLUMN penalty_high_score INTEGER DEFAULT 0"))
        if hasattr(conn, 'commit'): conn.commit()
except Exception:
    pass

app = FastAPI(title="DailyWords AI Backend")

# --- CORS AYARLARI ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- KLASÖR AYARLARI ---
audio_path = os.path.join(os.getcwd(), "assets", "audio")
if not os.path.exists(audio_path):
    os.makedirs(audio_path)
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

# --- MODEL VE MOTOR YÜKLEME ---
print("Yapay zeka modeli yükleniyor, lütfen bekleyin...")
model = whisper.load_model("base")
print("Model başarıyla yüklendi!")

# pwd_context kaldırıldı, bcrypt kullanılacak

try:
    global_backend = EspeakBackend('en-us')
except Exception as e:
    print(f"UYARI: Espeak motoru başlatılamadı: {e}")
    global_backend = None

# --- BAĞIMLILIKLAR ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- EXPERT SYSTEM / HATA SÖZLÜĞÜ (ELSA SPEAK MANTIĞI) ---
def generate_elsa_feedback(target_ipa: str, user_ipa: str, dtw_message: str, dtw_score: float) -> str:
    """Hedef IPA ve Kullanıcı IPA'sını karşılaştırıp ELSA Speak tarzında noktasal telaffuz tüyoları verir."""
    if dtw_score >= 85:
        return "Tıpkı ana dili İngilizce olan biri gibi konuştun! Mükemmel!"
    
    # Türklerin en sık yaptığı İngilizce telaffuz hataları için uzman kuralları
    feedback = ""
    target = target_ipa.lower()
    user = user_ipa.lower()
    
    if 'θ' in target and ('t' in user or 's' in user or 'θ' not in user):
        feedback += "İpucu: Peltek 'th' (θ) sesi yerine 't' veya 's' çıkardın. Dilini hafifçe üst ve alt dişlerinin arasına yerleştirip nefes vererek üfle.\n\n"
    elif 'ð' in target and ('d' in user or 'z' in user or 'ð' not in user):
        feedback += "İpucu: 'th' (ð) sesi yerine 'd' veya 'z' dedin. Dilinin ucunu dişlerinin arasına hafifçe bastır ve (arı vızıltısı gibi) titreterek ses çıkar.\n\n"
    elif 'æ' in target and 'e' in user:
        feedback += "İpucu: Açık 'a' (æ) sesini genizden 'e' gibi okudun. Çeneni biraz daha aşağı düşür ve dudaklarını yanlara doğru açarak (gülümser gibi) geniş bir 'a' de.\n\n"
    elif 'v' in target and 'w' in user:
        feedback += "İpucu: 'v' sesini söylerken dudaklarını 'u' gibi yuvarlama. Üst dişlerini alt dudağına hafifçe dokundurarak titreşimi hisset.\n\n"
    elif 'w' in target and 'v' in user:
        feedback += "İpucu: 'w' sesini dudaklarını 'v' gibi ısırarak değil, dudaklarını küçültüp yuvarlayarak (ıslık çalar gibi) çıkarmalısın.\n\n"
    elif 'r' in target and ('l' in user or 'r' not in user):
        feedback += "İpucu: İngilizcedeki 'r' sesinin vurgusu eksikti. Dilini arkaya, damağına doğru kıvır ancak kesinlikle damağına değdirme.\n\n"
    
    # Eğer özel bir IPA hatası yakalanmadıysa DTW'nin ritim teşhisini ilet
    if feedback == "":
        return f"{dtw_message} Vurguya ve ritme biraz daha dikkat edersen kusursuz olacak!"
    
    # IPA hatası bulunduysa, akustik analizin zamanlama hatasını da kibarca birleştir
    return feedback.strip() + f" Ek analiz: {dtw_message.lower()}"

# --- ANA ENDPOINT'LER ---

@app.get("/")
def read_root():
    return {"message": "DailyWords Backend Çalışıyor ve Telaffuz Analizine Hazır!"}

# --- KULLANICI YÖNETİMİ ---

# JSON Body için Model Tanımlaması
class AuthRequest(BaseModel):
    username: str
    password: str

@app.post("/register")
def register(request: AuthRequest, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == request.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")
    
    hashed_pw = bcrypt.hashpw(request.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    new_user = models.User(
        username=request.username, 
        hashed_password=hashed_pw,
        current_level=None
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "success", "user_id": new_user.id, "message": "Kayıt başarılı."}

@app.post("/login")
def login(request: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    try:
        is_password_correct = bcrypt.checkpw(request.password.encode('utf-8'), user.hashed_password.encode('utf-8'))
    except Exception:
        raise HTTPException(status_code=500, detail="Şifre formatı geçersiz. Lütfen yeni hesap açın.")

    if not is_password_correct:
        raise HTTPException(status_code=401, detail="Şifre hatalı")

    return {
        "status": "success",
        "user_id": user.id,
        "username": user.username,
        "current_level": user.current_level,
        "daily_goal": user.daily_goal,
        "xp": user.xp or 0,
        "highest_combo": user.highest_combo or 0,
        "penalty_total_xp": user.penalty_total_xp or 0,
        "penalty_high_score": user.penalty_high_score or 0,
        "bug_hunt_total_xp": user.bug_hunt_total_xp or 0,
        "bug_hunt_high_score": user.bug_hunt_high_score or 0,
        "needs_placement_test": user.current_level is None
    }

@app.post("/update-user-settings/")
def update_user_settings(user_id: int, detected_level: str, daily_goal: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    
    if daily_goal not in [3, 5, 10]:
        raise HTTPException(status_code=400, detail="Lütfen geçerli bir hedef seçin: 3, 5 veya 10.")

    user.current_level = detected_level.upper()
    user.daily_goal = daily_goal
    db.commit()
    return {
        "status": "success", 
        "new_level": user.current_level, 
        "daily_goal": user.daily_goal,
        "message": f"Ayarlar güncellendi. Günde {daily_goal} kelime seni bekliyor!"
    }

@app.post("/update-daily-goal/")
def update_daily_goal(user_id: int, daily_goal: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if daily_goal not in [3, 5, 10]:
        raise HTTPException(status_code=400, detail="Geçerli hedef: 3, 5 veya 10.")
    user.daily_goal = daily_goal
    db.commit()
    return {"status": "success", "daily_goal": daily_goal}

@app.get("/get-user/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    return {
        "status": "success",
        "user_id": user.id,
        "username": user.username,
        "current_level": user.current_level,
        "daily_goal": user.daily_goal,
        "streak_count": user.streak_count,
        "xp": user.xp or 0,
        "highest_combo": user.highest_combo or 0,
        "penalty_total_xp": user.penalty_total_xp or 0,
        "penalty_high_score": user.penalty_high_score or 0,
        "bug_hunt_total_xp": user.bug_hunt_total_xp or 0,
        "bug_hunt_high_score": user.bug_hunt_high_score or 0,
        "needs_placement_test": user.current_level is None
    }

# --- KELİME VE TEST SİSTEMİ ---

@app.post("/update-bughunt-stats/{user_id}")
def update_bughunt_stats(user_id: int, score: int, earned_xp: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    # Update high score
    if score > (user.bug_hunt_high_score or 0):
        user.bug_hunt_high_score = score
        
    # Add XP
    user.bug_hunt_total_xp = (user.bug_hunt_total_xp or 0) + earned_xp
    
    db.commit()
    return {"status": "success", "bug_hunt_high_score": user.bug_hunt_high_score, "bug_hunt_total_xp": user.bug_hunt_total_xp}

@app.get("/get-test-questions")
def get_test_questions(db: Session = Depends(get_db)):
    levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    questions = []
    
    for level in levels:
        # Her seviye için 20 kelime çekiyoruz
        words = db.query(models.Word).filter(models.Word.cefr_level == level).order_by(func.random()).limit(20).all()
        
        for word in words:
            # --- DÜZELTME: EZBER BOZAN SEVİYE MANTIĞI ---
            is_advanced = level != "A1" 
            
            if is_advanced and word.definition_en:
                correct_text = word.definition_en
                target_attr = "definition_en"
            else:
                correct_text = word.meaning_tr or "Anlamı"
                target_attr = "meaning_tr"

            # --- YENİ: 2 ADET YANLIŞ ŞIK SEÇİMİ ---
            wrong_words = db.query(models.Word).filter(
                models.Word.cefr_level == level, 
                models.Word.id != word.id
            ).order_by(func.random()).limit(2).all() # 1 yerine 2 kelime çekiyoruz
            
            options = [{"text": correct_text, "is_correct": True}]

            for w_word in wrong_words:
                w_text = getattr(w_word, target_attr)
                # Eğer hedef öznitelik (tanım veya anlam) boşsa fallback yapıyoruz
                if not w_text:
                    w_text = w_word.meaning_tr or "Yanlış Şık"
                
                options.append({"text": w_text, "is_correct": False})

            # Eğer veritabanında yeterli kelime yoksa ve 3 şık oluşmadıysa yedek ekle
            while len(options) < 3:
                options.append({"text": "None of the above", "is_correct": False})

            random.shuffle(options)
            
            questions.append({
                "id": word.id,
                "word_en": word.word_en,
                "level": level,
                "options": options
            })
            
    return questions

@app.get("/get-my-words/{user_id}")
def get_my_words(user_id: int, force_extra: int = 0, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.current_level:
        raise HTTPException(status_code=400, detail="Önce seviye testi yapmalısınız.")

    learned_ids = db.query(models.UserProgress.word_id).filter(
        models.UserProgress.user_id == user_id
    ).all()
    learned_ids_list = [r[0] for r in learned_ids]
    
    daily_goal = user.daily_goal or 5
    
    # Bugün öğrenilen kelime sayısını hesapla (SADECE pratik yapılanları hedefe sayıyoruz)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    learned_today_count = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.is_learned == True,
        models.UserProgress.learned_at_practice == True, # Kritik ayırım
        models.UserProgress.last_reviewed >= today_start
    ).count()
    
    remaining_goal = max(0, daily_goal - learned_today_count)
    
    # Eğer hedef dolmuşsa ve extra istenmiyorsa boş dön
    if remaining_goal == 0 and force_extra == 0:
        return {"words": [], "learned_today": learned_today_count, "daily_goal": daily_goal}

    # Eğer extra isteniyorsa (veya hedef dolmamışsa) limit belirle
    fetch_limit = force_extra if remaining_goal == 0 else remaining_goal

    words = db.query(models.Word).filter(
        models.Word.cefr_level == user.current_level,
        ~models.Word.id.in_(learned_ids_list) if learned_ids_list else True
    ).order_by(func.random()).limit(fetch_limit).all()
    
    return {
        "words": words,
        "learned_today": learned_today_count,
        "daily_goal": daily_goal
    }

@app.get("/get-review-words/{user_id}")
def get_review_words(user_id: int, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    # Gece 00:00 limitini belirliyoruz
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 1. Adım: Sadece tekrar zamanı GELMİŞ kelimeleri bul (Burası 0 dönmesinin asıl sebebidir)
    review_progress = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.is_learned == True,
        or_(
            models.UserProgress.next_review_date <= now,
            models.UserProgress.next_review_date == None # Henüz SRS algoritmasına girmemiş olanlar
        )
    ).all()
    
    if not review_progress:
        return [] # Tekrar zamanı gelmiş kelime yoksa boş dön. İstatistik bu yüzden 0!
        
    review_word_ids = [rp.word_id for rp in review_progress]
    progress_map = {rp.word_id: rp.last_reviewed for rp in review_progress}
    
    # 2. Adım: Kelimelerin İngilizce/Türkçe detaylarını getir
    words = db.query(models.Word).filter(models.Word.id.in_(review_word_ids)).all()
    
    result = []
    for w in words:
        lr = progress_map.get(w.id)
        result.append({
            "id": w.id,
            "word_en": w.word_en,
            "meaning_tr": w.meaning_tr,
            "phonetic": w.phonetic,
            "definition_en": w.definition_en,
            "definition_tr": w.definition_tr,
            "example_en": w.example_en,
            "example_tr": w.example_tr,
            "cefr_level": w.cefr_level,
            "audio_path": w.audio_path,
            # Kullanıcı bu kelimeyi bugün zaten tekrar ettiyse True, etmediyse False (Tekrar kartı olarak çıkar)
            "reviewed_today": bool(lr and lr >= today_start),
        })
    return result


@app.post("/mark-word-learned/")
def mark_word_learned(user_id: int, word_id: int, is_practice: bool = False, db: Session = Depends(get_db)):
    progress = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id, 
        models.UserProgress.word_id == word_id
    ).first()

    if progress:
        progress.last_reviewed = datetime.utcnow()
        if is_practice:
            progress.learned_at_practice = True # Pratikten geldi, hedefe ekle
            
        if not progress.is_learned:
            progress.is_learned = True
            progress.repetition_count = 1
            progress.interval = 1
            progress.next_review_date = datetime.utcnow() + timedelta(days=1)
    else:
        new_progress = models.UserProgress(
            user_id=user_id, 
            word_id=word_id, 
            is_learned=True,
            learned_at_practice=is_practice,
            last_reviewed=datetime.utcnow(),
            repetition_count=1,
            interval=1,
            next_review_date=datetime.utcnow() + timedelta(days=1)
        )
        db.add(new_progress)
    
    db.commit()
    total_learned = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.is_learned == True
    ).count()

    return {"status": "success", "total_learned": total_learned}

@app.post("/mark-multiple-learned/")
def mark_multiple_learned(user_id: int, word_ids: list[int] = Body(...), db: Session = Depends(get_db)):
    """
    Testte doğru bilinen kelimeleri toplu olarak öğrenildi işaretler.
    """
    for w_id in word_ids:
        progress = db.query(models.UserProgress).filter(
            models.UserProgress.user_id == user_id, 
            models.UserProgress.word_id == w_id
        ).first()

        if progress:
            progress.last_reviewed = datetime.utcnow()
            if not progress.is_learned:
                progress.is_learned = True
                progress.repetition_count = 1
                progress.interval = 1
                progress.next_review_date = datetime.utcnow() + timedelta(days=1)
        else:
            new_progress = models.UserProgress(
                user_id=user_id, 
                word_id=w_id, 
                is_learned=True,
                last_reviewed=datetime.utcnow(),
                repetition_count=1,
                interval=1,
                next_review_date=datetime.utcnow() + timedelta(days=1)
            )
            db.add(new_progress)
    
    db.commit()
    return {"status": "success"}

@app.post("/review-word/")
def review_word(user_id: int, word_id: int, is_correct: bool, db: Session = Depends(get_db)):
    progress = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id, 
        models.UserProgress.word_id == word_id
    ).first()

    if not progress:
        raise HTTPException(status_code=404, detail="Öğrenme kaydı bulunamadı.")
        
    if is_correct:
        progress.repetition_count += 1
        progress.interval = int(progress.interval * progress.ease_factor)
        progress.ease_factor = progress.ease_factor + 0.1
    else:
        progress.repetition_count = 1
        progress.interval = 1
        progress.ease_factor = max(1.3, progress.ease_factor - 0.2)
        
    progress.next_review_date = datetime.utcnow() + timedelta(days=progress.interval)
    db.commit()
    
    return {"status": "success", "next_review": progress.next_review_date}

# --- GRAMER TABANLI SRS SORU URETICI (AI ENTEGRASYONU) ---

# DÜZELTME 1: Yapay Zekayı sınırlandıran ve halüsinasyonu önleyen yeni Prompt
AI_SYSTEM_PROMPT = """
You are an expert English language teacher dynamically generating Spaced Repetition (SRS) questions.
Always output valid JSON using the strictly defined schema.

USER CEFR LEVEL: {cefr_level}
TARGET WORD: "{word_en}"
WORD MEANING: "{meaning_tr}"
WORD TYPE: "{word_type}"  <-- İŞTE BURASI!

CRITICAL RULES:
1. LOGICAL QUESTION TYPE: 
   - If the WORD TYPE is a noun, adjective, determiner, preposition etc., NEVER generate tense questions (past/future). Generate "meaning", "synonym", or "usage" (fill-in-the-blanks) questions.
   - ONLY generate "grammar" (tense) questions if the WORD TYPE is a "verb".
2. OPTION CONSISTENCY: 
   - If the question asks for a Turkish meaning, all 4 options MUST be in Turkish and logically similar.
   - If it's a usage/grammar question, all 4 options MUST be in English.
3. TARGETED HINT: Provide a helpful Turkish hint.

JSON SCHEMA:
{{
  "question_type": "meaning | synonym | usage | grammar",
  "question_text": "The actual question",
  "hint": "Ipucu: ...",
  "options": [
    {{ "text": "Wrong option 1", "is_correct": false }},
    {{ "text": "Correct option", "is_correct": true }},
    {{ "text": "Wrong option 2", "is_correct": false }},
    {{ "text": "Wrong option 3", "is_correct": false }}
  ]
}}
"""

QUESTION_TEMPLATES = {
    "meaning": {
        "question": "Aşağıdaki cümlede boşluğa gelmesi gereken kelimenin Türkçesi nedir?",
        "hint": "İpucu: Cümlenin genel anlamına odaklan.",
    },
    "synonym": {
        "question": "'{word}' kelimesiyle anlam bakımından en yakın kelime hangisi?",
        "hint": "İpucu: Eş anlamlı kelimeler aynı durumu ifade eder.",
    },
    "usage": {
        "question": "Aşağıdaki cümlelerden hangisinde '{word}' kelimesi doğru kullanılmıştır?",
        "hint": "İpucu: Kelimenin isme mi yoksa fiile mi benzediğine dikkat et.",
    },
}

@app.get("/get-review-question/{word_id}")
def get_review_question(word_id: int, user_id: int, db: Session = Depends(get_db)):
    word = db.query(models.Word).filter(models.Word.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Kelime bulunamadi.")

    valid_types = ["meaning"]
    if word.example_en and word.word_en.lower() in word.example_en.lower():
        valid_types.extend(["fill_in", "usage"])

    q_type = random.choice(valid_types)

    wrong_words = db.query(models.Word).filter(
        models.Word.cefr_level == word.cefr_level,
        models.Word.id != word.id
    ).order_by(func.random()).limit(3).all()

    if q_type == "meaning":
        question_text = f"'{word.word_en}' kelimesinin Türkçe karşılığı aşağıdakilerden hangisidir?"
        hint = f"İpucu: Bu kelimenin kullanımı: {word.example_en}" if word.example_en else "İpucu: Harflerine odaklan."
        correct_answer = word.meaning_tr
        wrong_answers = [w.meaning_tr for w in wrong_words]
        
    elif q_type == "fill_in":
        import re
        blank_sentence = re.sub(rf"(?i)\b{re.escape(word.word_en)}\b", "______", word.example_en)
        question_text = f"Aşağıdaki cümlede boşluğa gelmesi gereken kelime hangisidir?\n\n\"{blank_sentence}\""
        hint = f"İpucu: Cümlenin anlamı ile Türkçe karşılığını düşün ({word.meaning_tr})."
        correct_answer = word.word_en
        wrong_answers = [w.word_en for w in wrong_words]

    elif q_type == "usage":
        question_text = f"Aşağıdaki cümlelerden hangisi '{word.word_en}' ({word.meaning_tr}) kelimesinin doğru kullanımıdır?"
        hint = "İpucu: Kelimenin cümleye gramer ve anlam olarak oturduğundan emin ol."
        correct_answer = word.example_en
        
        import re
        wrong_answers = []
        for w in wrong_words:
            if w.example_en and w.word_en.lower() in w.example_en.lower():
                nonsense_sentence = re.sub(rf"(?i)\b{re.escape(w.word_en)}\b", word.word_en.lower(), w.example_en)
                wrong_answers.append(nonsense_sentence)
            else:
                wrong_answers.append(f"He is very {word.word_en.lower()} yesterday.")

    options = [{"text": correct_answer, "is_correct": True}] + [{"text": w, "is_correct": False} for w in wrong_answers[:3]]
    random.shuffle(options)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    progress = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.word_id == word_id
    ).first()
    reviewed_today = bool(progress and progress.last_reviewed and progress.last_reviewed >= today_start)

    return {
        "word_id": word.id,
        "word_en": word.word_en,
        "meaning_tr": word.meaning_tr,
        "sentence": word.example_en or "",
        "question_type": q_type,
        "question_text": question_text,
        "hint": hint,
        "options": options,
        "reviewed_today": reviewed_today,
    }

# --- OGRENiLENLER VE STREAK SISTEMI ---

@app.get("/get-learned-words/{user_id}")
def get_learned_words(user_id: int, db: Session = Depends(get_db)):
    learned_words = db.query(models.Word).join(
        models.UserProgress, models.UserProgress.word_id == models.Word.id
    ).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.is_learned == True
    ).all()
    return learned_words

@app.post("/update-streak/{user_id}")
def update_streak(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    # 1. BUGÜN KAÇ KELİME ÖĞRENİLDİĞİNİ HESAPLA
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    learned_today_count = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id,
        models.UserProgress.is_learned == True,
        models.UserProgress.learned_at_practice == True, # Pratik yaparak öğrenilenler
        models.UserProgress.last_reviewed >= today_start
    ).count()

    # 2. HEDEF KONTROLÜ: Eğer hedef tamamlanmadıysa seriyi artırma
    daily_goal = user.daily_goal or 5
    if learned_today_count < daily_goal:
        return {
            "status": "pending", 
            "streak": user.streak_count, 
            "message": f"Hedefe ulaşılmasına {daily_goal - learned_today_count} kelime kaldı."
        }

    # 3. SERİ MANTIĞI (Hedef tamamsa buraya geçer)
    today = date.today()
    if user.last_study_date:
        last_date = user.last_study_date.date()
        if last_date == today:
            pass # Zaten bugün seri artmış
        elif (today - last_date).days == 1:
            user.streak_count += 1
        else:
            user.streak_count = 1
    else:
        user.streak_count = 1

    user.last_study_date = datetime.now()
    db.commit()
    db.refresh(user)
    
    return {"status": "success", "streak": user.streak_count}

class GameStatsRequest(BaseModel):
    xp_earned: int
    combo_reached: int

@app.post("/update-game-stats/{user_id}")
def update_game_stats(user_id: int, stats: GameStatsRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    if user.xp is None: user.xp = 0
    if user.highest_combo is None: user.highest_combo = 0

    user.xp += stats.xp_earned
    if stats.combo_reached > user.highest_combo:
        user.highest_combo = stats.combo_reached
        
    db.commit()
    db.refresh(user)
    
    return {"status": "success", "xp": user.xp, "highest_combo": user.highest_combo}

class PenaltyStatsRequest(BaseModel):
    xp_earned: int
    score_reached: int

@app.post("/update-penalty-stats/{user_id}")
def update_penalty_stats(user_id: int, stats: PenaltyStatsRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    if user.penalty_total_xp is None: user.penalty_total_xp = 0
    if user.penalty_high_score is None: user.penalty_high_score = 0

    user.penalty_total_xp += stats.xp_earned
    if stats.score_reached > user.penalty_high_score:
        user.penalty_high_score = stats.score_reached
        
    db.commit()
    db.refresh(user)
    
    return {"status": "success", "penalty_total_xp": user.penalty_total_xp, "penalty_high_score": user.penalty_high_score}

# --- SES ANALİZ ENDPOINT'İ ---

@app.post("/analyze-speech/{word_en}")
async def analyze_speech(word_en: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not global_backend:
        raise HTTPException(status_code=500, detail="Fonetik motoru (eSpeak) hazır değil.")

    word_data = db.query(models.Word).filter(models.Word.word_en == word_en).first()
    if not word_data:
        raise HTTPException(status_code=404, detail="Kelime bulunamadı.")

    temp_file = f"temp_{file.filename}"
    with open(temp_file, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # --- 1. Whisper Analizi (Doğrulama / VAD için) ---
        result = model.transcribe(temp_file, language="en", temperature=0, fp16=False)
        user_text = result["text"].strip().lower().replace(".", "").replace(",", "").replace("!", "")

        # --- 2. IPA Dönüşümü (Sadece Frontend Görselliği İçin) ---
        target_ipa = global_backend.phonemize([word_en.lower()])[0].strip()
        user_ipa = global_backend.phonemize([user_text])[0].strip()
        lev_dist = lev_distance(target_ipa, user_ipa)
        similarity_ratio = lev_ratio(target_ipa, user_ipa)

        # --- 3. Akustik Analiz (Hocanın İstediği DTW Skorlaması) ---
        # Referans sesin konumu (eğer yoksa gTTS ile anlık oluşturulur)
        ref_audio_path = os.path.join(audio_path, f"{word_en.lower()}_ref.mp3")
        if not os.path.exists(ref_audio_path):
            aa.generate_reference_audio(word_en.lower(), ref_audio_path)
            
        # FastDTW ile spectrogram (MFCC) zamanlama karşılaştırması
        dtw_score, dtw_diagnostic = aa.calculate_dtw_distance(temp_file, ref_audio_path)

        # --- 4. HİBRİT KARAR MEKANİZMASI ---
        # Whisper kelime doğrulama (Step 1)
        if lev_ratio(word_en.lower(), user_text) < 0.5:
            final_score = min(dtw_score * 0.3, 25.0) 
            status_msg = "Needs Work"
            elsa_diagnostic = "Söylediğin kelime tamamen farklı anlaşıldı veya araya gürültü girdi. Lütfen odaklanıp tekrar dene."
        else:
            final_score = dtw_score
            status_msg = "Excellent" if final_score >= 85 else "Good" if final_score >= 70 else "Needs Work"
            # Cosine DTW skoru 85'in altındaysa Whisper Autocorrect yapsa bile Teşhis dönmesi için
            elsa_diagnostic = generate_elsa_feedback(target_ipa, user_ipa, dtw_diagnostic, final_score)

        score_normalized = max(0, min(final_score, 100)) / 100

        # --- 5. Veritabanına Loglama (SpeechAttempt) ---
        # Not: Frontend'den user_id gelmediği için şimdilik loglarken user_id=None veya dummy tutulabilir.
        # İleride JWT Auth eklendiğinde "current_user.id" olarak değiştirilecek.
        attempt = models.SpeechAttempt(
            user_id=None, 
            word_id=word_data.id,
            dtw_score=final_score,
            whisper_text=user_text,
            error_details={"metric": "dtw", "levenshtein_similarity": similarity_ratio} 
        )
        # db.add(attempt)
        # db.commit()
        # Not: User_id nullable hatası vermemesi için şimdilik yorum satırı. Model düzeltilince açılabilir.

        return {
            "is_correct": final_score >= 70, # Baraj
            "score": score_normalized,
            "transcription": user_text, # Whisper'ın duyduğu
            "target_ipa": target_ipa,
            "user_ipa": user_ipa,
            "phonetic_errors": lev_dist,
            "status": status_msg,
            "diagnostic_message": elsa_diagnostic, # Expert System Feedback (ELSA Style)
            "dtw_raw_score": final_score 
        }

    except Exception as e:
        print(f"Hata Detayı: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analiz hatası: {str(e)}")
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

# --- YAPAY ZEKA HİKAYE ÜRETİMİ ---

@app.post("/generate-story/{user_id}")
def generate_story(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
        
    # Get recent learned words (max 20)
    progresses = db.query(models.UserProgress).filter(
        models.UserProgress.user_id == user_id, 
        models.UserProgress.is_learned == True
    ).order_by(models.UserProgress.last_reviewed.desc()).limit(20).all()
    
    if len(progresses) < 5:
        raise HTTPException(status_code=400, detail="Yapay zekanın mantıklı bir hikaye yazabilmesi için en az 5 kelime öğrenmiş olmalısın!")
        
    words = [p.word.word_en for p in progresses]
    level = user.current_level or "A2"
    
    prompt = f"""
    Sen yaratıcı bir İngilizce öğretmenisin. Karşındaki kişi {level} seviyesinde İngilizce öğreniyor.
    Şu kelimelerin TAMAMININ kullanıldığı, sürükleyici, kısa bir hikaye yaz (maksimum 150 kelime).
    Hikaye {level} seviyesine uygun, basit ve anlaşılır olmalı.
    
    Hedef kelimeler: {', '.join(words)}
    
    JSON formatında yanıt ver. JSON'da şu alanlar olmalı:
    "title": "Hikayenin İngilizce Başlığı",
    "content_en": "Hikayenin İngilizce metni. Lütfen hedef kelimeleri metin içinde kalın (bold) yap (örn: **apple**).",
    "content_tr": "Hikayenin tamamen Türkçe çevirisi. Hedef kelimelerin çevirilerini de kalın (bold) yap."
    """
    
    genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash', generation_config={"response_mime_type": "application/json"})
        response = model.generate_content(prompt)
        
        result_str = response.text
        result_json = json.loads(result_str)
        
        # Save to DB
        new_story = models.UserStory(
            user_id=user_id,
            title=result_json.get("title", "My Weekly Story"),
            content_en=result_json.get("content_en", ""),
            content_tr=result_json.get("content_tr", ""),
            used_words=json.dumps(words)
        )
        db.add(new_story)
        db.commit()
        db.refresh(new_story)
        
        return {"status": "success", "story": new_story}
        
    except Exception as e:
        print(f"Gemini Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Hikaye üretilirken yapay zeka servisinde bir hata oluştu: {str(e)}")

@app.get("/get-stories/{user_id}")
def get_stories(user_id: int, db: Session = Depends(get_db)):
    stories = db.query(models.UserStory).filter(models.UserStory.user_id == user_id).order_by(models.UserStory.created_at.desc()).all()
    return {"status": "success", "stories": stories}