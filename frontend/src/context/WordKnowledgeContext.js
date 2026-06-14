import React, { createContext, useContext, useState } from 'react';

const WordKnowledgeContext = createContext();

const initialWordState = {
  phoneme_score: null,
  l1_errors: [],
  veto_history: 0,
  game_accuracy: null,
  srs_interval: 1,
  mastery_level: 0
};

export function WordKnowledgeProvider({ children }) {
    const [wordStates, setWordStates] = useState({});

    const calculateMasteryLevel = (state) => {
        const { phoneme_score, l1_errors, game_accuracy } = state;
        
        if (phoneme_score !== null) {
            const hasL1Errors = l1_errors && l1_errors.length > 0;
            if (phoneme_score >= 85 && !hasL1Errors) {
                return 4;
            }
            if (phoneme_score >= 70) {
                return 3;
            }
            return 2;
        }
        
        if (game_accuracy !== null && game_accuracy > 0) {
            return 1;
        }
        
        return 0;
    };

    const updatePhonemeResult = (wordId, score, l1_errors = [], veto = false) => {
        setWordStates(prev => {
            const current = prev[wordId] || { ...initialWordState };
            const updated = {
                ...current,
                phoneme_score: score,
                l1_errors: l1_errors,
                veto_history: veto ? current.veto_history + 1 : current.veto_history
            };
            updated.mastery_level = calculateMasteryLevel(updated);
            return {
                ...prev,
                [wordId]: updated
            };
        });
    };

    const updateGameResult = (wordId, accuracy) => {
        setWordStates(prev => {
            const current = prev[wordId] || { ...initialWordState };
            const updated = {
                ...current,
                game_accuracy: accuracy
            };
            updated.mastery_level = calculateMasteryLevel(updated);
            return {
                ...prev,
                [wordId]: updated
            };
        });
    };

    const getMasteryColor = (wordId) => {
        const state = wordStates[wordId];
        const level = state ? state.mastery_level : 0;
        
        switch (level) {
            case 1:
                return '#f59e0b'; // amber
            case 2:
                return '#3b82f6'; // blue
            case 3:
                return '#8b5cf6'; // purple
            case 4:
                return '#10b981'; // green
            default:
                return '#64748b'; // grey
        }
    };

    const markReviewLater = (wordId, vetoCount) => {
        setWordStates(prev => {
            const current = prev[wordId] || { ...initialWordState };
            return {
                ...prev,
                [wordId]: {
                    ...current,
                    status: 'review_later',
                    vetoCount: vetoCount
                }
            };
        });
    };

    return (
        <WordKnowledgeContext.Provider value={{
            wordStates,
            updatePhonemeResult,
            updateGameResult,
            getMasteryColor,
            markReviewLater
        }}>
            {children}
        </WordKnowledgeContext.Provider>
    );
}

export function useWordKnowledge() {
    return useContext(WordKnowledgeContext);
}
