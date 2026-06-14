import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    Animated, 
    Platform, 
    ActivityIndicator, 
    Dimensions,
    Modal,
    ScrollView
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { useWordKnowledge } from '../context/WordKnowledgeContext';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import apiClient from '../api/client';

const { width } = Dimensions.get('window');

const shuffleArray = (array) => {
    let newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

export default function RefactorGameScreen({ navigation }) {
    const { theme } = useTheme();
    const { userData } = useUser();
    const { updateGameResult } = useWordKnowledge();
    const user = userData;

    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    
    const [shuffledWords, setShuffledWords] = useState([]);
    const [selectedWords, setSelectedWords] = useState([]);
    
    // States for game flow
    const [gameState, setGameState] = useState('building'); // 'building', 'checked'
    const [isCorrect, setIsCorrect] = useState(null); // null, true, false
    
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [gameOverModal, setGameOverModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Animations
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const xpAnimY = useRef(new Animated.Value(0)).current;
    const xpAnimOpacity = useRef(new Animated.Value(0)).current;
    const [showXpAnim, setShowXpAnim] = useState(false);

    const triggerShake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true })
        ]).start();
    };

    const prepareQuestion = (item) => {
        if (!item) return null;
        // Strip out trailing punctuation like periods or question marks for sentence construction
        const cleanSentence = item.example_en.replace(/[.?]/g, "").trim();
        return {
            original: item.example_en,
            clean: cleanSentence,
            hint: item.example_tr || item.meaning_tr || "Cümleyi kur."
        };
    };

    const fetchWordsFromDB = async () => {
        try {
            setLoading(true);
            let fetchedWords = [];
            if (user && user.user_id) {
                try {
                    const response = await apiClient.get(`/get-learned-words/${user.user_id}`);
                    if (response.data && response.data.length > 0) {
                        fetchedWords = response.data.filter(w => w.example_en && w.example_en.trim() !== "");
                        fetchedWords = shuffleArray(fetchedWords);
                    }
                } catch (e) {
                    console.log("Fetch error", e);
                }
            }
            
            if (fetchedWords.length === 0) {
                fetchedWords = [
                    { id: 9991, example_en: "You need to learn more words", meaning_tr: "Daha fazla kelime öğrenmelisin." },
                    { id: 9992, example_en: "Practice makes perfect", meaning_tr: "Pratik mükemmelleştirir." }
                ];
            }
            
            setGameData(fetchedWords);
            initializeQuestion(fetchedWords[0]);
        } catch (error) { 
            console.log(error); 
        } finally {
            setLoading(false);
        }
    };

    const initializeQuestion = (questionItem) => {
        const prepared = prepareQuestion(questionItem);
        if (!prepared) return;
        
        // Map words to objects with unique IDs to prevent duplicate token issues (e.g. two "the"s)
        const wordObjects = prepared.clean.split(/\s+/).map((word, idx) => ({
            id: `w-${idx}-${word}`,
            text: word
        }));
        
        setShuffledWords(shuffleArray(wordObjects));
        setSelectedWords([]);
        setGameState('building');
        setIsCorrect(null);
    };

    useEffect(() => { 
        fetchWordsFromDB(); 
    }, []);

    const handleNextQuestion = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < gameData.length) {
            setCurrentIndex(nextIndex);
            initializeQuestion(gameData[nextIndex]);
        } else {
            // Loop: Reshuffle and start from beginning
            const reshuffled = shuffleArray(gameData);
            setGameData(reshuffled);
            setCurrentIndex(0);
            initializeQuestion(reshuffled[0]);
        }
    };

    const handlePickWord = (wordObj) => {
        if (gameState === 'checked') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedWords([...selectedWords, wordObj]);
        setShuffledWords(shuffledWords.filter(w => w.id !== wordObj.id));
    };

    const handleRemoveWord = (wordObj) => {
        if (gameState === 'checked') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setShuffledWords([...shuffledWords, wordObj]);
        setSelectedWords(selectedWords.filter(w => w.id !== wordObj.id));
    };

    const handleUndo = () => {
        if (gameState === 'checked' || selectedWords.length === 0) return;
        handleRemoveWord(selectedWords[selectedWords.length - 1]);
    };

    const handleClearAll = () => {
        if (gameState === 'checked' || selectedWords.length === 0) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShuffledWords([...shuffledWords, ...selectedWords]);
        setSelectedWords([]);
    };

    const handleCheck = () => {
        const current = prepareQuestion(gameData[currentIndex]);
        if (!current) return;

        const selectedStr = selectedWords.map(w => w.text).join(' ');
        const isCorrectAnswer = selectedStr === current.clean;

        setGameState('checked');
        setIsCorrect(isCorrectAnswer);

        if (isCorrectAnswer) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            const earnedXP = 10 + combo * 2;
            setScore(prev => prev + earnedXP);
            const newCombo = combo + 1;
            setCombo(newCombo);
            if (newCombo > maxCombo) setMaxCombo(newCombo);

            // Trigger floating XP text animation
            setShowXpAnim(true);
            xpAnimY.setValue(10);
            xpAnimOpacity.setValue(1);
            Animated.parallel([
                Animated.timing(xpAnimY, { toValue: -60, duration: 1000, useNativeDriver: true }),
                Animated.timing(xpAnimOpacity, { toValue: 0, duration: 1000, useNativeDriver: true })
            ]).start(() => setShowXpAnim(false));

            // Update local mastery levels
            if (gameData[currentIndex] && gameData[currentIndex].id) {
                updateGameResult(gameData[currentIndex].id, 100);
            }
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            triggerShake();
            setCombo(0);
        }
    };

    const handleContinue = () => {
        setGameState('building');
        setIsCorrect(null);
        const nextIndex = currentIndex + 1;
        if (nextIndex < gameData.length) {
            setCurrentIndex(nextIndex);
            initializeQuestion(gameData[nextIndex]);
        } else {
            handleEndGame();
        }
    };

    const handleEndGame = () => {
        setGameOverModal(true);
    };

    const handleSaveAndExit = async () => {
        setIsSaving(true);
        try {
            if (user && user.user_id && score > 0) {
                await apiClient.post(`/update-game-stats/${user.user_id}`, {
                    xp_earned: score,
                    combo_reached: maxCombo
                });
            }
        } catch (e) {
            console.log("Stat save error", e);
        } finally {
            setIsSaving(false);
            navigation.goBack();
        }
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    const currentQuestion = prepareQuestion(gameData[currentIndex]);
    const correctCleanWords = currentQuestion ? currentQuestion.clean.split(/\s+/) : [];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header & Stats */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={handleEndGame} style={[styles.exitBtn, { backgroundColor: theme.danger + '22', borderColor: theme.danger + '55' }]}>
                        <Text style={[styles.exitBtnText, { color: theme.danger }]}>🛑 Oyunu Bitir</Text>
                    </TouchableOpacity>
                    <View style={styles.statsContainer}>
                        <Text style={styles.comboText}>🔥 Seri: {combo}</Text>
                        <Text style={styles.scoreText}>⭐ XP: {score}</Text>
                    </View>
                </View>
                <Text style={[styles.title, { color: theme.text }]}>Sentence Builder</Text>
            </View>

            {/* Target Meaning Area (Türkçe Anlam) */}
            <View style={[styles.targetContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={styles.targetLabel}>TÜRKÇE ANLAMI:</Text>
                <Text style={[styles.targetMeaning, { color: theme.text }]}>{currentQuestion?.hint}</Text>
            </View>

            {/* Construction Area (Yapım Alanı) */}
            <View style={styles.constructionWrapper}>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>CÜMLE KURMA ALANI:</Text>
                <View style={[
                    styles.constructionArea, 
                    { 
                        backgroundColor: theme.card,
                        borderColor: isCorrect === true ? theme.success : isCorrect === false ? theme.danger : theme.border 
                    }
                ]}>
                    {selectedWords.length === 0 ? (
                        <Text style={[styles.placeholderText, { color: theme.textMuted }]}>Kelime eklemek için aşağıdakilere dokun</Text>
                    ) : (
                        <View style={styles.chipRow}>
                            {selectedWords.map((wordObj, index) => {
                                const isMismatched = isCorrect === false && (index >= correctCleanWords.length || wordObj.text !== correctCleanWords[index]);
                                
                                return (
                                    <Animated.View 
                                        key={wordObj.id}
                                        style={[
                                            isMismatched ? { transform: [{ translateX: shakeAnim }] } : {}
                                        ]}
                                    >
                                        <TouchableOpacity 
                                            activeOpacity={0.8}
                                            disabled={gameState === 'checked'}
                                            onPress={() => handleRemoveWord(wordObj)}
                                            style={[
                                                styles.chip, 
                                                { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.background },
                                                isCorrect === true ? styles.chipSuccess : isMismatched ? styles.chipError : {}
                                            ]}
                                        >
                                            <Text style={[
                                                styles.chipText,
                                                { color: theme.text },
                                                isCorrect === true ? styles.chipTextSuccess : isMismatched ? styles.chipTextError : {}
                                            ]}>
                                                {wordObj.text}
                                            </Text>
                                        </TouchableOpacity>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </View>

            {/* Clear / Undo Row */}
            {gameState === 'building' && selectedWords.length > 0 && (
                <View style={styles.undoRow}>
                    <TouchableOpacity onPress={handleUndo} style={styles.undoBtn}>
                        <Ionicons name="arrow-undo" size={16} color={theme.textSecondary} />
                        <Text style={[styles.undoText, { color: theme.textSecondary }]}>Geri Al</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleClearAll} style={styles.undoBtn}>
                        <Ionicons name="trash-bin" size={16} color={theme.textSecondary} />
                        <Text style={[styles.undoText, { color: theme.textSecondary }]}>Temizle</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Shuffled Word Pool */}
            <View style={styles.poolWrapper}>
                {gameState === 'building' && (
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>KELİME HAVUZU:</Text>
                )}
                {gameState === 'building' ? (
                    <View style={styles.chipRow}>
                        {shuffledWords.map((wordObj) => (
                            <TouchableOpacity 
                                key={wordObj.id}
                                activeOpacity={0.7}
                                onPress={() => handlePickWord(wordObj)}
                                style={[styles.chip, styles.poolChip, { backgroundColor: theme.elevated, borderColor: theme.border, shadowColor: theme.background }]}
                            >
                                <Text style={[styles.chipText, { color: theme.text }]}>{wordObj.text}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    /* Checked State Info Board */
                    <View style={[
                        styles.feedbackBoard,
                        { 
                            borderColor: isCorrect ? theme.success : theme.warning, 
                            backgroundColor: theme.card,
                            borderWidth: 2,
                            shadowColor: isCorrect ? theme.success : theme.warning,
                            shadowOffset: { width: 0, height: 0 },
                            shadowRadius: 10,
                            shadowOpacity: 0.3,
                            elevation: 5
                        }
                    ]}>
                        <View style={styles.feedbackTitleRow}>
                            <Ionicons 
                                name={isCorrect ? "checkmark-circle" : "alert-circle"} 
                                size={28} 
                                color={isCorrect ? theme.success : theme.warning} 
                            />
                            <Text style={[
                                styles.feedbackTitle, 
                                { color: isCorrect ? theme.success : theme.warning }
                            ]}>
                                {isCorrect ? "Tebrikler! Doğru Cevap" : "Hatalı Sıralama"}
                            </Text>
                        </View>
                        
                        {!isCorrect && (
                            <View style={[styles.correctSentenceBoard, { borderTopColor: theme.border }]}>
                                <Text style={[styles.correctLabel, { color: theme.warning }]}>TARGET SENTENCE STRUCTURE:</Text>
                                <Text style={[styles.correctSentence, { color: theme.warning, textShadowColor: theme.warning, textShadowRadius: 5 }]}>
                                    {currentQuestion?.clean}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>

            {/* Action Area at bottom */}
            <View style={styles.footer}>
                {/* Floating XP element positioned relatively to the button container */}
                {showXpAnim && (
                    <Animated.View style={[
                        styles.floatingXp, 
                        { backgroundColor: theme.success, shadowColor: theme.background },
                        { transform: [{ translateY: xpAnimY }], opacity: xpAnimOpacity }
                    ]}>
                        <Text style={[styles.floatingXpText, { color: theme.text }]}>+{10 + combo * 2} XP</Text>
                    </Animated.View>
                )}

                {gameState === 'building' ? (
                    <TouchableOpacity 
                        style={[
                            styles.actionBtn, 
                            { backgroundColor: selectedWords.length === 0 ? theme.elevated : theme.primary }
                        ]}
                        disabled={selectedWords.length === 0}
                        onPress={handleCheck}
                    >
                        <Text style={[
                            styles.actionBtnText, 
                            { color: selectedWords.length === 0 ? theme.textMuted : theme.text }
                        ]}>
                            Kontrol Et
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity 
                        style={[
                            styles.actionBtn, 
                            { backgroundColor: isCorrect ? theme.success : theme.primary }
                        ]}
                        onPress={handleContinue}
                    >
                        <Text style={[styles.actionBtnText, { color: theme.text }]}>Devam Et</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Game Over Summary Modal */}
            <Modal visible={gameOverModal} transparent animationType="slide">
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1.5 }]}>
                        <Text style={styles.summaryEmoji}>🏆</Text>
                        <Text style={[styles.summaryTitle, { color: theme.text }]}>Seans Tamamlandı</Text>
                        
                        <View style={styles.summaryStatsBox}>
                            <View style={styles.summaryStat}>
                                <Text style={[styles.summaryStatValue, { color: theme.primary }]}>+{score}</Text>
                                <Text style={[styles.summaryStatLabel, { color: theme.textSecondary }]}>Kazanılan XP</Text>
                            </View>
                            <View style={styles.summaryStat}>
                                <Text style={[styles.summaryStatValue, { color: theme.warning }]}>{maxCombo}</Text>
                                <Text style={[styles.summaryStatLabel, { color: theme.textSecondary }]}>En Yüksek Seri</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                            onPress={handleSaveAndExit}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color={theme.text} />
                            ) : (
                                <Text style={[styles.saveBtnText, { color: theme.text }]}>Kaydet ve Çık</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 30 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { marginBottom: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    exitBtn: { backgroundColor: COLORS.game_wrong + '22', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderColor: COLORS.game_wrong + '55', borderWidth: 1 },
    exitBtnText: { color: COLORS.accent_red, fontWeight: 'bold', fontSize: 13 },
    statsContainer: { flexDirection: 'row', gap: 15 },
    comboText: { color: COLORS.accent_amber, fontWeight: 'bold', fontSize: 15 },
    scoreText: { color: COLORS.accent_cyan, fontWeight: 'bold', fontSize: 15 },
    title: { fontSize: 26, fontWeight: 'bold', color: COLORS.text_primary },
    
    targetContainer: { 
        backgroundColor: COLORS.bg_card, 
        borderColor: COLORS.border, 
        borderWidth: 1, 
        borderRadius: 15, 
        padding: 20, 
        marginBottom: 25 
    },
    targetLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.accent_cyan, marginBottom: 5, letterSpacing: 0.5 },
    targetMeaning: { 
        fontSize: 22, 
        fontWeight: '700', 
        color: COLORS.text_primary, 
        lineHeight: 30,
        textAlign: 'center',
        textShadowColor: COLORS.accent_cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10
    },
    
    sectionLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.text_secondary, marginBottom: 8, letterSpacing: 0.5 },
    constructionWrapper: { marginBottom: 15 },
    constructionArea: { 
        minHeight: 120, 
        backgroundColor: COLORS.bg_card, 
        borderWidth: 2.5, 
        borderRadius: 15, 
        borderStyle: 'dashed',
        padding: 15,
        justifyContent: 'center',
        alignItems: 'center'
    },
    placeholderText: { color: COLORS.text_muted, fontSize: 14, textAlign: 'center' },
    
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    chip: { 
        paddingHorizontal: 16, 
        paddingVertical: 10, 
        borderRadius: 20, 
        borderWidth: 1.5,
        borderColor: COLORS.border,
        elevation: 2,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5
    },
    poolChip: {
        backgroundColor: COLORS.bg_elevated,
        borderColor: COLORS.border
    },
    chipSuccess: {
        borderColor: COLORS.accent_green,
        backgroundColor: COLORS.accent_green + '20'
    },
    chipError: {
        borderColor: COLORS.accent_red,
        backgroundColor: COLORS.accent_red + '20'
    },
    chipText: { color: COLORS.text_primary, fontSize: 15, fontWeight: '600' },
    chipTextSuccess: { color: COLORS.accent_green },
    chipTextError: { color: COLORS.accent_red },
    
    undoRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15, marginBottom: 20 },
    undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5 },
    undoText: { color: COLORS.text_secondary, fontSize: 12, fontWeight: '600' },
    
    poolWrapper: { flex: 1, justifyContent: 'flex-start', marginTop: 10 },
    
    feedbackBoard: {
        borderWidth: 2,
        borderRadius: 15,
        padding: 20,
        width: '100%',
        alignItems: 'center'
    },
    feedbackTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
    feedbackTitle: { fontSize: 18, fontWeight: 'bold' },
    correctSentenceBoard: { width: '100%', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 15 },
    correctLabel: { fontSize: 10, fontWeight: 'bold', color: COLORS.text_secondary, marginBottom: 5 },
    correctSentence: { fontSize: 18, fontWeight: '700', color: COLORS.accent_green, textAlign: 'center' },
    
    footer: { marginTop: 'auto', alignItems: 'center', width: '100%' },
    actionBtn: { 
        width: '100%', 
        paddingVertical: 16, 
        borderRadius: 30, 
        alignItems: 'center', 
        justifyContent: 'center',
        elevation: 3
    },
    actionBtnText: { fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
    
    floatingXp: { 
        position: 'absolute', 
        top: -30, 
        backgroundColor: COLORS.accent_green, 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 15,
        elevation: 5,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3
    },
    floatingXpText: { color: COLORS.text_primary, fontWeight: 'bold', fontSize: 15 },

    // Modal
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000, backgroundColor: COLORS.overlay_dark },
    summaryCard: { width: '85%', padding: 25, borderRadius: 25, alignItems: 'center' },
    summaryEmoji: { fontSize: 60, marginBottom: 10 },
    summaryTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: COLORS.text_primary },
    summaryStatsBox: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30, width: '100%' },
    summaryStat: { alignItems: 'center', flex: 1 },
    summaryStatValue: { fontSize: 32, fontWeight: '900' },
    summaryStatLabel: { color: COLORS.text_secondary, fontSize: 13, marginTop: 5 },
    saveBtn: { paddingVertical: 15, borderRadius: 25, alignItems: 'center', width: '100%' },
    saveBtnText: { color: COLORS.text_primary, fontWeight: 'bold', fontSize: 16 }
});