import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ThemeProvider } from './src/context/ThemeContext';
import { UserProvider, useUser } from './src/context/UserContext';

// Ekran İçe Aktarmaları
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import StartTestScreen from './src/screens/StartTestScreen';
import PlacementTestScreen from './src/screens/PlacementTestScreen';
import PracticeScreen from './src/screens/PracticeScreen';
import ContextReviewScreen from './src/screens/ContextReviewScreen';
import PenaltyGame from './src/screens/PenaltyGame';
import RefactorGameScreen from './src/screens/RefactorGameScreen';
import RefactorStartScreen from './src/screens/RefactorStartScreen';
import BugHuntStartScreen from './src/screens/BugHuntStartScreen';
import BugHuntGame from './src/screens/BugHuntGame';
import StoryListScreen from './src/screens/StoryListScreen';
import StoryReaderScreen from './src/screens/StoryReaderScreen';
import SwipeGameStartScreen from './src/screens/SwipeGameStartScreen';
import SwipeGame from './src/screens/SwipeGame';

// YENİ: Penaltı Giriş Ekranı (O topun olduğu, 'Oynamaya Başla' butonu olan yer)
// Not: Bu dosyayı henüz oluşturmadıysan screens klasöründe oluşturmayı unutma!
import PenaltyStartScreen from './src/screens/PenaltyStartScreen'; 

const Stack = createStackNavigator();

function AppNavigator() {
  const { userData, isAppLoading } = useUser();

  if (isAppLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#00FF00" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName={userData ? "Home" : "Login"} 
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Placement" component={PlacementTestScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="StartTest" component={StartTestScreen} />
        <Stack.Screen name="Practice" component={PracticeScreen} />
        <Stack.Screen name="ContextReview" component={ContextReviewScreen} />
        
        {/* OYUN NAVİGASYON DÜZENİ */}
        <Stack.Screen name="PenaltyStart" component={PenaltyStartScreen} />
        <Stack.Screen name="PenaltyGame" component={PenaltyGame} />

        <Stack.Screen name="RefactorStart" component={RefactorStartScreen} />
        <Stack.Screen name="RefactorGame" component={RefactorGameScreen} options={{ headerShown: false }} /> 
        
        {/* Bug Hunt */}
        <Stack.Screen name="BugHuntStartScreen" component={BugHuntStartScreen} />
        <Stack.Screen name="BugHuntGame" component={BugHuntGame} options={{ headerShown: false }} />

        {/* Swipe Match */}
        <Stack.Screen name="SwipeGameStartScreen" component={SwipeGameStartScreen} />
        <Stack.Screen name="SwipeGame" component={SwipeGame} options={{ headerShown: false }} />
        
        {/* Stories */}
        <Stack.Screen name="StoryList" component={StoryListScreen} />
        <Stack.Screen name="StoryReader" component={StoryReaderScreen} options={{ headerShown: false, presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <UserProvider>
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </UserProvider>
  );
}