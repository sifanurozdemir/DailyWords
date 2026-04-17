import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

export default function StartTestScreen({ route, navigation }) {
    const { user_id } = route.params;
    const { theme, isDark } = useTheme();

    // İkonlu ve daha ferah maddeler
    const testFeatures = [
        { icon: "🧠", title: "Kişiselleştirilmiş Liste", desc: "Bu test, sana en uygun kelimeleri seçebilmemiz için tasarlandı." },
        { icon: "📈", title: "6 Seviye, 120 Soru", desc: "A1'den C1'ye kadar uzanan kapsamlı bir değerlendirme." },
        { icon: "⏱️", title: "Dinamik İlerleme", desc: "Bir seviyede 15 doğru yaparsan, otomatik olarak bir sonrakine geçersin." }
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                
                <View style={styles.header}>
                    <Text style={styles.emoji}>🎯</Text>
                    <Text style={[styles.title, { color: theme.text }]}>Seviyeni Belirleyelim</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Sana özel bir çalışma programı hazırlayabilmemiz için 5 dakikanı ayır.</Text>
                </View>

                <View style={styles.cardsContainer}>
                    {testFeatures.map((item, index) => (
                        <View key={index} style={[styles.featureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <View style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}>
                                <Text style={styles.featureIcon}>{item.icon}</Text>
                            </View>
                            <View style={styles.featureTextContainer}>
                                <Text style={[styles.featureTitle, { color: theme.text }]}>{item.title}</Text>
                                <Text style={[styles.featureDesc, { color: theme.textSecondary }]}>{item.desc}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: theme.primary, shadowColor: theme.primary }]} 
                    onPress={() => navigation.replace('Placement', { user_id })}
                    activeOpacity={0.8}
                >
                    <Text style={styles.btnText}>Testi Başlat ➔</Text>
                </TouchableOpacity>

                <View style={[styles.warningBox, { backgroundColor: theme.danger + '15', borderColor: theme.danger + '40' }]}>
                    <Text style={[styles.footerText, { color: theme.danger }]}>
                        ⚠️ Uyarı: Testi yarıda bırakırsan seviyen başlangıç (A1) olarak kabul edilecektir.
                    </Text>
                </View>
                
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 24, alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
    
    header: { alignItems: 'center', marginBottom: 35 },
    emoji: { fontSize: 70, marginBottom: 15 },
    title: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 10, letterSpacing: 0.5 },
    subtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24, paddingHorizontal: 10 },
    
    cardsContainer: { width: '100%', marginBottom: 40 },
    featureCard: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 20, 
        borderRadius: 20, 
        marginBottom: 16, 
        borderWidth: 1,
        elevation: 2,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4
    },
    iconContainer: { 
        width: 55, 
        height: 55, 
        borderRadius: 18, 
        justifyContent: 'center', 
        alignItems: 'center',
        marginRight: 16
    },
    featureIcon: { fontSize: 26 },
    featureTextContainer: { flex: 1 },
    featureTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 5 },
    featureDesc: { fontSize: 14, lineHeight: 20 },
    
    btn: { 
        paddingVertical: 18, 
        borderRadius: 20, 
        width: '100%', 
        alignItems: 'center', 
        elevation: 8, 
        shadowOffset: { width: 0, height: 6 }, 
        shadowOpacity: 0.3, 
        shadowRadius: 8,
        marginBottom: 30
    },
    btnText: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 1 },
    
    warningBox: {
        width: '100%',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: 'dashed'
    },
    footerText: { fontSize: 13, textAlign: 'center', fontWeight: '600', lineHeight: 20 },
});