import os
import numpy as np
try:
    import librosa
    from fastdtw import fastdtw
    from scipy.spatial.distance import euclidean, cosine
except ImportError:
    print("WARNING: librosa, fastdtw veya scipy kütüphaneleri bulunamadı. Lütfen 'pip install librosa fastdtw scipy' komutunu çalıştırın.")

try:
    from gtts import gTTS
except ImportError:
    print("WARNING: gtts bulunamadı. Lütfen 'pip install gTTS' komutunu çalıştırın.")

def generate_reference_audio(word: str, output_path: str):
    """
    Hedef kelime için gTTS kullanarak referans sesi üretir. (MVP için)
    """
    try:
        tts = gTTS(text=word, lang='en', tld='us') # Amerikan İngilizcesi
        tts.save(output_path)
        return True
    except Exception as e:
        print(f"Ses üretilirken hata oluştu: {str(e)}")
        return False

def load_and_preprocess_audio(audio_path: str, sr=16000):
    """
    Ses dosyasını yükler, sessizlikleri kırpar (VAD) ve normalize eder.
    """
    try:
        y, sr = librosa.load(audio_path, sr=sr)
        
        # Sessiz kısımları (baş ve sondaki boşlukları) kırpma (top_db eşiği ayarlanabilir)
        yt, _ = librosa.effects.trim(y, top_db=25)
        
        # Sinyal genliğini normalize et
        if len(yt) > 0 and np.max(np.abs(yt)) > 0:
            yt = yt / np.max(np.abs(yt))
            
        return yt, sr
    except Exception as e:
        print(f"Ses dosyası yüklenemedi {audio_path}: {e}")
        return np.array([]), sr

def extract_mfcc(y, sr):
    """
    Ses sinyalinden MFCC özniteliklerini (parmak izini) çıkarır.
    """
    # n_mfcc genelde 13 veya 20'dir
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    # fastdtw için (zaman, özellik) formatına transpoze et
    return mfccs.T

def calculate_dtw_distance(user_audio_path: str, reference_audio_path: str):
    """
    İki ses arasındaki konuşma hızını ve Cosine mesafesini (DTW Warping Path) ölçer.
    Konuşma süresi anormallikleri (uzatma/yutma) için teşhis mesajı ve gerçek DTW akustik skoru döner.
    """
    y_user, sr_user = load_and_preprocess_audio(user_audio_path)
    y_ref, sr_ref = load_and_preprocess_audio(reference_audio_path)
    
    if len(y_user) == 0 or len(y_ref) == 0:
         return 0.0, "Ses dosyası algılanamadı."

    mfcc_user = extract_mfcc(y_user, sr_user)
    mfcc_ref = extract_mfcc(y_ref, sr_ref)
    
    # Cosine distance ile hesaplama yapıyoruz ki sesin şiddeti veya mikrofon farkı skoru 0'a çekmesin.
    distance, path = fastdtw(mfcc_user, mfcc_ref, dist=cosine)
    
    # Ortalama path (yol) uzunluğuna bölüyoruz
    path_len = len(path) if len(path) > 0 else 1
    normalized_dist = distance / path_len
    
    # Cosine distance farklı seste aynı kelime için genelde 0.15 - 0.35 arası çıkar.
    # Yanlış kelimede 0.50 ve üstüne çıkar.
    # Skoru 0-100 arasına kalibre etme:
    score = 100.0 - ((normalized_dist - 0.15) * 200.0)
    score = max(0.0, min(100.0, score))
    
    # --- EXPERT SYSTEM (ZAMANLAMA/RİTİM DÜZELTMESİ) ---
    diagnostic_message = ""
    ratio = len(mfcc_user) / len(mfcc_ref) if len(mfcc_ref) > 0 else 1
    
    if ratio > 1.6:
        diagnostic_message = "İpucu: Kelimeyi gereğinden fazla heceleyip yayarak uzattın. Daha seri ve doğal okumayı dene."
        score -= 15 # Süre cezası
    elif ratio < 0.5:
        diagnostic_message = "İpucu: Kelimeyi çok aceleci veya yutarak okudun. Harflerin hakkını vererek telaffuz et."
        score -= 15 # Süre cezası
        
    score = max(0.0, score)
    
    return round(score, 2), diagnostic_message
