import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

let alertRegister = null;

export const showCustomAlert = (title, message, buttons = []) => {
  if (alertRegister) {
    alertRegister(title, message, buttons);
  } else {
    console.warn("CustomAlert has not been mounted yet.");
  }
};

export default function CustomAlert() {
  const { theme, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState([]);

  useEffect(() => {
    alertRegister = (t, m, b) => {
      setTitle(t);
      setMessage(m);
      setButtons(b || []);
      setVisible(true);
    };
    return () => {
      alertRegister = null;
    };
  }, []);

  const handleButtonPress = (onPress) => {
    setVisible(false);
    if (onPress) {
      onPress();
    }
  };

  const getIcon = () => {
    const t = (title || '').toLowerCase();
    const m = (message || '').toLowerCase();
    
    if (t.includes('tebrik') || t.includes('başarı') || t.includes('türkçe') || t.includes('harika') || t.includes('kutlarız')) {
      return <Ionicons name="trophy" size={32} color={COLORS.accent_amber} />;
    }
    if (t.includes('hata') || t.includes('başarısız') || t.includes('uyarı') || t.includes('eksik') || t.includes('yanlış')) {
      return <Ionicons name="alert-circle" size={32} color={COLORS.danger} />;
    }
    if (t.includes('bağlantı') || t.includes('network') || t.includes('sunucu') || m.includes('sunucuya ulaşılamıyor')) {
      return <Ionicons name="wifi" size={32} color={COLORS.danger} />;
    }
    if (t.includes('izin') || t.includes('mikrofon')) {
      return <Ionicons name="lock-closed" size={32} color={COLORS.accent_purple} />;
    }
    if (t.includes('sil') || t.includes('emin misiniz') || t.includes('çıkış')) {
      return <Ionicons name="trash-outline" size={32} color={COLORS.danger} />;
    }
    return <Ionicons name="sparkles" size={32} color={COLORS.accent_violet} />;
  };

  const renderButtons = () => {
    if (buttons.length === 0) {
      return (
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, { backgroundColor: COLORS.accent_purple, width: '100%' }]}
          onPress={() => setVisible(false)}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Tamam</Text>
        </TouchableOpacity>
      );
    }

    const isStack = buttons.length > 2;

    return (
      <View style={[styles.buttonContainer, { flexDirection: isStack ? 'column' : 'row' }]}>
        {buttons.map((btn, index) => {
          const isDestructive = btn.style === 'destructive';
          const isCancel = btn.style === 'cancel';
          
          let btnBg = 'transparent';
          let btnBorder = theme.border;
          let btnTextColor = theme.textSecondary;

          if (isDestructive) {
            btnBg = COLORS.danger;
            btnBorder = 'transparent';
            btnTextColor = '#FFFFFF';
          } else if (isCancel) {
            btnBg = 'transparent';
            btnBorder = theme.border;
            btnTextColor = theme.textSecondary;
          } else {
            const isLast = index === buttons.length - 1;
            if (isLast || buttons.length === 1) {
              btnBg = COLORS.accent_purple;
              btnBorder = 'transparent';
              btnTextColor = '#FFFFFF';
            }
          }

          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.8}
              style={[
                styles.button, 
                { 
                  backgroundColor: btnBg, 
                  borderColor: btnBorder,
                  borderWidth: btnBg === 'transparent' ? 1.5 : 0,
                  flex: isStack ? undefined : 1,
                  width: isStack ? '100%' : undefined,
                  marginBottom: isStack && index < buttons.length - 1 ? 8 : 0
                }
              ]}
              onPress={() => handleButtonPress(btn.onPress)}
            >
              <Text style={[styles.buttonText, { color: btnTextColor }]}>
                {btn.text || 'Tamam'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.elevated, borderColor: theme.border }]}>
          <View style={[styles.headerIcon, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.1)' : 'rgba(124, 58, 237, 0.05)' }]}>
            {getIcon()}
          </View>
          {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
          {message ? <Text style={[styles.desc, { color: theme.textSecondary }]}>{message}</Text> : null}
          {renderButtons()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay_dark || 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  content: {
    width: '90%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)'
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12
  },
  desc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  button: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold'
  }
});
