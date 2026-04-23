import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
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

    const renderStoryText = (text) => {
        if (!text) return null;
        
        const parts = text.split(/(\*\*.*?\*\*)/g);
        
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                const word = part.slice(2, -2);
                return (
                    <Text key={i} style={{ fontWeight: 'bold', color: theme.primary }}>
                        {word}
                    </Text>
                );
            }
            return <Text key={i} style={{ color: theme.text }}>{part}</Text>;
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

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.title, { color: theme.text }]}>{story.title}</Text>
                
                {/* 3D Kart Çevirme Konteyneri */}
                <TouchableOpacity activeOpacity={1} onPress={flipCard} style={{ perspective: 1000 }}>
                    <View>
                        {/* İngilizce (Ön Yüz) */}
                        <Animated.View style={[
                            styles.storyCard, 
                            { 
                                backgroundColor: theme.card, 
                                borderColor: theme.border, 
                                transform: [{rotateY: frontInterpolate}], 
                                backfaceVisibility: 'hidden' 
                            }
                        ]}>
                            <Text style={[styles.content, { color: theme.text }]}>
                                {renderStoryText(story.content_en)}
                            </Text>
                            <View style={styles.flipHintContainer}>
                                <Ionicons name="refresh" size={16} color={theme.textMuted} />
                                <Text style={[styles.flipHint, { color: theme.textMuted }]}>
                                    Çeviriyi görmek için karta dokun
                                </Text>
                            </View>
                        </Animated.View>

                        {/* Türkçe (Arka Yüz) */}
                        <Animated.View style={[
                            styles.storyCard, 
                            { 
                                backgroundColor: theme.primaryLight, 
                                borderColor: theme.primary, 
                                transform: [{rotateY: backInterpolate}], 
                                backfaceVisibility: 'hidden',
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0 // Ön yüzün boyutunu tam kapla
                            }
                        ]}>
                            <Text style={[styles.content, { color: theme.text }]}>
                                {renderStoryText(story.content_tr || "Bu hikaye için henüz Türkçe çeviri bulunmuyor. Yeni bir tane üretin!")}
                            </Text>
                            <View style={styles.flipHintContainer}>
                                <Ionicons name="language" size={16} color={theme.primary} />
                                <Text style={[styles.flipHint, { color: theme.primary }]}>
                                    İngilizceye dönmek için karta dokun
                                </Text>
                            </View>
                        </Animated.View>
                    </View>
                </TouchableOpacity>

                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                        Renkli ve kalın kelimeler, bu hafta öğrendiğin hedef kelimelerdir. Kartı çevirerek hikayenin Türkçesini de okuyabilirsin.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    playBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, elevation: 3 },
    restartBtn: { padding: 8, borderRadius: 20, borderWidth: 1, marginRight: 10, elevation: 1 },
    scrollContent: { padding: 20, paddingBottom: 50 },
    title: { fontSize: 28, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
    storyCard: { padding: 20, borderRadius: 15, borderWidth: 1, elevation: 2, marginBottom: 25 },
    content: { fontSize: 18, lineHeight: 28 },
    infoBox: { flexDirection: 'row', padding: 15, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, alignItems: 'center' },
    infoText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 18 },
    flipHintContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    flipHint: { fontSize: 13, marginLeft: 5, fontWeight: 'bold' }
});
