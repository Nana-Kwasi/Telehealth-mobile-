/** Age rules: teen 13–17, individual & couples 18+. */

export const TEEN_AGE_MIN = 13;
export const TEEN_AGE_MAX = 17;
export const ADULT_AGE_MIN = 18;

export function parseAgeYears(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const age = parseInt(String(value).trim(), 10);
  return Number.isNaN(age) ? NaN : age;
}

export function validateTeenAgeYears(ageValue) {
  const age = parseAgeYears(ageValue);
  if (Number.isNaN(age)) return 'Please select a valid age';
  if (age < TEEN_AGE_MIN) return 'Child must be at least 13 years old for teen therapy';
  if (age >= ADULT_AGE_MIN) {
    return 'Teen therapy is for ages 13–17. If you are 18 or older, please choose individual therapy.';
  }
  return null;
}

export function validateAdultAgeYears(ageValue) {
  const age = parseAgeYears(ageValue);
  if (Number.isNaN(age)) return 'Please select a valid age';
  if (age < ADULT_AGE_MIN) {
    return 'You must be at least 18 years old for individual or couples therapy';
  }
  return null;
}

export function validateTeenDateOfBirth(dob, calculateAgeFromDob) {
  if (!String(dob || '').trim()) return 'Date of birth is required';
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 'Please enter a valid date of birth';
  if (birthDate > new Date()) return 'Date of birth cannot be in the future';
  const age = parseAgeYears(calculateAgeFromDob(dob));
  return validateTeenAgeYears(age);
}

export function validateAdultDateOfBirth(dob, calculateAgeFromDob) {
  if (!String(dob || '').trim()) return 'Date of birth is required';
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 'Please enter a valid date of birth';
  if (birthDate > new Date()) return 'Date of birth cannot be in the future';
  const age = parseAgeYears(calculateAgeFromDob(dob));
  return validateAdultAgeYears(age);
}

export function getQuestionnaireAgeOptions(therapyType) {
  if (therapyType === 'teen') {
    return Array.from({ length: TEEN_AGE_MAX - TEEN_AGE_MIN + 1 }, (_, i) =>
      String(TEEN_AGE_MIN + i),
    );
  }
  const maxAge = 100;
  return Array.from({ length: maxAge - ADULT_AGE_MIN + 1 }, (_, i) =>
    String(ADULT_AGE_MIN + i),
  );
}

export function validateQuestionnaireAge(therapyType, ageValue) {
  if (therapyType === 'teen') return validateTeenAgeYears(ageValue);
  return validateAdultAgeYears(ageValue);
}
