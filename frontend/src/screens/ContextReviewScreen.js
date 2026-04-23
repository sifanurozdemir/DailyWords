import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, ScrollView } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function ContextReviewScreen({ route, navigation }) {
    // HomeScreen artık pendingWords array'i gönderiyor
    const { pendingWords, user_id } = route.params;
    const { theme, isDark } = useTheme();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [question, setQuestion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showHint, setShowHint] = useState(false);
    const [answered, setAnswered] = useState(false);
    const [sessionComplete, setSessionComplete] = useState(false);

    // Current word being reviewed
    const word = pendingWords && pendingWords.length > 0 ? pendingWords[currentIndex] : null;

    useEffect(() => {
        if (word) {
            fetchQuestion();
        } else {
            setSessionComplete(true);
        }
    }, [currentIndex]);

    const fetchQuestion = async () => {
        try {
            setLoading(true);
            setAnswered(false);
            setSelectedOption(null);
            setShowHint(false);
            const res = await apiClient.get(`/get-review-question/${word.id}?user_id=${user_id}`);
            setQuestion(res.data);
            if (res.data.reviewed_today) setAnswered(true);
        } catch (e) {
            console.log("Soru yüklenemedi:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAnswer = async (option) => {
        if (answered) return;
        setSelectedOption(option);
        setAnswered(true);
        setSubmitting(true);
        try {
            await apiClient.post(`/review-word/?user_id=${user_id}&word_id=${word.id}&is_correct=${option.is_correct}`);
        } catch (e) {
            console.log(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleNext = () => {
        if (currentIndex + 1 < pendingWords.length) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setSessionComplete(true);
        }
    };

    const getOptionStyle = (opt) => {
        if (!answered) return [styles.optionBtn, { backgroundColor: theme.card, borderColor: theme.border }];
        if (opt.is_correct) return [styles.optionBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: 2 }];
        if (selectedOption === opt) return [styles.optionBtn, { backgroundColor: theme.dangerLight, borderColor: theme.danger, borderWidth: 2 }];
        return [styles.optionBtn, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.5 }];
    };

    const QUESTION_TYPE_LABELS = {
        meaning: '🧠 Anlam Testi',
        fill_in: '🔤 Boşluk Doldurma',
        usage: '✏️ Doğru Kullanım',
    };

    if (sessionComplete) {
        return (
            <View style={[styles.center, { backgroundColor: theme.background, padding: 30 }]}>
                <Text style={{ fontSize: 90, marginBottom: 20 }}>🎉</Text>
                <Text style={{ color: theme.primary, fontSize: 30, fontWeight: '900', textAlign: 'center', marginBottom: 15 }}>Seans Tamamlandı!</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 17, textAlign: 'center', marginBottom: 40, lineHeight: 24 }}>
                    Bugünkü tüm {pendingWords?.length} tekrarlarını başarıyla bitirdin ve kelimelerin hafızandaki yerini sağlamlaştırdın. Harika iş çıkardın!
                </Text>
                <TouchableOpacity 
                    style={[styles.backBtn, { backgroundColor: theme.primary, width: '100%', paddingVertical: 18, borderRadius: 25, elevation: 5 }]}
                    onPress={() => {
                        // Navigate back with an optional param to trigger refresh
                        navigation.navigate('Home', { refresh: Date.now() });
                    }}
                >
                    <Text style={[styles.backBtnText, { fontSize: 18, fontWeight: '900' }]}>ANA EKRANA DÖN</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (loading || !question) return (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ color: theme.text, marginTop: 15, fontWeight: 'bold' }}>Soru hazırlanıyor...</Text>
        </View>
    );

    const progress = ((currentIndex) / pendingWords.length) * 100;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            
            {/* Top Progress Bar */}
            <View style={{ height: 8, backgroundColor: theme.border, width: '100%', marginTop: 45 }}>
                <View style={{ height: '100%', width: `${progress}%`, backgroundColor: theme.primary }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
                        <Text style={{ color: theme.danger, fontSize: 16, fontWeight: 'bold' }}>✕ Çıkış</Text>
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.typeLabel, { color: theme.textMuted }]}>
                            {QUESTION_TYPE_LABELS[question.question_type] || '🎯 Tekrar'}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4, fontWeight: 'bold' }}>
                            {currentIndex + 1} / {pendingWords.length}
                        </Text>
                    </View>
                    <View style={{ width: 60 }} />
                </View>

                {/* Word Card */}
                <View style={[styles.wordCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                    <Text style={[styles.wordEn, { color: theme.text }]}>{question.word_en}</Text>
                    {answered && <Text style={[styles.wordTr, { color: theme.successText, fontWeight: 'bold', marginTop: 8 }]}>{question.meaning_tr}</Text>}
                </View>

                {/* Sentence Box */}
                {answered && question.sentence ? (
                    <View style={[styles.sentenceBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                        <Text style={[styles.sentenceLabel, { color: theme.textMuted }]}>📖 Örnek Cümle (Bağlam)</Text>
                        <Text style={[styles.sentenceText, { color: theme.text }]}>{question.sentence}</Text>
                    </View>
                ) : null}

                {/* 💡 Memory Trick / Hint */}
                <TouchableOpacity
                    style={[styles.hintToggle, { borderColor: theme.warning, backgroundColor: showHint ? theme.card : 'transparent' }]}
                    onPress={() => setShowHint(!showHint)}
                >
                    <Text style={[styles.hintToggleText, { color: theme.warning }]}>
                        {showHint ? '🙈 İpucunu Gizle' : '💡 İpucu Göster'}
                    </Text>
                </TouchableOpacity>
                {showHint && (
                    <View style={[styles.hintBox, { backgroundColor: theme.card, borderColor: theme.warning }]}>
                        <Text style={[styles.hintText, { color: theme.text }]}>{question.hint}</Text>
                    </View>
                )}

                {/* Question */}
                <Text style={[styles.questionText, { color: theme.text }]}>{question.question_text}</Text>

                {/* Options */}
                {question.options.map((opt, i) => (
                    <TouchableOpacity
                        key={i}
                        style={getOptionStyle(opt)}
                        onPress={() => handleAnswer(opt)}
                        disabled={answered || submitting}
                    >
                        <Text style={[styles.optionText, {
                            color: answered && opt.is_correct ? theme.successText :
                                   answered && selectedOption === opt && !opt.is_correct ? theme.danger :
                                   theme.text
                        }]}>
                            {answered && opt.is_correct ? '✅ ' : answered && selectedOption === opt ? '❌ ' : ''}
                            {opt.text}
                        </Text>
                    </TouchableOpacity>
                ))}

                {/* Post-answer Next Button */}
                {answered && (
                    <View style={[styles.feedbackBox, { backgroundColor: 'transparent', padding: 0, marginTop: 10 }]}>
                        {selectedOption && !selectedOption.is_correct && (
                            <Text style={{ color: theme.danger, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', fontSize: 16 }}>
                                Doğrusu: "{question.options.find(o => o.is_correct)?.text}"
                            </Text>
                        )}
                        <TouchableOpacity
                            style={[styles.backBtn, { backgroundColor: theme.primary, width: '100%', paddingVertical: 18, borderRadius: 20 }]}
                            onPress={handleNext}
                        >
                            <Text style={[styles.backBtnText, { fontSize: 18 }]}>SIRADAKİ ➔</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20, paddingTop: 20, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerBack: { padding: 5, width: 60 },
    typeLabel: { fontSize: 14, fontWeight: 'bold' },

    wordCard: { padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 15, elevation: 3, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
    wordEn: { fontSize: 32, fontWeight: '800', marginBottom: 5 },
    wordTr: { fontSize: 18 },

    sentenceBox: { padding: 15, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
    sentenceLabel: { fontSize: 12, marginBottom: 5, fontWeight: 'bold' },
    sentenceText: { fontSize: 16, lineHeight: 24, fontStyle: 'italic' },

    hintToggle: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 15, alignSelf: 'flex-start', marginBottom: 8 },
    hintToggleText: { fontWeight: 'bold', fontSize: 14 },
    hintBox: { padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 15 },
    hintText: { fontSize: 15, lineHeight: 22 },

    questionText: { fontSize: 17, fontWeight: '700', marginBottom: 18, lineHeight: 24 },

    optionBtn: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
    optionText: { fontSize: 16, fontWeight: '500' },

    feedbackBox: { borderRadius: 18, marginTop: 10 },
    backBtn: { alignItems: 'center' },
    backBtnText: { color: '#fff', fontWeight: 'bold' },
});
