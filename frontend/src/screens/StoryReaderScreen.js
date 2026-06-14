import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Modal, Dimensions } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { useWordKnowledge } from '../context/WordKnowledgeContext';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

const screenWidth = Dimensions.get('window').width;

export default function StoryReaderScreen({ route, navigation }) {
    const { story } = route.params;
    const { theme } = useTheme();
    const { userData } = useUser();
    const { getMasteryColor } = useWordKnowledge();
    const insets = useSafeAreaInsets();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const sentencesRef = useRef([]);
    const isPlayingRef = useRef(false);

    const [isFlipped, setIsFlipped] = useState(false);
    const flipAnim = useRef(new Animated.Value(0)).current;

    const [selectedWordDetails, setSelectedWordDetails] = useState(null);
    const [activeBubble, setActiveBubble] = useState(null); // { text, tokenKey, fullDetails }
    const [wordList, setWordList] = useState([]);

    useEffect(() => {
        const fetchWordList = async () => {
            try {
                const [myWordsRes, learnedWordsRes] = await Promise.all([
                    apiClient.get(`/get-my-words/${userData.user_id}`).catch(() => ({ data: [] })),
                    apiClient.get(`/get-learned-words/${userData.user_id}`).catch(() => ({ data: [] }))
                ]);

                const wordsMap = {};
                const processList = (list) => {
                    const data = list.data || list;
                    if (Array.isArray(data)) {
                        data.forEach(w => {
                            if (w && w.word_en) wordsMap[w.word_en.toLowerCase().trim()] = w;
                        });
                    }
                };
                processList(myWordsRes);
                processList(learnedWordsRes);
                setWordList(Object.values(wordsMap));
            } catch (error) {
                console.log("Failed to load wordList:", error);
            }
        };
        if (userData?.user_id) fetchWordList();
    }, [userData?.user_id]);

    useEffect(() => {
        const cleanText = story.content_en.replace(/\*\*/g, '');
        const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
        sentencesRef.current = sentences.map(s => s.trim()).filter(s => s.length > 0);

        return () => {
            Speech.stop();
            isPlayingRef.current = false;
        };
    }, [story]);

    const playNextSentence = (index) => {
        if (!isPlayingRef.current) return;
        if (index >= sentencesRef.current.length) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            setCurrentSentenceIndex(0);
            return;
        }
        setCurrentSentenceIndex(index);
        Speech.speak(sentencesRef.current[index], {
            language: 'en-US',
            rate: 0.9,
            pitch: 1.0,
            onDone: () => { if (isPlayingRef.current) playNextSentence(index + 1); },
            onError: () => { setIsPlaying(false); isPlayingRef.current = false; }
        });
    };

    const handlePlayAudio = () => {
        if (isPlaying) {
            Speech.stop();
            setIsPlaying(false);
            isPlayingRef.current = false;
        } else {
            setIsPlaying(true);
            isPlayingRef.current = true;
            playNextSentence(currentSentenceIndex);
        }
    };

    const handleRestartAudio = () => {
        Speech.stop();
        setIsPlaying(true);
        isPlayingRef.current = true;
        setCurrentSentenceIndex(0);
        setTimeout(() => playNextSentence(0), 100);
    };

    const flipCard = () => {
        setActiveBubble(null);
        if (isFlipped) {
            Animated.spring(flipAnim, { toValue: 0, friction: 8, tension: 10, useNativeDriver: true }).start();
        } else {
            Animated.spring(flipAnim, { toValue: 180, friction: 8, tension: 10, useNativeDriver: true }).start();
        }
        setIsFlipped(!isFlipped);
    };

    const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
    const backInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

    const cleanWord = (word) => word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\[\]"']/g, '').toLowerCase().trim();

    // Yeni Dinamik Karşılık Bulma (API Entegrasyonu)
    const fetchOnlineTranslation = async (word) => {
        try {
            const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|tr`);
            const data = await response.json();
            return data.responseData?.translatedText || "Tanım bulunamadı";
        } catch {
            return "Tanım bulunamadı";
        }
    };

    const showTargetModal = (wordId) => {
        const foundWord = wordList.find(w => w.id === wordId);
        if (foundWord) {
            const mColor = getMasteryColor(foundWord.id);
            setSelectedWordDetails({
                word_en: foundWord.word_en,
                meaning_tr: foundWord.meaning_tr,
                example_en: foundWord.example_en,
                example_tr: foundWord.example_tr,
                mastery_color: mColor,
                isTarget: true
            });
        }
    };

    const renderStoryText = (text, isTurkish = false) => {
        if (!text) return null;

        const parts = text.split(/(\*\*.*?\*\*)/g);
        const renderedElements = [];

        parts.forEach((part, partIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                const targetText = part.slice(2, -2);
                const tokenKey = `${isTurkish ? 'tr' : 'en'}_target_${partIdx}`;
                const cleaned = cleanWord(targetText);
                const foundWord = wordList.find(w => cleanWord(w.word_en) === cleaned);

                renderedElements.push(
                    <View key={tokenKey} style={styles.wordWrapper}>
                        {/* Kelimenin Tam Üstünde Konumlanan Yerel Baloncuk */}
                        {activeBubble?.tokenKey === tokenKey && (
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => foundWord && showTargetModal(foundWord.id)}
                                style={styles.inlineBubble}
                            >
                                <Text style={styles.bubbleText}>{activeBubble.text}</Text>
                                {foundWord && <Text style={styles.detailHint}>ℹ️ Detaylar için tıkla</Text>}
                                <View style={styles.bubbleArrow} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => {
                                if (isTurkish) {
                                    // Türkçe modda doğrudan ID eşleşmesi
                                    let usedWordsList = JSON.parse(story.used_words || "[]");
                                    const storyTargetWords = wordList.filter(w => usedWordsList.some(uw => uw.toLowerCase().trim() === w.word_en.toLowerCase().trim()));
                                    const matched = storyTargetWords.find(w => {
                                        const trClean = cleanWord(w.meaning_tr || "");
                                        return trClean === cleaned || trClean.includes(cleaned) || cleaned.includes(trClean);
                                    });
                                    if (matched) showTargetModal(matched.id);
                                } else {
                                    if (activeBubble?.tokenKey === tokenKey) {
                                        setActiveBubble(null);
                                    } else if (foundWord) {
                                        setActiveBubble({ text: foundWord.meaning_tr, tokenKey });
                                    }
                                }
                            }}
                            activeOpacity={isTurkish && !foundWord ? 1 : 0.7}
                            style={{ paddingHorizontal: 2 }}
                        >
                            <Text style={{
                                fontSize: 18,
                                color: isTurkish ? (foundWord ? theme.primary : theme.text) : COLORS.accent_green,
                                fontWeight: 'bold'
                            }}>
                                {targetText}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );
            } else {
                const tokens = part.split(/\s+/).filter(t => t.length > 0);

                tokens.forEach((token, tokenIdx) => {
                    const cleanToken = cleanWord(token);
                    if (cleanToken.length === 0) return;

                    const tokenKey = `${isTurkish ? 'tr' : 'en'}_normal_${partIdx}_${tokenIdx}`;

                    if (isTurkish) {
                        // Türkçe normal kelimeler tamamen düz metindir, tıklanamaz
                        renderedElements.push(
                            <Text key={tokenKey} style={{ fontSize: 18, color: theme.text, marginRight: 6, marginBottom: 8 }}>
                                {token}
                            </Text>
                        );
                    } else {
                        renderedElements.push(
                            <View key={tokenKey} style={styles.wordWrapper}>
                                {activeBubble?.tokenKey === tokenKey && (
                                    <View style={styles.inlineBubble}>
                                        <Text style={styles.bubbleText}>{activeBubble.text}</Text>
                                        <View style={styles.bubbleArrow} />
                                    </View>
                                )}
                                <TouchableOpacity
                                    onPress={async () => {
                                        if (activeBubble?.tokenKey === tokenKey) {
                                            setActiveBubble(null);
                                            return;
                                        }

                                        let foundWord = wordList.find(w => cleanWord(w.word_en) === cleanToken);
                                        let finalWord = cleanToken;

                                        // İki kelimelik Look-Ahead mekanizması
                                        if (!foundWord && tokenIdx + 1 < tokens.length) {
                                            const nextToken = tokens[tokenIdx + 1];
                                            const combinedClean = cleanWord(token + " " + nextToken);
                                            foundWord = wordList.find(w => cleanWord(w.word_en) === combinedClean);
                                            if (foundWord) finalWord = token + " " + nextToken;
                                        }

                                        if (foundWord) {
                                            setActiveBubble({ text: foundWord.meaning_tr, tokenKey });
                                        } else {
                                            setActiveBubble({ text: "Aranıyor...", tokenKey });
                                            const onlineTranslation = await fetchOnlineTranslation(finalWord);
                                            setActiveBubble({ text: onlineTranslation, tokenKey });
                                        }
                                    }}
                                    style={{ paddingHorizontal: 2 }}
                                >
                                    <Text style={{ fontSize: 18, color: theme.text, fontWeight: 'normal' }}>
                                        {token}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    }
                });
            }
        });

        return (
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => setActiveBubble(null)}
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}
            >
                {renderedElements}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
                    <Ionicons name="close" size={28} color={theme.text} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {currentSentenceIndex > 0 && !isPlaying && (
                        <TouchableOpacity onPress={handleRestartAudio} style={[styles.restartBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Ionicons name="refresh-outline" size={20} color={theme.text} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={handlePlayAudio} style={[styles.playBtn, { backgroundColor: isPlaying ? theme.danger : theme.primary }]}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={COLORS.text_primary} />
                        <Text style={{ color: COLORS.text_primary, marginLeft: 5, fontWeight: 'bold' }}>
                            {isPlaying ? "Durdur" : (currentSentenceIndex > 0 ? "Devam Et" : "Sesli Dinle")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Cümle İlerleme Çubuğu */}
            <View style={styles.progressBarContainer}>
                {[...Array(sentencesRef.current.length || 1)].map((_, i) => (
                    <TouchableOpacity
                        key={i}
                        style={[styles.progressSegment, {
                            backgroundColor: i < currentSentenceIndex ? theme.primary : (i === currentSentenceIndex ? theme.warning : theme.border),
                        }]}
                        onPress={() => {
                            Speech.stop();
                            setIsPlaying(true);
                            isPlayingRef.current = true;
                            setCurrentSentenceIndex(i);
                            playNextSentence(i);
                        }}
                    />
                ))}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <Text style={[styles.title, { color: theme.text }]}>{story.title}</Text>

                <View style={{ perspective: 1000 }}>
                    {/* İngilizce (Ön Yüz) */}
                    <Animated.View
                        pointerEvents={isFlipped ? "none" : "auto"}
                        style={[styles.storyCard, { backgroundColor: theme.card, borderColor: theme.border, transform: [{ rotateY: frontInterpolate }], backfaceVisibility: 'hidden' }]}
                    >
                        <View style={styles.content}>
                            {renderStoryText(story.content_en, false)}
                        </View>
                    </Animated.View>

                    {/* Türkçe (Arka Yüz) */}
                    <Animated.View
                        pointerEvents={isFlipped ? "auto" : "none"}
                        style={[styles.storyCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary, transform: [{ rotateY: backInterpolate }], backfaceVisibility: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                    >
                        <View style={styles.content}>
                            {renderStoryText(story.content_tr || "Bu hikaye için henüz Türkçe çeviri bulunmuyor.", true)}
                        </View>
                    </Animated.View>
                </View>

                {/* Çeviri Butonu */}
                <TouchableOpacity onPress={flipCard} style={[styles.flipBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="language" size={24} color={theme.primary} />
                    <Text style={{ color: theme.text, fontWeight: 'bold', marginLeft: 10, fontSize: 16 }}>
                        {isFlipped ? "İngilizce Orijinaline Dön" : "Hikayeyi Türkçeye Çevir"}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Kelime Modal (Yeşiller İçin Tam Döküm) */}
            <Modal visible={!!selectedWordDetails} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedWordDetails(null)}>
                    <View style={[styles.wordModal, { backgroundColor: theme.card, borderColor: COLORS.accent_green, borderWidth: 3 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: selectedWordDetails?.mastery_color || '#64748b', marginRight: 10 }} />
                            <Text style={[styles.modalWord, { color: theme.primary, fontSize: 28, fontWeight: '900' }]}>
                                {selectedWordDetails?.word_en}
                            </Text>
                        </View>
                        <Text style={[styles.modalMeaning, { color: theme.text, fontSize: 18, fontWeight: '600' }]}>
                            {selectedWordDetails?.meaning_tr}
                        </Text>
                        {selectedWordDetails?.example_en && (
                            <View style={{ marginTop: 15, padding: 12, backgroundColor: theme.background, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
                                <Text style={{ color: theme.text, fontStyle: 'italic', fontSize: 15 }}>"{selectedWordDetails.example_en}"</Text>
                                {selectedWordDetails?.example_tr && (
                                    <Text style={{ color: theme.textSecondary, marginTop: 8, fontSize: 13 }}>{selectedWordDetails.example_tr}</Text>
                                )}
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    playBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, elevation: 3 },
    restartBtn: { padding: 8, borderRadius: 20, borderWidth: 1, marginRight: 10, elevation: 1 },
    progressBarContainer: { flexDirection: 'row', height: 6, paddingHorizontal: 20, marginBottom: 10 },
    progressSegment: { flex: 1, marginHorizontal: 2, borderRadius: 3 },
    scrollContent: { padding: 20, paddingBottom: 50 },
    title: { fontSize: 28, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
    storyCard: { padding: 20, borderRadius: 15, borderWidth: 1, elevation: 2, marginBottom: 25 },
    content: { fontSize: 18, lineHeight: 30 },
    flipBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 15, borderWidth: 1, marginBottom: 25 },
    modalOverlay: { flex: 1, backgroundColor: COLORS.overlay_dark, justifyContent: 'center', padding: 20 },
    wordModal: { padding: 25, borderRadius: 20, borderWidth: 1, elevation: 5 },
    modalWord: { fontSize: 28, fontWeight: '900', marginBottom: 5 },
    modalMeaning: { fontSize: 18, fontWeight: '600' },

    // YENİ ELEMANLAR: Kelimeyi ve Üstündeki Baloncuğu Sarıp Hizalayan Yerel Yapı
    wordWrapper: {
        position: 'relative',
        alignItems: 'center',
        marginRight: 6,
        marginBottom: 8,
    },
    inlineBubble: {
        position: 'absolute',
        bottom: 32, // Kelimenin tam olarak 32px üst sınırında başlar (Asla çakışmaz)
        width: 150,
        backgroundColor: COLORS.bg_elevated,
        borderWidth: 1,
        borderColor: COLORS.accent_violet,
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignItems: 'center',
        zIndex: 999,
        shadowColor: COLORS.bg_primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    bubbleText: { color: COLORS.text_primary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    detailHint: { color: COLORS.accent_green, fontSize: 9, marginTop: 2, fontWeight: 'bold' },
    bubbleArrow: {
        position: 'absolute',
        bottom: -5,
        left: '50%',
        marginLeft: -5,
        width: 0,
        height: 0,
        borderStyle: 'solid',
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderTopWidth: 5,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: COLORS.bg_elevated,
    }
});