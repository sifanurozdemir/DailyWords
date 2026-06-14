import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import apiClient from '../api/client';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

export default function StoryListScreen({ navigation, isTab }) {
    const { theme } = useTheme();
    const { userData } = useUser();
    const insets = useSafeAreaInsets();

    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [highlightedStoryId, setHighlightedStoryId] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);

    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        fetchStories();
    }, []);

    const fetchStories = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get(`/get-stories/${userData.user_id}`);
            setStories(res.data.stories || []);
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    };

    const silentFetchStories = async () => {
        try {
            const res = await apiClient.get(`/get-stories/${userData.user_id}`);
            setStories(res.data.stories || []);
        } catch (e) {
            console.log(e);
        }
    };

    const startPulse = () => {
        pulseAnim.setValue(1);
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.03,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1.0,
                    duration: 500,
                    useNativeDriver: true,
                })
            ]),
            { iterations: 3 }
        ).start(() => {
            setHighlightedStoryId(null);
        });
    };

    const pollForNewStory = (oldStoriesCount) => {
        let attempts = 0;
        const maxAttempts = 15; // 45 seconds max polling (3s interval)
        
        const intervalId = setInterval(async () => {
            attempts++;
            try {
                const res = await apiClient.get(`/get-stories/${userData.user_id}`);
                const fetchedStories = res.data.stories || [];
                
                if (fetchedStories.length > oldStoriesCount) {
                    // New story found!
                    clearInterval(intervalId);
                    
                    const newStory = fetchedStories[0]; // The API returns stories sorted by created_at desc
                    setStories(fetchedStories);
                    setToastMessage(null);
                    setGenerating(false);
                    
                    // Highlight card for 3 seconds
                    setHighlightedStoryId(newStory.id);
                    startPulse();
                    
                    setTimeout(() => {
                        navigation.navigate('StoryReader', { story: newStory });
                    }, 3000);
                } else if (attempts >= maxAttempts) {
                    // Timeout
                    clearInterval(intervalId);
                    setToastMessage(null);
                    setGenerating(false);
                    Alert.alert("Zaman Aşımı", "Hikaye üretimi çok uzun sürdü. Lütfen ana sayfadan kelimelerinizi kontrol edin.");
                }
            } catch (e) {
                console.log("Polling error:", e);
                if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    setToastMessage(null);
                    setGenerating(false);
                }
            }
        }, 3000);
    };

    const handleGenerateStory = async () => {
        const oldStoriesCount = stories.length;
        const startTime = Date.now();
        try {
            setGenerating(true);
            setToastMessage(null);
            
            // Axios timeout: 60s, skipErrorAlert: true
            const res = await apiClient.post(
                `/generate-story/${userData.user_id}`,
                {},
                { timeout: 60000, skipErrorAlert: true }
            );
            
            // Enforce minimum 1.5s loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 1500) {
                await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
            }

            if (res.data.status === 'success') {
                const newStory = res.data.story;
                setStories(prev => [newStory, ...prev]);
                setGenerating(false);
                
                // Highlight card for 3 seconds
                setHighlightedStoryId(newStory.id);
                startPulse();
                
                // Navigate after 3 seconds of highlight
                setTimeout(() => {
                    navigation.navigate('StoryReader', { story: newStory });
                }, 3000);
            } else {
                throw new Error("API status is not success");
            }
        } catch (e) {
            // Enforce minimum 1.5s loading time even on error
            const elapsed = Date.now() - startTime;
            if (elapsed < 1500) {
                await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
            }

            // Hatalı durumda toast mesajı göster ve arka planda kontrol etmeye (polling) başla
            setToastMessage("Üretim sürüyor, lütfen bekle...");
            pollForNewStory(oldStoriesCount);
        }
    };

    const renderItem = ({ item }) => {
        const date = new Date(item.created_at).toLocaleDateString('tr-TR');
        const isHighlighted = item.id === highlightedStoryId;
        
        const cardStyle = [
            styles.storyCard,
            { 
                backgroundColor: COLORS.bg_card, 
                borderColor: COLORS.border,
                borderLeftWidth: 3,
                borderLeftColor: isHighlighted ? COLORS.accent_cyan : COLORS.accent_purple
            }
        ];

        const cardContent = (
            <TouchableOpacity 
                style={cardStyle}
                onPress={() => navigation.navigate('StoryReader', { story: item })}
                disabled={isHighlighted}
            >
                <View style={styles.cardHeader}>
                    <Text style={[styles.storyTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.storyDate, { color: theme.textSecondary }]}>{date}</Text>
                </View>
                <Text style={[styles.storyPreview, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.content_en.replace(/\*\*/g, '')}
                </Text>
                <View style={styles.cardFooter}>
                    <Ionicons name="book-outline" size={16} color={theme.primary} />
                    <Text style={[styles.readText, { color: theme.primary }]}>Okumaya Başla</Text>
                </View>
            </TouchableOpacity>
        );

        if (isHighlighted) {
            return (
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    {cardContent}
                </Animated.View>
            );
        }

        return cardContent;
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background, paddingTop: isTab ? (insets.top + 20) : insets.top }]}>
            {/* Header (Hide if used as Tab) */}
            {!isTab && (
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
                        <Ionicons name="arrow-back" size={28} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>Benim Hikayelerim</Text>
                    <View style={{ width: 28 }} />
                </View>
            )}

            {/* If tab, display a small title */}
            {isTab && (
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text, paddingHorizontal: 20, marginBottom: 15 }}>Benim Hikayelerim</Text>
            )}

            {/* Generate Button */}
            <View style={styles.actionContainer}>
                <TouchableOpacity 
                    style={[styles.generateBtn, { backgroundColor: theme.primary }]}
                    onPress={handleGenerateStory}
                    disabled={generating}
                >
                    {generating ? (
                        <>
                            <ActivityIndicator color={COLORS.text_primary} />
                            <Text style={styles.generateBtnText}>Hikaye üretiliyor...</Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={22} color={COLORS.text_primary} />
                            <Text style={styles.generateBtnText}>Yeni Hikaye Üret (AI)</Text>
                        </>
                    )}
                </TouchableOpacity>
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                    Son öğrendiğin kelimeler kullanılarak seviyene uygun özgün bir hikaye oluşturulur.
                </Text>
            </View>

            {/* List */}
            {loading ? (
                <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 50 }} />
            ) : stories.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="library-outline" size={80} color={theme.border} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Henüz bir hikayen yok.</Text>
                </View>
            ) : (
                <FlatList 
                    data={stories}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20 }}
                />
            )}

            {/* Custom Toast Alert */}
            {toastMessage && (
                <View style={styles.toastContainer}>
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    headerTitle: { fontSize: 22, fontWeight: 'bold' },
    actionContainer: { paddingHorizontal: 20, marginBottom: 10 },
    generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, elevation: 3 },
    generateBtnText: { color: COLORS.text_primary, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    infoText: { fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 10 },
    storyCard: { padding: 18, borderRadius: 12, marginBottom: 15, borderWidth: 1, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    storyTitle: { fontSize: 18, fontWeight: 'bold', flex: 1, marginRight: 10 },
    storyDate: { fontSize: 12 },
    storyPreview: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    cardFooter: { flexDirection: 'row', alignItems: 'center' },
    readText: { fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 16, marginTop: 15 },
    toastContainer: {
        position: 'absolute',
        bottom: 50,
        alignSelf: 'center',
        backgroundColor: COLORS.bg_card,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 25,
        elevation: 10,
        zIndex: 9999,
        shadowColor: COLORS.text_primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    toastText: {
        color: COLORS.text_primary,
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    }
});
