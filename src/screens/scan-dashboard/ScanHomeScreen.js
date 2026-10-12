import React from 'react';
import { View } from 'react-native';
import RoleAssistantMobile from '../../components/RoleAssistantMobile';
import { ScanColors as C } from '../../constants/colors';
import DiagDashboardMobile from '../../components/diagnostics/DiagDashboardMobile';

// Scan dashboard home (parent and branch) — see components/diagnostics.
export default function ScanHomeScreen({ profile }) {
  return (
    <View style={{ flex: 1 }}>
      <DiagDashboardMobile type="scan" profile={profile} isBranch={profile?.role === 'scan_branch'} colors={C} />
      <RoleAssistantMobile kind="lab" accent={C.primary} />
    </View>
  );
}
