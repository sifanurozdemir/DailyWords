import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated, Dimensions, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import Matter from 'matter-js';

const { width } = Dimensions.get('window');

export default function PenaltyGame({ route, navigation }) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    // --- KELİME YÖNETİMİ ---
    const [shuffledPool, setShuffledPool] = useState([]); 
    const [currentIndex, setCurrentIndex] = useState(0); 
    const [isPoolReady, setIsPoolReady] = useState(false);

    // Animasyon State'leri
    const ballY = useRef(new Animated.Value(0)).current; 
    const ballX = useRef(new Animated.Value(0)).current; 
    const ballScale = useRef(new Animated.Value(1)).current; 
    const [animStatus, setAnimStatus] = useState('idle'); 

    // Kaleci Animasyonu
    const keeperX = useRef(new Animated.Value(0)).current; 

    // Oyun State'leri
    const [gameState, setGameState] = useState('start'); 
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(5);
    const [currentWord, setCurrentWord] = useState(null);
    const [options, setOptions] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [feedbackTargetId, setFeedbackTargetId] = useState(null); 

    // 1. ADIM: Kelimeleri Hazırla ve Karıştır
    useEffect(() => {
        let userWords = route.params?.words || [];
        
        if (userWords.length < 4) {
            userWords = [
                { id: 'b1', word_en: 'Accomplish', meaning_tr: 'Başarmak' },
                { id: 'b2', word_en: 'Identify', meaning_tr: 'Tanımlamak' },
                { id: 'b3', word_en: 'Significant', meaning_tr: 'Önemli' },
                { id: 'b4', word_en: 'Consistent', meaning_tr: 'Tutarlı' },
                { id: 'b5', word_en: 'Evaluate', meaning_tr: 'Değerlendirmek' },
                { id: 'b6', word_en: 'Sustain', meaning_tr: 'Sürdürmek' }
            ];
        }

        const shuffled = [...userWords].sort(() => Math.random() - 0.5);
        setShuffledPool(shuffled);
        setIsPoolReady(true);
    }, [route.params?.words]);

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
        setCurrentIndex(0); 
        setGameState('playing');
        setTimeout(loadNextWord, 50);
    };

    const loadNextWord = () => {
        setFeedbackTargetId(null);
        if (shuffledPool.length === 0) return;

        setFeedback(null);
        setAnimStatus('idle');
        ballY.setValue(0);
        ballX.setValue(0);
        ballScale.setValue(1);
        setTimeLeft(5);

        let activeIdx = currentIndex;

        if (activeIdx >= shuffledPool.length) {
            const reshuffled = [...shuffledPool].sort(() => Math.random() - 0.5);
            setShuffledPool(reshuffled);
            activeIdx = 0;
        }

        const correctWord = shuffledPool[activeIdx];
        
        const wrongOptions = shuffledPool
            .filter(w => w.id !== correctWord.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        const questionOptions = [correctWord, ...wrongOptions].sort(() => Math.random() - 0.5);

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

    // 2. ADIM: Gelişmiş Şut ve Fizik Animasyonu
    const runShootAnimation = (isGoal) => {
        setAnimStatus('shooting');
        
        // Yanlış cevapta topu direklere veya dışarıya saptır (Fiziksel sapma)
        const sideFalso = isGoal ? (Math.random() - 0.5) * 30 : (Math.random() > 0.5 ? 100 : -100);

        Animated.parallel([
            Animated.timing(ballY, {
                toValue: isGoal ? -190 : -130, 
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(ballX, {
                toValue: sideFalso,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(ballScale, {
                toValue: 0.35,
                duration: 600,
                useNativeDriver: true,
            })
        ]).start(() => {
            if (isGoal) {
                setAnimStatus('goal');
                Vibration.vibrate(100); // Gol olunca hafif titreşim
                setTimeout(loadNextWord, 1000);
            } else {
                setAnimStatus('miss');
                // Direkten dönme/sekme efekti
                Animated.spring(ballY, { toValue: -90, bounciness: 15, useNativeDriver: true }).start();
                Vibration.vibrate([0, 50, 50, 50]); // Hata titreşimi
                setTimeout(() => setGameState('gameover'), 1500);
            }
        });
    };

    const handleAnswer = (selectedWord, isTimeout = false) => {
        if (feedback !== null || !currentWord) return;

        const isCorrect = !isTimeout && selectedWord?.id === currentWord?.id;
        
        if (!isTimeout) setFeedbackTargetId(selectedWord.id);
        setFeedback(isCorrect ? 'goal' : 'miss');
        runShootAnimation(isCorrect);

        if (isCorrect) setScore(prev => prev + 1);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <View style={[styles.scoreBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.scoreText}>🏆 {score}</Text>
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
                        
                        {/* TOP */}
                        <Animated.View style={[
                            styles.ball, 
                            { transform: [
                                { translateY: ballY }, 
                                { translateX: ballX }, 
                                { scale: ballScale }
                            ]}
                        ]}>
                            <Text style={{ fontSize: 50 }}>⚽</Text>
                        </Animated.View>

                        {animStatus === 'goal' && <Text style={styles.goalFlash}>GOOOOL! 🔥</Text>}
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
                    <TouchableOpacity style={[styles.startBtn, { backgroundColor: theme.primary }]} onPress={startGame}>
                        <Text style={styles.startBtnText}>{gameState === 'start' ? 'BAŞLA' : 'TEKRAR DENE'}</Text>
                    </TouchableOpacity>
                </View>
            )}
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