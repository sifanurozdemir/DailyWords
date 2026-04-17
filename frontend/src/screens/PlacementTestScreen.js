import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function PlacementTestScreen({ route, navigation }) {
    const { user_id } = route.params;
    const { theme, isDark } = useTheme();
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedOption, setSelectedOption] = useState(null);
    const [scoreCard, setScoreCard] = useState({ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 });
    const [correctWordIds, setCorrectWordIds] = useState([]);
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [detectedLevel, setDetectedLevel] = useState(null);
    
    // YENİ: Sonuç Ekranı State'leri
    const [showResultScreen, setShowResultScreen] = useState(false);
    const [finalScore, setFinalScore] = useState(0);

    useEffect(() => {
        apiClient.get('/get-test-questions')
            .then(res => { setQuestions(res.data); setLoading(false); })
            .catch(err => {
                console.log(err);
                setLoading(false);
            });
    }, []);

    const handleAnswer = (option) => {
        setSelectedOption(option);
        const currentQuestion = questions[currentIndex];
        const currentLevel = currentQuestion.level;

        if (option.is_correct) {
            setScoreCard(prev => ({ ...prev, [currentLevel]: prev[currentLevel] + 1 }));
            if (currentQuestion.id) setCorrectWordIds(prev => [...prev, currentQuestion.id]);
        }

        setTimeout(() => {
            const isEndOfLevel = (currentIndex + 1) % 20 === 0;
            const currentLevelScore = scoreCard[currentLevel] + (option.is_correct ? 1 : 0);

            if (isEndOfLevel) {
                if (currentLevelScore >= 15) {
                    // Başarılı geçiş - Küçük bir motivasyon uyarısı
                    Alert.alert("Harika Gidiyorsun! 🔥",
                        `${currentLevel} seviyesini ${currentLevelScore}/20 başarı ile tamamladın. Sonraki seviyeye geçiyoruz!`,
                        [{ text: "Devam Et", onPress: () => {
                            if (currentIndex < questions.length - 1) { setCurrentIndex(currentIndex + 1); setSelectedOption(null); }
                            else finishTest(currentLevel, currentLevelScore);
                        }}]
                    );
                } else {
                    // DÜZELTME: Elendiğinde Alert göstermek yerine şık Sonuç Ekranına yönlendiriyoruz
                    finishTest(currentLevel, currentLevelScore);
                }
            } else {
                if (currentIndex < questions.length - 1) { setCurrentIndex(currentIndex + 1); setSelectedOption(null); }
                else finishTest(currentLevel, currentLevelScore);
            }
        }, 600);
    };

    const finishTest = async (level, finalLevelScore) => {
        setDetectedLevel(level);
        setFinalScore(finalLevelScore);
        setShowResultScreen(true); // Sonuç ekranını aktif et

        try {
            if (correctWordIds.length > 0) {
                // UI'ı kitlememek için arka planda sessizce kaydet
                apiClient.post(`/mark-multiple-learned/?user_id=${user_id}`, correctWordIds).catch(e => console.log(e));
            }
        } catch (error) {
            console.log("Öğrenilenleri kaydetme hatası", error);
        }
    };

    const submitGoal = async (goal) => {
        try {
            await apiClient.post(`/update-user-settings/?user_id=${user_id}&detected_level=${detectedLevel}&daily_goal=${goal}`);
            setShowGoalModal(false);
            navigation.replace('Home', { user: { user_id, current_level: detectedLevel, daily_goal: goal } });
        } catch (error) {
            navigation.replace('Home', { user: { user_id, current_level: detectedLevel } });
        }
    };

    if (loading) return <View style={[styles.container, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={theme.primary} /></View>;

    // === YENİ: ŞIK SONUÇ EKRANI (TEST BİTİNCE ÇALIŞIR) ===
    if (showResultScreen) {
        // Skoru 100 üzerinden yüzdeye çeviriyoruz (20 soru üzerinden)
        const percentage = Math.min((finalScore / 20) * 100, 100); 

        return (
            <View style={[styles.container, styles.centerAll, { backgroundColor: theme.background }]}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
                
                <Text style={{ fontSize: 80, marginBottom: 10 }}>🎉</Text>
                <Text style={[styles.resultTitle, { color: theme.text }]}>Test Tamamlandı!</Text>
                <Text style={[styles.resultDesc, { color: theme.textSecondary }]}>İngilizce seviyeni başarıyla analiz ettik.</Text>

                <View style={[styles.badgeContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.badgeLabel, { color: theme.textMuted }]}>TESPİT EDİLEN SEVİYE</Text>
                    <Text style={[styles.badgeLevel, { color: theme.primary }]}>{detectedLevel}</Text>
                    
                    <View style={styles.scoreRow}>
                        <Text style={[styles.scoreText, { color: theme.text }]}>Son Aşama Başarısı:</Text>
                        <Text style={[styles.scoreHighlight, { color: theme.text }]}>{finalScore} / 20</Text>
                    </View>

                    {/* Dairesel grafik hissi veren kalın İlerleme Çubuğu */}
                    <View style={[styles.graphBg, { backgroundColor: theme.progressBg }]}>
                        <View style={[styles.graphFill, { backgroundColor: theme.primary, width: `${percentage}%` }]} />
                    </View>
                    <Text style={[styles.graphHint, { color: theme.textMuted }]}>
                        {finalScore >= 15 ? "Mükemmel performans!" : "Kendi seviyeni buldun, artık gelişme zamanı."}
                    </Text>
                </View>

                <TouchableOpacity 
                    style={[styles.resultBtn, { backgroundColor: theme.primary, shadowColor: theme.primary }]} 
                    onPress={() => setShowGoalModal(true)}
                >
                    <Text style={styles.resultBtnText}>Kendine Bir Hedef Belirle ➔</Text>
                </TouchableOpacity>

                {/* Hedef Seçim Modalı Sonuç Ekranının Üzerinde Açılacak */}
                {showGoalModal && (
                    <View style={styles.overlay}>
                        <View style={[styles.goalCard, { backgroundColor: theme.card }]}>
                            <Text style={[styles.goalTitle, { color: theme.text }]}>🎯 Günlük Hedefin</Text>
                            <Text style={[styles.goalDesc, { color: theme.textSecondary }]}>Günde kaç kelime öğrenmek istersin?</Text>
                            {[{ label: '🐢 Günde 3 Kelime (Rahat)', val: 3 }, { label: '🚶‍♂️ Günde 5 Kelime (Düzenli)', val: 5 }, { label: '🚀 Günde 10 Kelime (Hızlı)', val: 10 }].map(item => (
                                <TouchableOpacity key={item.val} style={[styles.goalBtn, { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }]} onPress={() => submitGoal(item.val)}>
                                    <Text style={[styles.goalBtnText, { color: theme.text }]}>{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        );
    }

    // === MEVCUT SORU EKRANI ===
    const currentQ = questions[currentIndex];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <Text style={[styles.levelLabel, { color: theme.textMuted }]}>Zorluk: {currentQ?.level}</Text>
            <Text style={[styles.word, { color: theme.primary }]}>{currentQ?.word_en}</Text>

            {currentQ?.options.map((opt, index) => (
                <TouchableOpacity
                    key={index}
                    style={[
                        styles.optionBtn,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        selectedOption === opt && (opt.is_correct
                            ? { backgroundColor: theme.primaryLight, borderColor: theme.primary }
                            : { backgroundColor: theme.dangerLight, borderColor: theme.danger })
                    ]}
                    onPress={() => !selectedOption && handleAnswer(opt)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.optionText, { color: theme.text }]}>{opt.text}</Text>
                </TouchableOpacity>
            ))}

            <Text style={[styles.progress, { color: theme.textMuted }]}>{currentIndex + 1} / {questions.length}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20 },
    centerAll: { alignItems: 'center' },
    
    // Mevcut Soru Ekranı Stilleri
    levelLabel: { textAlign: 'center', marginBottom: 10, fontSize: 16, fontWeight: 'bold' },
    word: { fontSize: 42, fontWeight: '900', textAlign: 'center', marginBottom: 40, letterSpacing: 1 },
    optionBtn: { borderWidth: 1.5, padding: 20, borderRadius: 20, marginBottom: 16, elevation: 2, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
    optionText: { fontSize: 18, textAlign: 'center', fontWeight: '600' },
    progress: { textAlign: 'center', marginTop: 20, fontWeight: 'bold' },
    
    // Yeni Sonuç Ekranı Stilleri
    resultTitle: { fontSize: 30, fontWeight: '900', marginBottom: 5 },
    resultDesc: { fontSize: 16, textAlign: 'center', marginBottom: 30 },
    badgeContainer: { width: '100%', padding: 25, borderRadius: 24, borderWidth: 1, alignItems: 'center', elevation: 4, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, marginBottom: 30 },
    badgeLabel: { fontSize: 13, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 5 },
    badgeLevel: { fontSize: 55, fontWeight: '900', marginBottom: 20 },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 10, paddingHorizontal: 10 },
    scoreText: { fontSize: 16, fontWeight: '600' },
    scoreHighlight: { fontSize: 16, fontWeight: '900' },
    graphBg: { width: '100%', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
    graphFill: { height: '100%', borderRadius: 8 },
    graphHint: { fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
    
    resultBtn: { paddingVertical: 18, borderRadius: 20, width: '100%', alignItems: 'center', elevation: 8, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8 },
    resultBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

    // Modal Stilleri
    overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 10 },
    goalCard: { padding: 30, borderRadius: 24, width: '100%', alignItems: 'center', elevation: 10 },
    goalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    goalDesc: { fontSize: 16, marginBottom: 25, textAlign: 'center' },
    goalBtn: { width: '100%', padding: 18, borderRadius: 16, marginBottom: 12 },
    goalBtnText: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
});