import React, { useState, useEffect, useRef } from 'react';
import { 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    StyleSheet, 
    Alert, 
    ScrollView, 
    KeyboardAvoidingView, 
    Platform, 
    ActivityIndicator, 
    Pressable, 
    StatusBar,
    Animated,
    Dimensions,
    InteractionManager
} from 'react-native';
import { Audio } from 'expo-av';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useWordKnowledge } from '../context/WordKnowledgeContext';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const parseSyllables = (word, phonetic) => {
    if (!word) return [];

    const cleanWord = word.trim();
    
    // Helper to get syllable divisions of the written word
    const getEnglishSyllables = (str) => {
        const vowelRegex = /[aeiouy]+/gi;
        let matches = [...str.matchAll(vowelRegex)];
        
        // Handle silent final 'e' / 'ue' / 'se' etc.
        if (matches.length > 1) {
            const lastMatch = matches[matches.length - 1];
            const lastStr = lastMatch[0].toLowerCase();
            const lastIndex = lastMatch.index;
            
            // If it ends with 'e' (or 'ue' after q, etc.) at the end of the word
            if (lastStr.endsWith('e') && (lastIndex + lastMatch[0].length === str.length)) {
                // If it's a silent final e (not preceded by 'l' like 'handle')
                const precededByL = lastIndex > 0 && str[lastIndex - 1].toLowerCase() === 'l';
                if (!precededByL) {
                    matches.pop();
                }
            }
        }
        
        if (matches.length <= 1) {
            return [str];
        }
        
        const res = [];
        let lastIdx = 0;
        const vowels = matches.map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
        
        for (let i = 0; i < vowels.length - 1; i++) {
            const currentVowel = vowels[i];
            const nextVowel = vowels[i + 1];
            const between = str.slice(currentVowel.end, nextVowel.start);
            
            let splitOffset = 0;
            if (between.length > 1) {
                splitOffset = Math.floor(between.length / 2);
            }
            
            const splitPoint = currentVowel.end + splitOffset;
            res.push(str.slice(lastIdx, splitPoint));
            lastIdx = splitPoint;
        }
        res.push(str.slice(lastIdx));
        return res.filter(Boolean);
    };

    const wordSyllables = getEnglishSyllables(cleanWord);
    
    // Find stressed syllable index
    let stressedIdx = -1;
    
    if (phonetic && (phonetic.includes('ˈ') || phonetic.includes('ˌ'))) {
        const cleanIpa = phonetic.replace(/[\/\[\]]/g, '').trim();
        
        let stressPos = cleanIpa.indexOf('ˈ');
        if (stressPos === -1) {
            stressPos = cleanIpa.indexOf('ˌ');
        }
        
        if (stressPos !== -1) {
            const ipaVowelsRegex = /[əʌæɑɒɔʊuɪieaʊɔɪaɪeɪoʊɜ]/g;
            const prefix = cleanIpa.substring(0, stressPos);
            const prefixVowelsCount = (prefix.match(ipaVowelsRegex) || []).length;
            stressedIdx = prefixVowelsCount;
        }
    }
    
    // Fallback if stress index is invalid or not found
    if (stressedIdx === -1 || stressedIdx >= wordSyllables.length) {
        stressedIdx = 0; // Default to first syllable
    }
    
    const finalSyllables = wordSyllables.map((text, idx) => ({
        text,
        isStressed: idx === stressedIdx
    }));

    // CRITICAL CONSTRAINT:
    // If the splitter yields 1 syllable OR any syllable has length < 1 character:
    // Do not split, render whole word as a single block using COLORS.text_primary.
    if (finalSyllables.length <= 1 || finalSyllables.some(s => s.text.length < 1)) {
        return [{ text: cleanWord, isStressed: true }];
    }
    
    return finalSyllables;
};

const generateVisibilityMask = (wordEn, cefr) => {
    if (!wordEn) return [];
    const L = wordEn.length;
    const mask = new Array(L).fill(false);
    if (L <= 2) {
        return mask.map(() => true);
    }
    // First and last are always visible
    mask[0] = true;
    mask[L - 1] = true;
    
    let ratio = 0.25; // default B1/B2
    const cefrLevel = (cefr || 'B1').toUpperCase();
    if (cefrLevel.startsWith('A')) ratio = 0.40;
    else if (cefrLevel.startsWith('B')) ratio = 0.25;
    else if (cefrLevel.startsWith('C')) ratio = 0.10;
    
    const targetVisible = Math.round(L * ratio);
    const additionalToReveal = Math.max(0, targetVisible - 2);
    
    if (additionalToReveal > 0) {
        // Gather middle indices
        const middleIndices = [];
        for (let i = 1; i < L - 1; i++) {
            middleIndices.push(i);
        }
        // Shuffle middle indices
        for (let i = middleIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [middleIndices[i], middleIndices[j]] = [middleIndices[j], middleIndices[i]];
        }
        // Reveal first K additional indices
        for (let i = 0; i < Math.min(additionalToReveal, middleIndices.length); i++) {
            mask[middleIndices[i]] = true;
        }
    }
    return mask;
};

const IpaText = ({ phonetic, containerWidth }) => {
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const isOverflowing = measuredWidth > 0 && containerWidth > 0 && measuredWidth > containerWidth;
    
    return (
        <Text
            onLayout={(e) => {
                if (measuredWidth === 0) {
                    setMeasuredWidth(e.nativeEvent.layout.width);
                }
            }}
            numberOfLines={isOverflowing ? 1 : undefined}
            adjustsFontSizeToFit={isOverflowing}
            minimumFontScale={0.7}
            minFontSizeMultiplier={0.7}
            style={[
                Platform.select({
                    ios: { fontFamily: 'Menlo, Courier New' },
                    android: { fontFamily: 'monospace' }
                }),
                {
                    fontVariant: ['tabular-nums'],
                    fontSize: 14,
                    color: '#CBD5E1',
                    textAlign: 'center',
                    marginBottom: 15
                }
            ]}
        >
            {phonetic}
        </Text>
    );
};

const getSyllableHintString = (wordEn, phonetic) => {
    if (!wordEn) return '';
    const cleanWord = wordEn.trim().toLowerCase();
    if (!phonetic) return cleanWord;
    
    // Parse phonetic to locate exact index positions of 'ˈ' and 'ˌ'
    // Ensure we do NOT lookup stress markers in wordEn
    const cleanIpa = phonetic.replace(/[\/\[\]]/g, '').trim();
    
    const hasStress = cleanIpa.includes('ˈ') || cleanIpa.includes('ˌ');
    if (!hasStress) {
        return cleanWord;
    }
    
    const syllables = parseSyllables(cleanWord, phonetic);
    return syllables.map(s => s.text.toLowerCase()).join('-');
};

const getNextEditableIndex = (current, maskedSet, len) => {
    for (let i = current + 1; i < len; i++) {
        if (maskedSet.has(i)) return i;
    }
    return null;
};

const getPrevEditableIndex = (current, maskedSet) => {
    for (let i = current - 1; i >= 0; i--) {
        if (maskedSet.has(i)) return i;
    }
    return null;
};

const getAnatomicalData = (feedback) => {
    if (!feedback || feedback.length === 0) return null;
    const first = feedback[0];
    const hint = first.anatomical_hint || "";
    
    const newlineIdx = hint.indexOf('\n');
    let instruction = first.feedback_tr || "";
    let header = "";
    
    if (newlineIdx !== -1) {
        header = hint.substring(0, newlineIdx).trim();
        instruction = hint.substring(newlineIdx + 1).trim();
    } else if (hint) {
        const dashIdx = hint.indexOf(' — ');
        if (dashIdx !== -1) {
            header = hint;
        } else {
            header = "Artikülasyon ipucu";
            instruction = hint;
        }
    } else {
        header = `${first.error_name || "Telaffuz Hatası"}`;
        instruction = first.feedback_tr || "";
    }
    
    return { header, instruction };
};

export default function PracticeScreen({ route, navigation }) {
    const { studyList, user_id, isReview } = route.params || { studyList: [], user_id: null, isReview: false };
    const { theme, isDark } = useTheme();
    const { updatePhonemeResult, markReviewLater } = useWordKnowledge();

    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [step, setStep] = useState(1); 
    const [isFlipped, setIsFlipped] = useState(false);
    const [isWrong, setIsWrong] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [passedStep3, setPassedStep3] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [feedbackJson, setFeedbackJson] = useState(null);
    const [spectrogram, setSpectrogram] = useState(null);
    const [backtrackingFeedback, setBacktrackingFeedback] = useState(null);
    const [vetoTriggered, setVetoTriggered] = useState(false);
    const [diagnosticMessage, setDiagnosticMessage] = useState('');
    
    // Audio playback & slide animation states/refs
    const [recordedUri, setRecordedUri] = useState(null);
    const [refAudioUrl, setRefAudioUrl] = useState(null);
    const [playingType, setPlayingType] = useState(null);
    const soundRef = useRef(null);
    const isLoadingRef = useRef(false);
    const isAnalyzingRef = useRef(false);
    const pulsePlayAnim = useRef(new Animated.Value(0.4)).current;
    const slideAnim = useRef(new Animated.Value(60)).current;
    const isPressingRef = useRef(false);
    
    // Ses Yönetimi State'leri
    const [sound, setSound] = useState(null);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);

    // Overhaul specific states
    const [analysisComplete, setAnalysisComplete] = useState(false);
    const [hadVeto, setHadVeto] = useState(false);
    const [vetoAttempts, setVetoAttempts] = useState(0);
    const [bypassUnlocked, setBypassUnlocked] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!word?.id) return;
        const VETO_KEY = `veto_${word.id}`;
        AsyncStorage.getItem(VETO_KEY).then(raw => {
            if (!mountedRef.current) return;
            const saved = raw ? JSON.parse(raw) : 0;
            setVetoAttempts(saved);
            if (saved >= 3) {
                setBypassUnlocked(true);
            } else {
                setBypassUnlocked(false);
            }
        }).catch(err => {
            console.warn("AsyncStorage load error:", err);
        });
    }, [word?.id]);
    
    // Scale animation for Next Word button
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const bypassPulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!bypassUnlocked) {
            bypassPulseAnim.setValue(1.0);
            return;
        }
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(bypassPulseAnim, { 
                    toValue: 0.6, 
                    duration: 800,
                    useNativeDriver: true 
                }),
                Animated.timing(bypassPulseAnim, { 
                    toValue: 1.0, 
                    duration: 800,
                    useNativeDriver: true 
                })
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [bypassUnlocked]);

    // Animated values for Design Sprint A Progress Indicator
    const line1Anim = useRef(new Animated.Value(step >= 2 ? 1 : 0)).current;
    const line2Anim = useRef(new Animated.Value(step >= 3 ? 1 : 0)).current;
    const pulseActiveStep = useRef(new Animated.Value(1)).current;

    const word = studyList[currentWordIndex];

    // States and Refs for Design Sprint B Hidden Letter Mechanic
    const inputRefs = useRef([]);
    const [inputArray, setInputArray] = useState([]);
    const [visibilityMask, setVisibilityMask] = useState([]);
    const [revealedIndices, setRevealedIndices] = useState([]);
    const [checkStatus, setCheckStatus] = useState('idle'); // 'idle', 'correct', 'wrong'
    const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
    const scaleAnims = useRef([]).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;

    // Animated values for Design Sprint C Microphone Wave Animation
    const idlePulseAnim = useRef(new Animated.Value(0)).current;
    const ripple1 = useRef(new Animated.Value(0)).current;
    const ripple2 = useRef(new Animated.Value(0)).current;
    const ripple3 = useRef(new Animated.Value(0)).current;
    const spinAnim = useRef(new Animated.Value(0)).current;
    const barAnims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;

    // --- ANIMATIONS FOR MICROPHONE BUTTON ---
    useEffect(() => {
        // Stop all active animations first
        idlePulseAnim.setValue(0);
        ripple1.setValue(0);
        ripple2.setValue(0);
        ripple3.setValue(0);
        spinAnim.setValue(0);
        barAnims.forEach(anim => anim.setValue(0));
        
        let idleLoop = null;
        let rippleLoops = [];
        let spinLoop = null;
        let barLoops = [];
        
        if (isRecording) {
            const startRipple = (anim, delayVal) => {
                anim.setValue(0);
                const loop = Animated.loop(
                    Animated.sequence([
                        Animated.delay(delayVal),
                        Animated.timing(anim, {
                            toValue: 1,
                            duration: 1200,
                            useNativeDriver: true
                        })
                    ])
                );
                loop.start();
                return loop;
            };
            
            rippleLoops = [
                startRipple(ripple1, 0),
                startRipple(ripple2, 200),
                startRipple(ripple3, 400)
            ];
            
            const startBar = (anim, minVal, maxVal, delayVal) => {
                anim.setValue(0);
                const loop = Animated.loop(
                    Animated.sequence([
                        Animated.delay(delayVal),
                        Animated.timing(anim, {
                            toValue: 1,
                            duration: 400,
                            useNativeDriver: false
                        }),
                        Animated.timing(anim, {
                            toValue: 0,
                            duration: 400,
                            useNativeDriver: false
                        })
                    ])
                );
                loop.start();
                return loop;
            };
            
            barLoops = [
                startBar(barAnims[0], 8, 16, 160),
                startBar(barAnims[1], 8, 20, 80),
                startBar(barAnims[2], 8, 24, 0),
                startBar(barAnims[3], 8, 32, 80), // center
                startBar(barAnims[4], 8, 24, 0),
                startBar(barAnims[5], 8, 20, 80),
                startBar(barAnims[6], 8, 16, 160)
            ];
        } else if (isAnalyzing) {
            spinAnim.setValue(0);
            spinLoop = Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: (t) => t,
                    useNativeDriver: true
                })
            );
            spinLoop.start();
        } else {
            idlePulseAnim.setValue(0);
            idleLoop = Animated.loop(
                Animated.timing(idlePulseAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true
                })
            );
            idleLoop.start();
        }
        
        return () => {
            idlePulseAnim.stopAnimation();
            ripple1.stopAnimation();
            ripple2.stopAnimation();
            ripple3.stopAnimation();
            spinAnim.stopAnimation();
            barAnims.forEach(b => b.stopAnimation());
        };
    }, [isRecording, isAnalyzing]);

    const getBarHeight = (idx) => {
        let maxH = 16;
        if (idx === 3) maxH = 32;
        else if (idx === 2 || idx === 4) maxH = 24;
        else if (idx === 1 || idx === 5) maxH = 20;
        
        return barAnims[idx].interpolate({
            inputRange: [0, 1],
            outputRange: [8, maxH]
        });
    };

    useEffect(() => {
        if (word && word.word_en) {
            const mask = generateVisibilityMask(word.word_en, word.cefr_level);
            setVisibilityMask(mask);
            
            const initialInput = word.word_en.split('').map((char, idx) => mask[idx] ? char : '');
            setInputArray(initialInput);

            setCheckStatus('idle');
            setShowCorrectAnswers(false);
            setRevealedIndices(new Array(word.word_en.length).fill(false));
            scaleAnims.length = word.word_en.length;
            for (let i = 0; i < word.word_en.length; i++) {
                scaleAnims[i] = new Animated.Value(1);
            }

            const maskedSetLocal = new Set(
                mask
                    .map((visible, idx) => (!visible ? idx : null))
                    .filter((idx) => idx !== null)
            );
            const firstEmpty = getNextEditableIndex(-1, maskedSetLocal, word.word_en.length);
            if (firstEmpty !== null) {
                InteractionManager.runAfterInteractions(() => {
                    inputRefs.current[firstEmpty]?.focus();
                });
            }
        }
    }, [word?.word_en]);

    // --- ANIMATIONS FOR PROGRESS INDICATOR ---
    useEffect(() => {
        pulseActiveStep.setValue(1);
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseActiveStep, {
                    toValue: 1.15,
                    duration: 450,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseActiveStep, {
                    toValue: 1.0,
                    duration: 450,
                    useNativeDriver: true,
                })
            ])
        );
        anim.start();

        Animated.timing(line1Anim, {
            toValue: step >= 2 ? 1 : 0,
            duration: 400,
            useNativeDriver: false,
        }).start();

        Animated.timing(line2Anim, {
            toValue: step >= 3 ? 1 : 0,
            duration: 400,
            useNativeDriver: false,
        }).start();

        return () => anim.stop();
    }, [step]);

    const renderStepCircle = (stepNum) => {
        const isCompleted = stepNum < step;
        const isActive = stepNum === step;
        
        if (isCompleted) {
            return (
                <View key={stepNum} style={[styles.stepCircle, { backgroundColor: COLORS.success }]}>
                    <Ionicons name="checkmark" size={16} color={theme.text} />
                </View>
            );
        } else if (isActive) {
            return (
                <Animated.View key={stepNum} style={[styles.stepCircle, { backgroundColor: COLORS.accent_purple, transform: [{ scale: pulseActiveStep }] }]}>
                    <Text style={[styles.circleText, { color: theme.text }]}>{stepNum}</Text>
                </Animated.View>
            );
        } else {
            return (
                <View key={stepNum} style={[styles.stepCircle, { backgroundColor: COLORS.border }]}>
                    <Text style={[styles.circleText, { color: theme.textMuted }]}>{stepNum}</Text>
                </View>
            );
        }
    };

    const renderLine = (lineNum) => {
        const anim = lineNum === 1 ? line1Anim : line2Anim;
        const widthPercent = anim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%']
        });
        return (
            <View style={styles.lineTrack}>
                <Animated.View style={[styles.lineFill, { width: widthPercent }]} />
            </View>
        );
    };

    const advanceFocus = (nextIdx) => {
        if (nextIdx === null) return;
        InteractionManager.runAfterInteractions(() => {
            inputRefs.current[nextIdx]?.focus();
        });
    };

    const renderLetterBox = (letter, idx) => {
        if (!word || !word.word_en) return null;
        const L = word.word_en.length;
        const isVisible = visibilityMask[idx] || revealedIndices[idx];
        
        // Width calculation to ensure all letters fit on a single line perfectly
        const screenWidth = Dimensions.get('window').width;
        const availableWidth = screenWidth - 48; // screen padding of 20 on each side + safety margin
        const gapSize = 4;
        const totalGaps = L - 1;
        const computedBoxWidth = (availableWidth - (totalGaps * gapSize)) / L - 2; // -2 for borders
        const boxWidth = Math.min(Math.max(computedBoxWidth, 24), 40);
        
        // Font size proportional to boxWidth
        const fontSize = Math.max(Math.floor(boxWidth * 0.55), 12);
        
        // Styles based on checkStatus, visible state
        let boxBgColor = theme.card;
        let boxBorderColor = COLORS.accent_purple + '44';
        let boxBorderStyle = 'dashed';
        let textColor = theme.textMuted;
        let fontWeight = 'normal';
        
        if (isVisible) {
            boxBgColor = theme.elevated;
            boxBorderColor = COLORS.border;
            boxBorderStyle = 'solid';
            textColor = theme.text;
            fontWeight = 'bold';
        } else if (inputArray[idx] && inputArray[idx] !== '') {
            // User-filled letters should be bold and clear
            textColor = theme.text;
            fontWeight = 'bold';
        }
        
        // Correct answer reveal styling
        if (checkStatus === 'correct' && revealedIndices[idx]) {
            boxBgColor = COLORS.success + '33';
            boxBorderColor = COLORS.success;
            boxBorderStyle = 'solid';
            textColor = COLORS.success;
            fontWeight = 'bold';
        }
        
        // Wrong answer styling
        if (checkStatus === 'wrong') {
            boxBgColor = COLORS.danger + '22';
            boxBorderColor = COLORS.danger;
            boxBorderStyle = 'solid';
            
            if (showCorrectAnswers) {
                // Show correct letters in red
                textColor = COLORS.danger;
                fontWeight = 'bold';
            } else {
                textColor = theme.textMuted;
            }
        }
        
        // Content inside the box
        let displayText = '';
        if (isVisible) {
            displayText = letter;
        } else if (showCorrectAnswers) {
            displayText = letter; // Show correct letter in red
        } else {
            displayText = inputArray[idx] || ''; // Show user typed char
        }
        
        const scaleVal = scaleAnims[idx] || new Animated.Value(1);
        
        const maskedSet = new Set(
            visibilityMask
                .map((visible, idx) => (!visible ? idx : null))
                .filter((idx) => idx !== null)
        );

        // Accessibility Label
        const accessibilityLabel = isVisible
            ? `${letter} harfi, sabit`
            : `${idx + 1}. harf, doldurulacak`;

        return (
            <Animated.View 
                key={idx} 
                style={[
                    styles.letterBox, 
                    { 
                        width: boxWidth, 
                        height: boxWidth, 
                        backgroundColor: boxBgColor, 
                        borderColor: boxBorderColor,
                        borderStyle: boxBorderStyle,
                        transform: [{ scale: scaleVal }]
                    }
                ]}
            >
                <TextInput
                    ref={(el) => (inputRefs.current[idx] = el)}
                    style={{ 
                        fontSize, 
                        color: textColor, 
                        fontWeight, 
                        textAlign: 'center', 
                        width: '100%', 
                        height: '100%',
                        padding: 0,
                        margin: 0,
                        ...Platform.select({
                            android: {
                                textAlignVertical: 'center',
                                includeFontPadding: false
                            }
                        })
                    }}
                    value={displayText}
                    maxLength={1}
                    editable={!isVisible && !showCorrectAnswers && checkStatus !== 'correct'}
                    pointerEvents={isVisible ? "none" : "auto"}
                    onChangeText={(char) => {
                        const next = [...inputArray];
                        next[idx] = char;
                        setInputArray(next);
                        setIsWrong(false);
                        if (char) {
                            advanceFocus(getNextEditableIndex(idx, maskedSet, L));
                        }
                    }}
                    onKeyPress={(e) => {
                        if (e.nativeEvent.key === 'Backspace') {
                            const currentVal = inputArray[idx];
                            if (currentVal) {
                                const next = [...inputArray];
                                next[idx] = '';
                                setInputArray(next);
                            } else {
                                const prevIdx = getPrevEditableIndex(idx, maskedSet);
                                if (prevIdx !== null) {
                                    const next = [...inputArray];
                                    next[prevIdx] = '';
                                    setInputArray(next);
                                    InteractionManager.runAfterInteractions(() => {
                                        inputRefs.current[prevIdx]?.focus();
                                    });
                                }
                            }
                        }
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    accessibilityLabel={accessibilityLabel}
                />
            </Animated.View>
        );
    };

    // --- SES ÇALMA VE KAYIT İZİNLERİ (EXPO-AV) ---
    useEffect(() => {
        async function setupAudio() {
            try {
                const permission = await Audio.requestPermissionsAsync();
                if (permission.status !== 'granted') {
                    Alert.alert("İzin Gerekli", "Ses analizi için mikrofon izni vermeniz gerekiyor.");
                }

                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                });
            } catch (error) {
                console.error("Audio setup error:", error);
            }
        }
        setupAudio();

        return sound
            ? () => {
                  sound.unloadAsync();
              }
            : undefined;
    }, []);

    // --- KELİMENİN SESİNİ ÇALMA ---
    const playSound = async () => {
        if (!word || !word.audio_path) return;
        try {
            const audioUrl = `${apiClient.defaults.baseURL}/${word.audio_path.replace(/\\/g, '/')}`;
            const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUrl });
            setSound(newSound);
            await newSound.playAsync();
        } catch (error) {
            console.log("Ses çalma hatası:", error);
        }
    };

    // --- STEP 3 AUDIO COMPARISON PLAYBACK WITH LOCK & CLEANUP ---
    const playAudioCompare = async (uri, type) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        setPlayingType(type);
        try {
            if (soundRef.current) {
                await soundRef.current.unloadAsync().catch(() => {});
                soundRef.current = null;
            }
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true },
                (status) => {
                    if (status.didJustFinish) {
                        setPlayingType(null);
                        soundRef.current?.unloadAsync().catch(() => {});
                        soundRef.current = null;
                    }
                }
            );
            soundRef.current = newSound;
        } catch (e) {
            console.warn("Playback error:", e);
            setPlayingType(null);
        } finally {
            isLoadingRef.current = false;
        }
    };

    const handlePlayComparePress = async (uri, type) => {
        if (!uri) {
            Alert.alert("Ses Yok", "Önce sesinizi kaydetmelisiniz.");
            return;
        }
        if (playingType === type) {
            if (soundRef.current) {
                await soundRef.current.stopAsync().catch(() => {});
                await soundRef.current.unloadAsync().catch(() => {});
                soundRef.current = null;
            }
            setPlayingType(null);
        } else {
            await playAudioCompare(uri, type);
        }
    };

    // Animated loop for playback button pulsing
    useEffect(() => {
        let anim = null;
        if (playingType) {
            anim = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulsePlayAnim, {
                        toValue: 1.0,
                        duration: 800,
                        useNativeDriver: true
                    }),
                    Animated.timing(pulsePlayAnim, {
                        toValue: 0.4,
                        duration: 800,
                        useNativeDriver: true
                    })
                ])
            );
            anim.start();
        } else {
            pulsePlayAnim.setValue(0.4);
        }
        return () => {
            if (anim) anim.stop();
        };
    }, [playingType]);

    // Animated entry for L1 articulation hint card
    useEffect(() => {
        if (vetoTriggered) {
            setTimeout(() => {
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 10,
                    useNativeDriver: true
                }).start();
            }, 800);
        } else {
            slideAnim.setValue(60);
        }
    }, [vetoTriggered]);

    // Clean comparison sounds on unmount
    useEffect(() => {
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => {});
            }
        };
    }, []);

    const runShakeAnimation = () => {
        shakeAnim.setValue(0);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true })
        ]).start();
    };

    const runRevealAnimation = (callback) => {
        const L = word.word_en.length;
        let animatedCount = 0;
        
        for (let i = 0; i < L; i++) {
            if (!visibilityMask[i]) {
                animatedCount++;
                setTimeout(() => {
                    scaleAnims[i].setValue(0.8);
                    Animated.spring(scaleAnims[i], {
                        toValue: 1.0,
                        tension: 40,
                        friction: 5,
                        useNativeDriver: true
                    }).start();
                    setRevealedIndices(prev => {
                        const next = [...prev];
                        next[i] = true;
                        return next;
                    });
                }, i * 80);
            }
        }
        
        if (animatedCount > 0) {
            setTimeout(callback, L * 80 + 300);
        } else {
            callback();
        }
    };

    const checkWrite = () => {
        const maskedSet = new Set(
            visibilityMask
                .map((visible, idx) => (!visible ? idx : null))
                .filter((idx) => idx !== null)
        );

        let isCorrect = true;
        for (let i = 0; i < word.word_en.length; i++) {
            if (maskedSet.has(i)) {
                if (inputArray[i]?.toLowerCase() !== word.word_en[i]?.toLowerCase()) {
                    isCorrect = false;
                    break;
                }
            }
        }
        
        if (isCorrect) {
            setCheckStatus('correct');
            setIsWrong(false);
            const finalInput = word.word_en.split('');
            setInputArray(finalInput);
            
            runRevealAnimation(() => {
                setStep(3);
                setCheckStatus('idle');
            });
        } else {
            setCheckStatus('wrong');
            setIsWrong(true);
            runShakeAnimation();
            
            // Show correct answers after 1 second
            setTimeout(() => {
                setShowCorrectAnswers(true);
                setTimeout(() => {
                    Alert.alert("Hatalı Yazım", "Kelimeyi tekrar kontrol et veya Flashcard'a geri dön.", [
                        {
                            text: "Tamam",
                            onPress: () => {
                                if (word && word.word_en) {
                                    const mask = generateVisibilityMask(word.word_en, word.cefr_level);
                                    setVisibilityMask(mask);
                                    setCheckStatus('idle');
                                    setShowCorrectAnswers(false);
                                    setRevealedIndices(new Array(word.word_en.length).fill(false));
                                    
                                    const initialInput = word.word_en.split('').map((char, idx) => mask[idx] ? char : '');
                                    setInputArray(initialInput);
                                    
                                    for (let i = 0; i < word.word_en.length; i++) {
                                        scaleAnims[i] = new Animated.Value(1);
                                    }
                                }
                            }
                        }
                    ]);
                }, 1000);
            }, 1000);
        }
    };

    // --- BASILI TUTUNCA KAYIT ---
    async function startRecording() {
        try {
            isPressingRef.current = true;
            setIsRecording(true);
            if (recording) {
                try {
                    await recording.stopAndUnloadAsync();
                } catch (e) {}
            }

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            
            if (!isPressingRef.current) {
                await newRecording.stopAndUnloadAsync();
                setIsRecording(false);
                setRecording(null);
                return;
            }

            setRecording(newRecording);
            console.log('Kayıt başladı');
        } catch (err) {
            console.error('Kayıt başlatılamadı:', err);
            setIsRecording(false);
            Alert.alert("Hata", "Mikrofon başlatılamadı. Lütfen izinleri kontrol edin.");
        }
    }

    // --- BIRAKINCA DURDUR VE GÖNDER ---
    async function stopRecording() {
        isPressingRef.current = false;
        if (!recording) {
            setIsRecording(false);
            return;
        }

        setIsRecording(false);
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            console.log('Kayıt durdu, dosya kaydedildi:', uri);
            setRecording(null); 
            
            if (uri) {
                setRecordedUri(uri);
                sendAudioToBackend(uri);
            }
        } catch (error) {
            console.error("Kayıt durdurma hatası:", error);
            setRecording(null);
        }
    }

    const persistVeto = (count) => {
        if (!word?.id) return;
        const VETO_KEY = `veto_${word.id}`;
        AsyncStorage.setItem(VETO_KEY, JSON.stringify(count))
            .catch(() => {});
    };

    // --- BACKEND'E SES DOSYASINI GÖNDERME ---
    const sendAudioToBackend = async (uri) => {
        if (isAnalyzingRef.current) return;
        isAnalyzingRef.current = true;
        setIsAnalyzing(true);
        try {
            const fileType = Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/m4a';
            const fileName = `speech_${word.word_en}_${Date.now()}.m4a`;

            const formData = new FormData();
            formData.append('file', {
                uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                type: fileType,
                name: fileName,
            });

            console.log("Dosya gönderiliyor...", fileName);

            const response = await apiClient.post(`/analyze-speech/${word.word_en}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 90000, 
            });

            const { is_correct, score, diagnostic_message, frontend_feedback_json, residual_spectrogram, backtracking_feedback, veto_triggered, reference_audio_url } = response.data;
            
            setFeedbackJson(frontend_feedback_json || null);
            setSpectrogram(residual_spectrogram || null);
            setBacktrackingFeedback(backtracking_feedback || null);
            setVetoTriggered(veto_triggered || false);
            setDiagnosticMessage(diagnostic_message || '');

            const refUrl = reference_audio_url 
                ? `${apiClient.defaults.baseURL}/${reference_audio_url.replace(/^\//, '')}` 
                : `${apiClient.defaults.baseURL}/assets/audio/${word.word_en.toLowerCase()}_ref.mp3`;
            setRefAudioUrl(refUrl);

            // Safe Score calculation to protect against scale differences
            const scoreVal = score <= 1.0 ? score * 100 : score;
            const roundedScore = Math.round(scoreVal);

            // Context sync
            updatePhonemeResult(word.id, roundedScore, backtracking_feedback, veto_triggered);

            if (veto_triggered) {
                setHadVeto(true);
                const next = vetoAttempts + 1;
                if (mountedRef.current) {
                    setVetoAttempts(next);
                    persistVeto(next);
                    if (next >= 3) {
                        setBypassUnlocked(true);
                        if (next === 3) {
                            Alert.alert(
                                "Pes Etmek Yok! 💪",
                                "Bu kelime seni biraz zorlamış olabilir. 3 deneme yaptığın için geçiş kilidi açıldı; dilersen yeşil butona basarak sonraki kelimeye geçebilir veya çalışmayı bitirebilirsin.",
                                [{ text: "Devam Et", style: "cancel" }]
                            );
                        }
                    }
                }
                setPassedStep3(false);
                setFeedback({ type: 'error', text: `Tekrar dene. Puan: %${roundedScore}\n${diagnostic_message || ''}`});
            } else {
                if (is_correct || roundedScore >= 70) {
                    await apiClient.post(`/mark-word-learned/?user_id=${user_id}&word_id=${word.id}&is_practice=true`);
                    setPassedStep3(true);
                    setFeedback({ type: 'success', text: `Harika! Puan: %${roundedScore} - ${diagnostic_message || ''}`});
                    
                    // If they previously hit a veto and now resolved it successfully:
                    if (hadVeto) {
                        // Increment veto_history in context cleanly
                        updatePhonemeResult(word.id, roundedScore, backtracking_feedback, true);
                        
                        // Trigger pulse micro-animation
                        pulseAnim.setValue(1);
                        Animated.sequence([
                            Animated.timing(pulseAnim, { toValue: 1.15, duration: 250, useNativeDriver: true }),
                            Animated.timing(pulseAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
                            Animated.timing(pulseAnim, { toValue: 1.05, duration: 150, useNativeDriver: true }),
                            Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true })
                        ]).start();
                    }
                } else {
                    const next = vetoAttempts + 1;
                    if (mountedRef.current) {
                        setVetoAttempts(next);
                        persistVeto(next);
                        if (next >= 3) {
                            setBypassUnlocked(true);
                            if (next === 3) {
                                Alert.alert(
                                    "Pes Etmek Yok! 💪",
                                    "Bu ses seni biraz zorlamış olabilir. 3 deneme yaptığın için geçiş kilidi açıldı; dilersen yeşil butona basarak sonraki kelimeye geçebilir veya çalışmayı bitirebilirsin.",
                                    [{ text: "Devam Et", style: "cancel" }]
                                );
                            }
                        }
                    }
                    setFeedback({ type: 'error', text: `Tekrar dene. Puan: %${roundedScore}\n${diagnostic_message || ''}`});
                    setPassedStep3(false);
                }
            }

            setAnalysisComplete(true);
        } catch (error) {
            console.error("Ses analiz hatası:", error);
            setFeedback({ type: 'error', text: 'Ses analizi başarısız.'});
        } finally {
            setIsAnalyzing(false);
            isAnalyzingRef.current = false;
        }
    };

    const handleFinishOrNext = async () => {
        if (bypassUnlocked && !passedStep3) {
            markReviewLater(word.id, vetoAttempts);
            const VETO_KEY = `veto_${word.id}`;
            await AsyncStorage.removeItem(VETO_KEY).catch(() => {});
        }

        // Reset VETO logic for the new word
        setHadVeto(false);
        setVetoAttempts(0);
        setBypassUnlocked(false);
        setAnalysisComplete(false);
        setRecordedUri(null);
        setRefAudioUrl(null);
        setDiagnosticMessage('');

        if (currentWordIndex < studyList.length - 1) {
            setCurrentWordIndex(prev => prev + 1);
            setStep(1);
            setInputArray([]);
            setIsFlipped(false);
            setIsWrong(false);
            setPassedStep3(false);
            setFeedback(null);
            setFeedbackJson(null);
            setSpectrogram(null);
            setBacktrackingFeedback(null);
            setVetoTriggered(false);
            setDiagnosticMessage('');
        } else {
            try {
                const res = await apiClient.post(`/update-streak/${user_id}`);
                const { streak, learned_today, daily_goal, goal_reached, streak_updated } = res.data;

                if (goal_reached && learned_today === daily_goal) {
                    const streakText = streak_updated ? `\n🔥 Serin: ${streak} Gün` : '';
                    Alert.alert(
                        "Harika! 🏆", 
                        `Bugünün tüm kelimelerini sildin süpürdün! Harika gidiyorsun! (${learned_today}/${daily_goal})${streakText}`, 
                        [
                            { 
                                text: "Ana Sayfaya Dön", 
                                onPress: () => {
                                    navigation.reset({
                                        index: 0,
                                        routes: [{ name: 'Home', params: { user: { user_id, streak_count: streak, username: '', daily_goal: daily_goal } } }],
                                    });
                                } 
                            }
                        ]
                    );
                } else if (streak_updated) {
                    Alert.alert(
                        "Tebrikler! 🔥", 
                        `Bugünün ilk kelimesini tamamladın, serin devam ediyor!\n\nSerin: ${streak} Gün`, 
                        [
                            { 
                                text: "Ana Sayfaya Dön", 
                                onPress: () => {
                                    navigation.reset({
                                        index: 0,
                                        routes: [{ name: 'Home', params: { user: { user_id, streak_count: streak, username: '', daily_goal: daily_goal } } }],
                                    });
                                } 
                            }
                        ]
                    );
                } else {
                    // Go back silently
                    navigation.reset({
                        index: 0,
                        routes: [{ name: 'Home', params: { user: { user_id, streak_count: streak, username: '', daily_goal: daily_goal } } }],
                    });
                }
            } catch (error) {
                console.log("Streak hatası:", error);
                navigation.navigate('Home', { user: { user_id } });
            }
        }
    };

    const handleRetryClick = () => {
        // Allow the user to re-record by showing the microphone button again
        setAnalysisComplete(false);
        setFeedback(null);
        setRecordedUri(null);
        setRefAudioUrl(null);
        setDiagnosticMessage('');
        if (word && word.word_en) {
            setVisibilityMask(generateVisibilityMask(word.word_en, word.cefr_level));
        }
    };

    if (!word) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.primary} />
            </View>
        );
    }

    // Compute score details for display
    const finalScore = feedbackJson ? (feedback && feedback.text ? parseInt(feedback.text.match(/\d+/)?.[0] || '0') : 0) : 0;
    
    // Resolve score motivation band
    const getScoreBand = (scoreVal, isVeto) => {
        if (isVeto) {
            return {
                text: "🔬 L1 Pattern Detected",
                color: COLORS.danger,
                bg: COLORS.danger + '22',
                glow: COLORS.danger,
                desc: "L1 Pattern/aksanı saptandı. Aşağıdaki telaffuz tüyolarını inceleyerek tekrar denemelisin."
            };
        }
        if (scoreVal >= 85) {
            return {
                text: "🔥 Native-like!",
                color: COLORS.success,
                bg: COLORS.success + '22',
                glow: COLORS.success,
                desc: "Mükemmel telaffuz! Ana dili İngilizce olan biri gibi seslendirdin."
            };
        }
        if (scoreVal >= 70) {
            return {
                text: "⚡ Great job!",
                color: COLORS.accent_cyan,
                bg: COLORS.accent_cyan + '22',
                glow: COLORS.accent_cyan,
                desc: "Çok iyi! Küçük pürüzler dışında kelimeyi gayet temiz telaffuz ettin."
            };
        }
        if (scoreVal >= 50) {
            return {
                text: "💪 Keep going",
                color: COLORS.accent_amber,
                bg: COLORS.accent_amber + '22',
                glow: COLORS.accent_amber,
                desc: "Gayet iyi gidiyorsun. Kırmızı harflere ve vurguya dikkat ederek tekrarla."
            };
        }
        if (scoreVal >= 30) {
            return {
                text: "🎯 Almost there",
                color: COLORS.accent_amber,
                bg: COLORS.accent_amber + '22',
                glow: COLORS.accent_amber,
                desc: "Neredeyse oldu! Harflerin sesletimlerine odaklanarak tekrar dene."
            };
        }
        return {
            text: "🎯 Almost there",
            color: COLORS.danger,
            bg: COLORS.danger + '22',
            glow: COLORS.danger,
            desc: "Neredeyse oldu! Harflerin sesletimlerine odaklanarak tekrar dene."
        };
    };

    const band = getScoreBand(finalScore, vetoTriggered);
    const isNextDisabled = !passedStep3 && !bypassUnlocked;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
                
                {/* 3 Adım Progress Indicator */}
                <View style={styles.indicatorWrapper}>
                    <Text style={[styles.stepTitle, { color: theme.textSecondary }]}>
                        {step === 1 ? "ADIM 1: İNCELE" : step === 2 ? "ADIM 2: YAZ" : "ADIM 3: TELAFFUZ"}
                    </Text>
                    <View style={styles.indicatorContainer}>
                        {renderStepCircle(1)}
                        {renderLine(1)}
                        {renderStepCircle(2)}
                        {renderLine(2)}
                        {renderStepCircle(3)}
                    </View>
                </View>

                {step === 1 && (
                    <View style={styles.center}>
                        <TouchableOpacity
                            activeOpacity={0.9}
                            style={[styles.flashcard, { backgroundColor: isFlipped ? theme.flipBack : theme.card }]}
                            onPress={() => setIsFlipped(!isFlipped)}
                        >
                            <View style={[styles.unoWhiteBorder, { borderColor: theme.border }]}>
                                {!isFlipped ? (
                                    <View 
                                        style={styles.cardContent}
                                        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
                                    >
                                        {/* ANA KELİME GÖSTERİMİ */}
                                        <Text style={{ fontSize: 36, color: '#FFFFFF', fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
                                            {word.word_en}
                                        </Text>

                                        {/* HECE İPUCU SATIRI (BADGE) */}
                                        <View style={styles.syllableBadge}>
                                            <Text style={styles.syllableBadgeText}>
                                                {getSyllableHintString(word.word_en, word.phonetic)}
                                            </Text>
                                        </View>

                                        {/* IPA METNİ STİL — PLATFORM UYUMU VE TAŞMA KORUMASI */}
                                        <IpaText key={word.word_en} phonetic={word.phonetic} containerWidth={containerWidth} />

                                        <Text style={[styles.description, { color: theme.textSecondary }]}>{word.definition_en}</Text>
                                        <View style={[styles.exampleBox, { backgroundColor: theme.background, borderColor: theme.border }]}><Text style={[styles.exampleText, { color: theme.textSecondary }]}>"{word.example_en}"</Text></View>
                                        <TouchableOpacity onPress={playSound} style={[styles.unoAudioBtn, { backgroundColor: theme.elevated }]}><Text style={{fontSize: 24}}>🔊</Text></TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.cardContent}>
                                        <Text style={[styles.bigWordTr, { color: theme.accent }]}>{word.meaning_tr}</Text>
                                        <Text style={[styles.ipaTr, { color: theme.textMuted }]}>{word.phonetic}</Text>
                                        <Text style={[styles.descriptionTr, { color: theme.text }]}>{word.definition_tr}</Text>
                                        <View style={[styles.exampleBoxTr, { backgroundColor: theme.accentLight }]}><Text style={[styles.exampleTextTr, { color: theme.text }]}>"{word.example_tr}"</Text></View>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                        
                        {!isReview ? (
                            <TouchableOpacity style={styles.mainBtn} onPress={() => setStep(2)}>
                                <Text style={[styles.mainBtnText, { color: theme.text }]}>Yazma Aşamasına Geç ➔</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.mainBtn} onPress={() => navigation.goBack()}>
                                <Text style={[styles.mainBtnText, { color: theme.text }]}>⬅ İncelemeyi Bitir</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.center}>
                        <Text style={styles.trHint}>"{word.meaning_tr}"</Text>
                        
                        <Pressable 
                            onPress={() => {
                                const maskedSet = new Set(
                                    visibilityMask
                                        .map((visible, idx) => (!visible ? idx : null))
                                        .filter((idx) => idx !== null)
                                );
                                const firstEmpty = getNextEditableIndex(-1, maskedSet, word.word_en.length);
                                if (firstEmpty !== null) {
                                    InteractionManager.runAfterInteractions(() => {
                                        inputRefs.current[firstEmpty]?.focus();
                                    });
                                }
                            }} 
                            style={{ width: '90%', marginVertical: 20 }}
                        >
                            <Animated.View 
                                style={[
                                    {
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        paddingVertical: 10,
                                        gap: 4
                                    },
                                    { transform: [{ translateX: shakeAnim }] }
                                ]}
                            >
                                {word.word_en.split('').map((letter, idx) => renderLetterBox(letter, idx))}
                            </Animated.View>
                        </Pressable>
                        
                        <TouchableOpacity style={styles.mainBtn} onPress={checkWrite}>
                            <Text style={styles.mainBtnText}>Kontrol Et</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                            <Text style={styles.backBtnText}>⬅ Kartı Tekrar Gör</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.step3Wrapper}>
                        
                        {/* ━━━━━━━━ ÜST (SABİT) BÖLÜM ━━━━━━━━ */}
                        <View style={[styles.fixedTopCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            {feedbackJson && feedbackJson.length > 0 ? (
                                <View style={styles.charContainer}>
                                    {feedbackJson.map((item, index) => {
                                        const isWrongChar = item.status === 'wrong' || item.status === 'error';
                                        const isCorrectChar = item.status === 'correct';
                                        return (
                                            <Text 
                                                key={index} 
                                                style={[
                                                    styles.bigWordChar, 
                                                    { 
                                                        color: isCorrectChar ? COLORS.success : isWrongChar ? COLORS.danger : theme.text, 
                                                        fontWeight: isWrongChar ? 'bold' : '600',
                                                        textDecorationLine: isWrongChar ? 'underline' : 'none' 
                                                    }
                                                ]}
                                            >
                                                {item.char}
                                            </Text>
                                        );
                                    })}
                                </View>
                            ) : (
                                <Text style={styles.syllableContainer}>
                                    {parseSyllables(word.word_en, word.phonetic).map((syl, index, arr) => (
                                        <React.Fragment key={index}>
                                            <Text 
                                                style={{
                                                    color: syl.isStressed ? theme.text : theme.textSecondary,
                                                    fontSize: syl.isStressed ? 36 : 28,
                                                    fontWeight: syl.isStressed ? '800' : '500'
                                                }}
                                            >
                                                {syl.text}
                                            </Text>
                                            {index < arr.length - 1 && (
                                                <Text style={{ color: theme.textMuted, fontSize: 20 }}>
                                                    {' · '}
                                                </Text>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </Text>
                            )}
                            <Text style={[styles.ipa, { color: theme.textMuted }]}>{word.phonetic}</Text>
                        </View>
                        
                        {/* ━━━━━━━━ ALT (SCROLL) BÖLÜM ━━━━━━━━ */}
                        <ScrollView style={styles.bottomScroll} contentContainerStyle={styles.bottomScrollContent} showsVerticalScrollIndicator={false}>
                            {!analysisComplete ? (
                                /* A: RECORDING INTERFACE */
                                <View style={styles.recordingArea}>
                                    <View style={styles.micBtnWrapper}>
                                        {/* Background Animation Rings */}
                                        {!isRecording && !isAnalyzing && (
                                            <Animated.View style={[
                                                styles.pulseRing,
                                                {
                                                    transform: [{
                                                        scale: idlePulseAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [1.0, 1.3]
                                                        })
                                                    }],
                                                    opacity: idlePulseAnim.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [0.4, 0]
                                                    })
                                                }
                                            ]} />
                                        )}
                                        
                                        {isRecording && (
                                            <>
                                                <Animated.View style={[
                                                    styles.rippleRing,
                                                    {
                                                        transform: [{
                                                            scale: ripple1.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [1, 1.6]
                                                            })
                                                        }],
                                                        opacity: ripple1.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.6, 0]
                                                        })
                                                    }
                                                ]} />
                                                <Animated.View style={[
                                                    styles.rippleRing,
                                                    {
                                                        transform: [{
                                                            scale: ripple2.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [1, 1.8]
                                                            })
                                                        }],
                                                        opacity: ripple2.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.5, 0]
                                                        })
                                                    }
                                                ]} />
                                                <Animated.View style={[
                                                    styles.rippleRing,
                                                    {
                                                        transform: [{
                                                            scale: ripple3.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [1, 2.0]
                                                            })
                                                        }],
                                                        opacity: ripple3.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.4, 0]
                                                        })
                                                    }
                                                ]} />
                                            </>
                                        )}

                                        <View pointerEvents={isAnalyzing ? 'none' : 'auto'}>
                                            <Pressable 
                                                onPressIn={startRecording}
                                                onPressOut={stopRecording}
                                                disabled={isAnalyzing || isRecording}
                                                style={{ zIndex: 2 }}
                                            >
                                                <Animated.View 
                                                    style={[
                                                        styles.micBtn, 
                                                        isRecording && { backgroundColor: COLORS.danger + '33', borderColor: COLORS.danger },
                                                        isAnalyzing && { 
                                                            borderColor: COLORS.accent_amber,
                                                            transform: [{ 
                                                                rotate: spinAnim.interpolate({
                                                                    inputRange: [0, 1],
                                                                    outputRange: ['0deg', '360deg']
                                                                }) 
                                                            }] 
                                                        },
                                                        !isRecording && !isAnalyzing && { borderColor: COLORS.accent_purple }
                                                    ]}
                                                >
                                                    {isAnalyzing ? (
                                                        <ActivityIndicator size="large" color={theme.text} />
                                                    ) : (
                                                        <Text style={{fontSize: 50}}>🎤</Text>
                                                    )}
                                                </Animated.View>
                                            </Pressable>
                                        </View>
                                    </View>
                                    
                                    {isRecording && (
                                        <View style={styles.equalizerContainer}>
                                            {barAnims.map((_, idx) => (
                                                <Animated.View 
                                                    key={idx} 
                                                    style={[
                                                        styles.equalizerBar, 
                                                        { height: getBarHeight(idx) }
                                                    ]} 
                                                />
                                            ))}
                                        </View>
                                    )}

                                    <Text style={[
                                        styles.micHint, 
                                        isRecording && { color: COLORS.danger },
                                        isAnalyzing && { color: COLORS.accent_amber },
                                        !isRecording && !isAnalyzing && { color: theme.textSecondary || theme.textMuted }
                                    ]}>
                                        {isRecording ? "🔴 Dinleniyor..." : isAnalyzing ? "Analiz Ediliyor..." : "Basılı Tut ve Söyle"}
                                    </Text>

                                    {/* Small visual fallback when there is no analysis done yet */}
                                    <View style={[styles.infoBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                        <Ionicons name="volume-high" size={20} color={theme.primary} />
                                        <Text style={[styles.infoBoxText, { color: theme.textSecondary }]}>
                                            Kulaklıkla dinleyip tekrar etmen telaffuz doğruluğunu artırır.
                                        </Text>
                                    </View>
                                </View>
                            ) : (
                                /* B: PERSISTENT FEEDBACK CARD */
                                <View style={[styles.feedbackCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                    
                                    {/* 1. SCORE BAND */}
                                    <View style={[styles.scoreBand, { backgroundColor: band.bg, borderColor: band.color }]}>
                                        <Text style={[styles.scoreBandTitle, { color: band.color }]}>{band.text}</Text>
                                        
                                        {/* Conditionally display large or faded score based on VETO */}
                                        {vetoTriggered || finalScore < 30 ? (
                                            <Text style={[styles.scoreTextFaded, { color: theme.textMuted }]}>
                                                Skor: %{finalScore} (Düşük/Aksanlı Telaffuz)
                                            </Text>
                                        ) : (
                                            <Text style={[styles.scoreTextLarge, { color: band.color, textShadowColor: band.glow }]}>
                                                %{finalScore}
                                            </Text>
                                        )}
                                        
                                        <Text style={[styles.scoreBandDesc, { color: theme.textSecondary }]}>{diagnosticMessage || band.desc}</Text>
                                    </View>

                                    {/* AUDIO PLAYBACK COMPARE */}
                                    <View style={styles.audioPlaybackRow}>
                                        <TouchableOpacity 
                                            disabled={playingType === 'reference'}
                                            style={[
                                                styles.audioPlayBtn, 
                                                playingType === 'user' && styles.audioPlayActive,
                                                playingType === 'reference' && { opacity: 0.4 }
                                            ]} 
                                            onPress={() => handlePlayComparePress(recordedUri, 'user')}
                                        >
                                            {playingType === 'user' && (
                                                <Animated.View style={[styles.audioPulseBg, { opacity: pulsePlayAnim }]} />
                                            )}
                                            <Ionicons name={playingType === 'user' ? "stop" : "volume-high"} size={16} color={playingType === 'user' ? COLORS.accent_purple : theme.text} style={{ marginRight: 6 }} />
                                            <Text style={[styles.audioPlayText, { color: theme.text }]}>Kendi Sesini Dinle</Text>
                                        </TouchableOpacity>
                                        
                                        <TouchableOpacity 
                                            disabled={playingType === 'user'}
                                            style={[
                                                styles.audioPlayBtn, 
                                                playingType === 'reference' && styles.audioPlayActive,
                                                playingType === 'user' && { opacity: 0.4 }
                                            ]} 
                                            onPress={() => handlePlayComparePress(refAudioUrl, 'reference')}
                                        >
                                            {playingType === 'reference' && (
                                                <Animated.View style={[styles.audioPulseBg, { opacity: pulsePlayAnim }]} />
                                            )}
                                            <Ionicons name={playingType === 'reference' ? "stop" : "volume-high"} size={16} color={playingType === 'reference' ? COLORS.accent_purple : theme.text} style={{ marginRight: 6 }} />
                                            <Text style={[styles.audioPlayText, { color: theme.text }]}>Doğru Telaffuzu Dinle</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* 2. L1 ANATOMICAL HINT CARD (SLIDE SPRING ANIMATED) */}
                                    {vetoTriggered && backtrackingFeedback && backtrackingFeedback.length > 0 && (
                                        <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
                                            <View style={styles.anatomicalCard}>
                                                <View style={styles.anatomicalHeader}>
                                                    <Ionicons name="bulb" size={16} color={COLORS.accent_purple} style={{ marginRight: 6 }} />
                                                    <Text style={styles.anatomicalTitle}>Artikülasyon ipucu</Text>
                                                </View>
                                                {(() => {
                                                    const data = getAnatomicalData(backtrackingFeedback);
                                                    if (!data) return null;
                                                    return (
                                                        <View style={{ marginTop: 6 }}>
                                                            <Text style={[styles.anatomicalSubHeader, { color: theme.text }]}>
                                                                {data.header}
                                                            </Text>
                                                            <Text style={[styles.anatomicalInstruction, { color: theme.textSecondary }]}>
                                                                {data.instruction}
                                                            </Text>
                                                        </View>
                                                    );
                                                })()}
                                            </View>
                                        </Animated.View>
                                    )}

                                    {/* 3. RESIDUAL SPECTROGRAM CHART (WITH TIMELINE OVERLAY & ERROR HIGHLIGHT) */}
                                    {spectrogram && spectrogram.length > 0 && (() => {
                                        let maxTime = 1.0;
                                        if (feedbackJson && feedbackJson.length > 0) {
                                            feedbackJson.forEach(item => {
                                                if (item.timestamp && item.timestamp > maxTime) {
                                                    maxTime = item.timestamp;
                                                }
                                            });
                                        }
                                        let errorTime = -1;
                                        if (feedbackJson && feedbackJson.length > 0) {
                                            const firstError = feedbackJson.find(item => item.status === 'wrong' || item.status === 'error');
                                            if (firstError && firstError.timestamp !== undefined) {
                                                errorTime = firstError.timestamp;
                                            }
                                        }

                                        const getClosestPhoneme = (barIndex, totalBars, maxDuration, feedback) => {
                                            if (!feedback || feedback.length === 0) return null;
                                            const activeFeedback = feedback.filter(item => item && item.reason !== 'missing');
                                            if (activeFeedback.length === 0) return null;
                                            const barTime = (barIndex / totalBars) * maxDuration;
                                            let closestItem = null;
                                            let minDiff = Infinity;
                                            activeFeedback.forEach(item => {
                                                if (item.timestamp !== undefined) {
                                                    const diff = Math.abs(item.timestamp - barTime);
                                                    if (diff < minDiff) {
                                                        minDiff = diff;
                                                        closestItem = item;
                                                    }
                                                }
                                            });
                                            return closestItem;
                                        };

                                        return (
                                            <View style={[styles.chartContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                                <Text style={[styles.chartTitle, { color: theme.text }]}>Ses Spektrogram Analizi</Text>
                                                
                                                <View style={styles.chartBars}>
                                                    {spectrogram.map((item, index) => {
                                                        const maxValue = Math.max(...spectrogram) || 1;
                                                        const barHeight = (item / maxValue) * 55;
                                                        const valPercent = item * 100;
                                                        const barColor = valPercent < 50 ? COLORS.accent_cyan : COLORS.danger;
                                                        
                                                        const barTime = (index / spectrogram.length) * maxTime;
                                                        const isHighlighted = vetoTriggered && errorTime !== -1 && Math.abs(barTime - errorTime) < 0.18;

                                                        return (
                                                            <View 
                                                                key={index} 
                                                                style={{
                                                                    width: `${(100 / spectrogram.length) - 1.2}%`,
                                                                    height: '100%',
                                                                    justifyContent: 'flex-end',
                                                                    backgroundColor: isHighlighted ? 'rgba(239, 68, 68, 0.25)' : 'transparent',
                                                                    borderRadius: 4,
                                                                    marginRight: 2,
                                                                }}
                                                            >
                                                                <View 
                                                                    style={{
                                                                        width: '100%',
                                                                        height: Math.max(4, barHeight),
                                                                        backgroundColor: barColor,
                                                                        borderTopLeftRadius: 3,
                                                                        borderTopRightRadius: 3
                                                                    }} 
                                                                />
                                                            </View>
                                                        );
                                                    })}
                                                </View>

                                                {/* Phoneme Timeline Overlay */}
                                                <View style={styles.phonemeTimeline}>
                                                    {spectrogram.map((_, index) => {
                                                        const closest = getClosestPhoneme(index, spectrogram.length, maxTime, feedbackJson);
                                                        if (!closest) {
                                                            return (
                                                                <View key={index} style={{ width: `${(100 / spectrogram.length) - 1.2}%`, marginRight: 2 }} />
                                                            );
                                                        }
                                                        const isWrongChar = closest.status === 'wrong' || closest.status === 'error';
                                                        const isCorrectChar = closest.status === 'correct';
                                                        
                                                        return (
                                                            <View key={index} style={{ width: `${(100 / spectrogram.length) - 1.2}%`, marginRight: 2, alignItems: 'center' }}>
                                                                <Text 
                                                                    style={[
                                                                        styles.timelineChar,
                                                                        {
                                                                            color: isWrongChar ? COLORS.danger : isCorrectChar ? COLORS.success : theme.textMuted,
                                                                            fontWeight: isWrongChar ? 'bold' : 'normal',
                                                                        }
                                                                    ]}
                                                                >
                                                                    {closest.char}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        );
                                    })()}

                                    {/* 4. ACTIONS ROW */}
                                    <View style={styles.actionBtnRow}>
                                        <TouchableOpacity 
                                            activeOpacity={0.8}
                                            style={[styles.actionHalfBtn, styles.retryActionBtn, { backgroundColor: theme.elevated, borderColor: theme.border }]} 
                                            onPress={handleRetryClick}
                                        >
                                            <Ionicons name="refresh" size={18} color={theme.text} style={{ marginRight: 6 }} />
                                            <Text style={[styles.actionBtnText, { color: theme.text }]}>Tekrar Dene</Text>
                                        </TouchableOpacity>
                                        
                                        <Animated.View style={{ flex: 1.2, transform: [{ scale: pulseAnim }], opacity: bypassUnlocked ? bypassPulseAnim : 1 }}>
                                            <TouchableOpacity 
                                                activeOpacity={0.8}
                                                style={[
                                                    styles.actionHalfBtn, 
                                                    isNextDisabled ? [styles.disabledActionBtn, { backgroundColor: theme.elevated, borderColor: theme.border }] : { backgroundColor: theme.success }
                                                ]} 
                                                onPress={handleFinishOrNext}
                                                disabled={isNextDisabled}
                                            >
                                                <Text style={[styles.actionBtnText, { color: theme.text }, isNextDisabled && { color: theme.textMuted }]}>
                                                    {currentWordIndex < studyList.length - 1 ? "Sonraki Kelime ➔" : "Çalışmayı Bitir 🎉"}
                                                </Text>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    </View>

                                    {/* Lock Hints & Bypasses */}
                                    {!passedStep3 && !bypassUnlocked && vetoAttempts > 0 && (
                                        <View style={styles.lockInfoContainer}>
                                            <View style={styles.lockRow}>
                                                <Ionicons name="lock-closed" size={14} color={COLORS.accent_amber} />
                                                <Text style={[styles.lockHint, { color: COLORS.accent_amber }]}>
                                                    {vetoTriggered ? "Bu hatayı düzelt, buton açılacak 🔓" : "Telaffuzu düzelt, buton açılacak 🔓"} (Deneme: {vetoAttempts}/3)
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                    {bypassUnlocked && (
                                        <View style={styles.lockInfoContainer}>
                                            <View style={styles.lockRow}>
                                                <Ionicons name="bulb" size={14} color={COLORS.accent_amber} />
                                                <Text style={[styles.bypassHint, { color: COLORS.accent_amber }]}>
                                                    Zorlu bir ses! Sonra tekrar dene 💡
                                                </Text>
                                            </View>
                                        </View>
                                    )}

                                </View>
                            )}
                        </ScrollView>
                    </View>
                )}
            </ScrollView>
            
            {feedback && !analysisComplete && (
                <View style={[styles.toast, { backgroundColor: feedback.type === 'success' ? COLORS.success : COLORS.danger }]}>
                    <Text style={styles.toastText}>{feedback.text}</Text>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, padding: 20, paddingBottom: 40, paddingTop: 50 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    stepTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text_secondary, marginBottom: 20, letterSpacing: 1, textAlign: 'center' },
    
    flashcard: { 
        width: '100%', 
        height: 420, 
        backgroundColor: COLORS.bg_elevated, 
        borderRadius: 24, 
        padding: 8,
        shadowColor: COLORS.bg_primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
        marginBottom: 30
    },
    unoWhiteBorder: { flex: 1, borderWidth: 2, borderColor: COLORS.border, borderRadius: 16, padding: 20 },
    cardContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    bigWord: { fontSize: 44, fontWeight: '800', color: COLORS.text_primary, marginBottom: 5, textAlign: 'center' },
    bigWordChar: { fontSize: 44, textAlign: 'center' },
    charContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 5 },
    ipa: { fontSize: 20, color: COLORS.text_secondary, marginBottom: 15, fontStyle: 'italic', textAlign: 'center' },
    description: { fontSize: 18, color: COLORS.text_muted, textAlign: 'center', fontStyle: 'italic', marginBottom: 25 },
    exampleBox: { backgroundColor: COLORS.bg_elevated, padding: 15, borderRadius: 12, width: '100%', borderWidth: 1, borderColor: COLORS.border },
    exampleText: { fontSize: 16, fontStyle: 'italic', color: COLORS.text_muted, textAlign: 'center' },
    
    bigWordTr: { fontSize: 40, fontWeight: '800', color: COLORS.accent_cyan, marginBottom: 5, textAlign: 'center' },
    ipaTr: { fontSize: 18, color: COLORS.accent_violet, marginBottom: 20, fontStyle: 'italic' }, 
    descriptionTr: { fontSize: 18, color: COLORS.accent_purple, textAlign: 'center', marginBottom: 25 },
    exampleBoxTr: { backgroundColor: COLORS.bg_elevated, padding: 15, borderRadius: 12, width: '100%' },
    exampleTextTr: { fontSize: 16, fontStyle: 'italic', color: COLORS.accent_purple, textAlign: 'center' },
    unoAudioBtn: { marginTop: 20, backgroundColor: COLORS.bg_elevated, padding: 15, borderRadius: 40, elevation: 2 },
    
    mainBtn: { backgroundColor: COLORS.success, padding: 20, borderRadius: 15, width: '100%', marginTop: 25 },
    mainBtnText: { color: COLORS.text_primary, textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
    backBtn: { marginTop: 20, padding: 10 },
    backBtnText: { color: COLORS.text_muted, fontWeight: '600' },
    trHint: { fontSize: 28, fontWeight: 'bold', color: COLORS.success, marginBottom: 30 },
    input: { borderBottomWidth: 3, borderColor: COLORS.success, width: '90%', fontSize: 26, textAlign: 'center', padding: 15, borderRadius: 10, backgroundColor: COLORS.bg_elevated, marginTop: 20 },
    inputError: { borderColor: COLORS.danger, color: COLORS.danger, backgroundColor: COLORS.danger + '15' },
    toast: { position: 'absolute', top: 100, alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 25, elevation: 6, shadowColor: COLORS.bg_primary, shadowOffset: { width:0, height:3 }, shadowOpacity: 0.2, maxWidth: '90%', zIndex: 999 },
    toastText: { color: COLORS.text_primary, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    
    micBtn: { backgroundColor: COLORS.bg_elevated, width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', elevation: 5, borderWidth: 3 },
    micPressed: { backgroundColor: COLORS.danger + '22', borderColor: COLORS.danger, transform: [{ scale: 0.95 }] },
    micHint: { marginTop: 15, fontSize: 15, color: COLORS.text_muted, textAlign: 'center', fontWeight: '600' },

    // Step 3 Split Screen & Overhaul Styles
    step3Wrapper: { flex: 1, width: '100%', alignItems: 'center' },
    fixedTopCard: { 
        width: '100%', 
        paddingVertical: 20, 
        paddingHorizontal: 15,
        borderRadius: 20, 
        borderWidth: 1.5,
        alignItems: 'center',
        elevation: 3,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        marginBottom: 15
    },
    bottomScroll: { flex: 1, width: '100%' },
    bottomScrollContent: { paddingBottom: 30, alignItems: 'center' },
    recordingArea: { width: '100%', alignItems: 'center', paddingVertical: 15 },
    infoBox: { 
        flexDirection: 'row', 
        width: '100%', 
        borderRadius: 15, 
        borderWidth: 1, 
        padding: 15, 
        marginTop: 35, 
        alignItems: 'center', 
        gap: 12 
    },
    infoBoxText: { flex: 1, fontSize: 13, lineHeight: 18 },

    // Feedback Card
    feedbackCard: { 
        width: '100%', 
        borderRadius: 20, 
        borderWidth: 1.5, 
        padding: 15, 
        elevation: 4,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 5
    },
    scoreBand: { 
        width: '100%', 
        borderRadius: 15, 
        borderWidth: 1.5, 
        padding: 15, 
        alignItems: 'center', 
        marginBottom: 15 
    },
    scoreBandTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8 },
    scoreTextLarge: { fontSize: 44, fontWeight: '900', textShadowOffset: { width: 0, height: 0 } },
    scoreTextFaded: { fontSize: 14, fontWeight: '700', opacity: 0.6, marginTop: 4, marginBottom: 8 },
    scoreBandDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 8 },

    // Veto Box
    vetoContainer: { width: '100%', borderRadius: 15, overflow: 'hidden', borderWidth: 1.5, marginBottom: 15 },
    vetoHeader: { flexDirection: 'row', padding: 12, alignItems: 'center', gap: 8, justifyContent: 'center' },
    vetoHeaderText: { color: COLORS.text_primary, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
    errorCard: { 
        backgroundColor: COLORS.danger + '15', 
        borderColor: COLORS.danger, 
        borderLeftWidth: 4, 
        borderRadius: 12,
        padding: 15
    },
    errorCardTitle: { color: COLORS.danger, fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
    errorCardDesc: { color: COLORS.text_secondary, fontSize: 13, lineHeight: 18 },

    // Spectrogram Chart
    chartContainer: { 
        width: '100%', 
        padding: 15, 
        backgroundColor: COLORS.bg_card,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 20
    },
    chartTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10, letterSpacing: 0.3 },
    chartBars: { height: 55, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', width: '100%' },

    // Overhaul Actions
    actionBtnRow: { flexDirection: 'row', width: '100%', gap: 12, marginTop: 5 },
    actionHalfBtn: { 
        height: 52, 
        borderRadius: 26, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center',
        elevation: 3
    },
    retryActionBtn: {
        flex: 1,
        backgroundColor: COLORS.bg_elevated,
        borderColor: COLORS.border,
        borderWidth: 1.5
    },
    disabledActionBtn: {
        backgroundColor: COLORS.bg_elevated,
        borderColor: COLORS.border,
        borderWidth: 1.5,
        opacity: 0.4
    },
    actionBtnText: { fontSize: 14, fontWeight: 'bold', color: COLORS.text_primary },

    // Lock Info & Bypasses
    lockInfoContainer: { width: '100%', alignItems: 'center', marginTop: 12 },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lockHint: { fontSize: 12, fontWeight: '700' },
    bypassHint: { fontSize: 12, fontWeight: '800' },

    indicatorWrapper: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 25,
        marginTop: 10
    },
    indicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        gap: 8,
        marginTop: 10
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circleText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    lineTrack: {
        height: 2,
        width: Dimensions.get('window').width / 6,
        backgroundColor: COLORS.border,
        overflow: 'hidden',
    },
    lineFill: {
        height: '100%',
        backgroundColor: COLORS.success,
    },
    syllableContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 5,
        textAlign: 'center',
        width: '100%',
    },
    letterBoxesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 4
    },
    letterBox: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 8
    },
    micBtnWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        marginTop: 15,
        width: 240,
        height: 240
    },
    pulseRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: COLORS.accent_purple,
        backgroundColor: 'transparent'
    },
    rippleRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: COLORS.accent_purple,
        backgroundColor: 'transparent'
    },
    equalizerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 40,
        marginTop: 20,
        gap: 4
    },
    equalizerBar: {
        width: 4,
        borderRadius: 2,
        backgroundColor: COLORS.accent_purple
    },
    syllableBadge: {
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        borderColor: '#A78BFA',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginTop: 10,
        marginBottom: 10,
    },
    syllableBadgeText: {
        color: '#A78BFA',
        fontSize: 13,
        fontWeight: '600',
    },
    audioPlaybackRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
        marginBottom: 15,
        justifyContent: 'space-between'
    },
    audioPlayBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderWidth: 1.5
    },
    audioPlayActive: {
        borderColor: COLORS.accent_purple
    },
    audioPlayText: {
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 4
    },
    audioPulseBg: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: COLORS.accent_purple + '1A',
        borderRadius: 12
    },
    anatomicalCard: {
        width: '100%',
        backgroundColor: COLORS.accent_purple + '1A',
        borderWidth: 1,
        borderColor: COLORS.accent_purple + '40',
        padding: 14,
        borderRadius: 12,
        marginBottom: 15
    },
    anatomicalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6
    },
    anatomicalTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.accent_purple
    },
    anatomicalSubHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 4
    },
    anatomicalInstruction: {
        fontSize: 13,
        lineHeight: 18
    },
    phonemeTimeline: {
        flexDirection: 'row',
        width: '100%',
        marginTop: 8,
        justifyContent: 'center'
    },
    timelineChar: {
        fontSize: 10,
        textAlign: 'center'
    }
});