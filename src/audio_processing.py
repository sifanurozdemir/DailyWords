import os
import numpy as np
from Levenshtein import distance as lev_distance, ratio as lev_ratio
try:
    import librosa
    from fastdtw import fastdtw
    from scipy.spatial.distance import euclidean, cosine
except ImportError:
    print("WARNING: librosa, fastdtw veya scipy kutuphaneleri bulunamadi. Lutfen 'pip install librosa fastdtw scipy' komutunu calistirin.")

try:
    from gtts import gTTS
except ImportError:
    print("WARNING: gtts bulunamadi. Lutfen 'pip install gTTS' komutunu calistirin.")

try:
    import torch
    from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
    WAV2VEC_AVAILABLE = True
except ImportError:
    WAV2VEC_AVAILABLE = False
    print("WARNING: transformers veya torch bulunamadi. Lutfen 'pip install transformers torch torchaudio' komutunu calistirin.")

processor = None
wav2vec_model = None

def load_wav2vec2_model():
    global processor, wav2vec_model
    if not WAV2VEC_AVAILABLE:
        return False
    if processor is None or wav2vec_model is None:
        try:
            print("Wav2Vec2 Fonem Modeli yukleniyor (Ilk acilista biraz zaman alabilir)...")
            model_id = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
            processor = Wav2Vec2Processor.from_pretrained(model_id)
            wav2vec_model = Wav2Vec2ForCTC.from_pretrained(model_id)
            print("Wav2Vec2 basariyla yuklendi!")
            return True
        except Exception as e:
            print(f"Wav2Vec2 model yukleme hatasi: {e}")
            return False
    return True


def generate_reference_audio(word: str, output_path: str):
    """
    Hedef kelime için gTTS kullanarak referans sesi üretir. (MVP için)
    """
    try:
        tts = gTTS(text=word, lang='en', tld='us') # Amerikan İngilizcesi
        tts.save(output_path)
        return True
    except Exception as e:
        print(f"Ses uretilirken hata olustu: {str(e)}")
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
        print(f"Ses dosyasi yuklenemedi {audio_path}: {e}")
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
    # Skoru 0-100 arasına kalibre etme (STRICT NON-LINEAR PENALTY):
    # Uzaklık 0.10'u geçtiği an logaritmik/üstel olarak hızla düşer.
    penalty_factor = max(0.0, normalized_dist - 0.10)
    score = 100.0 * (0.005 ** penalty_factor) # Çok acımasız ceza
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

import difflib

def extract_phonemes_with_timestamps(audio_path: str):
    """
    Sesi doğrudan analiz ederek duyulan saf fonemleri (IPA) ve zaman damgalarını döndürür.
    Bu işlem ASR (Kelime tahmini) yapmaz, sadece akustik sinyali harflere çevirir.
    Hocanın eleştirdiği "Whisper Auto-Correct" probleminin gerçek çözümüdür.
    """
    if not load_wav2vec2_model():
        return "", []
    
    try:
        y, sr = librosa.load(audio_path, sr=16000)
        yt, _ = librosa.effects.trim(y, top_db=25)
        
        # ADIM 4: Ses verisini doğrulama kontrolleri
        if y is None or yt is None:
            print("ERROR: Ses verisi dizisi (audio array) None olarak yüklendi.")
            return "", []
        if len(yt) < 1000:
            print(f"ERROR: Temizlenmiş ses dizisi uzunluğu ({len(yt)} örnek) minimum 1000 örnek sınırının altındadır.")
            return "", []
            
        if len(yt) == 0:
            return "", []
            
        inputs = processor(yt, sampling_rate=16000, return_tensors="pt")
        with torch.no_grad():
            logits = wav2vec_model(**inputs).logits
            probs = torch.nn.functional.softmax(logits, dim=-1)
            
        predicted_ids = torch.argmax(logits, dim=-1)[0]
        
        # Tam metin transkripsiyonu
        transcription = processor.batch_decode(predicted_ids.unsqueeze(0))[0]
        
        # Zaman damgalı ve güven skorlu fonem çıkarımı
        tokens = processor.tokenizer.convert_ids_to_tokens(predicted_ids)
        phonemes_with_times = []
        current_token = None
        
        for i, token in enumerate(tokens):
            if token == processor.tokenizer.pad_token or token == '<s>' or token == '</s>' or token == '|':
                current_token = None
                continue
            if token != current_token:
                timestamp = i * 0.02 # Wav2Vec2'de her logit frame 20ms'ye denk gelir (stride 320 / 16000)
                clean_token = token.replace(' ', '')
                if clean_token:
                    confidence = probs[0, i, predicted_ids[i]].item()
                    phonemes_with_times.append({"phoneme": clean_token, "timestamp": timestamp, "confidence": confidence})
                current_token = token
                
        # Memory Management
        del inputs, logits, probs
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
                
        return transcription, phonemes_with_times
    except Exception as e:
        print(f"Fonem cikarma hatasi: {e}")
        return "", []

def load_l1_rules_as_map():
    import json
    import os
    rules_map = {}
    config_path = "models/turkish_l1_rules.json"
    if not os.path.exists(config_path):
        config_path = "../models/turkish_l1_rules.json"
        
    if not os.path.exists(config_path):
        # fallback in case it's run from another subfolder
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "turkish_l1_rules.json")
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            rules_list = json.load(f)
        for rule in rules_list:
            target = rule.get("target_fonem", "")
            detected = rule.get("detected_fonem", "")
            key = f"{target}->{detected}"
            backtracking = rule.get("backtracking_logic", {})
            rules_map[key] = {
                "error_id": rule.get("error_id"),
                "error_name": rule.get("error_name"),
                "feedback_tr": backtracking.get("feedback_tr", rule.get("feedback_tr", "")),
                "severity": backtracking.get("severity", "Medium"),
                "veto_trigger": rule.get("veto_triggered", False),
                "veto_ceiling": rule.get("veto_ceiling")
            }
        print(f"L1 kurallari yuklendi: {len(rules_list)} kural")
    except Exception as e:
        print(f"L1 kurallari yukleme hatasi: {e}")
    return rules_map

L1_RULE_MAP = load_l1_rules_as_map()

def align_and_diagnose_json(target_ipa: str, phonemes_with_times: list):
    """
    Hedef IPA ile kullanıcının zaman damgalı fonemlerini zorunlu hizalar.
    Hedef kelimenin temizlenmiş orijinal IPA karakter uzunluğunu baz alarak,
    indis kaydırması ve karakter klonlaması yapmadan kullanıcının fonemleriyle tam eşleşme yapmasını sağlar.
    """
    import difflib
    
    # SPRINT 2: Akustik Çökme Riski boş kontrolü
    if not phonemes_with_times:
        target_clean = target_ipa.replace(' ', '').replace('ˈ', '').replace('ˌ', '').replace('ɪ', 'i')
        result_json = []
        for idx in range(len(target_clean)):
            result_json.append({
                "char": target_clean[idx],
                "status": "wrong",
                "reason": "missing",
                "expected": target_clean[idx],
                "detected": "",
                "confidence": 0.0,
                "timestamp": 0.0
            })
        return result_json, True, "Akustik sinyal çok zayıf. Lütfen mikrofona daha yakın ve net konuşun.", []
        
    # SPRINT 2: Collapse consecutive identical phonemes
    if phonemes_with_times:
        collapsed = []
        current = None
        for p in phonemes_with_times:
            ph = p["phoneme"].replace('ɪ', 'i')
            ts = p["timestamp"]
            conf = p["confidence"]
            if current is None or ph != current["phoneme"]:
                if current is not None:
                    collapsed.append(current)
                current = {"phoneme": ph, "timestamp": ts, "confidence": conf}
            else:
                if conf > current["confidence"]:
                    current["confidence"] = conf
        if current is not None:
            collapsed.append(current)
        phonemes_with_times = collapsed
        
    user_ipa_str = "".join([p["phoneme"] for p in phonemes_with_times])
    target_clean = target_ipa.replace(' ', '').replace('ˈ', '').replace('ˌ', '').replace('ɪ', 'i')
    
    result_json = [None] * len(target_clean)
    veto_triggered = False
    diagnostic_msg = ""
    triggered_rules = []
    
    if not target_clean:
        return [], False, "Hedef IPA boş.", []
        
    if not user_ipa_str:
        for idx in range(len(target_clean)):
            result_json[idx] = {
                "char": target_clean[idx],
                "status": "wrong",
                "reason": "missing",
                "expected": target_clean[idx],
                "detected": "",
                "confidence": 0.0,
                "timestamp": 0.0
            }
        return result_json, True, "Sinyalden ses anlaşılamadı. Çok sessiz veya gürültülü olabilir.", []
        
    s = difflib.SequenceMatcher(None, target_clean, user_ipa_str)
    matching_blocks = s.get_matching_blocks()
    
    last_a = 0
    last_b = 0
    
    # 1. Global Multi-character check for Epenthesis (e.g. sp -> isp)
    for prefix in ["sp", "st", "sk"]:
        if prefix in target_clean:
            for ip in ["i", "ı"]:
                full_pattern = f"{ip}{prefix}"
                if full_pattern in user_ipa_str:
                    idx = user_ipa_str.find(full_pattern)
                    ts = phonemes_with_times[idx]["timestamp"] if idx < len(phonemes_with_times) else 0.0
                    rule = L1_RULE_MAP.get(f"{prefix}->{full_pattern}")
                    if rule:
                        veto_triggered = veto_triggered or rule["veto_trigger"]
                        if not diagnostic_msg:
                            diagnostic_msg = f"{ts:.2f}s - {rule['error_name']}: {rule['feedback_tr']}"
                        r_copy = rule.copy()
                        r_copy["timestamp"] = ts
                        triggered_rules.append(r_copy)
                        
    # 2. Main alignment loop
    for a, b, size in matching_blocks:
        # Check if there is a mismatch region before this matching block
        if a > last_a or b > last_b:
            expected_chunk = target_clean[last_a:a]
            detected_chunk = user_ipa_str[last_b:b]
            
            chunk_ts = 0.0
            if last_b < len(phonemes_with_times):
                chunk_ts = phonemes_with_times[last_b]["timestamp"]
                
            # Check L1 rules for the entire chunk
            rule = L1_RULE_MAP.get(f"{expected_chunk}->{detected_chunk}")
            if rule:
                veto_triggered = veto_triggered or rule["veto_trigger"]
                if not diagnostic_msg:
                    diagnostic_msg = f"{chunk_ts:.2f}s - {rule['error_name']}: {rule['feedback_tr']}"
                r_copy = rule.copy()
                r_copy["timestamp"] = chunk_ts
                triggered_rules.append(r_copy)
                
            # Process each target character in the mismatch range
            L_exp = a - last_a
            L_det = b - last_b
            for k in range(L_exp):
                idx = last_a + k
                char = target_clean[idx]
                
                if k < L_det:
                    # Substitution
                    user_idx = last_b + k
                    conf = phonemes_with_times[user_idx]["confidence"] if user_idx < len(phonemes_with_times) else 1.0
                    detected_char = user_ipa_str[user_idx]
                    char_ts = phonemes_with_times[user_idx]["timestamp"] if user_idx < len(phonemes_with_times) else 0.0
                    
                    # Check L1 rules for the specific character substitution
                    char_rule = L1_RULE_MAP.get(f"{char}->{detected_char}")
                    if char_rule:
                        veto_triggered = veto_triggered or char_rule["veto_trigger"]
                        if not diagnostic_msg:
                            diagnostic_msg = f"{char_ts:.2f}s - {char_rule['error_name']}: {char_rule['feedback_tr']}"
                        r_copy = char_rule.copy()
                        r_copy["timestamp"] = char_ts
                        triggered_rules.append(r_copy)
                        
                    result_json[idx] = {
                        "char": char,
                        "status": "wrong",
                        "reason": "substitution",
                        "expected": char,
                        "detected": detected_char,
                        "confidence": round(conf, 2),
                        "timestamp": char_ts
                    }
                else:
                    # Deletion (missing character)
                    prev_user_idx = max(0, last_b - 1)
                    del_ts = phonemes_with_times[prev_user_idx]["timestamp"] if prev_user_idx < len(phonemes_with_times) else 0.0
                    
                    # Check L1 rules for deletion
                    char_rule = L1_RULE_MAP.get(f"{char}->")
                    if char_rule:
                        veto_triggered = veto_triggered or char_rule["veto_trigger"]
                        if not diagnostic_msg:
                            diagnostic_msg = f"{del_ts:.2f}s - {char_rule['error_name']}: {char_rule['feedback_tr']}"
                        r_copy = char_rule.copy()
                        r_copy["timestamp"] = del_ts
                        triggered_rules.append(r_copy)
                        
                    result_json[idx] = {
                        "char": char,
                        "status": "wrong",
                        "reason": "missing",
                        "expected": char,
                        "detected": "",
                        "confidence": 0.0,
                        "timestamp": del_ts
                    }
                    
            # Check L1 rules for insertions (extra user characters)
            if L_det > L_exp:
                inserted_chunk = user_ipa_str[last_b + L_exp : b]
                if (last_b + L_exp) < len(phonemes_with_times):
                    ins_ts = phonemes_with_times[last_b + L_exp]["timestamp"]
                else:
                    ins_ts = phonemes_with_times[-1]["timestamp"] if phonemes_with_times else 0.0
                ins_rule = L1_RULE_MAP.get(f"->{inserted_chunk}")
                if ins_rule:
                    veto_triggered = veto_triggered or ins_rule["veto_trigger"]
                    if not diagnostic_msg:
                        diagnostic_msg = f"{ins_ts:.2f}s - {ins_rule['error_name']}: {ins_rule['feedback_tr']}"
                    r_copy = ins_rule.copy()
                    r_copy["timestamp"] = ins_ts
                    triggered_rules.append(r_copy)
                    
        # Process the matching block characters
        for k in range(size):
            idx = a + k
            user_idx = b + k
            char = target_clean[idx]
            conf = phonemes_with_times[user_idx]["confidence"] if user_idx < len(phonemes_with_times) else 1.0
            ts = phonemes_with_times[user_idx]["timestamp"] if user_idx < len(phonemes_with_times) else 0.0
            result_json[idx] = {
                "char": char,
                "status": "correct",
                "confidence": round(conf, 2),
                "timestamp": ts
            }
            
        last_a = a + size
        last_b = b + size
        
    if not diagnostic_msg:
        any_wrong = any(item["status"] == "wrong" for item in result_json if item)
        if any_wrong:
            first_wrong = next((item for item in result_json if item and item["status"] == "wrong"), None)
            if first_wrong:
                if first_wrong["reason"] == "substitution":
                    diagnostic_msg = f"{first_wrong['timestamp']:.2f}. saniyede hata: Beklenen fonem /{first_wrong['expected']}/ iken akustik olarak /{first_wrong['detected']}/ çıkardın."
                else:
                    diagnostic_msg = f"Eksik Ses: /{first_wrong['expected']}/ sesini yuttun."
        else:
            diagnostic_msg = "Mükemmel! Bütün harfleri doğru seslendirdin."
            
    seen_ids = set()
    unique_triggered_rules = []
    for r in triggered_rules:
        if r["error_id"] not in seen_ids:
            seen_ids.add(r["error_id"])
            unique_triggered_rules.append(r)
            
    return result_json, veto_triggered, diagnostic_msg, unique_triggered_rules

def calculate_residual_spectrogram(user_audio_path: str, reference_audio_path: str):
    """
    Kullanıcı sesi ile Referans sesinin Mel-Spectrogram'larını karşılaştırarak
    hata (fark) matrisini Frontend için küçültülmüş bir array olarak döner.
    """
    y_user, sr_user = load_and_preprocess_audio(user_audio_path)
    y_ref, sr_ref = load_and_preprocess_audio(reference_audio_path)
    
    if len(y_user) == 0 or len(y_ref) == 0:
        return []

    S_user = librosa.feature.melspectrogram(y=y_user, sr=sr_user, n_mels=128)
    S_ref = librosa.feature.melspectrogram(y=y_ref, sr=sr_ref, n_mels=128)
    
    S_user_db = librosa.power_to_db(S_user, ref=np.max)
    S_ref_db = librosa.power_to_db(S_ref, ref=np.max)
    
    from scipy.ndimage import zoom
    if S_user_db.shape[1] > 0 and S_ref_db.shape[1] > 0:
        ratio = S_ref_db.shape[1] / S_user_db.shape[1]
        S_user_resized = zoom(S_user_db, (1, ratio))
        
        residual = np.mean(np.abs(S_ref_db - S_user_resized), axis=0)
        if np.max(residual) > 0:
            residual = residual / np.max(residual)
            
        points = 20
        if len(residual) > points:
            chunk_size = len(residual) // points
            residual = [float(np.mean(residual[i:i+chunk_size])) for i in range(0, len(residual), chunk_size)][:points]
        else:
            residual = [float(x) for x in residual]
        
        return residual
    return []

def calculate_strict_phoneme_score(target_ipa: str, user_ipa: str):
    """
    Hedef IPA ile kullanıcı IPA'sını temizleyerek Levenshtein mesafesini hesaplar.
    Eğer 1 veya daha fazla hata varsa skoru üstel (exponential) olarak cezalandırır.
    
    Örnek:
      1 hata (d=1) -> 0.5^1 = 0.5 çarpanı (Skor %40-50 bandına iner).
      2 hata (d=2) -> 0.5^2 = 0.25 çarpanı.
    """
    target_clean = target_ipa.replace(' ', '').replace('ˈ', '').replace('ˌ', '').replace('ɪ', 'i')
    user_clean = user_ipa.replace(' ', '').replace('ˈ', '').replace('ˌ', '').replace('ɪ', 'i')
    
    if not target_clean:
        return 0.0, 0.0, 0
    if not user_clean:
        return 0.0, 0.0, len(target_clean)
        
    d = lev_distance(target_clean, user_clean)
    r = lev_ratio(target_clean, user_clean)
    
    if d == 0:
        return 100.0, 1.0, 0
        
    # Üstel ceza (exponential penalty)
    phoneme_score = 100.0 * r * (0.5 ** d)
    phoneme_score = max(0.0, min(100.0, phoneme_score))
    
    return round(phoneme_score, 2), round(r, 4), d


import asyncio
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=1)

async def extract_phonemes_async(audio_path):
    loop = asyncio.get_event_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(
            _executor,
            extract_phonemes_with_timestamps,
            audio_path
        ),
        timeout=55.0
    )


