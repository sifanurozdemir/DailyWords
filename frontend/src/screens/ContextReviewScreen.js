import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar, ScrollView } from 'react-native';
import apiClient from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function ContextReviewScreen({ route, navigation }) {
    const { word, user_id } = route.params;
    const { theme, isDark } = useTheme();
    const [question, setQuestion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showHint, setShowHint] = useState(false);
    const [answered, setAnswered] = useState(false);

    useEffect(() => {
        fetchQuestion();
    }, []);

    const fetchQuestion = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get(`/get-review-question/${word.id}?user_id=${user_id}`);
            setQuestion(res.data);
            // If already reviewed today, mark as answered
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

    const getOptionStyle = (opt) => {
        if (!answered) return [styles.optionBtn, { backgroundColor: theme.card, borderColor: theme.border }];
        if (opt.is_correct) return [styles.optionBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: 2 }];
        if (selectedOption === opt) return [styles.optionBtn, { backgroundColor: theme.dangerLight, borderColor: theme.danger, borderWidth: 2 }];
        return [styles.optionBtn, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.5 }];
    };

    const QUESTION_TYPE_LABELS = {
        meaning: '🧠 Anlam Testi',
        past: '⏪ Geçmiş Zaman',
        future: '⏩ Gelecek Zaman',
        synonym: '🔗 Sinonim Testi',
        usage: '✏️ Doğru Kullanım',
    };

    if (loading) return (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
            <ActivityIndicator size="large" color={theme.primary} />
        </View>
    );

    if (!question) return (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text }}>Soru yüklenemedi.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.backBtnText}>Geri Dön</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
                        <Text style={{ color: theme.accent, fontSize: 16, fontWeight: 'bold' }}>← Geri</Text>
                    </TouchableOpacity>
                    <Text style={[styles.typeLabel, { color: theme.textMuted }]}>
                        {QUESTION_TYPE_LABELS[question.question_type] || '🎯 Tekrar'}
                    </Text>
                </View>

                {/* Completed Banner */}
                {question.reviewed_today && (
                    <View style={[styles.completedBanner, { backgroundColor: theme.primaryLight }]}>
                        <Text style={[styles.completedText, { color: theme.successText }]}>✅ Bu kelimeyi bugün zaten tamamladın!</Text>
                    </View>
                )}

                {/* Word Card */}
                <View style={[styles.wordCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                    <Text style={[styles.wordEn, { color: theme.text }]}>{question.word_en}</Text>
                    <Text style={[styles.wordTr, { color: theme.textSecondary }]}>{question.meaning_tr}</Text>
                </View>

                {/* Sentence Box */}
                {question.sentence ? (
                    <View style={[styles.sentenceBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                        <Text style={[styles.sentenceLabel, { color: theme.textMuted }]}>📖 Örnek Cümle</Text>
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

                {/* Post-answer feedback */}
                {answered && (
                    <View style={[styles.feedbackBox, { backgroundColor: selectedOption?.is_correct ? theme.primaryLight : theme.dangerLight }]}>
                        <Text style={[styles.feedbackText, { color: selectedOption?.is_correct ? theme.successText : theme.danger }]}>
                            {selectedOption?.is_correct
                                ? '🎉 Harika! Kelimeyi hatırladın. SRS aralığı uzatıldı.'
                                : `💪 Doğru cevap: "${question.options.find(o => o.is_correct)?.text}". Daha sık tekrar göreceksin.`}
                        </Text>
                        <TouchableOpacity
                            style={[styles.backBtn, { backgroundColor: theme.accent, marginTop: 12 }]}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={styles.backBtnText}>← Geri Dön</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20, paddingTop: 50, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerBack: { padding: 5 },
    typeLabel: { fontSize: 14, fontWeight: 'bold' },

    completedBanner: { padding: 12, borderRadius: 12, marginBottom: 15, alignItems: 'center' },
    completedText: { fontWeight: 'bold', fontSize: 15 },

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

    feedbackBox: { padding: 18, borderRadius: 18, marginTop: 10 },
    feedbackText: { fontSize: 15, fontWeight: 'bold', lineHeight: 22 },

    backBtn: { paddingVertical: 14, paddingHorizontal: 25, borderRadius: 14, alignItems: 'center' },
    backBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
