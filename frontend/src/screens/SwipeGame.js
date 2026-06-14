import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { useWordKnowledge } from '../context/WordKnowledgeContext';
import { COLORS } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import apiClient from '../api/client';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80; // Eşiği düşürdük, daha kolay kaysın

export default function SwipeGame({ route, navigation }) {
    const { words } = route.params || { words: [] };
    const { theme } = useTheme();
    const { userData, updateUserFields } = useUser();
    const { updateGameResult } = useWordKnowledge();

    const [allLearnedWords, setAllLearnedWords] = useState(words || []);
    const allLearnedWordsRef = useRef(words || []);
    const [currentCard, setCurrentCard] = useState(null);
    const currentCardRef = useRef(null);
    const [gameState, setGameState] = useState('loading'); // loading, playing, gameover
    
    // Stats
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [lives, setLives] = useState(3);
    const [totalEarnedXp, setTotalEarnedXp] = useState(0);
    
    // Timer
    const [timeLeft, setTimeLeft] = useState(100); // 100%
    const timerInterval = useRef(null);

    // YENİ: Kelime destesi (Tekrarları önlemek için)
    const wordQueue = useRef([]);

    const [incorrectAnswers, setIncorrectAnswers] = useState([]);
    const fullPoolRef = useRef(words || []);

    // Animations
    const position = useRef(new Animated.ValueXY()).current;
    const feedbackOpacity = useRef(new Animated.Value(0)).current;
    const [feedbackType, setFeedbackType] = useState(null); // 'correct' or 'wrong'

    useEffect(() => {
        const fetchLearned = async () => {
            try {
                if (userData && userData.user_id) {
                    const res = await apiClient.get(`/get-learned-words/${userData.user_id}?t=${Date.now()}`);
                    if (res.data && res.data.length > 0) {
                        const combined = [...words];
                        res.data.forEach(lw => {
                            if (!combined.find(w => w.id === lw.id)) {
                                combined.push(lw);
                            }
                        });
                        setAllLearnedWords(combined);
                        allLearnedWordsRef.current = combined;
                        fullPoolRef.current = combined;
                    } else {
                        setAllLearnedWords(words);
                        allLearnedWordsRef.current = words;
                        fullPoolRef.current = words;
                    }
                } else {
                    setAllLearnedWords(words);
                    allLearnedWordsRef.current = words;
                    fullPoolRef.current = words;
                }
            } catch (e) { 
                console.log(e);
                setAllLearnedWords(words); 
                allLearnedWordsRef.current = words;
                fullPoolRef.current = words;
            }
        };
        fetchLearned();
    }, [userData]);

    useEffect(() => {
        // Havuzda en az 2 kelime olduğunda oyunu başlat
        if (allLearnedWords.length >= 2) {
            // Eğer daha önce başlamadıysa veya havuz güncellendiyse kuyruğu sıfırla ve başlat
            if (gameState === 'loading' || gameState === 'error') {
                wordQueue.current = []; // Kuyruğu sıfırla ki yeni havuzla dolsun
                generateNextCard();
                setGameState('playing');
            }
        } else if (allLearnedWords.length < 2 && gameState === 'loading') {
            // Eğer veriler gelmesine rağmen hala 2 kelime yoksa hata ver
            // Ama fetch bitene kadar bekle
            setTimeout(() => {
                if (allLearnedWords.length < 2) setGameState('error');
            }, 3000);
        }
    }, [allLearnedWords]);

    // Timer logic
    useEffect(() => {
        if (gameState === 'playing') {
            timerInterval.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 0) {
                        handleGameOver();
                        return 0;
                    }
                    // Zaman geçtikçe hızlanır
                    const dropRate = 0.5 + (score * 0.05); 
                    return prev - dropRate;
                });
            }, 100);
        } else {
            clearInterval(timerInterval.current);
        }
        return () => clearInterval(timerInterval.current);
    }, [gameState, score]);

    const generateNextCard = () => {
        const pool = allLearnedWordsRef.current;
        if (pool.length < 2) return;
        
        // 1. Eğer deste boşaldıysa (veya oyun ilk kez başlıyorsa), listeyi tekrar karıştırıp doldur
        if (wordQueue.current.length === 0) {
            let shuffled = [...pool].sort(() => Math.random() - 0.5);
            
            // 2. KUSURSUZ DETAY: Eğer yeni destenin en üstündeki kelime, 
            // az önce ekranda oynadığımız kelimeyle aynıysa yerini değiştir.
            if (currentCardRef.current && shuffled[0].id === currentCardRef.current.id) {
                const temp = shuffled[0];
                shuffled[0] = shuffled[1];
                shuffled[1] = temp;
            }
            wordQueue.current = shuffled;
        }

        // 3. Destenin en sonundan bir kelime çek (ve desteden çıkar)
        const wordObj = wordQueue.current.pop();
        
        // %50 ihtimalle doğru anlam, %50 ihtimalle yanlış anlam
        const isMatch = Math.random() > 0.5;
        let displayedMeaning = wordObj.meaning_tr;
        
        if (!isMatch) {
            let wrongWord;
            do {
                wrongWord = pool[Math.floor(Math.random() * pool.length)];
            } while (wrongWord.id === wordObj.id);
            displayedMeaning = wrongWord.meaning_tr;
        }

        const newCard = {
            ...wordObj,
            displayedMeaning,
            isMatch
        };
        
        setCurrentCard(newCard);
        currentCardRef.current = newCard; // Ref'i de hemen güncelle

        // Yeni kelime geldiğinde sesli oku
        Speech.stop();
        Speech.speak(wordObj.word_en, { language: 'en-US', rate: 0.9 });
    };

    const handleGameOver = async () => {
        setGameState('gameover');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        
        if (userData && userData.user_id) {
            try {
                const res = await apiClient.post(`/update-swipe-stats/${userData.user_id}?score=${score}&earned_xp=${totalEarnedXp}`);
                console.log("Swipe Stats Response:", res.data);
                if (res.data && res.data.status === 'success') {
                    updateUserFields({
                        swipe_match_high_score: res.data.swipe_match_high_score,
                        swipe_match_total_xp: res.data.swipe_match_total_xp
                    });
                }
            } catch (e) {
                console.log("Stats update error:", e);
            }
        }
    };

    const restartGame = (poolOfWords) => {
        setScore(0);
        setCombo(0);
        setLives(3);
        setTotalEarnedXp(0);
        setTimeLeft(100);
        setIncorrectAnswers([]);
        
        allLearnedWordsRef.current = poolOfWords;
        setAllLearnedWords(poolOfWords);
        wordQueue.current = [];
        
        setGameState('playing');
        generateNextCard();
    };

    const handleSwipe = (direction) => {
        const activeCard = currentCardRef.current;
        if (!activeCard) return;

        const userSaidMatch = direction === 'right';
        const isCorrectGuess = userSaidMatch === activeCard.isMatch;

        // Context update
        updateGameResult(activeCard.id, isCorrectGuess ? 100 : 0);

        if (isCorrectGuess) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setScore(s => s + 1);
            setCombo(c => c + 1);
            setTotalEarnedXp(x => x + 2 + (combo > 2 ? 1 : 0));
            setTimeLeft(prev => Math.min(100, prev + 10));
            
            showFeedback('correct');
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setCombo(0);
            setTimeLeft(prev => prev - 15);
            
            // Record incorrect answers
            const wrongAnswer = {
                id: activeCard.id,
                word_en: activeCard.word_en,
                userAnswer: userSaidMatch ? activeCard.displayedMeaning : 'Eşleşmiyor',
                correctAnswer: activeCard.meaning_tr,
                wordObj: activeCard
            };
            setIncorrectAnswers(prev => [...prev, wrongAnswer]);

            setLives(l => {
                if (l - 1 <= 0) {
                    handleGameOver();
                }
                return l - 1;
            });
            showFeedback('wrong');
        }

        generateNextCard();
    };

    const showFeedback = (type) => {
        setFeedbackType(type);
        feedbackOpacity.setValue(1);
        Animated.timing(feedbackOpacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true
        }).start();
    };

    const forceSwipe = (direction) => {
        const x = direction === 'right' ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
        Animated.timing(position, {
            toValue: { x, y: 0 },
            duration: 250,
            useNativeDriver: false
        }).start(() => {
            handleSwipe(direction);
            position.setValue({ x: 0, y: 0 });
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (evt, gestureState) => {
                position.setValue({ x: gestureState.dx, y: gestureState.dy });
            },
            onPanResponderRelease: (evt, gestureState) => {
                // Hem mesafe (dx) hem de fırlatma hızını (vx) kontrol ediyoruz
                if (gestureState.dx > SWIPE_THRESHOLD || gestureState.vx > 0.8) {
                    forceSwipe('right');
                } else if (gestureState.dx < -SWIPE_THRESHOLD || gestureState.vx < -0.8) {
                    forceSwipe('left');
                } else {
                    Animated.spring(position, {
                        toValue: { x: 0, y: 0 },
                        friction: 5,
                        tension: 40,
                        useNativeDriver: false
                    }).start();
                }
            }
        })
    ).current;

    const getCardStyle = () => {
        const rotate = position.x.interpolate({
            inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
            outputRange: ['-120deg', '0deg', '120deg']
        });

        return {
            ...position.getLayout(),
            transform: [{ rotate }]
        };
    };

    const renderOverlayColor = () => {
        const opacity = position.x.interpolate({
            inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
            outputRange: [0.5, 0, 0.5],
            extrapolate: 'clamp'
        });
        const backgroundColor = position.x.interpolate({
            inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
            outputRange: [COLORS.game_wrong, 'transparent', COLORS.game_correct],
            extrapolate: 'clamp'
        });

        return (
            <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor, opacity, borderRadius: 20 }} />
        );
    };

    if (gameState === 'error') {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
                <Text style={{ fontSize: 40, marginBottom: 20 }}>📚</Text>
                <Text style={{ color: theme.text, fontSize: 18, textAlign: 'center', padding: 20 }}>
                    Bu oyunu oynamak için en az 2 kelime öğrenmiş olman gerekiyor.
                </Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 15, backgroundColor: theme.primary, borderRadius: 10 }}>
                    <Text style={{ color: theme.text, fontWeight: 'bold' }}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (gameState === 'gameover') {
        const uniqueIncorrect = Array.from(new Set(incorrectAnswers.map(a => a.id)))
            .map(id => incorrectAnswers.find(a => a.id === id));

        const handleReplayAll = () => {
            restartGame(fullPoolRef.current);
        };

        const handleReplayMissed = () => {
            if (uniqueIncorrect.length === 0) return;
            let missedPool = uniqueIncorrect.map(a => a.wordObj);
            
            if (missedPool.length === 1 && fullPoolRef.current.length > 1) {
                const padWord = fullPoolRef.current.find(w => w.id !== missedPool[0].id);
                if (padWord) missedPool.push(padWord);
            }
            restartGame(missedPool);
        };

        return (
            <View style={[styles.container, { backgroundColor: theme.background, paddingHorizontal: 20, paddingTop: 60 }]}>
                <View style={styles.gameOverHeader}>
                    <Text style={{ fontSize: 60, textAlign: 'center', marginBottom: 10 }}>🏆</Text>
                    <Text style={[styles.title, { color: theme.text, textAlign: 'center' }]}>Oyun Bitti</Text>
                </View>

                <View style={[styles.scoreSummaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.summaryStatItem}>
                        <Text style={[styles.summaryStatLabel, { color: theme.textSecondary }]}>SKOR</Text>
                        <Text style={[styles.summaryStatValue, { color: theme.accent }]}>{score}</Text>
                    </View>
                    <View style={styles.summaryStatItem}>
                        <Text style={[styles.summaryStatLabel, { color: theme.textSecondary }]}>KAZANILAN XP</Text>
                        <Text style={[styles.summaryStatValue, { color: theme.warning }]}>+{totalEarnedXp} XP</Text>
                    </View>
                </View>

                {uniqueIncorrect.length > 0 ? (
                    <View style={{ flex: 1, marginBottom: 20 }}>
                        <Text style={[styles.wrongAnswersTitle, { color: theme.textSecondary }]}>Hatalı Cevapların ({uniqueIncorrect.length})</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                            {uniqueIncorrect.map((item) => (
                                <View key={item.id} style={[styles.wrongAnswerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    <View style={styles.wrongAnswerCardHeader}>
                                        <Text style={{ fontSize: 16 }}>❌</Text>
                                        <Text style={[styles.wrongAnswerWordEn, { color: theme.text }]}>{item.word_en}</Text>
                                    </View>
                                    <View style={styles.wrongAnswerCardRow}>
                                        <Text style={[styles.wrongAnswerLabel, { color: theme.textSecondary }]}>Senin cevabın: </Text>
                                        <Text style={[styles.wrongAnswerVal, { color: theme.danger }]}>"{item.userAnswer}"</Text>
                                    </View>
                                    <View style={styles.wrongAnswerCardRow}>
                                        <Text style={[styles.wrongAnswerLabel, { color: theme.textSecondary }]}>Doğru anlam: </Text>
                                        <Text style={[styles.wrongAnswerVal, { color: theme.success }]}>"{item.correctAnswer}"</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                ) : (
                    <View style={styles.perfectScoreContainer}>
                        <Text style={{ fontSize: 50, marginBottom: 15 }}>🎉</Text>
                        <Text style={[styles.perfectScoreTitle, { color: theme.success }]}>Kusursuz Performans!</Text>
                        <Text style={[styles.perfectScoreSub, { color: theme.textSecondary }]}>Tüm soruları doğru cevapladın.</Text>
                    </View>
                )}

                <View style={styles.gameOverFooter}>
                    <View style={styles.replayRow}>
                        <TouchableOpacity 
                            style={[styles.replayBtn, { backgroundColor: theme.primary, flex: 1 }]}
                            onPress={handleReplayAll}
                        >
                            <Ionicons name="refresh" size={18} color={theme.text} style={{ marginRight: 6 }} />
                            <Text style={[styles.replayBtnText, { color: theme.text }]}>Tekrar Oyna</Text>
                        </TouchableOpacity>
                        
                        {uniqueIncorrect.length > 0 && (
                            <TouchableOpacity 
                                style={[styles.replayBtn, { backgroundColor: theme.warning, flex: 1.2 }]}
                                onPress={handleReplayMissed}
                            >
                                <Ionicons name="alert-circle" size={18} color={theme.text} style={{ marginRight: 6 }} />
                                <Text style={[styles.replayBtnText, { color: theme.text }]}>Yanlışları Tekrar Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity 
                        style={[styles.replayBtn, styles.exitBtnOut, { width: '100%', marginTop: 10, backgroundColor: theme.elevated, borderColor: theme.border }]}
                        onPress={() => navigation.navigate('Home')}
                    >
                        <Ionicons name="home" size={18} color={theme.text} style={{ marginRight: 6 }} />
                        <Text style={[styles.replayBtnText, { color: theme.text }]}>Ana Sayfaya Dön</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header & Stats */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
                    <Ionicons name="close" size={32} color={theme.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: theme.success, fontSize: 24, fontWeight: 'bold' }}>{score}</Text>
                </View>
                <View style={{ flexDirection: 'row', padding: 10 }}>
                    {[...Array(3)].map((_, i) => (
                        <Text key={i} style={{ fontSize: 20, opacity: i < lives ? 1 : 0.3 }}>❤️</Text>
                    ))}
                </View>
            </View>

            {/* Frenzy Bar */}
            <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <View style={{ height: 8, backgroundColor: theme.elevated, borderRadius: 4 }}>
                    <Animated.View style={{ height: '100%', width: `${timeLeft}%`, backgroundColor: timeLeft < 30 ? theme.danger : theme.success, borderRadius: 4 }} />
                </View>
            </View>

            {/* Combo / Feedback */}
            <View style={{ alignItems: 'center', height: 40 }}>
                {combo > 1 && (
                    <Text style={{ color: COLORS.accent_gold, fontWeight: 'bold', fontSize: 18 }}>COMBO x{combo} 🔥</Text>
                )}
            </View>

            <Animated.View style={[styles.feedbackOverlay, { opacity: feedbackOpacity, backgroundColor: feedbackType === 'correct' ? theme.success + '33' : theme.danger + '33' }]}>
                <Text style={{ fontSize: 60, fontWeight: '900', color: feedbackType === 'correct' ? theme.success : theme.danger, transform: [{rotate: feedbackType === 'correct' ? '-10deg' : '10deg'}] }}>
                    {feedbackType === 'correct' ? 'DOĞRU!' : 'YANLIŞ!'}
                </Text>
            </Animated.View>

            {/* Card Area */}
            <View style={styles.cardArea}>
                {currentCard && (
                    <Animated.View 
                        style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.background }, getCardStyle()]} 
                        {...panResponder.panHandlers}
                    >
                        {renderOverlayColor()}
                        <Text style={[styles.cardWordEn, { color: theme.text }]}>{currentCard.word_en}</Text>
                        <View style={[styles.divider, { backgroundColor: theme.border }]} />
                        <Text style={[styles.cardWordTr, { color: theme.textMuted }]}>{currentCard.displayedMeaning}</Text>
                        
                        {/* Interactive Hint Text */}
                        <Text style={{ position: 'absolute', bottom: 20, color: theme.textMuted, fontSize: 12 }}>
                            Sağa / Sola Kaydır
                        </Text>
                    </Animated.View>
                )}
            </View>

            {/* Bottom Actions */}
            <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.elevated }]} onPress={() => forceSwipe('left')}>
                    <Ionicons name="close" size={40} color={theme.danger} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.elevated }]} onPress={() => forceSwipe('right')}>
                    <Ionicons name="checkmark" size={40} color={theme.success} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 10 },
    cardArea: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    card: {
        width: SCREEN_WIDTH * 0.85,
        height: SCREEN_WIDTH * 1.1,
        backgroundColor: COLORS.text_primary,
        borderRadius: 20,
        elevation: 5,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 10
    },
    cardWordEn: { fontSize: 40, fontWeight: '900', color: COLORS.bg_primary, marginBottom: 20, textAlign: 'center' },
    divider: { width: '50%', height: 2, backgroundColor: COLORS.text_secondary, marginBottom: 20 },
    cardWordTr: { fontSize: 24, fontWeight: '600', color: COLORS.text_muted, textAlign: 'center' },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingBottom: 50, zIndex: 5 },
    actionBtn: { width: 80, height: 80, backgroundColor: COLORS.bg_elevated, borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    title: { fontSize: 36, fontWeight: '900', marginBottom: 20 },
    btn: { padding: 18, borderRadius: 20, alignItems: 'center' },
    btnText: { color: COLORS.text_primary, fontSize: 18, fontWeight: 'bold' },
    feedbackOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 20, pointerEvents: 'none' },

    gameOverHeader: { marginBottom: 20, alignItems: 'center' },
    scoreSummaryCard: { 
        flexDirection: 'row', 
        backgroundColor: COLORS.bg_card, 
        borderColor: COLORS.border, 
        borderWidth: 1.5, 
        borderRadius: 15, 
        padding: 15, 
        marginBottom: 20, 
        justifyContent: 'space-around',
        width: '100%'
    },
    summaryStatItem: { alignItems: 'center' },
    summaryStatLabel: { fontSize: 10, color: COLORS.text_secondary, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 5 },
    summaryStatValue: { fontSize: 24, fontWeight: '900' },
    wrongAnswersTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text_secondary, marginBottom: 12, letterSpacing: 0.5 },
    wrongAnswerCard: { 
        backgroundColor: COLORS.bg_card, 
        borderColor: COLORS.border, 
        borderWidth: 1.5, 
        borderRadius: 15, 
        padding: 15, 
        marginBottom: 10,
        width: '100%'
    },
    wrongAnswerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    wrongAnswerWordEn: { fontSize: 18, fontWeight: '800', color: COLORS.text_primary },
    wrongAnswerCardRow: { flexDirection: 'row', marginTop: 4 },
    wrongAnswerLabel: { fontSize: 13, color: COLORS.text_secondary },
    wrongAnswerVal: { fontSize: 13, fontWeight: '700' },
    perfectScoreContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    perfectScoreTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.accent_green, marginBottom: 8 },
    perfectScoreSub: { fontSize: 14, color: COLORS.text_secondary, textAlign: 'center' },
    gameOverFooter: { paddingBottom: 35, width: '100%' },
    replayRow: { flexDirection: 'row', gap: 12, width: '100%' },
    replayBtn: { 
        height: 52, 
        borderRadius: 26, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center',
        elevation: 3 
    },
    exitBtnOut: {
        backgroundColor: COLORS.bg_elevated,
        borderColor: COLORS.border,
        borderWidth: 1.5
    },
    replayBtnText: { color: COLORS.text_primary, fontSize: 14, fontWeight: 'bold' }
});
