import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UserContext = createContext();

export function UserProvider({ children }) {
    const [userData, setUserData] = useState(null);
    const [learnedCount, setLearnedCount] = useState(0);
    const [isAppLoading, setIsAppLoading] = useState(true);

    useEffect(() => {
        loadUserFromStorage();
    }, []);

    const loadUserFromStorage = async () => {
        try {
            const storedUser = await AsyncStorage.getItem('@user_data');
            if (storedUser) {
                setUserData(JSON.parse(storedUser));
            }
        } catch (e) {
            console.log('Failed to load user', e);
        } finally {
            setIsAppLoading(false);
        }
    };

    const loginUser = async (data) => {
        setUserData(data);
        try {
            await AsyncStorage.setItem('@user_data', JSON.stringify(data));
        } catch (e) {
            console.log('Failed to save user', e);
        }
    };

    const logoutUser = async () => {
        setUserData(null);
        setLearnedCount(0);
        try {
            await AsyncStorage.removeItem('@user_data');
        } catch (e) {
            console.log('Failed to clear user', e);
        }
    };

    const updateDailyGoal = async (goal) => {
        setUserData(prev => {
            const next = { ...prev, daily_goal: goal };
            AsyncStorage.setItem('@user_data', JSON.stringify(next));
            return next;
        });
    };

    const updateCurrentLevel = async (level) => {
        setUserData(prev => {
            const next = { ...prev, current_level: level };
            AsyncStorage.setItem('@user_data', JSON.stringify(next));
            return next;
        });
    };

    const updateUserFields = async (fields) => {
        setUserData(prev => {
            const next = { ...prev, ...fields };
            AsyncStorage.setItem('@user_data', JSON.stringify(next));
            return next;
        });
    };

    return (
        <UserContext.Provider value={{
            userData, loginUser, logoutUser,
            updateDailyGoal, updateCurrentLevel, updateUserFields,
            learnedCount, setLearnedCount,
            isAppLoading
        }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => useContext(UserContext);
