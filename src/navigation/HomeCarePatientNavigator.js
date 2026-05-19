import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { HomeCareColors as HC } from '../constants/homeCareColors';

import HomeCarePatientDashboardScreen from '../screens/home-care/patient/HomeCarePatientDashboardScreen';
import HomeCareHomeScreen from '../screens/home-care/patient/HomeCareHomeScreen';
import HomeCareSearchScreen from '../screens/home-care/patient/HomeCareSearchScreen';
import HomeCareNurseListScreen from '../screens/home-care/patient/HomeCareNurseListScreen';
import HomeCareNurseProfileScreen from '../screens/home-care/patient/HomeCareNurseProfileScreen';
import HomeCareBookScreen from '../screens/home-care/patient/HomeCareBookScreen';
import HomeCareBookingStatusScreen from '../screens/home-care/patient/HomeCareBookingStatusScreen';
import HomeCareHistoryScreen from '../screens/home-care/patient/HomeCareHistoryScreen';
import HomeCareFeedbackScreen from '../screens/home-care/patient/HomeCareFeedbackScreen';
import HomeCareReportScreen from '../screens/home-care/patient/HomeCareReportScreen';
import HomeCareVisitSummaryScreen from '../screens/home-care/patient/HomeCareVisitSummaryScreen';
import HomeCareEmergencyScreen from '../screens/home-care/patient/HomeCareEmergencyScreen';
import HomeCareOngoingCareScreen from '../screens/home-care/patient/HomeCareOngoingCareScreen';
import HomeCareSignUpModalScreen from '../screens/home-care/patient/HomeCareSignUpModalScreen';

const Stack = createStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: HC.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

export default function HomeCarePatientNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...screenOptions,
        headerStyle: { backgroundColor: HC.primary },
        headerTintColor: '#fff',
      }}
      initialRouteName="HomeCarePatientDashboard"
    >
      <Stack.Screen
        name="HomeCarePatientDashboard"
        component={HomeCarePatientDashboardScreen}
        options={{
          title: 'My Home Care',
          headerBackVisible: false,
          headerShown: false,
        }}
      />
      <Stack.Screen name="HomeCareHome" component={HomeCareHomeScreen} options={{ title: 'Find nurses' }} />
      <Stack.Screen name="HomeCareSearch" component={HomeCareSearchScreen} options={{ title: 'Search nurses' }} />
      <Stack.Screen name="HomeCareNurseList" component={HomeCareNurseListScreen} options={({ route }) => ({ title: route.params?.title || 'Nurses' })} />
      <Stack.Screen name="HomeCareNurseProfile" component={HomeCareNurseProfileScreen} options={{ title: 'Nurse profile' }} />
      <Stack.Screen name="HomeCareBook" component={HomeCareBookScreen} options={{ title: 'Book visit' }} />
      <Stack.Screen name="HomeCareBookingStatus" component={HomeCareBookingStatusScreen} options={{ title: 'Booking status' }} />
      <Stack.Screen name="HomeCareHistory" component={HomeCareHistoryScreen} options={{ title: 'Visit history' }} />
      <Stack.Screen name="HomeCareFeedback" component={HomeCareFeedbackScreen} options={{ title: 'Rate visit' }} />
      <Stack.Screen name="HomeCareReport" component={HomeCareReportScreen} options={{ title: 'Report issue' }} />
      <Stack.Screen name="HomeCareVisitSummary" component={HomeCareVisitSummaryScreen} options={{ title: 'Visit summary' }} />
      <Stack.Screen name="HomeCareEmergency" component={HomeCareEmergencyScreen} options={{ title: 'Emergency' }} />
      <Stack.Screen name="HomeCareOngoingCare" component={HomeCareOngoingCareScreen} options={{ title: 'Ongoing care' }} />
      <Stack.Screen
        name="HomeCareSignUpModal"
        component={HomeCareSignUpModalScreen}
        options={{ presentation: 'transparentModal', headerShown: false }}
      />
    </Stack.Navigator>
  );
}
