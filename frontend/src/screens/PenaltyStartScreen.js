import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';

export default function PenaltyStartScreen({ navigation }) {
    const { theme } = useTheme();
    const { userData } = useUser();

    // Isolated Stats for Penalty Game
    const xp = userData?.penalty_total_xp || 0;
    const highestCombo = userData?.penalty_high_score || 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={28} color={theme.text} />
            </TouchableOpacity>

            <Text style={styles.emoji}>⚽</Text>
            <Text style={[styles.title, { color: theme.text }]}>Zamana Karşı Penaltı</Text>
            
            <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.desc, { color: theme.textSecondary }]}>
                    Sadece 5 saniyen var! Doğru şıkkı ne kadar hızlı seçersen o kadar yüksek XP kazanırsın. En uzun gol serini yakala ve XP'leri topla!
                </Text>
            </View>

            <View style={styles.statsContainer}>
                <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.warning }]}>
                    <Text style={{ fontSize: 24 }}>⚡</Text>
                    <Text style={[styles.statValue, { color: theme.warning }]}>{xp}</Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Penaltı XP</Text>
                </View>
                
                <View style={[styles.statBox, { backgroundColor: theme.card, borderColor: theme.primary }]}>
                    <Text style={{ fontSize: 24 }}>🏆</Text>
                    <Text style={[styles.statValue, { color: theme.primary }]}>{highestCombo}</Text>
                    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Gol Rekoru</Text>
                </View>
            </View>
            
            <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('PenaltyGame')}
            >
                <Text style={styles.btnText}>OYUNA BAŞLA ➔</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    backBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
    emoji: { fontSize: 80, marginBottom: 15 },
    title: { fontSize: 28, fontWeight: '900', marginBottom: 20, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    infoCard: { padding: 20, borderRadius: 15, borderWidth: 1, marginBottom: 30, width: '100%' },
    desc: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
    statsContainer: { flexDirection: 'row', gap: 15, marginBottom: 40, width: '100%' },
    statBox: { flex: 1, padding: 20, borderRadius: 15, borderWidth: 1.5, alignItems: 'center' },
    statValue: { fontSize: 26, fontWeight: 'bold', marginTop: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
    statLabel: { fontSize: 13, marginTop: 5 },
    btn: { paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30, elevation: 5, width: '80%', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 18, fontWeight: '900' }
});