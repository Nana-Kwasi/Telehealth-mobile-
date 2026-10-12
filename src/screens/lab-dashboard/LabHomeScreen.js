import React from 'react';
import { View } from 'react-native';
import RoleAssistantMobile from '../../components/RoleAssistantMobile';
import { LabColors as C } from '../../constants/colors';
import DiagDashboardMobile from '../../components/diagnostics/DiagDashboardMobile';

// Lab dashboard home (parent and branch) — see components/diagnostics.
export default function LabHomeScreen({ profile }) {
  return (
    <View style={{ flex: 1 }}>
      <DiagDashboardMobile type="lab" profile={profile} isBranch={profile?.role === 'lab_branch'} colors={C} />
      <RoleAssistantMobile kind="lab" accent={C.primary} />
    </View>
  );
}
