# NessaHub Client Mobile App

React Native mobile application for Telehealth clients. This app handles client onboarding, login, and dashboard functionality.

## Features

- **Welcome Screen**: Choose therapy type (Individual, Couples, Teen)
- **Onboarding**: Multi-step questionnaire to match clients with therapists
- **Authentication**: Login with email/username
- **Dashboard**: Full client dashboard with:
  - Home screen with quick actions
  - Messages with therapist
  - Video call scheduling
  - Calendar view
  - Resources
  - Billing information
  - Settings
  - Support

## Technology Stack

- React Native with Expo
- Firebase (Auth, Firestore, Functions)
- React Navigation (Stack, Drawer)
- AsyncStorage for local data persistence

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Expo CLI
- Android Studio (for Android) or Xcode (for iOS)

### Installation

1. Navigate to the project directory:
   ```bash
   cd Telehealth-Client-Mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on device/simulator:
   ```bash
   # Android
   npm run android
   
   # iOS
   npm run ios
   ```

## Project Structure

```
src/
├── components/          # Reusable UI components (CustomDrawerContent)
├── constants/          # App constants (colors)
├── navigation/         # Navigation configuration
├── screens/           # App screens
│   ├── dashboard/     # Client dashboard screens
│   ├── WelcomeScreen.js
│   ├── LoginScreen.js
│   ├── QuestionnaireScreen.js
│   ├── SignUpScreen.js
│   ├── MatchTherapistScreen.js
│   └── PaymentScreen.js
└── services/          # Firebase and API services
```

## Notes

- This app is for clients only (not therapists)
- Uses the same Firebase backend as the web Telehealth project
- All client dashboard features from the web app are implemented
