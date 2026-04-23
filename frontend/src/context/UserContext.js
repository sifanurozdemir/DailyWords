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
        const newData = { ...userData, daily_goal: goal };
        setUserData(newData);
        await AsyncStorage.setItem('@user_data', JSON.stringify(newData));
    };

    const updateCurrentLevel = async (level) => {
        const newData = { ...userData, current_level: level };
        setUserData(newData);
        await AsyncStorage.setItem('@user_data', JSON.stringify(newData));
    };

    return (
        <UserContext.Provider value={{
            userData, loginUser, logoutUser,
            updateDailyGoal, updateCurrentLevel,
            learnedCount, setLearnedCount,
            isAppLoading
        }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => useContext(UserContext);
