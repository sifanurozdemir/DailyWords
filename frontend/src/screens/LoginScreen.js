import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen({ navigation }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { theme, isDark } = useTheme();

    const handleLogin = async () => {
        const cleanUsername = username.trim().toLowerCase();
        
        // 1. SENKRONİZASYON ÇÖZÜMÜ: Kayıt ekranıyla aynı kurallar
        if (cleanUsername.length < 3) {
            Alert.alert("Uyarı", "Kullanıcı adı en az 3 karakter olmalıdır.");
            return;
        }
        if (password.length < 8) {
            Alert.alert("Uyarı", "Şifreniz en az 8 karakter olmalıdır.");
            return;
        }

        setLoading(true);
        try {
            // 2. 422 HATASI ÇÖZÜMÜ: Verileri URL'den değil, JSON Paketinden (Body) gönderiyoruz
            const response = await apiClient.post('/login', {
                username: cleanUsername,
                password: password
            });

            if (response.data.status === "success") {
                if (response.data.needs_placement_test) {
                    navigation.replace('StartTest', { user_id: response.data.user_id });
                } else {
                    navigation.replace('Home', { user: response.data });
                }
            }
        } catch (error) {
            // 3. KIRMIZI EKRAN (ReadableNativeArray) ÇÖZÜMÜ: Güvenli hata yakalama
            let errorMessage = "Bağlantı sırasında bir sorun oluştu.";
            
            // Backend'den düzgün bir String (metin) hatası gelip gelmediğini kontrol et
            if (error.response && error.response.data && error.response.data.detail) {
                errorMessage = String(error.response.data.detail);
            }
            
            Alert.alert("Giriş Başarısız", errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                <Text style={[styles.logo, { color: theme.text }]}>DailyWords</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>İngilizce öğrenmeye başla</Text>

                <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                    placeholder="Kullanıcı Adı"
                    placeholderTextColor={theme.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                
                {/* Şifre Göster/Gizle Yapısı (İkonlu Versiyon) */}
                <View style={[styles.passwordContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                    <TextInput
                        style={[styles.passwordInput, { color: theme.text }]}
                        placeholder="Şifre"
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        autoCapitalize="none"
                    />
                    <TouchableOpacity 
                        style={styles.eyeIconContainer} 
                        onPress={() => setShowPassword(!showPassword)}
                    >
                        {/* Emojiler yerine şık Ionicons kullanıyoruz */}
                        <Ionicons 
                            name={showPassword ? "eye-off-outline" : "eye-outline"} 
                            size={22} 
                            color={theme.textMuted} 
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    style={[styles.button, { backgroundColor: loading ? theme.primaryLight : theme.primary }]} 
                    onPress={handleLogin} 
                    activeOpacity={0.8}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.buttonText}>Giriş Yap</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkContainer}>
                    <Text style={[styles.linkText, { color: theme.textSecondary }]}>Hesabınız yok mu? <Text style={[styles.linkBold, { color: theme.primary }]}>Kaydolun</Text></Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center' },
    card: { marginHorizontal: 30, padding: 40, borderRadius: 24, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5, alignItems: 'center' },
    logo: { fontSize: 32, fontWeight: '800', marginBottom: 5 },
    subtitle: { fontSize: 15, marginBottom: 35 },
    input: { width: '100%', borderWidth: 1, paddingVertical: 15, paddingHorizontal: 20, borderRadius: 16, marginBottom: 16, fontSize: 16 },
    button: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10, elevation: 4 },
    buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
    linkContainer: { marginTop: 25 },
    linkText: { fontSize: 14 },
    linkBold: { fontWeight: 'bold' },

    // YENİ EKLENEN STİLLER:
    passwordContainer: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12, // Eğer input'unda farklı bir radius varsa burayı ona eşitleyebilirsin (örn: 8 veya 16)
        marginBottom: 16,
        overflow: 'hidden',
    },
    passwordInput: {
        flex: 1,
        padding: 15, // Normal input'unun padding değeriyle aynı yap
        fontSize: 16,
    },
    eyeIconContainer: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eyeIcon: {
        fontSize: 20,
    },
});