import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, TextInput, Dimensions, KeyboardAvoidingView, Platform, Keyboard, StatusBar } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';
import apiClient from '../api/client';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function BugHuntGame({ route, navigation }) {
    const { words } = route.params || { words: [] };
    const { theme } = useTheme();
    const { userData } = useUser();

    const [gameState, setGameState] = useState('playing'); // 'playing', 'gameover'
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [currentWord, setCurrentWord] = useState(null);
    const [inputText, setInputText] = useState('');
    const [gameSpeed, setGameSpeed] = useState(10000); 
    const [combo, setCombo] = useState(0);
    const [isPerfect, setIsPerfect] = useState(true);
    const [bugState, setBugState] = useState('walking'); // 'walking', 'dead'
    const [totalEarnedXp, setTotalEarnedXp] = useState(0);
    const [allLearnedWords, setAllLearnedWords] = useState(words || []);
    const [hintsRemaining, setHintsRemaining] = useState(1);
    
    const bugAnim = useRef(new Animated.Value(0)).current;
    const bugYAnim = useRef(new Animated.Value(0)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const serverFlashAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);
    const timerRef = useRef(null);
    const walkTimerRef = useRef(null);

    // Initialize game and fetch all learned words
    useEffect(() => {
        const fetchLearned = async () => {
            try {
                if (userData && userData.user_id) {
                    const res = await apiClient.get(`/get-learned-words/${userData.user_id}?t=${Date.now()}`);
                    if (res.data && res.data.length > 0) {
                        setAllLearnedWords(res.data);
                    }
                }
            } catch (e) { console.log(e); }
        };
        fetchLearned();

        if (words && words.length > 0) {
            // İlk açılışta words ile başlar, fetch bitince allLearnedWords ile devam eder
            spawnBug(words);
        } else {
            setGameState('gameover'); // No words
        }
        
        return () => {
            bugAnim.stopAnimation();
            bugYAnim.stopAnimation();
            clearTimeout(timerRef.current);
            Speech.stop();
        };
    }, []);

    // Yürüme Animasyonu (Zıplama)
    const startWalkingAnimation = () => {
        bugYAnim.setValue(0);
        walkTimerRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(bugYAnim, { toValue: -15, duration: 150, useNativeDriver: true }),
                Animated.timing(bugYAnim, { toValue: 0, duration: 150, useNativeDriver: true })
            ])
        );
        walkTimerRef.current.start();
    };

    const playAudio = (wordText) => {
        Speech.stop();
        Speech.speak(wordText, { language: 'en-US', rate: 0.9, pitch: 1.0 });
    };

    const spawnBug = (sourceArray = allLearnedWords) => {
        if (lives <= 0) return;
        
        const listToUse = sourceArray.length > 0 ? sourceArray : words;
        const randomWord = listToUse[Math.floor(Math.random() * listToUse.length)];
        setCurrentWord(randomWord);
        setInputText('');
        setBugState('walking');
        setIsPerfect(true);
        
        // Dinamik ipucu hakkı belirleme (Uzunluğa göre: <5 -> 1, 5-7 -> 2, >=8 -> 3)
        const wordLen = randomWord.word_en.length;
        if (wordLen >= 8) setHintsRemaining(3);
        else if (wordLen >= 5) setHintsRemaining(2);
        else setHintsRemaining(1);
        
        // Reset bug position
        bugAnim.setValue(0);
        
        // Speak word
        playAudio(randomWord.word_en);
        
        // Ensure keyboard is up
        setTimeout(() => inputRef.current?.focus(), 500);

        // Start movement
        const currentSpeed = Math.max(2500, 10000 - (score * 400)); // Gets faster
        setGameSpeed(currentSpeed);
        startWalkingAnimation();

        Animated.timing(bugAnim, {
            toValue: SCREEN_WIDTH - 60, // Server position
            duration: currentSpeed,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) {
                handleBugReachedServer();
            }
        });
    };

    const handleBugReachedServer = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCombo(0); // Reset combo on hit
        
        // Server flash animation
        serverFlashAnim.setValue(0);
        Animated.sequence([
            Animated.timing(serverFlashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
            Animated.timing(serverFlashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
            Animated.timing(serverFlashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
            Animated.timing(serverFlashAnim, { toValue: 0, duration: 200, useNativeDriver: false })
        ]).start();

        setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
                endGame();
            } else {
                spawnBug();
            }
            return newLives;
        });
    };

    const endGame = async () => {
        setGameState('gameover');
        Keyboard.dismiss();
        bugYAnim.stopAnimation();
        
        // Update total XP and score in backend
        if (totalEarnedXp > 0 && userData && userData.user_id) {
            try {
                await apiClient.post(`/update-bughunt-stats/${userData.user_id}?score=${score}&earned_xp=${totalEarnedXp}`);
            } catch (e) {
                console.log(e);
            }
        }
    };

    const triggerShake = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        shakeAnim.setValue(0);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 15, duration: 40, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -15, duration: 40, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 15, duration: 40, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true })
        ]).start();
    };

    const handleTextChange = (text) => {
        if (gameState !== 'playing' || !currentWord) return;
        
        // Check if user made a typo
        const targetSubstring = currentWord.word_en.substring(0, text.length).toLowerCase();
        if (text.toLowerCase() !== targetSubstring) {
            triggerShake();
            setIsPerfect(false);
            setCombo(0);
            return; // Don't update state, block wrong letters
        }
        
        // Doğru harf basıldı (Laser/Pew sesi hissi)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setInputText(text);

        // Check if fully typed
        if (text.toLowerCase() === currentWord.word_en.toLowerCase()) {
            // Killed the bug!
            bugAnim.stopAnimation();
            bugYAnim.stopAnimation();
            setBugState('dead');
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            // Calculate XP
            const currentCombo = isPerfect ? combo + 1 : 0;
            if (isPerfect) setCombo(currentCombo);
            
            const xpGained = 10 + (currentCombo * 5);
            setTotalEarnedXp(prev => prev + xpGained);
            setScore(s => s + 1);
            
            // Spawn next after explosion delay (anlamını okuyabilmesi için süreyi artırdık)
            timerRef.current = setTimeout(() => {
                spawnBug();
            }, 1200);
        }
    };

    const handleHint = () => {
        if (gameState !== 'playing' || !currentWord || bugState === 'dead') return;
        if (hintsRemaining <= 0) return;
        
        if (inputText.length < currentWord.word_en.length) {
            setHintsRemaining(prev => prev - 1);
            const nextChar = currentWord.word_en[inputText.length];
            const newText = inputText + (nextChar.toLowerCase() === nextChar ? nextChar.toLowerCase() : nextChar);
            
            // İpucu kullanıldığı için perfect bozulur ve combo sıfırlanır
            setIsPerfect(false);
            setCombo(0);
            
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setInputText(newText);
            
            if (newText.toLowerCase() === currentWord.word_en.toLowerCase()) {
                bugAnim.stopAnimation();
                bugYAnim.stopAnimation();
                setBugState('dead');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                
                const xpGained = 5; // İpucuyla bilirse düşük XP
                setTotalEarnedXp(prev => prev + xpGained);
                setScore(s => s + 1);
                
                timerRef.current = setTimeout(() => {
                    spawnBug();
                }, 1200);
            }
        }
    };

    if (gameState === 'gameover') {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
                <Text style={{ fontSize: 80, marginBottom: 20 }}>💀</Text>
                <Text style={[styles.gameoverText, { color: theme.danger }]}>SİSTEM ÇÖKTÜ!</Text>
                <Text style={{ fontSize: 24, color: theme.text, marginBottom: 10 }}>Skor: {score}</Text>
                <Text style={{ fontSize: 20, color: theme.warning, fontWeight: 'bold', marginBottom: 40 }}>+{totalEarnedXp} Toplam XP</Text>
                
                <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: theme.primary, width: '80%' }]}
                    onPress={() => navigation.replace('BugHuntStartScreen', { words })}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#1E1E1E' }]}>
            <StatusBar barStyle="light-content" />
            
            {/* Header / Stats */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
                    <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: '#aaa', fontSize: 14 }}>SKOR</Text>
                    <Text style={{ color: '#00FF00', fontSize: 24, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{score}</Text>
                </View>
                <View style={{ flexDirection: 'row', padding: 10 }}>
                    {[...Array(3)].map((_, i) => (
                        <Text key={i} style={{ fontSize: 20, opacity: i < lives ? 1 : 0.3 }}>❤️</Text>
                    ))}
                </View>
            </View>

            {/* Game Area */}
            <View style={styles.gameArea}>
                {/* Server */}
                <Animated.View style={[styles.serverBox, {
                    backgroundColor: serverFlashAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['transparent', 'rgba(255,0,0,0.5)']
                    })
                }]}>
                    <Text style={{ fontSize: 40 }}>🖥️</Text>
                </Animated.View>

                {/* Bug */}
                {currentWord && (
                    <Animated.View style={[styles.bugContainer, { 
                        transform: [
                            { translateX: bugAnim },
                            { translateY: bugYAnim }
                        ] 
                    }]}>
                        {bugState === 'dead' && (
                            <View style={{ position: 'absolute', top: -55, width: SCREEN_WIDTH * 0.8, alignItems: 'center', zIndex: 10 }}>
                                <View style={{ backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, minWidth: 100, alignItems: 'center' }}>
                                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#00FF00', fontSize: 18, fontWeight: 'bold' }}>
                                        {currentWord.meaning_tr}
                                    </Text>
                                </View>
                            </View>
                        )}
                        <Text style={{ fontSize: 50 }}>{bugState === 'dead' ? '💥' : '🐛'}</Text>
                        {isPerfect && combo > 1 && bugState === 'dead' && (
                            <Text style={{ position: 'absolute', top: -20, color: '#FFD700', fontWeight: 'bold', fontSize: 16 }}>PERFECT!</Text>
                        )}
                    </Animated.View>
                )}
            </View>

            {/* Replay Audio Button, Hint & Combo */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity 
                        style={[styles.replayBtn, { paddingHorizontal: 15 }]} 
                        onPress={() => currentWord && playAudio(currentWord.word_en)}
                    >
                        <Ionicons name="volume-high" size={24} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.replayBtn, { backgroundColor: hintsRemaining > 0 ? '#FF9500' : '#555', marginLeft: 10 }]} 
                        onPress={handleHint}
                        disabled={hintsRemaining <= 0}
                    >
                        <Ionicons name="bulb" size={24} color={hintsRemaining > 0 ? "#fff" : "#888"} />
                        <Text style={{ color: hintsRemaining > 0 ? '#fff' : '#888', fontWeight: 'bold', marginLeft: 5 }}>İpucu ({hintsRemaining})</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: combo > 1 ? '#FFD700' : '#444', fontSize: 14, fontWeight: 'bold' }}>COMBO</Text>
                    <Text style={{ color: combo > 1 ? '#FFD700' : '#444', fontSize: 24, fontWeight: '900' }}>x{combo}</Text>
                </View>
            </View>

            {/* Typing Area */}
            <View style={styles.typingArea}>
                <View style={styles.typingBoxWrapper}>
                    {/* Görsel Kutucuk (Arkada) */}
                    <Animated.View style={[styles.displayBox, { transform: [{ translateX: shakeAnim }] }]}>
                        {currentWord && currentWord.word_en.split('').map((char, index) => {
                            const isTyped = index < inputText.length;
                            return (
                                <Text key={index} style={[styles.charText, { color: isTyped ? '#00FF00' : '#444' }]}>
                                    {isTyped ? char : '_'}
                                </Text>
                            );
                        })}
                    </Animated.View>

                    {/* Gerçek TextInput (Görünmez ama Tıklanabilir Şekilde Önde) */}
                    <TextInput
                        ref={inputRef}
                        style={styles.overlayInput}
                        value={inputText}
                        onChangeText={handleTextChange}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        autoFocus={true}
                        caretHidden={true}
                    />
                </View>
                <Text style={{ color: '#666', marginTop: 15, fontSize: 12 }}>Böceği durdurmak için kelimeyi yaz!</Text>
            </View>

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
    
    gameArea: { flex: 1, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: '#333' },
    serverBox: { position: 'absolute', right: 10, alignItems: 'center', padding: 10, borderRadius: 10 },
    bugContainer: { position: 'absolute', left: 0, alignItems: 'center' },
    soundWave: { position: 'absolute', top: -15, right: -15, backgroundColor: '#007AFF', borderRadius: 10, padding: 2 },
    
    typingArea: { height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
    typingBoxWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
    displayBox: { flexDirection: 'row', backgroundColor: '#000', padding: 20, borderRadius: 15, borderWidth: 2, borderColor: '#333', minWidth: 200, justifyContent: 'center' },
    overlayInput: { position: 'absolute', width: '100%', height: '100%', color: 'transparent', backgroundColor: 'transparent' },
    charText: { fontSize: 36, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginHorizontal: 2 },
    replayBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
    
    gameoverText: { fontSize: 36, fontWeight: '900', marginBottom: 20 },
    btn: { padding: 18, borderRadius: 20, alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
