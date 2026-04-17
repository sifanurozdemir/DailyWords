import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable, StatusBar } from 'react-native';
import { Audio } from 'expo-av'; // DİKKAT: 'expo-audio' değil 'expo-av' olmalı!
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function PracticeScreen({ route, navigation }) {
    const { studyList, user_id, isReview } = route.params || { studyList: [], user_id: null, isReview: false };
    const { theme, isDark } = useTheme();
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [step, setStep] = useState(1); 
    const [isFlipped, setIsFlipped] = useState(false);
    const [input, setInput] = useState('');
    const [isWrong, setIsWrong] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [passedStep3, setPassedStep3] = useState(false);
    const [feedback, setFeedback] = useState(null);
    
    // Ses Yönetimi State'leri
    const [sound, setSound] = useState(null);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);

    const word = studyList[currentWordIndex];

    // --- SES ÇALMA VE KAYIT İZİNLERİ (EXPO-AV) ---
    useEffect(() => {
        async function setupAudio() {
            try {
                // Mikrofon izni iste
                const permission = await Audio.requestPermissionsAsync();
                if (permission.status !== 'granted') {
                    Alert.alert("İzin Gerekli", "Ses analizi için mikrofon izni vermeniz gerekiyor.");
                }

                // Cihazın ses modunu ayarla (iOS ve Android uyumluluğu için kritik)
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                });
            } catch (error) {
                console.error("Audio setup error:", error);
            }
        }
        setupAudio();

        // Temizleme fonksiyonu: Component kapandığında sesi durdur
        return sound
            ? () => {
                  sound.unloadAsync();
              }
            : undefined;
    }, []);

    // --- KELİMENİN SESİNİ ÇALMA ---
    const playSound = async () => {
        if (!word || !word.audio_path) return;
        try {
            const audioUrl = `${apiClient.defaults.baseURL}/${word.audio_path.replace(/\\/g, '/')}`;
            const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUrl });
            setSound(newSound);
            await newSound.playAsync();
        } catch (error) {
            console.log("Ses çalma hatası:", error);
        }
    };

    const checkWrite = () => {
        if (input.toLowerCase().trim() === word.word_en.toLowerCase()) {
            setIsWrong(false);
            setStep(3); 
        } else {
            setIsWrong(true);
            Alert.alert("Hatalı Yazım", "Kelimeyi tekrar kontrol et veya Flashcard'a geri dön.");
        }
    };

    // --- BASILI TUTUNCA KAYIT (DÜZELTİLDİ) ---
    async function startRecording() {
        try {
            setIsRecording(true);
            // Varsa eski kaydı temizle
            if (recording) {
                await recording.stopAndUnloadAsync();
            }

            // Yeni kayıt nesnesi oluştur ve ayarları yükle
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            
            setRecording(newRecording);
            console.log('Kayıt başladı');
        } catch (err) {
            console.error('Kayıt başlatılamadı:', err);
            setIsRecording(false);
            Alert.alert("Hata", "Mikrofon başlatılamadı. Lütfen izinleri kontrol edin.");
        }
    }

    // --- BIRAKINCA DURDUR VE GÖNDER (DÜZELTİLDİ) ---
    async function stopRecording() {
        if (!recording) return;

        setIsRecording(false);
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            console.log('Kayıt durdu, dosya kaydedildi:', uri);
            
            // Kayıt nesnesini sıfırla ki bir sonraki sefer temiz başlasın
            setRecording(null); 
            
            if (uri) {
                sendAudioToBackend(uri);
            }
        } catch (error) {
            console.error("Kayıt durdurma hatası:", error);
        }
    }

    // --- BACKEND'E SES DOSYASINI GÖNDERME ---
    const sendAudioToBackend = async (uri) => {
        setIsAnalyzing(true);
        try {
            // Android ve iOS'taki dosya yollarını sunucunun anlayacağı formata çevir
            const fileType = Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/m4a';
            const fileName = `speech_${word.word_en}.m4a`;

            const formData = new FormData();
            formData.append('file', {
                uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                type: fileType,
                name: fileName,
            });

            console.log("Dosya gönderiliyor...", fileName);

            const response = await apiClient.post(`/analyze-speech/${word.word_en}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000, 
            });

            const { is_correct, score, diagnostic_message } = response.data;

            if (is_correct) {
                await apiClient.post(`/mark-word-learned/?user_id=${user_id}&word_id=${word.id}&is_practice=true`);
                setPassedStep3(true);
                setFeedback({ type: 'success', text: `Harika! Puan: %${(score * 100).toFixed(0)} - ${diagnostic_message || ''}`});
            } else {
                setFeedback({ type: 'error', text: `Tekrar dene. Puan: %${(score * 100).toFixed(0)} - ${diagnostic_message || ''}`});
            }
            setTimeout(() => setFeedback(null), 4000);
        } catch (error) {
            console.error("Ses analiz hatası:", error);
            setFeedback({ type: 'error', text: 'Ses analizi başarısız.'});
            setTimeout(() => setFeedback(null), 3000);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleFinishOrNext = async () => {
        if (currentWordIndex < studyList.length - 1) {
            setCurrentWordIndex(prev => prev + 1);
            setStep(1);
            setInput('');
            setIsFlipped(false);
            setIsWrong(false);
            setPassedStep3(false);
            setFeedback(null);
        } else {
            try {
                const res = await apiClient.post(`/update-streak/${user_id}`);
                const finalStreak = res.data.streak;

                Alert.alert("Tebrikler!", `Bugünkü listen bitti.\n🔥 Serin: ${finalStreak} Gün`, [
                    { 
                        text: "Ana Sayfaya Dön", 
                        onPress: () => {
                            navigation.reset({
                                index: 0,
                                routes: [{ name: 'Home', params: { user: { user_id, streak_count: finalStreak, username: '', daily_goal: 5 } } }],
                            });
                        } 
                    }
                ]);
            } catch (error) {
                console.log("Streak hatası:", error);
                navigation.navigate('Home', { user: { user_id } });
            }
        }
    };

    if (!word) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={theme.primary} /></View>;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
                
                {step === 1 && (
                    <View style={styles.center}>
                        <Text style={[styles.stepTitle, { color: theme.textMuted }]}>ADIM 1: İNCELE</Text>
                        <TouchableOpacity
                            activeOpacity={0.9}
                            style={[styles.flashcard, { backgroundColor: isFlipped ? theme.flipBack : theme.card }]}
                            onPress={() => setIsFlipped(!isFlipped)}
                        >
                            <View style={[styles.unoWhiteBorder, { borderColor: theme.border }]}>
                                {!isFlipped ? (
                                    <View style={styles.cardContent}>
                                        <Text style={[styles.bigWord, { color: theme.text }]}>{word.word_en}</Text>
                                        <Text style={[styles.ipa, { color: theme.textMuted }]}>{word.phonetic}</Text>
                                        <Text style={[styles.description, { color: theme.textSecondary }]}>{word.definition_en}</Text>
                                        <View style={[styles.exampleBox, { backgroundColor: theme.background, borderColor: theme.border }]}><Text style={[styles.exampleText, { color: theme.textSecondary }]}>"{word.example_en}"</Text></View>
                                        <TouchableOpacity onPress={playSound} style={styles.unoAudioBtn}><Text style={{fontSize: 24}}>🔊</Text></TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.cardContent}>
                                        <Text style={[styles.bigWordTr, { color: theme.accent }]}>{word.meaning_tr}</Text>
                                        <Text style={[styles.ipaTr, { color: theme.textMuted }]}>{word.phonetic}</Text>
                                        <Text style={[styles.descriptionTr, { color: theme.text }]}>{word.definition_tr}</Text>
                                        <View style={[styles.exampleBoxTr, { backgroundColor: theme.accentLight }]}><Text style={[styles.exampleTextTr, { color: theme.text }]}>"{word.example_tr}"</Text></View>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                        
                        {!isReview ? (
                            <TouchableOpacity style={styles.mainBtn} onPress={() => setStep(2)}>
                                <Text style={styles.mainBtnText}>Yazma Aşamasına Geç ➔</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.mainBtn} onPress={() => navigation.goBack()}>
                                <Text style={styles.mainBtnText}>⬅ İncelemeyi Bitir</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.center}>
                        <Text style={styles.stepTitle}>ADIM 2: YAZ</Text>
                        <Text style={styles.trHint}>"{word.meaning_tr}"</Text>
                        
                        {/* YAZMA ALANI DEKORASYONU GÜNCELLENDİ */}
                        <View style={{ width: '90%', marginTop: 20 }}>
                            <TextInput 
                                style={[styles.input, isWrong && styles.inputError, { opacity: input ? 1 : 0.6 }]} 
                                onChangeText={(text) => { setInput(text); setIsWrong(false); }}
                                value={input} 
                                placeholder="İngilizce karşılığını yazın" 
                                autoFocus
                                placeholderTextColor={theme.textMuted}
                                selectionColor={theme.primary}
                                autoCapitalize="none"
                                autoCorrect={false}
                                spellCheck={false} // Otomatik düzeltme ve altını çizmeyi engeller
                            />
                        </View>
                        
                        <TouchableOpacity style={styles.mainBtn} onPress={checkWrite}>
                            <Text style={styles.mainBtnText}>Kontrol Et</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                            <Text style={styles.backBtnText}>⬅ Kartı Tekrar Gör</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.center}>
                        <Text style={styles.stepTitle}>ADIM 3: TELAFFUZ</Text>
                        <Text style={styles.bigWord}>{word.word_en}</Text>
                        <Text style={styles.ipa}>{word.phonetic}</Text>
                        
                        <Pressable 
                            onPressIn={startRecording}
                            onPressOut={stopRecording}
                            disabled={isAnalyzing}
                            style={({ pressed }) => [
                                styles.micBtn, 
                                pressed && styles.micPressed,
                                isAnalyzing && { opacity: 0.5 }
                            ]}
                        >
                            {isAnalyzing ? <ActivityIndicator color="#fff" /> : <Text style={{fontSize: 50}}>🎤</Text>}
                        </Pressable>
                        
                        <Text style={styles.micHint}>
                            {isRecording ? "Dinleniyor... (Bırakınca Gönderilir)" : isAnalyzing ? "Analiz Ediliyor..." : "Basılı Tut ve Söyle"}
                        </Text>

                        <TouchableOpacity 
                             style={[styles.mainBtn, {backgroundColor: passedStep3 ? theme.primary : theme.border, marginTop: 40}]} 
                             onPress={handleFinishOrNext}
                             disabled={!passedStep3}
                        >
                            <Text style={[styles.mainBtnText, {color: passedStep3 ? '#fff' : theme.textMuted}]}>
                                {currentWordIndex < studyList.length - 1 ? "Sonraki Kelime ➔" : "Çalışmayı Bitir 🎉"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
            
            {feedback && (
                <View style={[styles.toast, { backgroundColor: feedback.type === 'success' ? theme.successText : theme.danger }]}>
                    <Text style={styles.toastText}>{feedback.text}</Text>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, padding: 20, paddingBottom: 40, paddingTop: 50 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    stepTitle: { fontSize: 18, fontWeight: '800', color: '#718096', marginBottom: 20, letterSpacing: 1 },
    
    flashcard: { 
        width: '100%', 
        height: 420, 
        backgroundColor: '#FFF', 
        borderRadius: 24, 
        padding: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
        marginBottom: 30
    },
    unoWhiteBorder: { flex: 1, borderWidth: 2, borderColor: '#EDF2F7', borderRadius: 16, padding: 20 },
    
    cardFront: { backgroundColor: '#FFFFFF' },
    cardBack: { backgroundColor: '#EBF8FF' },
    cardContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    bigWord: { fontSize: 44, fontWeight: '800', color: '#2D3748', marginBottom: 5, textAlign: 'center' },
    ipa: { fontSize: 20, color: '#A0AEC0', marginBottom: 20, fontStyle: 'italic' },
    description: { fontSize: 18, color: '#4A5568', textAlign: 'center', fontStyle: 'italic', marginBottom: 25 },
    exampleBox: { backgroundColor: '#F7FAFC', padding: 15, borderRadius: 12, width: '100%', borderWidth: 1, borderColor: '#EDF2F7' },
    exampleText: { fontSize: 16, fontStyle: 'italic', color: '#4A5568', textAlign: 'center' },
    
    bigWordTr: { fontSize: 40, fontWeight: '800', color: '#2B6CB0', marginBottom: 5, textAlign: 'center' },
    ipaTr: { fontSize: 18, color: '#63B3ED', marginBottom: 20, fontStyle: 'italic' }, 
    descriptionTr: { fontSize: 18, color: '#2C5282', textAlign: 'center', marginBottom: 25 },
    exampleBoxTr: { backgroundColor: '#E2E8F0', padding: 15, borderRadius: 12, width: '100%' },
    exampleTextTr: { fontSize: 16, fontStyle: 'italic', color: '#2C5282', textAlign: 'center' },
    unoAudioBtn: { marginTop: 20, backgroundColor: '#fff', padding: 15, borderRadius: 40 },
    mainBtn: { backgroundColor: '#2E7D32', padding: 20, borderRadius: 15, width: '100%', marginTop: 25 },
    mainBtnText: { color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
    backBtn: { marginTop: 20, padding: 10 },
    backBtnText: { color: '#666', fontWeight: '600' },
    trHint: { fontSize: 28, fontWeight: 'bold', color: '#2E7D32', marginBottom: 30 },
    input: { borderBottomWidth: 3, borderColor: '#4CAF50', width: '90%', fontSize: 26, textAlign: 'center', padding: 15, borderRadius: 10, backgroundColor: '#f9f9f9', marginTop: 20 },
    inputError: { borderColor: '#F44336', color: '#F44336', backgroundColor: '#ffebee' },
    toast: { position: 'absolute', top: 100, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 25, elevation: 6, shadowColor: '#000', shadowOffset: { width:0, height:3 }, shadowOpacity: 0.2, maxWidth: '90%' },
    toastText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    micBtn: { backgroundColor: '#f0f0f0', width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginTop: 30, elevation: 5, borderWidth: 3, borderColor: '#2E7D32' },
    micPressed: { backgroundColor: '#FFCDD2', borderColor: '#F44336', transform: [{ scale: 0.95 }] },
    micHint: { marginTop: 20, fontSize: 15, color: '#666', textAlign: 'center' }
});