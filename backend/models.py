from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Float
from sqlalchemy.dialects.postgresql import JSONB
from database import Base
from sqlalchemy.orm import relationship
from datetime import datetime

class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    word_en = Column(String, index=True, unique=False) # Word
    category = Column(String) # Category
    synonyms = Column(Text) # Synonyms
    antonyms = Column(Text) # Antonyms
    cefr_level = Column(String) # CEFR Level
    part_of_speech = Column(String) # Part of Speech
    phonetic = Column(String) # Phonetic
    meaning_tr = Column(String) # Turkish Meaning
    definition_en = Column(Text) # English Definition
    definition_tr = Column(Text) # Turkish Definition
    example_en = Column(Text) # Example Sentence (EN)
    example_tr = Column(Text) # Example Sentence (TR)
    source = Column(String) # Kaynak
    
    # Ses dosyası için eklediğimiz alan (API'den çekeceğiz)
    audio_path = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String) 
    current_level = Column(String, nullable=True, default=None)
    daily_goal = Column(Integer, default=5)       # Günlük kaç kelime hedefliyor?
    streak_count = Column(Integer, default=0)     # Uygulamaya giriş serisi
    last_study_date = Column(DateTime, nullable=True)

class UserProgress(Base):
    __tablename__ = "user_progress"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    word_id = Column(Integer, ForeignKey("words.id"))
    is_learned = Column(Boolean, default=False)   # "Biliyorum" olarak işaretlendi mi?
    learned_at_practice = Column(Boolean, default=False) # Pratik yapılarak mı öğrenildi? (Ders bitirme)
    last_reviewed = Column(DateTime, default=datetime.utcnow)
    
    # SRS (Spaced Repetition System) Sütunları
    repetition_count = Column(Integer, default=0) # Kaç kere doğru bilindi
    ease_factor = Column(Float, default=2.5) # Zorluk çarpanı
    interval = Column(Integer, default=1) # Sonraki tekrara kalan gün
    next_review_date = Column(DateTime, nullable=True) # Planlanan sonraki tekrar zamanı
    
    # İlişkiler (Kolay erişim için)
    user = relationship("User")
    word = relationship("Word")

class SpeechAttempt(Base):
    __tablename__ = "speech_attempts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    word_id = Column(Integer, ForeignKey("words.id"))
    
    dtw_score = Column(Float) # 0-100 arası çakışma skoru
    whisper_text = Column(String) # Ne duyuldu (Loglama amaçlı)
    
    # "Substitutions, Deletions, Insertions" verilerini tutacak dinamik yapı
    error_details = Column(JSONB, nullable=True) 
    
    created_at = Column(DateTime, default=datetime.utcnow)