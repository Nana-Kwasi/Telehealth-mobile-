/**
 * The professional profile of a doctor or therapist: every field that matching
 * (and automatic transfer reassignment) reads, with the same rules the server
 * applies in ProviderProfileRules.java. One definition is used by the super
 * admin's User Management screen and by each clinician's own Settings, so what
 * the Profile Completeness screen asks for is always something these forms can fill.
 * The web app keeps an identical copy of this file; change both together.
 *
 * Storage: name, specialization, phone, location and bio are profile columns;
 * everything else lives in the profile's metadata JSON. Some screens read older
 * key names, so `toStorage` also writes those mirrors (experience/yearsExperience,
 * consultationFee/sessionRate, professionalType/type, careFormats/therapyType).
 */

export const CONSULT_TYPES = [
  { value: 'video', label: 'Video / audio' },
  { value: 'chat', label: 'Chat' },
  { value: 'inPerson', label: 'In person' },
];

// type: text | textarea | number | date | select | multi | list | bool | consultTypes
// options: a catalog key (resolved from /api/v1/care-catalog) or an inline array.
export const DOCTOR_FIELDS = [
  { section: 'Identity', key: 'fullName', label: 'Full name', type: 'text', required: true },
  { section: 'Identity', key: 'gender', label: 'Gender', type: 'select', options: 'genders', required: true },
  { section: 'Identity', key: 'phone', label: 'Phone number', type: 'text', required: true },
  { section: 'Practice and licence', key: 'specialization', label: 'Specialization', type: 'select', options: 'doctorSpecialties', required: true },
  { section: 'Practice and licence', key: 'licenseNumber', label: 'Licence number', type: 'text', required: true },
  { section: 'Practice and licence', key: 'licensingAuthority', label: 'Licensing authority', type: 'text', required: true, placeholder: 'e.g. Medical and Dental Council' },
  { section: 'Practice and licence', key: 'experience', label: 'Years of experience', type: 'number', required: true, min: 0, max: 70 },
  { section: 'Consultations', key: 'consultationFee', label: 'Consultation fee (GHS)', type: 'number', required: true, min: 1 },
  { section: 'Consultations', key: 'consultationTypes', label: 'Consultation types', type: 'consultTypes', required: true },
  { section: 'Consultations', key: 'languages', label: 'Languages', type: 'list', required: true, placeholder: 'English, Twi, Ga' },
  { section: 'Location', key: 'city', label: 'City or town', type: 'text', required: true },
  { section: 'Location', key: 'region', label: 'Region', type: 'text' },
  { section: 'Location', key: 'location', label: 'Practice address', type: 'text' },
  { section: 'About', key: 'bio', label: 'Biography', type: 'textarea', required: true },
  { section: 'About', key: 'education', label: 'Education', type: 'textarea', required: true },
  { section: 'About', key: 'qualifications', label: 'Qualifications', type: 'textarea', required: true },
];

export const THERAPIST_FIELDS = [
  { section: 'Identity', key: 'fullName', label: 'Full name', type: 'text', required: true },
  { section: 'Identity', key: 'gender', label: 'Gender', type: 'select', options: 'genders', required: true },
  { section: 'Identity', key: 'phone', label: 'Phone number', type: 'text' },
  { section: 'Identity', key: 'lgbtqiaAffirming', label: 'LGBTQ+ affirming', type: 'bool', required: true },
  { section: 'Who they see', key: 'professionalType', label: 'Professional type', type: 'select', options: 'therapistProfessionalTypes', required: true },
  { section: 'Who they see', key: 'careFormats', label: 'Kinds of client', type: 'multi', options: 'careFormats', required: true },
  { section: 'Who they see', key: 'focusAreas', label: 'Areas of focus', type: 'multi', options: 'therapyFocus', required: true },
  { section: 'Who they see', key: 'ageGroupsServed', label: 'Age groups served', type: 'multi', options: 'ageGroups', required: true },
  { section: 'Who they see', key: 'languagesSpoken', label: 'Languages spoken', type: 'list', required: true, placeholder: 'English, Twi' },
  { section: 'Licence', key: 'licenseNumber', label: 'Licence / registration number', type: 'text', required: true },
  { section: 'Licence', key: 'licensingAuthority', label: 'Licensing authority', type: 'text', required: true, placeholder: 'e.g. Ghana Psychology Council' },
  { section: 'Licence', key: 'licenseIssueDate', label: 'Licence issue date', type: 'date', required: true },
  { section: 'Licence', key: 'licenseExpiryDate', label: 'Licence expiry date', type: 'date', required: true },
  { section: 'Licence', key: 'yearsExperience', label: 'Years of experience', type: 'number', required: true, min: 0, max: 70 },
  { section: 'Sessions', key: 'consultationMode', label: 'Consultation mode', type: 'select', options: 'consultationModes', required: true },
  { section: 'Sessions', key: 'availability', label: 'Availability', type: 'text', required: true, placeholder: 'e.g. Mon–Fri, 9am–5pm' },
  { section: 'Sessions', key: 'sessionDuration', label: 'Session length (minutes)', type: 'number', required: true, min: 15, max: 240 },
  { section: 'Sessions', key: 'consultationFee', label: 'Session fee (GHS)', type: 'number', required: true, min: 1 },
  { section: 'Practice', key: 'practiceName', label: 'Practice name', type: 'text' },
  { section: 'Practice', key: 'practiceAddress', label: 'Practice address', type: 'text' },
  { section: 'Practice', key: 'city', label: 'City or town', type: 'text' },
  { section: 'Practice', key: 'region', label: 'Region', type: 'text' },
  { section: 'About', key: 'bio', label: 'Short biography', type: 'textarea', required: true },
  { section: 'About', key: 'education', label: 'Education', type: 'textarea', required: true },
  { section: 'About', key: 'workExperience', label: 'Previous work experience', type: 'textarea', required: true },
  { section: 'About', key: 'therapyApproaches', label: 'Therapy approaches', type: 'list', required: true, placeholder: 'CBT, DBT, person-centred' },
];

export const fieldsFor = (kind) => (kind === 'doctor' ? DOCTOR_FIELDS : THERAPIST_FIELDS);

const blank = (v) => v === undefined || v === null || String(v).trim() === '' || String(v).trim().toLowerCase() === 'null';
const asList = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (blank(v)) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
};
const optionValues = (opts) => (opts || []).map((o) => (typeof o === 'object' ? o.value : o));
const canonical = (opts, v) => {
  if (blank(v)) return null;
  const s = String(v).trim().toLowerCase();
  return optionValues(opts).find((o) => String(o).toLowerCase() === s) || null;
};

/** Build form values from a stored profile (columns + metadata). */
export function fromProfile(kind, profile = {}) {
  let meta = {};
  if (profile.metadata && typeof profile.metadata === 'object') meta = profile.metadata;
  else if (typeof profile.metadataJson === 'string') { try { meta = JSON.parse(profile.metadataJson) || {}; } catch { meta = {}; } }
  const src = { ...meta, ...Object.fromEntries(Object.entries(profile).filter(([, v]) => !blank(v))) };
  const v = {};
  fieldsFor(kind).forEach((f) => {
    let raw = src[f.key];
    if (f.key === 'fullName') raw = src.fullName || src.name;
    if (f.key === 'experience') raw = blank(src.experience) ? src.yearsExperience : src.experience;
    if (f.key === 'yearsExperience') raw = blank(src.yearsExperience) ? src.experience : src.yearsExperience;
    if (f.key === 'professionalType') raw = src.professionalType || src.type;
    if (f.key === 'consultationFee' && kind === 'therapist') raw = blank(src.consultationFee) ? src.sessionRate : src.consultationFee;
    if (f.key === 'languagesSpoken') raw = blank(src.languagesSpoken) ? src.languages : src.languagesSpoken;
    if (f.key === 'careFormats') raw = asList(src.careFormats).length ? src.careFormats : src.therapyType;
    if (f.key === 'city') raw = src.city || src.locationMeta?.city || src.geo?.city;
    if (f.key === 'region') raw = src.region || src.locationMeta?.region || src.geo?.region;
    if (f.type === 'multi' || f.type === 'list') v[f.key] = asList(raw);
    else if (f.type === 'bool') v[f.key] = raw === true || raw === 'true' || raw === 'yes' ? true : raw === false || raw === 'false' || raw === 'no' ? false : null;
    else if (f.type === 'consultTypes') v[f.key] = { video: false, chat: false, inPerson: false, ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) };
    else if (f.type === 'date') v[f.key] = blank(raw) ? '' : String(raw).slice(0, 10);
    else v[f.key] = blank(raw) ? '' : String(raw);
  });
  return { values: v, meta };
}

/** What is still missing — the same checks as the server's ProviderProfileRules. */
export function missingFields(kind, v, catalog = {}) {
  const p = [];
  const need = (key, label) => { if (blank(v[key])) p.push({ key, text: `${label} is required` }); };
  const num = (key, label, min, max) => {
    const n = Number(v[key]);
    if (blank(v[key]) || !Number.isFinite(n)) p.push({ key, text: `${label} is required` });
    else if (n < min || n > max) p.push({ key, text: `${label} must be between ${min} and ${max}` });
  };
  need('fullName', 'Full name');
  if (catalog.genders && !canonical(catalog.genders, v.gender)) p.push({ key: 'gender', text: `Gender must be one of: ${catalog.genders.join(', ')}` });
  if (kind === 'doctor') {
    if (catalog.doctorSpecialties && !canonical(catalog.doctorSpecialties, v.specialization)) p.push({ key: 'specialization', text: 'Choose a specialization from the list' });
    need('phone', 'Phone number');
    need('licenseNumber', 'Licence number');
    need('licensingAuthority', 'Licensing authority');
    num('experience', 'Years of experience', 0, 70);
    num('consultationFee', 'Consultation fee', 1, 1000000);
    if (!asList(v.languages).length) p.push({ key: 'languages', text: 'Languages are required' });
    if (!Object.values(v.consultationTypes || {}).some(Boolean)) p.push({ key: 'consultationTypes', text: 'Choose at least one consultation type' });
    if (blank(v.city) && blank(v.location)) p.push({ key: 'city', text: 'Location (city) is required' });
    need('bio', 'Biography');
    need('education', 'Education');
    need('qualifications', 'Qualifications');
  } else {
    if (catalog.therapistProfessionalTypes && !canonical(catalog.therapistProfessionalTypes, v.professionalType)) p.push({ key: 'professionalType', text: 'Choose a professional type from the list' });
    if (!asList(v.careFormats).length) p.push({ key: 'careFormats', text: 'Choose at least one kind of client they see (individual, couples, teen…)' });
    if (!asList(v.focusAreas).length) p.push({ key: 'focusAreas', text: 'Choose at least one area of focus' });
    if (typeof v.lgbtqiaAffirming !== 'boolean') p.push({ key: 'lgbtqiaAffirming', text: 'Say whether they are LGBTQ+ affirming' });
    if (!asList(v.ageGroupsServed).length) p.push({ key: 'ageGroupsServed', text: 'Choose the age groups they serve' });
    if (asList(v.careFormats).includes('teen') && !asList(v.ageGroupsServed).some((a) => a.toLowerCase() === 'adolescents')) {
      p.push({ key: 'ageGroupsServed', text: 'A therapist who sees teens must serve the Adolescents age group' });
    }
    if (!asList(v.languagesSpoken).length) p.push({ key: 'languagesSpoken', text: 'Languages spoken are required' });
    need('licenseNumber', 'Licence / registration number');
    need('licensingAuthority', 'Licensing authority');
    need('licenseIssueDate', 'Licence issue date');
    need('licenseExpiryDate', 'Licence expiry date');
    if (!blank(v.licenseIssueDate) && !blank(v.licenseExpiryDate) && v.licenseExpiryDate <= v.licenseIssueDate) p.push({ key: 'licenseExpiryDate', text: 'Licence expiry must be after the issue date' });
    if (!blank(v.licenseExpiryDate) && v.licenseExpiryDate < new Date().toISOString().slice(0, 10)) p.push({ key: 'licenseExpiryDate', text: 'The licence has expired' });
    num('yearsExperience', 'Years of experience', 0, 70);
    if (catalog.consultationModes && !canonical(catalog.consultationModes, v.consultationMode)) p.push({ key: 'consultationMode', text: `Consultation mode must be one of: ${catalog.consultationModes.join(', ')}` });
    need('availability', 'Availability');
    num('sessionDuration', 'Session length (minutes)', 15, 240);
    num('consultationFee', 'Session fee', 1, 1000000);
    need('bio', 'Short biography');
    need('education', 'Education');
    need('workExperience', 'Previous work experience');
    if (!asList(v.therapyApproaches).length) p.push({ key: 'therapyApproaches', text: 'Therapy approaches are required' });
  }
  return p;
}

/**
 * The PATCH body for /api/v1/doctors/{id} or /api/v1/therapists/{id}. Metadata
 * is replaced whole on the server, so it is always the stored metadata merged
 * with the edits — never only the edits.
 */
export function toStorage(kind, v, meta = {}, catalog = {}) {
  const m = { ...meta };
  const num = (x) => (blank(x) ? null : Number(x));
  fieldsFor(kind).forEach((f) => {
    if (f.type === 'number') m[f.key] = num(v[f.key]);
    else if (f.type === 'multi' || f.type === 'list') m[f.key] = asList(v[f.key]);
    else if (f.type === 'bool') m[f.key] = typeof v[f.key] === 'boolean' ? v[f.key] : null;
    else if (f.type === 'consultTypes') m[f.key] = { ...(v[f.key] || {}) };
    else m[f.key] = blank(v[f.key]) ? null : String(v[f.key]).trim();
  });
  m.name = m.fullName;
  if (kind === 'doctor') {
    m.yearsExperience = m.experience;
  } else {
    m.type = m.professionalType;
    m.therapyType = m.careFormats;
    m.languages = m.languagesSpoken;
    m.sessionRate = m.consultationFee;
    // Display labels of the focus areas, plus any extra specialties already stored.
    const focusLabels = (m.focusAreas || []).map((k) => (catalog.therapyFocus || []).find((o) => o.value === k)?.label || k);
    const allFocusLabels = (catalog.therapyFocus || []).map((o) => o.label);
    const extras = asList(meta.specialties).filter((s) => !allFocusLabels.includes(s));
    m.specialties = [...focusLabels, ...extras];
  }
  if (m.city || m.region) m.locationMeta = { ...(meta.locationMeta || {}), city: m.city || null, region: m.region || null };
  const body = {
    fullName: m.fullName || undefined,
    phone: m.phone ?? undefined,
    bio: m.bio ?? undefined,
    metadataJson: JSON.stringify(m),
  };
  if (kind === 'doctor') {
    body.specialization = m.specialization || undefined;
    body.location = m.location || [m.city, m.region].filter(Boolean).join(', ') || undefined;
  }
  return body;
}

export const profileUrl = (kind, id) => (kind === 'doctor' ? `/api/v1/doctors/${id}` : `/api/v1/therapists/${id}`);
