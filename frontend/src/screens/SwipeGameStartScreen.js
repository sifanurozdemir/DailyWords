import React, { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SwipeGameStartScreen({ route, navigation }) {
    const { words } = route.params || { words: [] };
    const { theme } = useTheme();
    const { userData } = useUser();
    const insets = useSafeAreaInsets();

    // Sayfaya her odaklandığında (Geri dönüldüğünde) rekorun güncelliğini kontrol et
    useFocusEffect(
        useCallback(() => {
            // Sadece odaklanmayı tetiklemek yeterli, userData zaten Context'ten güncellenmiş olacak
        }, [])
    );

    const highScore = userData?.swipe_match_high_score || 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
                    <Ionicons name="arrow-back" size={28} color={theme.text} />
                </TouchableOpacity>
            </View>
            
            <View style={styles.content}>
                <Text style={{ fontSize: 80, marginBottom: 10 }}>🔥</Text>
                <Text style={[styles.title, { color: theme.text }]}>Swipe Match</Text>
                
                {/* REKOR BİLGİSİ */}
                <View style={[styles.recordBadge, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
                    <Ionicons name="trophy" size={20} color={theme.primary} />
                    <Text style={[styles.recordText, { color: theme.text }]}>Kişisel Rekorun: <Text style={{fontWeight: '900', color: theme.primary}}>{highScore}</Text></Text>
                </View>

                <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                        İngilizce kelime ve Türkçe anlamı eşleşiyor mu?
                    </Text>
                    
                    <View style={styles.instructionRow}>
                        <Ionicons name="arrow-forward-circle" size={30} color="#00FF00" />
                        <Text style={[styles.instructionText, { color: theme.text }]}>DOĞRU ise SAĞA kaydır</Text>
                    </View>
                    
                    <View style={styles.instructionRow}>
                        <Ionicons name="arrow-back-circle" size={30} color="#FF3B30" />
                        <Text style={[styles.instructionText, { color: theme.text }]}>YANLIŞ ise SOLA kaydır</Text>
                    </View>
                    
                    <Text style={[styles.warningText, { color: theme.warning }]}>
                        Zaman hızla akıyor! Hızlı ol ve komboları yakala!
                    </Text>
                </View>

                <TouchableOpacity 
                    style={[styles.startBtn, { backgroundColor: theme.primary }]}
                    onPress={() => navigation.replace('SwipeGame', { words })}
                >
                    <Text style={styles.startBtnText}>BAŞLA</Text>
                    <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 5 }} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 15, paddingTop: 10 },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    title: { fontSize: 32, fontWeight: '900', marginBottom: 20, letterSpacing: 1 },
    recordBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 15,
        borderWidth: 1,
        marginBottom: 25
    },
    recordText: {
        marginLeft: 10,
        fontSize: 16,
        fontWeight: '600'
    },
    infoCard: { width: '100%', padding: 25, borderRadius: 20, borderWidth: 1, marginBottom: 40, alignItems: 'center' },
    infoText: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 25, lineHeight: 26 },
    instructionRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 15, paddingHorizontal: 10 },
    instructionText: { fontSize: 18, fontWeight: 'bold', marginLeft: 15 },
    warningText: { fontSize: 14, marginTop: 15, fontStyle: 'italic', textAlign: 'center' },
    startBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30, width: '90%', justifyContent: 'center', elevation: 5 },
    startBtnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' }
});
