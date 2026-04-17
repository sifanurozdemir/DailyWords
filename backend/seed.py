import pandas as pd
import os
import time
import models
from database import SessionLocal, engine
from gtts import gTTS

# 1. Dinamik Dosya Yolu Ayarı
# Excel dosyasını seed.py ile aynı klasöre koymalısın
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(BASE_DIR, "datasetKelime.xlsx")

def seed_data():
    # 2. Tabloları Otomatik Oluştur ( DB'si boşsa diye)
    print("Veritabanı tabloları kontrol ediliyor/oluşturuluyor...")
    models.Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    
    # Ses klasörü yolu (Backend içinde assets/audio)
    audio_folder = os.path.join(BASE_DIR, "assets", "audio")
    if not os.path.exists(audio_folder): 
        os.makedirs(audio_folder)

    print(f"Excel okunuyor: {file_path}")
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"HATA: Excel dosyası bulunamadı! Lütfen {file_path} yolunu kontrol et.")
        return

    print("Veri aktarımı başlıyor...")

    for index, row in df.iterrows():
        try:
            # Sütun isimlerinden bağımsız olarak sırayla çekiyoruz
            word_text = str(row.iloc[0]).strip()
            
            if word_text.lower() in ["nan", "-", "None"]: 
                continue

            # 3. Ses Dosyası İşlemi
            safe_filename = word_text.replace(' ', '_').replace('/', '_')
            # GitHub'a yüklerken yolların karışmaması için relatif yol saklıyoruz
            relative_audio_path = f"assets/audio/{safe_filename}.mp3"
            full_audio_path = os.path.join(BASE_DIR, relative_audio_path)
            
            if not os.path.exists(full_audio_path):
                try:
                    tts = gTTS(text=word_text, lang='en')
                    tts.save(full_audio_path)
                    print(f"[{index}] Ses oluşturuldu: {word_text}")
                    time.sleep(0.5) # Google banlamasın diye kısa bir bekleme
                except Exception as e:
                    print(f"Ses indirme hatası ({word_text}): {e}")

            # 4. Veritabanı Modelini Oluşturma
            db_word = models.Word(
                word_en=word_text,
                category=str(row.iloc[1]).strip(),
                synonyms=str(row.iloc[2]).strip(),
                antonyms=str(row.iloc[3]).strip(),
                cefr_level=str(row.iloc[4]).strip(),
                part_of_speech=str(row.iloc[5]).strip(),
                phonetic=str(row.iloc[6]).strip(),
                meaning_tr=str(row.iloc[7]).strip(),
                definition_en=str(row.iloc[8]).strip(),
                definition_tr=str(row.iloc[9]).strip(),
                example_en=str(row.iloc[10]).strip(),
                example_tr=str(row.iloc[11]).strip(),
                source=str(row.iloc[12]).strip(),
                audio_path=relative_audio_path # Veritabanına göreceli (relative) yol yazıyoruz
            )
            
            db.add(db_word)
            
            # Her 20 kayıtta bir commit yaparak hızı artırıyoruz
            if index % 20 == 0:
                db.commit()
                print(f">>> {index} satır işlendi...")

        except Exception as e:
            print(f"Hata satırı {index} ({word_text}): {e}")
            db.rollback()

    db.commit()
    db.close()
    print("\n--- İŞLEM TAMAMLANDI! ---")

if __name__ == "__main__":
    seed_data()