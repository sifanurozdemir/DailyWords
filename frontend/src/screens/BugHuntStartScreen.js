import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import apiClient from '../api/client';

export default function BugHuntStartScreen({ route, navigation }) {
    const initialWords = route.params?.words || [];
    const { theme } = useTheme();
    const { userData } = useUser();
    
    const [words, setWords] = useState(initialWords);
    const [loading, setLoading] = useState(initialWords.length === 0);

    useEffect(() => {
        if (initialWords.length === 0 && userData?.user_id) {
            apiClient.get(`/get-learned-words/${userData.user_id}`)
                .then(res => {
                    setWords(Array.isArray(res.data) ? res.data : []);
                    setLoading(false);
                })
                .catch(err => {
                    console.log(err);
                    setLoading(false);
                });
        }
    }, []);

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={28} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: theme.text }]}>Bug Hunt</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}>
                    <Text style={{ fontSize: 60 }}>🐛</Text>
                </View>

                <Text style={[styles.subtitle, { color: theme.primary }]}>Dinle ve Yaz!</Text>
                
                <View style={[styles.rulesBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.ruleText, { color: theme.text }]}>
                        1. Böcek ekranın başından çıkacak. Kelimenin <Text style={{fontWeight: 'bold', color: theme.accent}}>İngilizce telaffuzunu</Text> duyacaksın. (Tekrar dinlemek için böceğe dokun!)
                    </Text>
                    <Text style={[styles.ruleText, { color: theme.text }]}>
                        2. Böcek sunucuya ulaşıp <Text style={{fontWeight: 'bold', color: theme.danger}}>sistemi çökertmeden</Text> önce duyduğun kelimeyi klavyeden doğru yaz.
                    </Text>
                    <Text style={[styles.ruleText, { color: theme.text }]}>
                        3. Toplam 3 canın var. Her doğru kelime sistemi kurtarır ve XP kazandırır!
                    </Text>
                </View>
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                {loading ? (
                    <ActivityIndicator size="large" color={theme.primary} />
                ) : (
                    <TouchableOpacity 
                        style={[styles.startBtn, { backgroundColor: words.length > 0 ? theme.primary : theme.textMuted }]}
                        onPress={() => words.length > 0 && navigation.replace('BugHuntGame', { words })}
                        disabled={words.length === 0}
                    >
                        <Text style={styles.startBtnText}>
                            {words.length > 0 ? 'OYNAMAYA BAŞLA' : 'ÖĞRENİLMİŞ KELİME YOK'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60 },
    backBtn: { marginRight: 15 },
    title: { fontSize: 24, fontWeight: '800' },
    content: { padding: 20, alignItems: 'center' },
    iconContainer: { width: 120, height: 120, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    subtitle: { fontSize: 26, fontWeight: '900', marginBottom: 30 },
    rulesBox: { padding: 25, borderRadius: 20, borderWidth: 1, width: '100%' },
    ruleText: { fontSize: 16, lineHeight: 26, marginBottom: 15 },
    footer: { padding: 20, paddingBottom: 40, borderTopWidth: 1 },
    startBtn: { padding: 18, borderRadius: 20, alignItems: 'center', elevation: 5, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5 },
    startBtnText: { color: '#fff', fontSize: 20, fontWeight: '900' },
});
