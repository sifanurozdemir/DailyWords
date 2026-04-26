import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StatusBar, Switch, Platform, Animated } from 'react-native';
// YENİ VE KESİN ÇÖZÜM: İşletim sisteminin tuş boşluklarını hesaplayan hook
import { useSafeAreaInsets } from 'react-native-safe-area-context'; 
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import StoryListScreen from './StoryListScreen';

export default function HomeScreen({ route, navigation }) {
    const { userData, loginUser } = useUser();
    const user = userData || route.params?.user;
    const { theme, isDark, toggleTheme } = useTheme();
    
    // SİHİRLİ KOD: Android ve iOS tuş yüksekliğini ölçer
    const insets = useSafeAreaInsets(); 

    const [words, setWords] = useState([]);
    const [reviewWords, setReviewWords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [learnedCount, setLearnedCount] = useState(0);
    const [learnedToday, setLearnedToday] = useState(0);
    const [studyList, setStudyList] = useState([]);
    const [showLearnedModal, setShowLearnedModal] = useState(false);
    const [learnedWordsList, setLearnedWordsList] = useState([]);
    const [currentTab, setCurrentTab] = useState('home');
    const [dailyGoal, setDailyGoal] = useState(user?.daily_goal || 5);
    const [savingGoal, setSavingGoal] = useState(false);
    const [isExtraMode, setIsExtraMode] = useState(false);
    
    const [toastMessage, setToastMessage] = useState(null);

    // --- YENİ SİSTEM: PROGRESS BAR VE GERİ ALMA DEĞİŞKENLERİ (TEKİL TANIM) ---
    const [undoId, setUndoId] = useState(null); // Hangi kelime geri sayımda?
    const undoTimerRef = useRef(null); // Zamanlayıcı referansı
    const progressAnim = useRef(new Animated.Value(0)).current; // Animasyon çizgisi değeri
    const fetchIdRef = useRef(0); // Race condition (Yarış durumu) önleyici referans
    const undoIdRef = useRef(null); // Geri alma durumu kontrolü için ek ref
    const recentlyLearnedIds = useRef(new Set()); // Zombi kelimeleri önlemek için önbellek

    const totalWords = 6066;

    // ... useEffect ve diğer fonksiyonlar buradan devam ediyor
    // SİHİRLİ DÜZELTME 2: Ekstra moddaki 5 kelime bittiğinde otomatik olarak kupaya dön.
    useEffect(() => {
        if (isExtraMode && words.length === 0 && !loading) {
            setIsExtraMode(false);
        }
    }, [words.length, isExtraMode, loading]);

    useFocusEffect(
        useCallback(() => {
            fetchInitialData(false);
        }, [user?.user_id])
    );

    const fetchInitialData = async (showLoading = true, appendOnly = false) => {
        const currentFetchId = ++fetchIdRef.current;
        try {
            if (showLoading) setLoading(true);
            const t = Date.now(); // Caching sorununu çözmek için (Cache buster)
            const [wordRes, reviewRes, learnedRes, userRes] = await Promise.all([
                apiClient.get(`/get-my-words/${user.user_id}${isExtraMode ? '?force_extra=5&' : '?'}t=${t}`),
                apiClient.get(`/get-review-words/${user.user_id}?t=${t}`),
                apiClient.get(`/get-learned-words/${user.user_id}?t=${t}`),
                apiClient.get(`/get-user/${user.user_id}?t=${t}`) 
            ]);

            // Eğer bu istek atıldıktan sonra yeni bir istek atıldıysa, eski isteği yoksay
            if (currentFetchId !== fetchIdRef.current) return;

            let newWords = [];
            let fetchedLearnedToday = 0;
            let fetchedDailyGoal = user.daily_goal || 5;

            if (wordRes.data && wordRes.data.words) {
                newWords = wordRes.data.words;
                fetchedLearnedToday = wordRes.data.learned_today || 0;
                fetchedDailyGoal = wordRes.data.daily_goal || fetchedDailyGoal;
            } else if (Array.isArray(wordRes.data)) {
                newWords = wordRes.data;
            }

            setLearnedToday(fetchedLearnedToday);
            setDailyGoal(fetchedDailyGoal);

            // SİHİRLİ DÜZELTME: Sunucudan gelen en güncel kullanıcı verilerini (XP, rekorlar vb.) hafızaya işle
            if (userRes.data) {
                loginUser(userRes.data);
            }

            const remainingGoal = Math.max(0, fetchedDailyGoal - fetchedLearnedToday);
            
            setWords(prev => {
                if (appendOnly) {
                    // SİHİRLİ DÜZELTME: 
                    // Ekstra moddaysak ekranda sürekli 5 kelime tut (Sonsuz pratik),
                    // Normal moddaysak kalan hedefe göre eksikleri tamamla (Kelimeler azalarak biter).
                    const needed = isExtraMode ? (5 - prev.length) : (remainingGoal - prev.length);
                    
                    if (needed > 0) {
                        const existingIds = new Set(prev.map(w => w.id));
                        const additionalWords = newWords
                            .filter(w => !existingIds.has(w.id) && !recentlyLearnedIds.current.has(w.id))
                            .slice(0, needed);
                        
                        return [...prev, ...additionalWords];
                    }
                    
                    // Normal modda hedefe ulaşıldığında fazlalıkları siler, ekstra modda dokunmaz.
                    return isExtraMode ? prev : prev.slice(0, Math.max(0, remainingGoal));
                }

                // Uygulamanın ilk açılışı veya Extra Moda ("Öğrenmeye Devam Et") ilk basıldığı an
                if (isExtraMode) {
                    return newWords.length > 0 ? newWords : prev;
                } else {
                    return newWords.length > 0 ? newWords.slice(0, remainingGoal === 0 ? newWords.length : remainingGoal) : [];
                }
            });
            
            setReviewWords(Array.isArray(reviewRes.data) ? reviewRes.data : []);
            setLearnedCount(Array.isArray(learnedRes.data) ? learnedRes.data.length : 0);

            if (userRes.data && userRes.data.status === "success") {
                loginUser(userRes.data); 
            }
            
        } catch (error) {
            console.log("Veri senkronizasyon hatası:", error);
            // Hata durumunda listeyi SİLMİYORUZ, böylece ekranda kelimeler kaybolmaz
        } finally { 
            if (currentFetchId === fetchIdRef.current) {
                setLoading(false); 
            }
        }
    };

    const showToast = (message) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const openLearnedModal = async () => {
        try {
            const res = await apiClient.get(`/get-learned-words/${user.user_id}`);
            setLearnedWordsList(Array.isArray(res.data) ? res.data : []);
            setShowLearnedModal(true);
        } catch (e) { showToast("Liste yüklenemedi."); }
    };

    // --- GÜNCELLENEN handleKnown FONKSİYONU ---
    const handleKnown = (item) => {
    const word_id = item.id;

    // Eğer buton zaten geri sayım modundaysa ve tekrar basıldıysa: İPTAL ET
    if (undoId === word_id) {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        progressAnim.setValue(0); // Çizgiyi sıfırla
        setUndoId(null); // Moddan çık
        return;
    }

    // İlk tıklama: Modu aktif et ve çizgiyi baştan başlat
    setUndoId(word_id);
    progressAnim.setValue(0);

    // Çizgiyi 1.5 saniyede doldur (0'dan 1'e)
    Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: false,
    }).start();

    // Zombi kelime önlemi: Olası backend gecikmesine karşı bunu şimdiden hafızaya al
    recentlyLearnedIds.current.add(word_id);

    // 1.5 saniye sonra işlemi kesinleştir
    undoTimerRef.current = setTimeout(async () => {
        setUndoId(null);
        progressAnim.setValue(0);
        
        // Kartı ekrandan kaldır (anında)
        setWords(prev => prev.filter(w => w.id !== word_id));

        // API kaydını yap
        try {
            const res = await apiClient.post(`/mark-word-learned/?user_id=${user.user_id}&word_id=${word_id}&is_practice=false`);
            setLearnedCount(res.data.total_learned);
            
            // API kaydı başarılı olunca yerine hemen yenisini çek, ama SADECE EKSİĞİ TAMAMLA!
            fetchInitialData(false, true);
        } catch (error) {
            console.log("Hata:", error);
        }
    }, 1500);
};

    const handleUndo = () => {
        if (undoWordId && undoWord) {
            cancelledUndos.current.add(undoWordId); 
            
            // Geri aldığımız için zombi listesinden çıkarıyoruz
            recentlyLearnedIds.current.delete(undoWordId);
            
            // SİHİRLİ DOKUNUŞ: Backend'e hiç sormadan, hafızadaki kelimeyi listenin başına ekle!
            setWords(prev => [undoWord, ...prev]); 
            
            setUndoWordId(null);
            setUndoWord(null);
            setToastMessage(null);
        }
    };

    const handleStudy = (item) => {
        if (studyList.find(s => s.id === item.id)) {
            setStudyList(prev => prev.filter(s => s.id !== item.id));
        } else {
            setStudyList(prev => [...prev, item]);
        }
    };

    const handleLearnMore = async () => {
        try {
            setLoading(true); 
            
            const res = await apiClient.get(`/get-my-words/${user.user_id}?force_extra=5`);
            
            if (res.data && res.data.words && res.data.words.length > 0) {
                setWords(res.data.words);
                setIsExtraMode(true); 
                showToast("5 yeni kelime daha eklendi! 🔥");
            } else {
                showToast("Şu an için yeni kelime bulunamadı.");
            }
        } catch (e) { 
            console.log("Ekstra kelime çekme hatası:", e);
            showToast("Yeni kelimeler yüklenemedi."); 
        } finally { 
            setLoading(false); 
        }
    };

    const handleUpdateGoal = async (goal) => {
        setSavingGoal(true);
        try {
            await apiClient.post(`/update-daily-goal/?user_id=${user.user_id}&daily_goal=${goal}`);
            setDailyGoal(goal);
            showToast(`Günlük hedef ${goal} kelime olarak güncellendi! ✅`);
            if (userData && loginUser) {
                loginUser({ ...userData, daily_goal: goal });
            }
            fetchInitialData(true);
        } catch (e) { showToast("Hedef güncellenemedi."); }
        finally { setSavingGoal(false); }
    };

    const handleLogout = () => {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    };

    const renderWordItem = ({ item }) => {
        return (
            <WordCard 
                key={item.id}
                item={item}
                theme={theme}
                isSelected={!!studyList.find(s => s.id === item.id)}
                onStudy={handleStudy}
                onConfirm={async (word_id) => {
                    // 1. Kelimeyi anında ekrandan kaldır (Kullanıcı bekletilmez)
                    setWords(prev => prev.filter(w => w.id !== word_id));
                    
                    // 2. Zombi kelime önlemi: Aynı kelimenin tekrar gelmesini engelle
                    recentlyLearnedIds.current.add(word_id);

                    try {
                        // 3. Backend'e kelimenin öğrenildiğini bildir
                        const res = await apiClient.post(`/mark-word-learned/?user_id=${user.user_id}&word_id=${word_id}&is_practice=false`);
                        
                        // 4. Öğrenilen sayısını güncelle
                        setLearnedCount(res.data.total_learned);
                        
                        // 5. SİHİRLİ DOKUNUŞ: Arka planda sessizce (loading olmadan) yeni kelime çek
                        // İlk parametre false: Ekranda dönen loading çıkarma
                        // İkinci parametre true: Sadece eksilen kelimenin yerine ekle (appendOnly)
                        fetchInitialData(false, true); 
                        
                    } catch (e) { 
                        console.log("Kelime işaretlenirken hata:", e); 
                    }
                }}
            />
        );
    };


    const renderReviewCard = (item) => {
        const reviewedToday = item.reviewed_today;
        return (
            <TouchableOpacity
                key={`review-${item.id}`}
                style={[styles.reviewCard, {
                    backgroundColor: reviewedToday ? theme.progressBg : theme.card,
                    borderColor: reviewedToday ? theme.border : theme.accent,
                    opacity: reviewedToday ? 0.6 : 1
                }]}
                onPress={() => {
                    if (!reviewedToday) {
                        navigation.navigate('ContextReview', { word: item, user_id: user.user_id });
                    }
                }}
                disabled={reviewedToday}
            >
                <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewWord, { color: reviewedToday ? theme.textMuted : theme.text }]}>{item.word_en}</Text>
                    <Text style={[styles.reviewTr, { color: theme.textSecondary }]}>{item.meaning_tr}</Text>
                </View>
                <Text style={{ fontSize: 20 }}>{reviewedToday ? '✅' : '🔄'}</Text>
            </TouchableOpacity>
        );
    };

    const remainingGoal = Math.max(0, dailyGoal - learnedToday);

    // --- PROFIL EKRANI MANTIK HESAPLAMALARI ---
    const safeUser = userData || user || {};
    const totalXp = (Number(safeUser.xp) || 0) + (Number(safeUser.penalty_total_xp) || 0) + (Number(safeUser.bug_hunt_total_xp) || 0) + (Number(safeUser.swipe_match_total_xp) || 0);

    const getMedal = (score, bronze = 5, silver = 10, gold = 15) => {
        if (score >= gold) return { icon: '🥇', label: 'Altın', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
        if (score >= silver) return { icon: '🥈', label: 'Gümüş', color: '#C0C0C0', bg: 'rgba(192, 192, 192, 0.15)' };
        if (score >= bronze) return { icon: '🥉', label: 'Bronz', color: '#CD7F32', bg: 'rgba(205, 127, 50, 0.15)' };
        return { icon: '🔒', label: 'Kilitli', color: '#666', bg: 'transparent' };
    };

    const penaltyMedal = getMedal(safeUser.penalty_high_score || 0, 5, 10, 15);
    const comboMedal = getMedal(safeUser.highest_combo || 0, 5, 10, 15);
    const bugHuntMedal = getMedal(safeUser.bug_hunt_high_score || 0, 10, 25, 50);
    const swipeMatchMedal = getMedal(safeUser.swipe_match_high_score || 0, 15, 20, 25);


    const userLevel = Math.floor(totalXp / 500) + 1;
    const nextLevelXp = userLevel * 100;
    const currentLevelProgress = ((totalXp % 100) / 100) * 100;

    const getLevelTitle = (lvl) => {
        if (lvl < 3) return "Dil Çırağı";
        if (lvl < 7) return "Kelime Avcısı";
        if (lvl < 15) return "Linguist";
        if (lvl < 30) return "Sözlük Yutan";
        return "Dil Üstadı";
    };

    // ---------------------------------------------

    return (
        <View style={[styles.outerContainer, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            {/* HOME TAB */}
            {currentTab === 'home' && (
                <View style={styles.container}>
                    <TouchableOpacity onPress={openLearnedModal} activeOpacity={0.8}>
                        <View style={[styles.progressSection, { backgroundColor: theme.card }]}>
                            <Text style={[styles.statsText, { color: theme.text }]}>{learnedCount} / {totalWords} Kelime</Text>
                            <View style={[styles.progressBarBg, { backgroundColor: theme.progressBg }]}>
                                <View style={[styles.progressBarFill, { width: `${Math.min((learnedCount / totalWords) * 100, 100)}%`, backgroundColor: theme.primary }]} />
                            </View>
                            <Text style={[styles.clickHint, { color: theme.textMuted }]}>Öğrendiğin kelimelerin listesini görmek için tıkla</Text>
                        </View>
                    </TouchableOpacity>

                    {loading ? <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 30 }} /> : (
                        <ScrollView contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
                            <Text style={[styles.listTitle, { color: theme.text }]}>Günlük Öğrenme ({Math.min(learnedToday, dailyGoal)} / {dailyGoal})</Text>
                            
                            {words.length > 0 ? (
                                <View>
                                    {words.map(item => (
                                        <React.Fragment key={`new-${item.id}`}>{renderWordItem({ item })}</React.Fragment>
                                    ))}
                                    
                                    {(learnedToday >= dailyGoal) && (
                                        <TouchableOpacity
                                            style={{ marginTop: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: theme.danger, borderRadius: 15, borderStyle: 'dashed' }}
                                            onPress={() => {
                                                setIsExtraMode(false);
                                                setWords([]); 
                                                setStudyList([]); 
                                            }}
                                        >
                                            <Text style={{ color: theme.danger, fontWeight: 'bold', fontSize: 15 }}>🛑 Bugünlük bu kadar yeter, kupaya dön</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (learnedToday >= dailyGoal && !isExtraMode) ? (
                                <View style={[styles.completedBox, { backgroundColor: theme.card }]}>
                                    <Text style={styles.completedEmoji}>🏆</Text>
                                    <Text style={[styles.completedTitle, { color: theme.primary }]}>Bugünkü hedefini tamamladın!</Text>
                                    <Text style={[styles.completedSub, { color: theme.textSecondary }]}>Yarın görüşmek üzere. Varsa tekrarlarını yapabilirsin.</Text>
                                    <TouchableOpacity style={[styles.learnMoreBtn, { borderColor: theme.warning }]} onPress={handleLearnMore}>
                                        <Text style={[styles.learnMoreBtnText, { color: theme.warning }]}>🔥 Öğrenmeye devam etmek ister misin?</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={[styles.completedBox, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, padding: 25 }]}>
                                    <ActivityIndicator size="small" color={theme.primary} style={{ marginBottom: 15 }} />
                                    <Text style={[styles.completedTitle, { color: theme.text }]}>Yeni kelimeler hazırlanıyor...</Text>
                                    <Text style={[styles.completedSub, { color: theme.textMuted }]}>Listen güncelleniyor, lütfen bekle.</Text>
                                </View>
                            )}

                            {reviewWords.length > 0 && (() => {
                                const pending = reviewWords.filter(w => !w.reviewed_today);
                                const completed = reviewWords.length - pending.length;
                                return (
                                <View style={{ marginTop: 30 }}>
                                    <Text style={[styles.listTitle, { color: theme.text }]}>🔄 Tekrar Zamanı (SRS)</Text>
                                    <Text style={[styles.srsSubtitle, { color: theme.textMuted }]}>İlerleme: {completed} / {reviewWords.length} tamamlandı.</Text>
                                    {pending.length > 0 ? (
                                        <TouchableOpacity
                                            style={[styles.sessionBtn, { backgroundColor: theme.primary }]}
                                            onPress={() => navigation.navigate('ContextReview', { pendingWords: pending, user_id: user.user_id })}
                                        >
                                            <Text style={styles.sessionBtnText}>
                                                🔥 SEANSA BAŞLA ({pending.length} Kelime) ➔
                                            </Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <Text style={{ color: theme.successText, fontWeight: 'bold' }}>Bugün bütün tekrarlarını bitirdin! 🎉</Text>
                                    )}
                                </View>
                                )
                            })()}
                        </ScrollView>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.startBtn, 
                            { 
                                backgroundColor: studyList.length > 0 ? theme.accent : theme.border, 
                                shadowColor: theme.accent, 
                                opacity: studyList.length > 0 ? 1 : 0.6,
                                // DÜZELTME: Başla butonu da Android tuşlarının üzerine itilir
                                bottom: Math.max(90, 70 + insets.bottom) 
                            }
                        ]}
                        onPress={() => navigation.navigate('Practice', { studyList, user_id: user.user_id })}
                        disabled={studyList.length === 0}
                    >
                        <Text style={styles.startBtnText}>
                            {remainingGoal > 0 
                                ? `ÖĞRENMEYE BAŞLA (${studyList.length}/${remainingGoal}) ➔` 
                                : studyList.length > 0 
                                    ? `EKSTRA ÇALIŞ (${studyList.length}) ➔` 
                                    : "GÜNLÜK HEDEF TAMAMLANDI 🎉"}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* GAMES TAB - OYUN MERKEZİ */}
            {currentTab === 'games' && (
                <ScrollView 
                    contentContainerStyle={{ padding: 20, paddingTop: 50, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[styles.profileTitle, { color: theme.text, marginBottom: 5 }]}>🎮 Oyun Merkezi</Text>
                    <Text style={[styles.profileUsername, { color: theme.textSecondary, marginBottom: 25 }]}>
                        Kelimeleri eğlenerek pekiştir!
                    </Text>

                    {/* 1. OYUN: PENALTI (AKTİF) */}
                    <TouchableOpacity 
                        style={[styles.profileCard, { 
                            backgroundColor: theme.card, 
                            borderColor: theme.primary, 
                            borderWidth: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 15
                        }]}
                        onPress={() => navigation.navigate('PenaltyStart', { words: words.length > 0 ? words : learnedWordsList })}
                    >
                        <View style={{ width: 60, height: 60, backgroundColor: theme.primaryLight, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 30 }}>⚽</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileSectionTitle, { color: theme.text, marginBottom: 2 }]}>Zamana Karşı Penaltı</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
                                5 saniyen var. Doğru bil, golü at. Rekorunu kır!
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.primary} />
                    </TouchableOpacity>

                    {/* 2. OYUN: CODE REFACTOR (AKTİF EDİLDİ) */}
                    <TouchableOpacity 
                        style={[styles.profileCard, { 
                            backgroundColor: theme.card, 
                            borderColor: theme.primary, 
                            borderWidth: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 15,
                            marginTop: 15
                        }]}
                        onPress={() => navigation.navigate('RefactorStart')}
                    >
                        <View style={{ width: 60, height: 60, backgroundColor: theme.primaryLight, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 30 }}>👨‍💻</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileSectionTitle, { color: theme.text, marginBottom: 2 }]}>Code Refactor</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                                Cümle dizilimini kod bloklarıyla düzelt.
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.primary} />
                    </TouchableOpacity>

                    {/* 3. OYUN: BUG HUNT (AKTİF) */}
                    <TouchableOpacity 
                        style={[styles.profileCard, { 
                            backgroundColor: theme.card, 
                            borderColor: theme.primary, 
                            borderWidth: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 15,
                            marginTop: 15
                        }]}
                        onPress={() => navigation.navigate('BugHuntStartScreen', { words: learnedWordsList.length > 0 ? learnedWordsList : words })}
                    >
                        <View style={{ width: 60, height: 60, backgroundColor: theme.primaryLight, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 30 }}>🐛</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileSectionTitle, { color: theme.text, marginBottom: 2 }]}>Bug Hunt</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
                                İngilizce duyduğun kelimeyi böcek sisteme ulaşmadan yaz!
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.primary} />
                    </TouchableOpacity>

                    {/* 4. OYUN: SWIPE MATCH (YENİ) */}
                    <TouchableOpacity 
                        style={[styles.profileCard, { 
                            backgroundColor: theme.card, 
                            borderColor: theme.primary, 
                            borderWidth: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 15,
                            marginTop: 15
                        }]}
                        onPress={() => navigation.navigate('SwipeGameStartScreen', { words: learnedWordsList.length > 0 ? learnedWordsList : words })}
                    >
                        <View style={{ width: 60, height: 60, backgroundColor: theme.primaryLight, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 30 }}>🔥</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileSectionTitle, { color: theme.text, marginBottom: 2 }]}>Swipe Match</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={2}>
                                Doğru anlam sağa, yanlış anlam sola! Zaman dolmadan eşleştir.
                            </Text>
                        </View>
                        <View style={{ backgroundColor: theme.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#fff' }}>YENİ</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={theme.primary} />
                    </TouchableOpacity>

                    {/* 5. OYUN: THE INTERVIEWER (YAKINDA) */}
                    <View 
                        style={[styles.profileCard, { 
                            backgroundColor: theme.card, 
                            borderColor: theme.border, 
                            opacity: 0.7,
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 15,
                            marginTop: 15
                        }]}
                    >
                        <View style={{ width: 60, height: 60, backgroundColor: theme.progressBg, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Text style={{ fontSize: 30, opacity: 0.5 }}>💼</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.profileSectionTitle, { color: theme.textMuted, marginBottom: 2 }]}>The Interviewer</Text>
                            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                                Teknik mülakatlara hazırlık simülasyonu.
                            </Text>
                        </View>
                        <View style={{ backgroundColor: theme.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: theme.textMuted }}>YAKINDA</Text>
                        </View>
                    </View>

                </ScrollView>
            )}

            {/* HİKAYELER TAB */}
            {currentTab === 'stories' && (
                <View style={{ flex: 1, paddingBottom: 100 }}>
                    <StoryListScreen navigation={navigation} isTab={true} />
                </View>
            )}

            {/* PROFILE TAB - GELİŞMİŞ GÖRÜNÜM */}
            {currentTab === 'profile' && (
                <ScrollView contentContainerStyle={[styles.profileContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
                    
                    {/* Üst Kısım: Profil ve Seviye (Level) */}
                    <View style={{ alignItems: 'center', marginBottom: 25 }}>
                        <View style={[styles.avatarCircle, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                            <Text style={{ fontSize: 45 }}>🦁</Text>
                        </View>
                        <Text style={[styles.profileTitle, { color: theme.text, marginTop: 10, fontSize: 24 }]}>{user.username || 'Kullanıcı'}</Text>
                        <Text style={[styles.profileUsername, { color: theme.primary, fontWeight: 'bold', fontSize: 16 }]}>
                            🌟 Level {userLevel} - {getLevelTitle(userLevel)}
                        </Text>
                    </View>

                    {/* Level İlerleme Çubuğu */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.primary, borderWidth: 1.5 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: theme.text, fontWeight: 'bold' }}>Sıradaki Seviyeye</Text>
                            <Text style={{ color: theme.primary, fontWeight: 'bold' }}>{totalXp} / {nextLevelXp} XP</Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: theme.progressBg, height: 16, borderRadius: 8 }]}>
                            <View style={[styles.progressBarFill, { width: `${currentLevelProgress}%`, backgroundColor: theme.primary, borderRadius: 8 }]} />
                        </View>
                    </View>

                    {/* Ateş Serisi (Streak) */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.warning, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', padding: 20 }]}>
                        <Text style={{ fontSize: 45, marginRight: 15 }}>🔥</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>{user.streak_count || 0} Günlük Seri</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>Her gün gir, serini ateşle ve kaybetme!</Text>
                        </View>
                    </View>

                    {/* Oyun Başarımları (Medals) */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.profileSectionTitle, { color: theme.text, marginBottom: 15 }]}>🏆 Oyun Başarımları</Text>
                        
                        <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                            <View style={[styles.medalBox, { backgroundColor: penaltyMedal.bg }]}>
                                <Text style={{ fontSize: 35 }}>{penaltyMedal.icon}</Text>
                            </View>
                            <View style={{ flex: 1, justifyContent: 'center', marginLeft: 15 }}>
                                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>Zamana Karşı Penaltı</Text>
                                <Text style={{ color: penaltyMedal.color, fontWeight: 'bold' }}>{penaltyMedal.label} Madalya (Rekor: {user.penalty_high_score || 0})</Text>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                            <View style={[styles.medalBox, { backgroundColor: comboMedal.bg }]}>
                                <Text style={{ fontSize: 35 }}>{comboMedal.icon}</Text>
                            </View>
                            <View style={{ flex: 1, justifyContent: 'center', marginLeft: 15 }}>
                                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>Code Refactor</Text>
                                <Text style={{ color: comboMedal.color, fontWeight: 'bold' }}>{comboMedal.label} Madalya (Kombo: {user.highest_combo || 0})</Text>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', marginBottom: 15 }}>
                            <View style={[styles.medalBox, { backgroundColor: bugHuntMedal.bg }]}>
                                <Text style={{ fontSize: 35 }}>{bugHuntMedal.icon}</Text>
                            </View>
                            <View style={{ flex: 1, justifyContent: 'center', marginLeft: 15 }}>
                                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>Bug Hunt</Text>
                                <Text style={{ color: bugHuntMedal.color, fontWeight: 'bold' }}>{bugHuntMedal.label} Madalya (Rekor: {user.bug_hunt_high_score || 0})</Text>
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row' }}>
                            <View style={[styles.medalBox, { backgroundColor: swipeMatchMedal.bg }]}>
                                <Text style={{ fontSize: 35 }}>{swipeMatchMedal.icon}</Text>
                            </View>
                            <View style={{ flex: 1, justifyContent: 'center', marginLeft: 15 }}>
                                <Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 16 }}>Swipe Match</Text>
                                <Text style={{ color: swipeMatchMedal.color, fontWeight: 'bold' }}>{swipeMatchMedal.label} Madalya (Rekor: {user.swipe_match_high_score || 0})</Text>
                            </View>
                        </View>
                    </View>

                    {/* Genel İstatistikler */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.profileSectionTitle, { color: theme.text }]}>📊 Eğitim İstatistikleri</Text>
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.primary }]}>{learnedCount}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Öğrenilen</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.accent }]}>{totalXp}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Toplam XP</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.successText }]}>{user.daily_goal}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Günlük Hedef</Text>
                            </View>
                        </View>
                    </View>

                    {/* Günlük Hedef Ayarı */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.profileSectionTitle, { color: theme.text }]}>🎯 Günlük Kelime Hedefi</Text>
                        <View style={styles.goalRow}>
                            {[3, 5, 10].map(g => (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.goalChip,
                                        {
                                            borderColor: dailyGoal === g ? theme.primary : theme.border,
                                            backgroundColor: dailyGoal === g ? theme.primaryLight : theme.background
                                        }
                                    ]}
                                    onPress={() => handleUpdateGoal(g)}
                                    disabled={savingGoal}
                                >
                                    <Text style={[styles.goalChipText, { color: dailyGoal === g ? theme.successText : theme.textSecondary }]}>{g} kelime</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {savingGoal && <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 10 }} />}
                    </View>

                    {/* Tema Tercihi */}
                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.profileSectionTitle, { color: theme.text }]}>🌙 Görünüm Tercihi</Text>
                        <View style={styles.themeRow}>
                            <Text style={[styles.themeLabel, { color: theme.textSecondary }]}>{isDark ? 'Karanlık Mod' : 'Aydınlık Mod'}</Text>
                            <Switch
                                value={isDark}
                                onValueChange={toggleTheme}
                                thumbColor={isDark ? theme.primary : '#f4f3f4'}
                                trackColor={{ false: theme.progressBg, true: theme.primaryDark }}
                            />
                        </View>
                    </View>

                    <TouchableOpacity style={[styles.logoutBtn, { borderColor: theme.danger }]} onPress={handleLogout}>
                        <Text style={[styles.logoutBtnText, { color: theme.danger }]}>🚪 Çıkış Yap</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}

            {/* BOTTOM NAV BAR (Profesyonel Edge-to-Edge Uyumlu) */}
            <View style={[
                styles.bottomBar, 
                { 
                    backgroundColor: theme.bottomBar,
                    // SİHİRLİ DOKUNUŞ: Bar her cihaza göre kendi iç boşluğunu ayarlar.
                    // Eğer altta tuş/çizgi varsa o kadar ekstra boşluk ekler, yoksa normal 14 değerini kullanır.
                    paddingBottom: insets.bottom > 0 ? insets.bottom + 5 : 14,
                    paddingTop: 14 
                }
            ]}>
                {[
                    { id: 'home', icon: '📖', label: 'Kelimeler' },
                    { id: 'stories', icon: '📚', label: 'Hikayeler' },
                    { id: 'games', icon: '🎮', label: 'Oyunlar' },
                    { id: 'profile', icon: '🏠', label: 'Hesabım' },
                ].map(tab => (
                    <TouchableOpacity key={tab.id} style={styles.navItem} onPress={() => setCurrentTab(tab.id)}>
                        <Text style={[styles.navIcon, { opacity: currentTab === tab.id ? 1 : 0.4 }]}>{tab.icon}</Text>
                        <Text style={[styles.navText, { color: currentTab === tab.id ? theme.navActive : theme.navText }]}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            

            {/* Öğrenilen Kelimeler Modal */}
            <Modal visible={showLearnedModal} animationType="slide">
                <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
                    <Text style={[styles.modalTitle, { color: theme.text }]}>Öğrendiğin Kelimeler 🎉</Text>
                    <ScrollView>
                        {learnedWordsList.length === 0 ? (
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Henüz kelime öğrenmedin.</Text>
                        ) : learnedWordsList.map(item => (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.modalItem, { backgroundColor: theme.card }]}
                                onPress={() => {
                                    setShowLearnedModal(false);
                                    navigation.navigate('Practice', { studyList: [item], user_id: user.user_id, isReview: true });
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalEn, { color: theme.text }]}>{item.word_en}</Text>
                                    <Text style={[styles.modalTr, { color: theme.textSecondary }]}>{item.meaning_tr}</Text>
                                </View>
                                <Text style={[styles.reviewHint, { color: theme.accent }]}>👀 İncele</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.text }]} onPress={() => setShowLearnedModal(false)}>
                        <Text style={[styles.closeBtnText, { color: theme.card }]}>Kapat</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

        </View>
    );
}

const WordCard = ({ item, theme, onConfirm, isSelected, onStudy }) => {
    const [isWaitingUndo, setIsWaitingUndo] = useState(false);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const timerRef = useRef(null);

    const handlePress = () => {
        if (isWaitingUndo) {
            if (timerRef.current) clearTimeout(timerRef.current);
            progressAnim.setValue(0);
            setIsWaitingUndo(false);
        } else {
            setIsWaitingUndo(true);
            progressAnim.setValue(0);

            Animated.timing(progressAnim, {
                toValue: 100,
                duration: 2000,
                useNativeDriver: false,
            }).start();

            timerRef.current = setTimeout(() => {
                onConfirm(item.id);
            }, 2000);
        }
    };

    // KENAR DOLMA HESAPLAMALARI
    const bottomWidth = progressAnim.interpolate({
        inputRange: [0, 25, 100],
        outputRange: ['0%', '100%', '100%']
    });
    const rightHeight = progressAnim.interpolate({
        inputRange: [0, 25, 50, 100],
        outputRange: ['0%', '0%', '100%', '100%']
    });
    const topWidth = progressAnim.interpolate({
        inputRange: [0, 50, 75, 100],
        outputRange: ['0%', '0%', '100%', '100%']
    });
    const leftHeight = progressAnim.interpolate({
        inputRange: [0, 75, 100],
        outputRange: ['0%', '0%', '100%']
    });

    // Dinamik Çizgi Stili (Gölge/Parlama efekti için)
    const edgeStyle = {
        backgroundColor: theme.text, // Temadaki yazı rengini (siyah veya beyaz) baz alır
        opacity: 0.6, // Şeffaflık sayesinde buton rengiyle uyumlu bir ton oluşturur
        position: 'absolute',
        zIndex: 10,
    };

    return (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: isSelected ? theme.accent : theme.border }]}>
            <View style={styles.wordInfo}>
                <Text style={[styles.wordEn, { color: theme.text }]}>{item.word_en}</Text>
                <Text style={[styles.wordTr, { color: theme.textSecondary }]}>{item.meaning_tr}</Text>
            </View>
            <View style={styles.actionRow}>
                {!isWaitingUndo && (
                    <TouchableOpacity 
                        style={[styles.studyBtn, { backgroundColor: isSelected ? theme.accent : theme.progressBg }]} 
                        onPress={() => onStudy(item)}
                    >
                        <Text style={{ color: isSelected ? '#FFF' : theme.text }}>{isSelected ? "📋 Seçildi" : "➕ Çalış"}</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                        styles.traceContainer, 
                        { 
                            flex: 1, 
                            // EĞER bekliyorsa senin yeşilin, beklemiyorsa temanın orijinal rengi
                            backgroundColor: isWaitingUndo ? '#4a804d' : theme.primaryLight 
                        }
                    ]}
                    onPress={handlePress}
                    disabled={isSelected}
                >
                    {isWaitingUndo && (
                        <>
                            {/* Dolma çizgileri sadece geri sayım varken görünür */}
                            <Animated.View style={[edgeStyle, { bottom: 0, left: 0, height: 3, width: bottomWidth }]} />
                            <Animated.View style={[edgeStyle, { right: 0, bottom: 0, width: 3, height: rightHeight }]} />
                            <Animated.View style={[edgeStyle, { top: 0, right: 0, height: 3, width: topWidth }]} />
                            <Animated.View style={[edgeStyle, { left: 0, top: 0, width: 3, height: leftHeight }]} />
                        </>
                    )}
                    
                    <Text style={[
                        styles.knownBtnText, 
                        { 
                            // Geri al modunda beyaz yazı, normalde temanın yazı rengi
                            color: isWaitingUndo ? '#FFFFFF' : theme.successText,
                            zIndex: 11 
                        }
                    ]}>
                        {isWaitingUndo ? "↩ Geri Al" : "✔ Biliyorum"}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({

    traceContainer: {
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', 
        position: 'relative',
        
    },
    fillEdge: {
        position: 'absolute',
        // backgroundColor buraya yazma, yukarıda dinamik verdik
        zIndex: 10,
    },
    knownBtnText: {
        fontWeight: 'bold',
        fontSize: 15,
        zIndex: 11, // Yazı her zaman en üstte
    },

    outerContainer: { flex: 1 },
    container: { flex: 1, padding: 20, paddingTop: 50 },

    progressSection: { padding: 20, borderRadius: 20, elevation: 3, marginBottom: 20 },
    statsText: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    clickHint: { textAlign: 'center', fontSize: 12, marginTop: 8 },
    progressBarBg: { height: 12, borderRadius: 6, marginTop: 12 },
    progressBarFill: { height: '100%', borderRadius: 6 },

    listTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
    srsSubtitle: { fontSize: 13, marginBottom: 10, marginTop: -6 },

    card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, elevation: 2 },
    wordInfo: { marginBottom: 12 },
    wordEn: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    wordTr: { fontSize: 15 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
    studyBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginRight: 10 },
    studyBtnText: { fontWeight: 'bold' },
    knownBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    knownBtnText: { fontWeight: 'bold' },

    reviewCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 14, marginBottom: 10, borderWidth: 1.5, elevation: 1 },
    reviewWord: { fontSize: 17, fontWeight: 'bold' },
    reviewTr: { fontSize: 14, marginTop: 2 },

    completedBox: { padding: 25, borderRadius: 20, alignItems: 'center', elevation: 2, marginBottom: 20 },
    completedEmoji: { fontSize: 50, marginBottom: 10 },
    completedTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
    completedSub: { fontSize: 14, textAlign: 'center' },
    learnMoreBtn: { marginTop: 18, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 15 },
    learnMoreBtnText: { fontWeight: 'bold', fontSize: 15 },

    // Başla butonu dinamikleştiği için buradan bottom: 90 ayarını sildik, yukarıda JSX içinde tanımlı.
    startBtn: { padding: 18, borderRadius: 20, position: 'absolute', left: 20, right: 20, elevation: 0, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3 },
    startBtnText: { color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 17 },

    sessionBtn: { padding: 16, borderRadius: 16, marginTop: 15, elevation: 3, alignItems: 'center' },
    sessionBtnText: { color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 },

    // Bar stili orijinal ve klasik halinde bırakıldı.
    bottomBar: { 
        flexDirection: 'row', 
        borderTopLeftRadius: 24, 
        borderTopRightRadius: 24, 
        elevation: 15, 
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        justifyContent: 'space-around', 
        position: 'absolute', 
        bottom: 0, // Her zaman ekranın en dibine yapışık!
        width: '100%',
        
    },
    navItem: { alignItems: 'center' },
    navIcon: { fontSize: 24 },
    navText: { fontSize: 11, fontWeight: 'bold', marginTop: 3 },

    tabContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    tabContentEmoji: { fontSize: 60, marginBottom: 20 },
    tabContentTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    tabContentDesc: { fontSize: 16, textAlign: 'center' },

    profileContent: { padding: 20, paddingTop: 55 },
    profileTitle: { fontSize: 26, fontWeight: '800', marginBottom: 5 },
    profileUsername: { fontSize: 16, marginBottom: 25 },
    profileCard: { borderRadius: 18, padding: 18, marginBottom: 15, borderWidth: 1, elevation: 2 },
    profileSectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 14 },
    themeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    themeLabel: { fontSize: 15 },
    goalRow: { flexDirection: 'row', gap: 10 },
    goalChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
    goalChipText: { fontWeight: 'bold', fontSize: 14 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statValue: { fontSize: 28, fontWeight: '800' },
    statLabel: { fontSize: 12, marginTop: 4 },
    logoutBtn: { borderWidth: 2, borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 10 },
    logoutBtnText: { fontSize: 16, fontWeight: 'bold' },

    avatarCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2 },
    medalBox: { width: 60, height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },

    modalContent: { flex: 1, padding: 25 },
    modalTitle: { fontSize: 24, fontWeight: '800', marginBottom: 20, textAlign: 'center', marginTop: 30 },
    modalItem: { padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
    modalEn: { fontSize: 17, fontWeight: 'bold' },
    modalTr: { fontSize: 15, marginTop: 2 },
    reviewHint: { fontSize: 13, fontWeight: 'bold' },
    closeBtn: { padding: 15, borderRadius: 14, marginTop: 15 },
    closeBtnText: { textAlign: 'center', fontWeight: 'bold', fontSize: 15 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 },

    toast: { position: 'absolute', top: 50, alignSelf: 'center', backgroundColor: '#333', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 25, elevation: 5 },
    undoToast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#323232', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 30, elevation: 8, flexDirection: 'row', alignItems: 'center' },
    toastText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    undoBtn: { marginLeft: 14, backgroundColor: '#FFB74D', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15 },
    undoBtnText: { color: '#000', fontWeight: 'bold' },
});