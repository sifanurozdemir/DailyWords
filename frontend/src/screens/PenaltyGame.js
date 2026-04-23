import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated, Dimensions, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import apiClient from '../api/client';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

const { width } = Dimensions.get('window');

export default function PenaltyGame({ route, navigation }) {
    const { theme } = useTheme();
    const { userData } = useUser();
    const insets = useSafeAreaInsets();

    // --- KELİME YÖNETİMİ ---
    const [shuffledPool, setShuffledPool] = useState([]); 
    const [currentIndex, setCurrentIndex] = useState(0); 
    const [isPoolReady, setIsPoolReady] = useState(false);

    // Animasyon State'leri
    const ballY = useRef(new Animated.Value(0)).current; 
    const ballX = useRef(new Animated.Value(0)).current; 
    const ballScale = useRef(new Animated.Value(1)).current; 
    const ballRotation = useRef(new Animated.Value(0)).current;
    const screenShake = useRef(new Animated.Value(0)).current;
    
    const [animStatus, setAnimStatus] = useState('idle'); 

    // Kaleci Animasyonu
    const keeperX = useRef(new Animated.Value(0)).current; 

    // Oyun State'leri
    const [gameState, setGameState] = useState('start'); 
    const [score, setScore] = useState(0);
    const [gameXp, setGameXp] = useState(0);
    const [timeLeft, setTimeLeft] = useState(5);
    const [currentWord, setCurrentWord] = useState(null);
    const [options, setOptions] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [feedbackTargetId, setFeedbackTargetId] = useState(null); 
    const [earnedXpFloat, setEarnedXpFloat] = useState(null);

    // SES YÜKLEME
    const [sounds, setSounds] = useState({});

    useEffect(() => {
        let kickSound, goalSound, missSound;
        const loadSounds = async () => {
            try {
                kickSound = await Audio.Sound.createAsync({ uri: 'https://actions.google.com/sounds/v1/foley/kick_drum.ogg' });
                goalSound = await Audio.Sound.createAsync({ uri: 'https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg' });
                missSound = await Audio.Sound.createAsync({ uri: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg' });
                setSounds({ kick: kickSound.sound, goal: goalSound.sound, miss: missSound.sound });
            } catch (e) {
                console.log("Sesler yüklenemedi", e);
            }
        };
        loadSounds();
        return () => {
            if (kickSound?.sound) kickSound.sound.unloadAsync();
            if (goalSound?.sound) goalSound.sound.unloadAsync();
            if (missSound?.sound) missSound.sound.unloadAsync();
        };
    }, []);

    const shuffleArray = (array) => {
        let newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    };

    // 1. ADIM: Kelimeleri Hazırla ve Karıştır
    useEffect(() => {
        const fetchWords = async () => {
            try {
                if (userData && userData.user_id) {
                    const res = await apiClient.get(`/get-learned-words/${userData.user_id}`);
                    if (res.data && res.data.length >= 4) {
                        setShuffledPool(shuffleArray(res.data));
                        setIsPoolReady(true);
                        return;
                    }
                }
            } catch (e) { console.log(e); }
            
            // Fallback to mock data if <4 learned words or error
            const fallbackWords = [
                { id: 'b1', word_en: 'Accomplish', meaning_tr: 'Başarmak' },
                { id: 'b2', word_en: 'Identify', meaning_tr: 'Tanımlamak' },
                { id: 'b3', word_en: 'Significant', meaning_tr: 'Önemli' },
                { id: 'b4', word_en: 'Consistent', meaning_tr: 'Tutarlı' },
                { id: 'b5', word_en: 'Evaluate', meaning_tr: 'Değerlendirmek' },
                { id: 'b6', word_en: 'Sustain', meaning_tr: 'Sürdürmek' }
            ];
            setShuffledPool(shuffleArray(fallbackWords));
            setIsPoolReady(true);
        };
        fetchWords();
    }, [userData]);

    // KALECİ HAREKETİ (Sürekli Loop)
    useEffect(() => {
        if (gameState === 'playing') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(keeperX, { toValue: 70, duration: 1200, useNativeDriver: true }),
                    Animated.timing(keeperX, { toValue: -70, duration: 1200, useNativeDriver: true })
                ])
            ).start();
        } else {
            keeperX.stopAnimation();
            keeperX.setValue(0);
        }
    }, [gameState]);

    const startGame = () => {
        setScore(0);
        setGameXp(0);
        setCurrentIndex(0); 
        setGameState('playing');
        setTimeout(loadNextWord, 50);
    };

    const loadNextWord = () => {
        setFeedbackTargetId(null);
        setEarnedXpFloat(null);
        if (shuffledPool.length === 0) return;

        setFeedback(null);
        setAnimStatus('idle');
        ballY.setValue(0);
        ballX.setValue(0);
        ballScale.setValue(1);
        ballRotation.setValue(0);
        screenShake.setValue(0);
        setTimeLeft(5);

        let activeIdx = currentIndex;

        if (activeIdx >= shuffledPool.length) {
            const reshuffled = shuffleArray(shuffledPool);
            setShuffledPool(reshuffled);
            activeIdx = 0;
        }

        const correctWord = shuffledPool[activeIdx];
        
        const wrongOptions = shuffleArray(shuffledPool.filter(w => w.id !== correctWord.id)).slice(0, 3);
        const questionOptions = shuffleArray([correctWord, ...wrongOptions]);

        setCurrentWord(correctWord);
        setOptions(questionOptions);
        setCurrentIndex(activeIdx + 1);
    };

    useEffect(() => {
        if (gameState !== 'playing' || feedback !== null) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleAnswer(null, true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [gameState, currentWord, feedback]);

    useEffect(() => {
        if (gameState === 'gameover' && (score > 0 || gameXp > 0)) {
            const saveStats = async () => {
                try {
                    if (userData && userData.user_id) {
                        await apiClient.post(`/update-penalty-stats/${userData.user_id}`, {
                            xp_earned: gameXp,
                            score_reached: score
                        });
                    }
                } catch (e) {
                    console.log("Stat save error", e);
                }
            };
            saveStats();
        }
    }, [gameState]);

    // 2. ADIM: Gerçekçi Parabolik 3D Şut Animasyonu
    const runShootAnimation = (isGoal) => {
        setAnimStatus('shooting');
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        if (sounds.kick) sounds.kick.playFromPositionAsync(0);

        if (isGoal) {
            // GOL: Top yükselir (Apex) ve fileye düşer (Parabolik Kavis)
            const targetX = (Math.random() - 0.5) * 130; // Kalenin içi (-65 ile +65)
            
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(ballY, { toValue: -240, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }), // Havalanma
                    Animated.timing(ballY, { toValue: -150, duration: 200, easing: Easing.bounce, useNativeDriver: true }), // Düşüş ve Fileye Çarpma
                ]),
                Animated.timing(ballX, { toValue: targetX, duration: 450, easing: Easing.linear, useNativeDriver: true }),
                Animated.timing(ballScale, { toValue: 0.28, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(ballRotation, { toValue: 1.5, duration: 450, useNativeDriver: true })
            ]).start(() => {
                setAnimStatus('goal');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (sounds.goal) sounds.goal.playFromPositionAsync(0);
                setTimeout(loadNextWord, 1600);
            });
        } else {
            // KAÇIŞ: Direğe çarpma veya çok farkla dışarı gitme
            const isPostHit = Math.random() > 0.4;
            const targetX = isPostHit ? (Math.random() > 0.5 ? 115 : -115) : (Math.random() > 0.5 ? 180 : -180);

            if (isPostHit) {
                // Direğe Çarpıp Geri Sekme
                Animated.parallel([
                    Animated.timing(ballY, { toValue: -150, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    Animated.timing(ballX, { toValue: targetX, duration: 250, easing: Easing.linear, useNativeDriver: true }),
                    Animated.timing(ballScale, { toValue: 0.35, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(ballRotation, { toValue: 0.8, duration: 250, useNativeDriver: true })
                ]).start(() => {
                    if (sounds.miss) sounds.miss.playFromPositionAsync(0);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    
                    // Şiddetli Kamera Sarsıntısı
                    Animated.sequence([
                        Animated.timing(screenShake, { toValue: 15, duration: 50, useNativeDriver: true }),
                        Animated.timing(screenShake, { toValue: -15, duration: 50, useNativeDriver: true }),
                        Animated.timing(screenShake, { toValue: 15, duration: 50, useNativeDriver: true }),
                        Animated.timing(screenShake, { toValue: 0, duration: 50, useNativeDriver: true }),
                    ]).start();
                    
                    // Topun Sahaya Geri Sekmesi
                    Animated.parallel([
                        Animated.timing(ballY, { toValue: -20, duration: 500, easing: Easing.bounce, useNativeDriver: true }),
                        Animated.timing(ballX, { toValue: targetX > 0 ? targetX + 60 : targetX - 60, duration: 500, useNativeDriver: true }),
                        Animated.timing(ballScale, { toValue: 0.7, duration: 500, useNativeDriver: true }),
                        Animated.timing(ballRotation, { toValue: 0, duration: 500, useNativeDriver: true })
                    ]).start();

                    setAnimStatus('miss');
                    setTimeout(() => setGameState('gameover'), 1500);
                });
            } else {
                // Farkla Dışarı (Üstten veya Yandan)
                const overY = Math.abs(targetX) < 130 ? -300 : -180; // Kalenin üstünden geçiyorsa çok havaya gider
                Animated.parallel([
                    Animated.timing(ballY, { toValue: overY, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    Animated.timing(ballX, { toValue: targetX, duration: 550, easing: Easing.linear, useNativeDriver: true }),
                    Animated.timing(ballScale, { toValue: 0.15, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                    Animated.timing(ballRotation, { toValue: 2, duration: 550, useNativeDriver: true })
                ]).start(() => {
                    if (sounds.miss) sounds.miss.playFromPositionAsync(0);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setAnimStatus('miss');
                    setTimeout(() => setGameState('gameover'), 1500);
                });
            }
        }
    };

    const handleAnswer = (selectedWord, isTimeout = false) => {
        if (feedback !== null || !currentWord) return;

        const isCorrect = !isTimeout && selectedWord?.id === currentWord?.id;
        
        if (!isTimeout) setFeedbackTargetId(selectedWord.id);
        setFeedback(isCorrect ? 'goal' : 'miss');
        runShootAnimation(isCorrect);

        if (isCorrect) {
            const xpGained = timeLeft * 10;
            setGameXp(prev => prev + xpGained);
            setScore(prev => prev + 1);
            setEarnedXpFloat(xpGained);
        } else if (isTimeout) {
            setGameState('gameover');
        }
    };

    const spin = ballRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '720deg']
    });
    
    const shadowScale = ballY.interpolate({
        inputRange: [-250, -100, 0],
        outputRange: [0, 0.4, 1],
        extrapolate: 'clamp'
    });
    const shadowOpacity = ballY.interpolate({
        inputRange: [-250, -100, 0],
        outputRange: [0, 0.2, 0.5],
        extrapolate: 'clamp'
    });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: screenShake }] }]}>
                <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.scoreBadge, { backgroundColor: theme.warning }]}>
                        <Text style={styles.scoreText}>⚡ {gameXp}</Text>
                    </View>
                    <View style={[styles.scoreBadge, { backgroundColor: theme.primary }]}>
                        <Text style={styles.scoreText}>🏆 {score}</Text>
                    </View>
                </View>
            </View>

            {gameState === 'playing' && (
                <View style={styles.gameContainer}>
                    <View style={styles.stadiumArea}>
                        {/* KALE */}
                        <View style={[styles.goalPost, { borderColor: theme.textSecondary }]}>
                            <View style={styles.netLine} />
                            {/* KALECİ */}
                            <Animated.View style={{ transform: [{ translateX: keeperX }] }}>
                                <Text style={{ fontSize: 45, marginTop: 15 }}>🧤</Text>
                            </Animated.View>
                        </View>
                        
                        {/* GÖLGE */}
                        <Animated.View style={[
                            styles.ballShadow,
                            {
                                transform: [{ scale: shadowScale }],
                                opacity: shadowOpacity
                            }
                        ]} />

                        {/* TOP */}
                        <Animated.View style={[
                            styles.ball, 
                            { transform: [
                                { translateY: ballY }, 
                                { translateX: ballX }, 
                                { scale: ballScale },
                                { rotate: spin }
                            ]}
                        ]}>
                            <Text style={{ fontSize: 50 }}>⚽</Text>
                        </Animated.View>

                        {animStatus === 'goal' && <Animated.Text style={[styles.goalFlash, { transform: [{ scale: 1.2 }] }]}>GOOOOL! 🔥</Animated.Text>}
                        {animStatus === 'goal' && earnedXpFloat !== null && earnedXpFloat > 0 && <Text style={[styles.goalFlash, { top: 120, fontSize: 24, color: theme.warning }]}>+{earnedXpFloat} XP</Text>}
                        {animStatus === 'miss' && <Text style={styles.missFlash}>DIŞARIYA! ❌</Text>}
                    </View>

                    <View style={[styles.questionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={styles.timerRow}>
                            <View style={[styles.timerBarBg, { backgroundColor: theme.progressBg }]}>
                                <View style={[styles.timerBarFill, { width: `${(timeLeft/5)*100}%`, backgroundColor: timeLeft < 2 ? '#ff4444' : theme.primary }]} />
                            </View>
                            <Text style={[styles.timerText, { color: theme.textSecondary }]}>{timeLeft}s</Text>
                        </View>
                        <Text style={[styles.wordText, { color: theme.text }]}>{currentWord?.word_en}</Text>
                    </View>

                    <View style={styles.optionsContainer}>
                        {options.map((opt, i) => {
                            let borderColor = theme.border; 
                            let borderWidth = 2;

                            if (feedback) {
                                if (opt.id === currentWord.id) {
                                    borderColor = '#4CAF50'; 
                                    borderWidth = 3;
                                } else if (feedback === 'miss' && opt.id === feedbackTargetId) {
                                    borderColor = '#F44336';
                                    borderWidth = 3;
                                }
                            }

                            return(
                            <TouchableOpacity 
                                key={i}
                                disabled={feedback !== null}
                                style={[styles.optionBtn, { backgroundColor: theme.card, borderColor: borderColor, borderWidth: borderWidth }]}
                                onPress={() => {
                                    setFeedbackTargetId(opt.id); 
                                    handleAnswer(opt);
                                }}
                            >
                                <Text style={[styles.optionText, { color: theme.text }]}>{opt.meaning_tr}</Text>
                            </TouchableOpacity>
                        );
                        })}
                    </View>
                </View>
            )}

            {gameState !== 'playing' && (
                <View style={styles.centerBox}>
                    <Text style={{ fontSize: 80 }}>{gameState === 'start' ? '⚽' : '🛑'}</Text>
                    <Text style={[styles.title, { color: theme.text }]}>{gameState === 'start' ? 'Penaltı Maçı' : 'Maç Bitti'}</Text>
                    {gameState === 'gameover' && <Text style={[styles.finalScore, { color: theme.primary }]}>{score} GOL</Text>}
                    {gameState === 'gameover' && <Text style={{ color: theme.warning, fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>+{gameXp} Toplam XP!</Text>}
                    <TouchableOpacity style={[styles.startBtn, { backgroundColor: theme.primary }]} onPress={startGame}>
                        <Text style={styles.startBtnText}>{gameState === 'start' ? 'BAŞLA' : 'TEKRAR DENE'}</Text>
                    </TouchableOpacity>
                </View>
            )}
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, alignItems: 'center', zIndex: 10 },
    scoreBadge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 15 },
    scoreText: { color: '#fff', fontWeight: 'bold' },
    gameContainer: { flex: 1, paddingHorizontal: 20 },
    stadiumArea: { height: 240, justifyContent: 'flex-end', alignItems: 'center', marginTop: 10 },
    goalPost: { width: 220, height: 120, borderTopWidth: 6, borderLeftWidth: 6, borderRightWidth: 6, position: 'absolute', top: 30, borderRadius: 5, alignItems: 'center' },
    netLine: { width: '100%', height: 1, backgroundColor: '#ccc', marginTop: 35, opacity: 0.2, position: 'absolute' },
    ball: { zIndex: 5, marginBottom: 15 },
    ballShadow: { width: 45, height: 12, backgroundColor: '#000', borderRadius: 20, position: 'absolute', bottom: 10, zIndex: 1 },
    particle: { position: 'absolute', fontSize: 30, zIndex: 10 },
    goalFlash: { position: 'absolute', top: 60, fontSize: 50, fontWeight: '900', color: '#4CAF50', zIndex: 20 },
    missFlash: { position: 'absolute', top: 60, fontSize: 40, fontWeight: '900', color: '#F44336', zIndex: 20 },
    questionCard: { borderRadius: 20, padding: 18, marginTop: 15, borderWidth: 1, elevation: 4 },
    timerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    timerBarBg: { flex: 1, height: 8, borderRadius: 4, marginRight: 10 },
    timerBarFill: { height: '100%', borderRadius: 4 },
    timerText: { fontSize: 13, fontWeight: 'bold' },
    wordText: { fontSize: 36, fontWeight: '900', textAlign: 'center' },
    optionsContainer: { marginTop: 20, gap: 10 },
    optionBtn: { padding: 16, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
    optionText: { fontSize: 18, fontWeight: '700' },
    centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    title: { fontSize: 32, fontWeight: '900', marginTop: 20 },
    finalScore: { fontSize: 60, fontWeight: '900', marginVertical: 10 },
    startBtn: { paddingVertical: 18, paddingHorizontal: 50, borderRadius: 30, marginTop: 20 },
    startBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' }
});