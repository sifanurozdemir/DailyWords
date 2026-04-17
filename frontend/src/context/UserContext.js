import React, { createContext, useContext, useState } from 'react';

const UserContext = createContext();

export function UserProvider({ children }) {
    const [userData, setUserData] = useState(null);
    const [learnedCount, setLearnedCount] = useState(0);

    const loginUser = (data) => setUserData(data);
    const logoutUser = () => {
        setUserData(null);
        setLearnedCount(0);
    };

    const updateDailyGoal = (goal) => {
        setUserData(prev => ({ ...prev, daily_goal: goal }));
    };

    const updateCurrentLevel = (level) => {
        setUserData(prev => ({ ...prev, current_level: level }));
    };

    return (
        <UserContext.Provider value={{
            userData, loginUser, logoutUser,
            updateDailyGoal, updateCurrentLevel,
            learnedCount, setLearnedCount
        }}>
            {children}
        </UserContext.Provider>
    );
}

export const useUser = () => useContext(UserContext);
