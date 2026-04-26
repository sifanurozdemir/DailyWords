import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Modal, ActivityIndicator, Alert } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';

export default function StoryReaderScreen({ route, navigation }) {
    const { story } = route.params;
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    
    // Sesli okuma stateleri
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
    const sentencesRef = useRef([]);
    const isPlayingRef = useRef(false);

    // Kart çevirme stateleri
    const [isFlipped, setIsFlipped] = useState(false);
    const flipAnim = useRef(new Animated.Value(0)).current;

    // Kelime detayı
    const [selectedWordDetails, setSelectedWordDetails] = useState(null);
    const [isWordLoading, setIsWordLoading] = useState(false);

    useEffect(() => {
        // Metni noktalama işaretlerine göre cümlelere böl (virgül hariç)
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
        
        // Hikaye bittiyse
        if (index >= sentencesRef.current.length) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            setCurrentSentenceIndex(0); // Başa sar
            return;
        }

        setCurrentSentenceIndex(index);
        Speech.speak(sentencesRef.current[index], {
            language: 'en-US',
            rate: 0.9,
            pitch: 1.0,
            onDone: () => {
                // Sadece oynatılıyorsa bir sonrakine geç
                if (isPlayingRef.current) {
                    playNextSentence(index + 1);
                }
            },
            onStopped: () => {
                // Manuel durduruldu (kaldığı yer index olarak state'de kalır)
            },
            onError: () => {
                setIsPlaying(false);
                isPlayingRef.current = false;
            }
        });
    };

    const handlePlayAudio = () => {
        if (isPlaying) {
            // Duraklat
            Speech.stop();
            setIsPlaying(false);
            isPlayingRef.current = false;
        } else {
            // Başlat veya devam et
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
        // Doğrudan sıfırdan başlat
        setTimeout(() => playNextSentence(0), 100);
    };

    const flipCard = () => {
        if (isFlipped) {
            Animated.spring(flipAnim, {
                toValue: 0,
                friction: 8,
                tension: 10,
                useNativeDriver: true
            }).start();
        } else {
            Animated.spring(flipAnim, {
                toValue: 180,
                friction: 8,
                tension: 10,
                useNativeDriver: true
            }).start();
        }
        setIsFlipped(!isFlipped);
    };

    const frontInterpolate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['0deg', '180deg']
    });
    
    const backInterpolate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['180deg', '360deg']
    });

    const handleWordClick = async (word) => {
        setIsWordLoading(true);
        setSelectedWordDetails({ word_en: word }); // Gösterimi hemen aç
        try {
            // Sadece baştaki ve sondaki boşlukları temizle. a-zA-Z regexi "wonderful time" gibi boşluklu kelimeleri bozuyordu.
            const cleanWord = word.trim().toLowerCase();
            const res = await apiClient.get(`/get-word-by-en/${cleanWord}`);
            setSelectedWordDetails(res.data);
        } catch (e) {
            setSelectedWordDetails({ word_en: word, error: 'Sözlük detayı bulunamadı.' });
        } finally {
            setIsWordLoading(false);
        }
    };

    const renderStoryText = (text, isTurkish = false) => {
        if (!text) return null;
        
        const parts = text.split(/(\*\*.*?\*\*)/g);
        
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                const word = part.slice(2, -2);
                
                // Eğer Türkçe yüzündeysek tıklanmasını engelle, sadece renklendir
                if (isTurkish) {
                    return (
                        <Text 
                            key={i} 
                            onPress={() => Alert.alert("Bilgi", "Lütfen kelime anlamı için İngilizce yüzüne dönün. Türkçe kelimeler sözlükte aratılamaz.")}
                            style={{ fontWeight: 'bold', color: theme.primary, fontSize: 18 }}
                        >
                            {word}
                        </Text>
                    );
                }

                // İngilizce yüzündeysek tıklanabilir yap
                return (
                    <Text 
                        key={i} 
                        onPress={() => handleWordClick(word)} 
                        suppressHighlighting={true}
                        style={{ fontWeight: 'bold', color: theme.primary, fontSize: 18 }}
                    >
                        {word}
                    </Text>
                );
            }
            return <Text key={i} style={{ color: theme.text, fontSize: 18 }}>{part}</Text>;
        });
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
                        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                        <Text style={{ color: '#fff', marginLeft: 5, fontWeight: 'bold' }}>
                            {isPlaying ? "Durdur" : (currentSentenceIndex > 0 ? "Devam Et" : "Sesli Dinle")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Cümle İlerleme Çubuğu (Ses Kaydı Çubuğu) */}
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

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.title, { color: theme.text }]}>{story.title}</Text>
                
                {/* 3D Kart Çevirme Konteyneri (Sadece View, Touchable Değil) */}
                <View style={{ perspective: 1000 }}>
                    {/* İngilizce (Ön Yüz) */}
                    <Animated.View 
                        pointerEvents={isFlipped ? "none" : "auto"}
                        style={[
                        styles.storyCard, 
                        { 
                            backgroundColor: theme.card, 
                            borderColor: theme.border, 
                            transform: [{rotateY: frontInterpolate}], 
                            backfaceVisibility: 'hidden' 
                        }
                    ]}>
                        <Text style={[styles.content, { color: theme.text }]}>
                            {renderStoryText(story.content_en, false)}
                        </Text>
                    </Animated.View>

                    {/* Türkçe (Arka Yüz) */}
                    <Animated.View 
                        pointerEvents={isFlipped ? "auto" : "none"}
                        style={[
                        styles.storyCard, 
                        { 
                            backgroundColor: theme.primaryLight, 
                            borderColor: theme.primary, 
                            transform: [{rotateY: backInterpolate}], 
                            backfaceVisibility: 'hidden',
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0 
                        }
                    ]}>
                        <Text style={[styles.content, { color: theme.text }]}>
                            {renderStoryText(story.content_tr || "Bu hikaye için henüz Türkçe çeviri bulunmuyor. Yeni bir tane üretin!", true)}
                        </Text>
                    </Animated.View>
                </View>

                {/* Yeni Çeviri Butonu */}
                <TouchableOpacity onPress={flipCard} style={[styles.flipBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="language" size={24} color={theme.primary} />
                    <Text style={{ color: theme.text, fontWeight: 'bold', marginLeft: 10, fontSize: 16 }}>
                        {isFlipped ? "İngilizce Orijinaline Dön" : "Hikayeyi Türkçeye Çevir"}
                    </Text>
                </TouchableOpacity>

                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                        Renkli ve kalın kelimeler hedef kelimelerdir. Üzerine tıklayarak kelimenin anlamına ve örnek cümlesine hızlıca bakabilirsin.
                    </Text>
                </View>
            </ScrollView>

            {/* Kelime Modal */}
            <Modal visible={!!selectedWordDetails} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedWordDetails(null)}>
                    <View style={[styles.wordModal, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {isWordLoading ? (
                            <ActivityIndicator size="large" color={theme.primary} />
                        ) : selectedWordDetails?.error ? (
                            <View style={{ alignItems: 'center' }}>
                                <Text style={[styles.modalWord, { color: theme.primary }]}>{selectedWordDetails.word_en}</Text>
                                <Text style={{ color: theme.textSecondary, marginTop: 10 }}>{selectedWordDetails.error}</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={[styles.modalWord, { color: theme.primary }]}>{selectedWordDetails?.word_en}</Text>
                                <Text style={[styles.modalMeaning, { color: theme.text }]}>{selectedWordDetails?.meaning_tr}</Text>
                                {selectedWordDetails?.example_en && (
                                    <View style={{ marginTop: 15, padding: 12, backgroundColor: theme.background, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
                                        <Text style={{ color: theme.text, fontStyle: 'italic', fontSize: 15 }}>"{selectedWordDetails.example_en}"</Text>
                                        {selectedWordDetails?.example_tr && (
                                            <Text style={{ color: theme.textSecondary, marginTop: 8, fontSize: 13 }}>{selectedWordDetails.example_tr}</Text>
                                        )}
                                    </View>
                                )}
                            </>
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
    infoBox: { flexDirection: 'row', padding: 15, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, alignItems: 'center' },
    infoText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 18 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    wordModal: { padding: 25, borderRadius: 20, borderWidth: 1, elevation: 5 },
    modalWord: { fontSize: 28, fontWeight: '900', marginBottom: 5 },
    modalMeaning: { fontSize: 18, fontWeight: '600' }
});
