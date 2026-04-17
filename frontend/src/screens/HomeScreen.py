import os, re

file_path = r'HomeScreen.js'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports -> useFocusEffect, useUser
code = code.replace(
    "import React, { useEffect, useState, useRef } from 'react';", 
    "import React, { useEffect, useState, useRef, useCallback } from 'react';\nimport { useFocusEffect } from '@react-navigation/native';"
)
code = code.replace(
    "import { useTheme } from '../context/ThemeContext';",
    "import { useTheme } from '../context/ThemeContext';\nimport { useUser } from '../context/UserContext';"
)

# 2. Add UserContext properly inside component
code = code.replace(
    "const { user } = route.params;\n    const { theme, isDark, toggleTheme } = useTheme();",
    "const { userData, loginUser } = useUser();\n    const user = userData || route.params?.user;\n    const { theme, isDark, toggleTheme } = useTheme();"
)

# 3. Add loginUser inside useEffect on mount
mount_replace = """    useEffect(() => { 
        if (!userData && route.params?.user) loginUser(route.params.user);
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchInitialData(false);
        }, [user])
    );"""
code = code.replace("    useEffect(() => { fetchInitialData(); }, []);", mount_replace)

# 4. Modify fetchInitialData to take a showLoading parameter
code = code.replace(
    "const fetchInitialData = async () => {",
    "const fetchInitialData = async (showLoading = true) => {"
)
code = code.replace(
    "setLoading(true);",
    "if (showLoading) setLoading(true);"
)

# 5. Fix Array overwrite in handleKnown
old_handle_known = """                    // Yerine yeni kelime çek
                    const nextRes = await apiClient.get(`/get-my-words/${user.user_id}`);
                    setWords(Array.isArray(nextRes.data) ? nextRes.data : []);"""
new_handle_known = """                    // Sadece olmayan kelimeleri ekle (tek kelime push mantigi)
                    const nextRes = await apiClient.get(`/get-my-words/${user.user_id}?force_extra=1`);
                    const newArray = Array.isArray(nextRes.data) ? nextRes.data : [];
                    setWords(prev => {
                        const existingIds = prev.map(w => w.id);
                        const additions = newArray.filter(w => !existingIds.includes(w.id));
                        return [...prev, ...additions].slice(0, dailyGoal);
                    });"""
code = code.replace(old_handle_known, new_handle_known)

# 6. Step-Lock / Progress Clamp Fixes
code = code.replace(
    "{studyList.length >= dailyGoal && (",
    "{studyList.length > 0 && ("
)
code = code.replace(
    "ÖĞRENMEYE BAŞLA ➔",
    "ÖĞRENMEYE BAŞLA ({studyList.length}/{dailyGoal}) ➔"
)

# 7. Card Stack Logic for Review Words
old_review_ui = """                            {/* SRS TEKRARı */}
                            {reviewWords.length > 0 && (
                                <View style={{ marginTop: 30 }}>
                                    <Text style={[styles.listTitle, { color: theme.text }]}>🔄 Tekrar Zamanı (SRS)</Text>
                                    <Text style={[styles.srsSubtitle, { color: theme.textMuted }]}>Bugün hatıralamanı bekliyoruz.</Text>
                                    {reviewWords.map(item => renderReviewCard(item))}
                                </View>
                            )}"""

new_review_ui = """                            {/* SRS TEKRARı KART MANTIGI */}
                            {reviewWords.length > 0 && (() => {
                                const pending = reviewWords.filter(w => !w.reviewed_today);
                                const completed = reviewWords.length - pending.length;
                                return (
                                <View style={{ marginTop: 30 }}>
                                    <Text style={[styles.listTitle, { color: theme.text }]}>🔄 Tekrar Zamanı (SRS)</Text>
                                    <Text style={[styles.srsSubtitle, { color: theme.textMuted }]}>İlerleme: {completed} / {reviewWords.length} tamamlandı.</Text>
                                    {pending.length > 0 ? (
                                        renderReviewCard(pending[0])
                                    ) : (
                                        <Text style={{ color: theme.successText, fontWeight: 'bold' }}>Bugün bütün tekrarlarını bitirdin! 🎉</Text>
                                    )}
                                </View>
                                )
                            })()}"""
code = code.replace(old_review_ui, new_review_ui)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("success")
