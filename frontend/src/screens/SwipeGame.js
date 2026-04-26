import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
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
                        // Günlük kelimelerle (words) öğrenilmiş kelimeleri (res.data) birleştir
                        // Böylece havuz çok daha geniş olur
                        const combined = [...words];
                        res.data.forEach(lw => {
                            if (!combined.find(w => w.id === lw.id)) {
                                combined.push(lw);
                            }
                        });
                        setAllLearnedWords(combined);
                        allLearnedWordsRef.current = combined; // Ref'i güncelle
                    } else {
                        setAllLearnedWords(words);
                        allLearnedWordsRef.current = words;
                    }
                }
            } catch (e) { 
                console.log(e);
                setAllLearnedWords(words); 
                allLearnedWordsRef.current = words;
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
        
        // Rekoru her zaman kaydetmeyi dene (XP şartına bakmaksızın)
        if (userData && userData.user_id) {
            try {
                const res = await apiClient.post(`/update-swipe-stats/${userData.user_id}?score=${score}&earned_xp=${totalEarnedXp}`);
                console.log("Swipe Stats Response:", res.data);
                if (res.data && res.data.status === 'success') {
                    // Uygulama genelindeki kullanıcı verisini anında güncelle
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

    const handleSwipe = (direction) => {
        // PanResponder içinde güncel karta erişmek için ref kullanıyoruz (Stale Closure önlemi)
        const activeCard = currentCardRef.current;
        if (!activeCard) return;

        const userSaidMatch = direction === 'right';
        const isCorrectGuess = userSaidMatch === activeCard.isMatch;

        if (isCorrectGuess) {
            // Bildi!
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setScore(s => s + 1);
            setCombo(c => c + 1);
            setTotalEarnedXp(x => x + 2 + (combo > 2 ? 1 : 0));
            setTimeLeft(prev => Math.min(100, prev + 10)); // Zaman kazandır
            
            showFeedback('correct');
        } else {
            // Bilemedi!
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setCombo(0);
            setTimeLeft(prev => prev - 15); // Zaman cezası
            setLives(l => {
                if (l - 1 <= 0) {
                    handleGameOver();
                }
                return l - 1;
            });
            showFeedback('wrong');
        }

        // Stale closure nedeniyle gameState kontrolü yapmıyoruz, her swipe sonrası yeni kart getir
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
            outputRange: ['#FF3B30', 'transparent', '#00FF00'],
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
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (gameState === 'gameover') {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
                <Text style={{ fontSize: 80, marginBottom: 20 }}>💔</Text>
                <Text style={[styles.title, { color: theme.danger }]}>OYUN BİTTİ!</Text>
                <Text style={{ fontSize: 24, color: theme.text, marginBottom: 10 }}>Skor: {score}</Text>
                <Text style={{ fontSize: 20, color: theme.warning, fontWeight: 'bold', marginBottom: 40 }}>+{totalEarnedXp} XP</Text>
                
                <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: theme.primary, width: '80%' }]}
                    onPress={() => navigation.replace('SwipeGameStartScreen', { words: allLearnedWords })}
                >
                    <Text style={styles.btnText}>TEKRAR DENE</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 2, marginTop: 15, width: '80%' }]}
                    onPress={() => navigation.navigate('Home')}
                >
                    <Text style={[styles.btnText, { color: theme.text }]}>ÇIKIŞ YAP</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: '#1A1A2E' }]}>
            {/* Header & Stats */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
                    <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#00FF00', fontSize: 24, fontWeight: 'bold' }}>{score}</Text>
                </View>
                <View style={{ flexDirection: 'row', padding: 10 }}>
                    {[...Array(3)].map((_, i) => (
                        <Text key={i} style={{ fontSize: 20, opacity: i < lives ? 1 : 0.3 }}>❤️</Text>
                    ))}
                </View>
            </View>

            {/* Frenzy Bar */}
            <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <View style={{ height: 8, backgroundColor: '#333', borderRadius: 4 }}>
                    <Animated.View style={{ height: '100%', width: `${timeLeft}%`, backgroundColor: timeLeft < 30 ? '#FF3B30' : '#00FF00', borderRadius: 4 }} />
                </View>
            </View>

            {/* Combo / Feedback */}
            <View style={{ alignItems: 'center', height: 40 }}>
                {combo > 1 && (
                    <Text style={{ color: '#FFD700', fontWeight: 'bold', fontSize: 18 }}>COMBO x{combo} 🔥</Text>
                )}
            </View>

            <Animated.View style={[styles.feedbackOverlay, { opacity: feedbackOpacity, backgroundColor: feedbackType === 'correct' ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)' }]}>
                <Text style={{ fontSize: 60, fontWeight: '900', color: feedbackType === 'correct' ? '#00FF00' : '#FF3B30', transform: [{rotate: feedbackType === 'correct' ? '-10deg' : '10deg'}] }}>
                    {feedbackType === 'correct' ? 'DOĞRU!' : 'YANLIŞ!'}
                </Text>
            </Animated.View>

            {/* Card Area */}
            <View style={styles.cardArea}>
                {currentCard && (
                    <Animated.View 
                        style={[styles.card, getCardStyle()]} 
                        {...panResponder.panHandlers}
                    >
                        {renderOverlayColor()}
                        <Text style={styles.cardWordEn}>{currentCard.word_en}</Text>
                        <View style={styles.divider} />
                        <Text style={styles.cardWordTr}>{currentCard.displayedMeaning}</Text>
                        
                        {/* Interactive Hint Text */}
                        <Text style={{ position: 'absolute', bottom: 20, color: '#999', fontSize: 12 }}>
                            Sağa / Sola Kaydır
                        </Text>
                    </Animated.View>
                )}
            </View>

            {/* Bottom Actions */}
            <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => forceSwipe('left')}>
                    <Ionicons name="close" size={40} color="#FF3B30" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => forceSwipe('right')}>
                    <Ionicons name="checkmark" size={40} color="#00FF00" />
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
        backgroundColor: '#fff',
        borderRadius: 20,
        elevation: 5,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 10
    },
    cardWordEn: { fontSize: 40, fontWeight: '900', color: '#1A1A2E', marginBottom: 20, textAlign: 'center' },
    divider: { width: '50%', height: 2, backgroundColor: '#E0E0E0', marginBottom: 20 },
    cardWordTr: { fontSize: 24, fontWeight: '600', color: '#666', textAlign: 'center' },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingBottom: 50, zIndex: 5 },
    actionBtn: { width: 80, height: 80, backgroundColor: '#2A2A4A', borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 5 },
    title: { fontSize: 36, fontWeight: '900', marginBottom: 20 },
    btn: { padding: 18, borderRadius: 20, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    feedbackOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 20, pointerEvents: 'none' }
});
