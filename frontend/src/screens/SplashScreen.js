import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Image, StatusBar, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useUser } from '../context/UserContext';

export default function SplashScreenComponent({ navigation }) {
    const { userData } = useUser();
    
    // Animasyon değerleri (0 -> 1)
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Enforce hiding native splash screen now that custom UI is mounting
        SplashScreen.hideAsync().catch(() => {});

        // Parallel timing animations to scale and fade from 0 to 1 simultaneously over 1200ms
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            })
        ]).start();

        // 2.8 saniye sonra ana ekrana veya giriş ekranına yönlendir
        const timer = setTimeout(() => {
            navigation.replace(userData ? 'Home' : 'Login');
        }, 2800);

        return () => clearTimeout(timer);
    }, [navigation, userData]);

    return (
        <LinearGradient
            colors={['#0a0a1a', '#1a0533']}
            style={styles.container}
        >
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            <Animated.View style={[
                styles.content,
                {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }]
                }
            ]}>
                <Image 
                    source={require('../../assets/logo.png')} 
                    style={styles.logo}
                    resizeMode="contain"
                />
                
                {/* Alt Kısımdaki İtibar Cümlesi (Tagline) */}
                <Text style={styles.tagline}>Speak. Learn. Evolve.</Text>
            </Animated.View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 240,
        height: 240,
        shadowColor: '#a78bfa',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 20,
        elevation: 8,
    },
    tagline: {
        color: '#a78bfa',
        fontSize: 16,
        fontStyle: 'italic',
        letterSpacing: 1.5,
        marginTop: 15,
    },
});
