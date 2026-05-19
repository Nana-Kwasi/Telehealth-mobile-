import { parseCoords } from './homeCareGeo';

export function getNurseProfileGaps(nurse) {
  if (!nurse) return ['profile'];
  const gaps = [];
  if (!nurse.photoURL) gaps.push('profile photo');
  if (!String(nurse.bio || '').trim()) gaps.push('bio');
  if (!String(nurse.specialty || '').trim()) gaps.push('specialty');
  if (!parseCoords(nurse)) gaps.push('service location');
  if (nurse.yearsExperience == null || nurse.yearsExperience === '') gaps.push('years of experience');
  if (!String(nurse.phone || '').trim()) gaps.push('phone number');
  const fees = nurse.fees || {};
  if (!(Number(fees.daily) > 0)) gaps.push('daily fee');
  if (!String(nurse.licenseNumber || '').trim()) gaps.push('license number');
  return gaps;
}

export function isNurseProfileComplete(nurse) {
  return getNurseProfileGaps(nurse).length === 0;
}

export function nurseProfileCompleteMessage(nurse) {
  const gaps = getNurseProfileGaps(nurse);
  if (!gaps.length) return null;
  return `Complete your profile (${gaps.join(', ')}) so patients can find and book you.`;
}
