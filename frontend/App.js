import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ThemeProvider } from './src/context/ThemeContext';
import { UserProvider } from './src/context/UserContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import StartTestScreen from './src/screens/StartTestScreen';
import PlacementTestScreen from './src/screens/PlacementTestScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import ContextReviewScreen from './src/screens/ContextReviewScreen';
import PenaltyGame from './src/screens/PenaltyGame'; // İçe aktarma zaten burada, harika!

const Stack = createStackNavigator();

export default function App() {
  return (
    <UserProvider>
      <ThemeProvider>
        <NavigationContainer>
          {/* headerShown: false sayesinde hiçbir ekranda çirkin üst başlık çıkmayacak */}
          <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Placement" component={PlacementTestScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="StartTest" component={StartTestScreen} />
            <Stack.Screen name="Practice" component={PracticeScreen} />
            <Stack.Screen name="ContextReview" component={ContextReviewScreen} />
            
            {/* YENİ EKLENEN KISIM: Oyun ekranımızı menüye (haritaya) kaydettik! */}
            <Stack.Screen name="PenaltyGame" component={PenaltyGame} />
            
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </UserProvider>
  );
}