import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StatusBar, Switch, Platform } from 'react-native';
// YENİ VE KESİN ÇÖZÜM: İşletim sisteminin tuş boşluklarını hesaplayan hook
import { useSafeAreaInsets } from 'react-native-safe-area-context'; 
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';

export default function HomeScreen({ route, navigation }) {
    const { userData, loginUser } = useUser();
    const user = userData || route.params?.user;
    const { theme, isDark, toggleTheme } = useTheme();
    
    // SİHİRLİ KOD: Android ve iOS tuş yüksekliğini ölçer (Örn: Android'de 48px, iOS'ta 34px)
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
    const [dailyGoal, setDailyGoal] = useState(user.daily_goal || 5);
    const [savingGoal, setSavingGoal] = useState(false);
    const [isExtraMode, setIsExtraMode] = useState(false);
    
    const [toastMessage, setToastMessage] = useState(null);
    const cancelledUndos = useRef(new Set());

    // DÜZELTME: Çift yazılan satır silindi, sadece bunlar kaldı:
    const [undoWordId, setUndoWordId] = useState(null);
    const [undoWord, setUndoWord] = useState(null); // YENİ: Sildiğimiz kelimeyi tutacak hafıza

    const totalWords = 6066;

    useEffect(() => { 
        if (!userData && route.params?.user) loginUser(route.params.user);
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchInitialData(false);
        }, [user?.user_id])
    );

    const fetchInitialData = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const [wordRes, reviewRes, learnedRes, userRes] = await Promise.all([
                apiClient.get(`/get-my-words/${user.user_id}`),
                apiClient.get(`/get-review-words/${user.user_id}`),
                apiClient.get(`/get-learned-words/${user.user_id}`),
                apiClient.get(`/get-user/${user.user_id}`) 
            ]);

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

            const remainingGoal = Math.max(0, fetchedDailyGoal - fetchedLearnedToday);
            
            setWords(prev => {
                if (isExtraMode && prev.length > 0) return prev;
                return newWords.slice(0, remainingGoal);
            });
            
            setReviewWords(Array.isArray(reviewRes.data) ? reviewRes.data : []);
            setLearnedCount(Array.isArray(learnedRes.data) ? learnedRes.data.length : 0);

            if (userRes.data && userRes.data.status === "success") {
                loginUser(userRes.data); 
            }
            
        } catch (error) {
            console.log("Veri senkronizasyon hatası:", error);
            setWords([]); setReviewWords([]);
        } finally { setLoading(false); }
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

    const handleKnown = (item) => { // DÜZELTME: Sadece word_id değil, tüm "item" objesini alıyoruz
        const word_id = item.id;
        setUndoWordId(word_id);
        setUndoWord(item); // YENİ: Kelimeyi geçici hafızaya al
        setWords(prev => prev.filter(w => w.id !== word_id));
        showToast('Öğrenildi! (3sn içinde geri alabilirsin)');

        setTimeout(async () => {
            if (cancelledUndos.current.has(word_id)) {
                cancelledUndos.current.delete(word_id); 
                return;
            }

            try {
                const res = await apiClient.post(`/mark-word-learned/?user_id=${user.user_id}&word_id=${word_id}&is_practice=false`);
                setLearnedCount(res.data.total_learned);
                
                const nextRes = await apiClient.get(`/get-my-words/${user.user_id}?force_extra=1`);
                const responseData = nextRes.data;
                
                if (responseData && responseData.words && responseData.words.length > 0) {
                    setWords(prev => {
                        const existingIds = prev.map(w => w.id);
                        const additions = responseData.words.filter(w => !existingIds.includes(w.id));
                        const remainingGoal = Math.max(0, dailyGoal - learnedToday);
                        
                        if (remainingGoal === 0) return [...prev, ...additions];
                        return [...prev, ...additions].slice(0, remainingGoal);
                    });
                } else {
                    setIsExtraMode(false);
                }
            } catch (error) { 
                console.log("Biliyorum API Hatası:", error); 
            }
            
            // Süre dolunca (geri alınmadıysa) hafızayı temizle
            setUndoWordId(prev => prev === word_id ? null : prev);
            setUndoWord(null); 
        }, 3000);
    };

    const handleUndo = () => {
        if (undoWordId && undoWord) {
            cancelledUndos.current.add(undoWordId); 
            
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
        const isSelected = !!studyList.find(s => s.id === item.id);
        return (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: isSelected ? theme.accent : theme.border }]}>
                <View style={styles.wordInfo}>
                    <Text style={[styles.wordEn, { color: theme.text }]}>{item.word_en}</Text>
                    <Text style={[styles.wordTr, { color: theme.textSecondary }]}>{item.meaning_tr}</Text>
                </View>
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.studyBtn, { backgroundColor: isSelected ? theme.accent : theme.progressBg }]}
                        onPress={() => handleStudy(item)}
                    >
                        <Text style={[styles.studyBtnText, { color: isSelected ? '#FFF' : theme.text }]}>
                            {isSelected ? "📋 Seçildi" : "➕ Çalış"}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.knownBtn, { backgroundColor: theme.primaryLight }]}
                        onPress={() => handleKnown(item)} // DÜZELTME: item.id yerine item gönderiyoruz
                        disabled={isSelected}
                    >
                        <Text style={[styles.knownBtnText, { color: theme.successText }]}>✔ Biliyorum</Text>
                    </TouchableOpacity>
                </View>
            </View>
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
                                        renderReviewCard(pending[0])
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

            {/* GAMES TAB */}
            {currentTab === 'games' && (
                <View style={styles.tabContentContainer}>
                    <Text style={styles.tabContentEmoji}>⚽</Text>
                    <Text style={[styles.tabContentTitle, { color: theme.text }]}>Zamana Karşı Penaltı</Text>
                    <Text style={[styles.tabContentDesc, { color: theme.textSecondary, marginBottom: 30 }]}>
                        5 saniyen var. Doğru bil, golü at. Rekorunu kır!
                    </Text>
                    
                    <TouchableOpacity
                        style={{ backgroundColor: theme.primary, paddingVertical: 16, paddingHorizontal: 35, borderRadius: 25, elevation: 5 }}
                        onPress={() => navigation.navigate('PenaltyGame', { words: words.length > 0 ? words : learnedWordsList })}
                    >
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>OYNAYA BAŞLA ➔</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* PROFILE TAB */}
            {currentTab === 'profile' && (
                <ScrollView contentContainerStyle={[styles.profileContent, { paddingBottom: 120 }]}>
                    <Text style={[styles.profileTitle, { color: theme.text }]}>👤 Hesabım</Text>
                    <Text style={[styles.profileUsername, { color: theme.textSecondary }]}>{user.username || 'Kullanıcı'}</Text>

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

                    <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.profileSectionTitle, { color: theme.text }]}>📊 İstatistikler</Text>
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.primary }]}>{learnedCount}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Öğrenilen</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.accent }]}>{reviewWords.length}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Tekrar Bekliyor</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={[styles.statValue, { color: theme.warning }]}>{user.streak_count || 0}</Text>
                                <Text style={[styles.statLabel, { color: theme.textMuted }]}>🔥 Seri</Text>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.logoutBtn, { borderColor: theme.danger }]}
                        onPress={handleLogout}
                    >
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

            {/* Toast */}
            {toastMessage && (
                <View style={[undoWordId ? styles.undoToast : styles.toast]}>
                    <Text style={styles.toastText}>{toastMessage}</Text>
                    {undoWordId && (
                        <TouchableOpacity onPress={handleUndo} style={styles.undoBtn}>
                            <Text style={styles.undoBtnText}>Geri Al</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
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