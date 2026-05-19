import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { HomeCareColors as HC } from '../constants/homeCareColors';
import { HomeCareNurseProvider } from '../contexts/HomeCareNurseContext';
import HomeCareNurseDrawerContent from '../components/HomeCareNurseDrawerContent';
import NurseNotificationsBell from '../components/home-care/NurseNotificationsBell';

import NurseHomeCareDashboardScreen from '../screens/home-care/nurse/NurseHomeCareDashboardScreen';
import NurseBookingsScreen from '../screens/home-care/nurse/NurseBookingsScreen';
import NurseAccountScreen from '../screens/home-care/nurse/NurseAccountScreen';
import NurseActiveVisitScreen from '../screens/home-care/nurse/NurseActiveVisitScreen';
import NurseVisitReportScreen from '../screens/home-care/nurse/NurseVisitReportScreen';
import { registerHomeCarePush } from '../services/homeCarePushService';

const Drawer = createDrawerNavigator();

function HomeCareNurseDrawerNavigator({ profile }) {
  React.useEffect(() => {
    if (profile?.id) registerHomeCarePush(profile.id, 'homeCareNurses');
  }, [profile?.id]);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <HomeCareNurseDrawerContent {...props} profile={profile} />}
      screenOptions={{
        headerStyle: { backgroundColor: HC.primaryDark },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        drawerStyle: { backgroundColor: HC.primaryDark, width: 288 },
        drawerActiveTintColor: '#99f6e4',
        drawerInactiveTintColor: 'rgba(255,255,255,0.7)',
        headerRight: () => (profile?.id ? <NurseNotificationsBell profileId={profile.id} /> : null),
      }}
      initialRouteName="NurseDashboard"
    >
      <Drawer.Screen name="NurseDashboard" options={{ title: 'Dashboard' }}>
        {(props) => <NurseHomeCareDashboardScreen {...props} profile={profile} />}
      </Drawer.Screen>
      <Drawer.Screen name="NurseBookings" options={{ title: 'Bookings' }}>
        {(props) => <NurseBookingsScreen {...props} profile={profile} />}
      </Drawer.Screen>
      <Drawer.Screen name="NurseAccount" options={{ title: 'Account' }}>
        {(props) => <NurseAccountScreen {...props} profile={profile} />}
      </Drawer.Screen>
      <Drawer.Screen
        name="NurseActiveVisit"
        component={NurseActiveVisitScreen}
        options={{ title: 'Active visit', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="NurseVisitReport"
        component={NurseVisitReportScreen}
        options={{ title: 'Visit report', drawerItemStyle: { display: 'none' } }}
      />
    </Drawer.Navigator>
  );
}

export default function HomeCareNurseNavigator({ profile }) {
  return (
    <HomeCareNurseProvider profile={profile}>
      <HomeCareNurseDrawerNavigator profile={profile} />
    </HomeCareNurseProvider>
  );
}
