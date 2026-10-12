import React from 'react';
import MedicalSettingsScreen from '../medical-dashboard/MedicalSettingsScreen';

/**
 * Therapy clients use the medical patient settings screen (the benchmark) in
 * its 'therapy' variant: Profile, Therapy, Security, Emergency, Billing, Legal.
 *
 * This used to be a separate, older screen that had drifted — fewer sections,
 * and a security card rendered INSIDE its horizontal tab strip, which covered
 * the tabs and pushed them far apart. One screen keeps both roles in step.
 */
export default function ClientSettingsScreen(props) {
  return <MedicalSettingsScreen {...props} variant="therapy" />;
}
