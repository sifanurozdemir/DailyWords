import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import apiClient from '../api/client';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StoryListScreen({ navigation, isTab }) {
    const { theme } = useTheme();
    const { userData } = useUser();
    const insets = useSafeAreaInsets();

    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

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

    const handleGenerateStory = async () => {
        try {
            setGenerating(true);
            const res = await apiClient.post(`/generate-story/${userData.user_id}`);
            if (res.data.status === 'success') {
                setStories(prev => [res.data.story, ...prev]);
                navigation.navigate('StoryReader', { story: res.data.story });
            }
        } catch (e) {
            if (e.response && e.response.status === 400) {
                Alert.alert("Daha Fazla Kelime Öğren", "Yapay zekanın mantıklı bir hikaye yazabilmesi için önce pratik yaparak en az 5 yeni kelime öğrenmelisin!");
            } else {
                Alert.alert("Hata", "Hikaye üretilirken bir sorun oluştu.");
            }
        } finally {
            setGenerating(false);
        }
    };

    const renderItem = ({ item }) => {
        const date = new Date(item.created_at).toLocaleDateString('tr-TR');
        return (
            <TouchableOpacity 
                style={[styles.storyCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => navigation.navigate('StoryReader', { story: item })}
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
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={22} color="#fff" />
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    headerTitle: { fontSize: 22, fontWeight: 'bold' },
    actionContainer: { paddingHorizontal: 20, marginBottom: 10 },
    generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, elevation: 3 },
    generateBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    infoText: { fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 10 },
    storyCard: { padding: 18, borderRadius: 12, marginBottom: 15, borderWidth: 1, elevation: 1 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    storyTitle: { fontSize: 18, fontWeight: 'bold', flex: 1, marginRight: 10 },
    storyDate: { fontSize: 12 },
    storyPreview: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    cardFooter: { flexDirection: 'row', alignItems: 'center' },
    readText: { fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 16, marginTop: 15 }
});
