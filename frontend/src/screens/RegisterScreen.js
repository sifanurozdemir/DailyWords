import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function RegisterScreen({ navigation }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { theme, isDark } = useTheme();

    // Şifre doğrulama fonksiyonu (Global Validator)
    const validatePassword = (pass) => {
        // En az 8 karakter, 1 büyük harf, 1 küçük harf, 1 rakam, 1 özel karakter
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,#_-])[A-Za-z\d@$!%*?&.,#_-]{8,}$/;
        return regex.test(pass);
    };

    const handleRegister = async () => {
        const cleanUsername = username.trim().toLowerCase();

        if (!cleanUsername || !password) { 
            Alert.alert("Hata", "Lütfen tüm alanları doldurun."); 
            return; 
        }

        if (cleanUsername.length < 3) {
            Alert.alert("Hata", "Kullanıcı adı en az 3 karakter olmalıdır.");
            return;
        }

        // Şifre Kuralları Kontrolü
        if (!validatePassword(password)) {
            Alert.alert(
                "Zayıf Şifre", 
                "Şifreniz en az 8 karakter olmalı ve şunları içermelidir:\n\n• Büyük harf\n• Küçük harf\n• Rakam\n• Özel karakter (@, !, ?, vb.)"
            );
            return;
        }

        setLoading(true);
        try {
            // 1. KAYIT İŞLEMİ (Eski URL formatı yerine temiz JSON paketi kullanıyoruz)
            const registerResponse = await apiClient.post('/register', {
                username: cleanUsername,
                password: password
            });

            if (registerResponse.data.status === "success") {
                // 2. AUTO-LOGIN İŞLEMİ (Kullanıcıyı Login sayfasına atmadan içeri alıyoruz)
                const loginResponse = await apiClient.post('/login', {
                    username: cleanUsername,
                    password: password
                });

                if (loginResponse.data.status === "success") {
                    if (loginResponse.data.needs_placement_test) {
                        // Yeni kullanıcıyı doğrudan seviye testine gönder!
                        navigation.replace('StartTest', { user_id: loginResponse.data.user_id });
                    } else {
                        navigation.replace('Home', { user: loginResponse.data });
                    }
                }
            }
        } catch (error) { 
            console.log("Kayıt hatası:", error);
            // Backend'den gelen 400 (Bu kullanıcı adı zaten alınmış) hatasını şık bir şekilde yakala
            if (error.response && error.response.status === 400) {
                Alert.alert("Kayıt Başarısız", "Bu kullanıcı adı zaten alınmış. Lütfen başka bir tane deneyin.");
            } else {
                Alert.alert("Hata", "Kayıt olurken bir sorun oluştu.");
            }
        } finally { 
            setLoading(false); 
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <Text style={[styles.title, { color: theme.primary }]}>Yeni Hesap Oluştur</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>DailyWords ile İngilizce yolculuğuna başla.</Text>

            <TextInput 
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
                placeholder="Kullanıcı Adı" 
                placeholderTextColor={theme.textMuted}
                value={username} 
                onChangeText={setUsername} 
                autoCapitalize="none" 
                autoCorrect={false}
            />

            <TextInput 
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text, marginBottom: 5 }]}
                placeholder="Şifre" 
                placeholderTextColor={theme.textMuted}
                secureTextEntry 
                value={password} 
                onChangeText={setPassword} 
            />
            {/* Şifre Kuralı İpucu Yazısı */}
            <Text style={[styles.passwordHint, { color: theme.textMuted }]}>
                Min. 8 karakter, büyük/küçük harf, rakam ve özel karakter.
            </Text>

            <TouchableOpacity style={[styles.button, { backgroundColor: loading ? theme.primaryLight : theme.primary }]} onPress={handleRegister} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? "İşleniyor..." : "Kayıt Ol"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
                <Text style={[styles.linkText, { color: theme.primary }]}>Zaten hesabınız var mı? Giriş Yap</Text>
            </TouchableOpacity>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 30 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 16, marginBottom: 30, textAlign: 'center' },
    input: { borderWidth: 1, padding: 15, borderRadius: 12, marginBottom: 15, fontSize: 16 },
    passwordHint: { fontSize: 12, marginLeft: 5, marginBottom: 20, fontStyle: 'italic' },
    button: { padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10, elevation: 2 },
    buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    link: { marginTop: 25 },
    linkText: { textAlign: 'center', fontSize: 16, fontWeight: '500' },
});