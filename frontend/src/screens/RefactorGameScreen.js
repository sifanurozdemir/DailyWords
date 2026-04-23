import React, { useState, useEffect, useRef, useContext } from 'react';
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
    Alert,
    PanResponder
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import apiClient from '../api/client';

const { width } = Dimensions.get('window');

const syntaxColors = {
    subject: '#9CDCFE',
    verb: '#C586C0',
    object: '#CE9178',
    adj: '#DCDCAA',
    default: '#D4D4D4'
};

const shuffleArray = (array) => {
    let newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const DraggableWord = ({ word, index, onSwap, layouts, wordColor, onRemove }) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const [isDragging, setIsDragging] = useState(false);
    const viewRef = useRef(null);

    const updateMeasurement = () => {
        if (viewRef.current) {
            viewRef.current.measure((x, y, w, h, pageX, pageY) => {
                if (layouts.current) {
                    layouts.current[index] = { pageX, pageY, w, h };
                }
            });
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gesture) => {
                return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
            },
            onPanResponderGrant: () => {
                pan.setOffset({ x: pan.x._value, y: pan.y._value });
                pan.setValue({ x: 0, y: 0 });
                setIsDragging(true);
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (e, gesture) => {
                setIsDragging(false);
                pan.flattenOffset();
                if (Math.abs(gesture.dx) < 5 && Math.abs(gesture.dy) < 5) {
                    onRemove(word, index);
                } else {
                    onSwap(index, gesture.moveX, gesture.moveY);
                }
                Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
            }
        })
    ).current;

    useEffect(() => {
        const timeout = setTimeout(updateMeasurement, 100);
        return () => clearTimeout(timeout);
    });

    return (
        <Animated.View 
            ref={viewRef}
            {...panResponder.panHandlers}
            onLayout={updateMeasurement}
            style={[
                { transform: pan.getTranslateTransform() }, 
                { zIndex: isDragging ? 1000 : 1, elevation: isDragging ? 100 : 0, opacity: isDragging ? 0.8 : 1 }
            ]}
        >
            <Text style={[styles.codeWord, { color: wordColor, padding: 5 }]}>"{word}"</Text>
        </Animated.View>
    );
};

const BlinkingCursor = () => {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true })
            ])
        ).start();
    }, []);
    return <Animated.Text style={{ color: '#fff', fontSize: 18, opacity, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>|</Animated.Text>;
};

export default function RefactorGameScreen({ navigation }) {
    const { theme } = useTheme();
    const { userData } = useUser();
    const user = userData;
    const [loading, setLoading] = useState(true);
    const [gameData, setGameData] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [shuffledWords, setShuffledWords] = useState([]);
    const [selectedWords, setSelectedWords] = useState([]);
    const [feedbackModal, setFeedbackModal] = useState({ visible: false, type: '', text: '' });
    
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [gameOverModal, setGameOverModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const wordLayouts = useRef({});

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const timerAnim = useRef(new Animated.Value(0)).current;

    const getWordColor = (word) => {
        const w = word.toLowerCase();
        const subjects = ['i', 'you', 'they', 'we', 'he', 'she', 'it', 'data', 'system', 'intelligence', 'car', 'email'];
        const verbs = ['am', 'is', 'are', 'developing', 'transforming', 'working', 'need', 'walked', 'important', 'address'];
        if (subjects.includes(w)) return syntaxColors.subject;
        if (verbs.includes(w)) return syntaxColors.verb;
        if (w.length > 7) return syntaxColors.adj;
        return syntaxColors.object;
    };

    const prepareQuestion = (item) => {
        if (!item) return null;
        const cleanSentence = item.example_en.replace(/[.?]/g, "");
        const wordsArray = cleanSentence.split(" ");
        return {
            original: item.example_en,
            clean: cleanSentence,
            shuffled: shuffleArray(wordsArray),
            hint: item.meaning_tr || "// Debug this sentence"
        };
    };

    const handleSwap = (dragIndex, moveX, moveY) => {
        let hoverIndex = -1;
        const layouts = wordLayouts.current;
        for (const i in layouts) {
            if (i == dragIndex) continue;
            const loc = layouts[i];
            if (moveX >= loc.pageX && moveX <= loc.pageX + loc.w &&
                moveY >= loc.pageY && moveY <= loc.pageY + loc.h) {
                hoverIndex = parseInt(i);
                break;
            }
        }

        if (hoverIndex !== -1 && hoverIndex !== dragIndex) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedWords(prev => {
                const newArr = [...prev];
                const draggedItem = newArr[dragIndex];
                newArr.splice(dragIndex, 1);
                newArr.splice(hoverIndex, 0, draggedItem);
                return newArr;
            });
        }
    };

    const startTimer = () => {
        timerAnim.setValue(0);
        Animated.timing(timerAnim, {
            toValue: 1,
            duration: 25000,
            useNativeDriver: false,
        }).start(({ finished }) => {
            if (finished) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                triggerShake();
                setCombo(0);
                setFeedbackModal({ visible: true, type: 'error', text: 'TIMEOUT: Execution failed' });
                setTimeout(() => {
                    setFeedbackModal({ visible: false, type: '', text: '' });
                    handleNextQuestion();
                }, 1500);
            }
        });
    };

    const triggerShake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
        ]).start();
    };

    const handlePickWord = (word, index) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedWords([...selectedWords, word]);
        setShuffledWords(shuffledWords.filter((_, i) => i !== index));
    };

    const handleRemoveWord = (word, index) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setShuffledWords([...shuffledWords, word]);
        setSelectedWords(selectedWords.filter((_, i) => i !== index));
    };

    const handleUndo = () => {
        if (selectedWords.length > 0) {
            handleRemoveWord(selectedWords[selectedWords.length - 1], selectedWords.length - 1);
        }
    };

    const handleClearAll = () => {
        if (selectedWords.length > 0) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShuffledWords([...shuffledWords, ...selectedWords]);
            setSelectedWords([]);
        }
    };

    const fetchWordsFromDB = async () => {
        try {
            setLoading(true);
            let fetchedWords = [];
            if (user && user.user_id) {
                try {
                    // Kullanıcının "öğrendim" dediği tüm kelimeleri çekiyoruz
                    const response = await apiClient.get(`/get-learned-words/${user.user_id}`);
                    if (response.data && response.data.length > 0) {
                        // Sadece İngilizce örneği olanları filtrele
                        fetchedWords = response.data.filter(w => w.example_en && w.example_en.trim() !== "");
                        
                        // Diziyi rastgele karıştır (Sonsuz döngü için tümünü tutuyoruz)
                        fetchedWords = shuffleArray(fetchedWords);
                    }
                } catch (e) {
                    console.log("Fetch error", e);
                }
            }
            
            // Eğer kullanıcının hiç öğrendiği kelime yoksa (veya API hatasıysa) fallback
            if (fetchedWords.length === 0) {
                fetchedWords = [
                    { example_en: "You need to learn more words", meaning_tr: "Daha fazla kelime öğrenmelisin." },
                    { example_en: "Practice makes perfect", meaning_tr: "Pratik mükemmelleştirir." }
                ];
            }
            
            setGameData(fetchedWords);
            const firstQuestion = prepareQuestion(fetchedWords[0]);
            if (firstQuestion) {
                setShuffledWords(firstQuestion.shuffled);
                startTimer();
            }
        } catch (error) { console.log(error); } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchWordsFromDB(); }, []);

    const handleNextQuestion = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < gameData.length) {
            setCurrentIndex(nextIndex);
            const nextQuestion = prepareQuestion(gameData[nextIndex]);
            if (nextQuestion) {
                setShuffledWords(nextQuestion.shuffled);
                setSelectedWords([]);
                startTimer();
            }
        } else {
            // Sonsuz döngü: Liste bittiğinde tekrar karıştır ve baştan başla
            const reshuffled = shuffleArray(gameData);
            setGameData(reshuffled);
            setCurrentIndex(0);
            const nextQuestion = prepareQuestion(reshuffled[0]);
            if (nextQuestion) {
                setShuffledWords(nextQuestion.shuffled);
                setSelectedWords([]);
                startTimer();
            }
        }
    };

    const handleEndGame = () => {
        timerAnim.stopAnimation();
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

    const handleCompile = () => {
        const current = prepareQuestion(gameData[currentIndex]);
        if (!current) return;
        
        if (selectedWords.join(' ') === current.clean) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            const earnedXP = 10 + (combo * 2);
            setScore(prev => prev + earnedXP);
            const newCombo = combo + 1;
            setCombo(newCombo);
            if (newCombo > maxCombo) setMaxCombo(newCombo);
            
            setFeedbackModal({ visible: true, type: 'success', text: `Build Successful! +${earnedXP} XP` });
            setTimeout(() => {
                setFeedbackModal({ visible: false, type: '', text: '' });
                handleNextQuestion();
            }, 1500);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            triggerShake();
            setCombo(0);
            setFeedbackModal({ visible: true, type: 'error', text: 'Syntax Error: Runtime Exception' });
            setTimeout(() => {
                setFeedbackModal({ visible: false, type: '', text: '' });
            }, 1500);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.timerContainer}>
                <Animated.View style={[styles.timerBar, { 
                    width: timerAnim.interpolate({ inputRange: [0, 1], outputRange: [width - 40, 0] }),
                    backgroundColor: '#4a804d'
                }]} />
            </View>

            <View style={styles.header}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <TouchableOpacity onPress={handleEndGame} style={{ backgroundColor: theme.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>🛑 Oyunu Bitir</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 15 }}>
                        <Text style={{ color: theme.warning, fontWeight: 'bold', fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>🔥 Combo: {combo}</Text>
                        <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>⭐ XP: {score}</Text>
                    </View>
                </View>
                <Text style={[styles.title, { color: theme.text, marginTop: 15 }]}>{"<CodeRefactor />"}</Text>
                <Text style={{ color: theme.textSecondary }}>{prepareQuestion(gameData[currentIndex])?.hint}</Text>
            </View>

            <Animated.View style={[styles.codeEditor, { backgroundColor: '#1e1e1e', transform: [{ translateX: shakeAnim }] }]}>
                <View style={styles.lineNumbers}>
                    {[1, 2, 3].map(n => <Text key={n} style={{ color: '#858585' }}>{n}</Text>)}
                </View>
                <View style={styles.editorContent}>
                    <Text style={[styles.codeText, { color: '#dcdcaa' }]}>function <Text style={{ color: '#4ec9b0' }}>Refactor</Text>() {"{"}</Text>
                    <View style={styles.wordRow}>
                        <Text style={[styles.codeText, { color: '#c586c0', marginLeft: 15 }]}>return </Text>
                        {selectedWords.map((word, index) => (
                            <DraggableWord 
                                key={`${word}-${index}`} 
                                word={word} 
                                index={index} 
                                wordColor={getWordColor(word)}
                                onSwap={handleSwap}
                                onRemove={handleRemoveWord}
                                layouts={wordLayouts}
                            />
                        ))}
                        <BlinkingCursor />
                    </View>
                    <Text style={[styles.codeText, { color: '#dcdcaa' }]}>{"}"}</Text>
                </View>
            </Animated.View>

            <View style={styles.controlRow}>
                <TouchableOpacity onPress={handleUndo} style={styles.controlBtn}>
                    <Text style={styles.controlBtnText}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClearAll} style={styles.controlBtn}>
                    <Text style={styles.controlBtnText}>Clear All</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.optionsContainer}>
                {shuffledWords.map((word, index) => (
                    <TouchableOpacity 
                        key={index} 
                        style={[styles.wordBadge, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => handlePickWord(word, index)}
                    >
                        <Text style={[styles.codeText, { color: theme.text }]}>{word}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            
            <TouchableOpacity style={styles.compileBtn} onPress={handleCompile}>
                <Ionicons name="play" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.compileBtnText}>RUN CODE</Text>
            </TouchableOpacity>

            {/* Custom Feedback Modal */}
            {feedbackModal.visible && (
                <View style={[styles.modalOverlay, { backgroundColor: feedbackModal.type === 'success' ? 'rgba(74, 128, 77, 0.9)' : 'rgba(180, 50, 50, 0.9)' }]}>
                    <Ionicons 
                        name={feedbackModal.type === 'success' ? "checkmark-circle" : "close-circle"} 
                        size={60} color="#fff" 
                    />
                    <Text style={styles.modalText}>{feedbackModal.text}</Text>
                </View>
            )}

            {/* Game Over Summary Modal */}
            <Modal visible={gameOverModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
                        <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>🏆</Text>
                        <Text style={[styles.summaryTitle, { color: theme.text }]}>Seans Tamamlandı</Text>
                        
                        <View style={styles.summaryStatsBox}>
                            <View style={styles.summaryStat}>
                                <Text style={[styles.summaryStatValue, { color: theme.primary }]}>+{score}</Text>
                                <Text style={{ color: theme.textSecondary }}>Kazanılan XP</Text>
                            </View>
                            <View style={styles.summaryStat}>
                                <Text style={[styles.summaryStatValue, { color: theme.warning }]}>{maxCombo}</Text>
                                <Text style={{ color: theme.textSecondary }}>En Yüksek Combo</Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                            onPress={handleSaveAndExit}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveBtnText}>Kaydet ve Çık</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, paddingTop: 50 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    timerContainer: { height: 4, backgroundColor: '#333', borderRadius: 2, marginBottom: 20 },
    timerBar: { height: 4, borderRadius: 2 },
    header: { marginBottom: 30 },
    title: { fontSize: 24, fontWeight: 'bold' },
    codeEditor: { borderRadius: 12, padding: 15, flexDirection: 'row', minHeight: 150, borderWidth: 1, borderColor: '#333' },
    lineNumbers: { marginRight: 15, alignItems: 'center' },
    editorContent: { flex: 1 },
    wordRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginVertical: 5 },
    codeText: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 16 },
    codeWord: { fontSize: 16, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    controlRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 15 },
    controlBtn: { padding: 5 },
    controlBtnText: { color: '#858585', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 30, gap: 10 },
    wordBadge: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
    compileBtn: { marginTop: 'auto', backgroundColor: '#4a804d', padding: 18, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    compileBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.8)' },
    modalText: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 15, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'center' },
    summaryCard: { width: '80%', padding: 25, borderRadius: 20, elevation: 5 },
    summaryTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    summaryStatsBox: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30 },
    summaryStat: { alignItems: 'center' },
    summaryStatValue: { fontSize: 30, fontWeight: '900' },
    saveBtn: { padding: 15, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});