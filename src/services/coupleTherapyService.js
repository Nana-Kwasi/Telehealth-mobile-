import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, functions, httpsCallable } from './firebaseConfig';
import { COUPLE_STATUSES, COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import { sectionsForPartner } from '../constants/coupleIntakeSections';
import { validateAdultDateOfBirth } from '../constants/therapyAgeValidation';

export function partnerDocRef(coupleId, partnerKey) {
  return doc(db, 'couples', coupleId, 'private', partnerKey);
}

export function coupleDocRef(coupleId) {
  return doc(db, 'couples', coupleId);
}

export async function createCoupleRegistration(payload) {
  const fn = httpsCallable(functions, 'createCoupleRegistration');
  const { data } = await fn(payload);
  return data;
}

export async function linkCouplePartnerAccount(coupleId, partnerKey, { clientId, name }) {
  const fn = httpsCallable(functions, 'linkCouplePartnerAccount');
  const { data } = await fn({ coupleId, partnerKey, clientId, name });
  return data;
}

export async function fetchCoupleByInviteToken(token) {
  const fn = httpsCallable(functions, 'getCoupleInviteByToken');
  const { data } = await fn({ token });
  return data;
}

export async function sendPartnerBInvitation(coupleId) {
  const fn = httpsCallable(functions, 'sendCouplePartnerInvitation');
  const { data } = await fn({ coupleId });
  return data;
}

export async function loadCouple(coupleId) {
  const snap = await getDoc(coupleDocRef(coupleId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function loadPartnerPrivate(coupleId, partnerKey) {
  const snap = await getDoc(partnerDocRef(coupleId, partnerKey));
  if (!snap.exists()) return {};
  return snap.data();
}

function coupleDraftKey(coupleId, partnerKey) {
  return `th.coupleDraft_${coupleId}_${partnerKey}`;
}

export async function loadLocalCoupleDraft(coupleId, partnerKey) {
  try {
    const raw = await AsyncStorage.getItem(coupleDraftKey(coupleId, partnerKey));
    return raw ? JSON.parse(raw) : { sections: {} };
  } catch {
    return { sections: {} };
  }
}

export async function loadSectionData(coupleId, partnerKey, section) {
  let fromServer = {};
  try {
    const privateData = await loadPartnerPrivate(coupleId, partnerKey);
    fromServer = privateData.sections?.[section.id] || {};
  } catch {
    /* private read may fail until linked */
  }
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  const fromDraft = draft.sections?.[section.id] || {};
  return { ...fromServer, ...fromDraft };
}

/** Pull Firestore sections into local draft so resume works across devices. */
export async function syncLocalCoupleDraftFromServer(coupleId, partnerKey) {
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    if (!priv?.sections || Object.keys(priv.sections).length === 0) return;
    const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
    draft.sections = { ...(draft.sections || {}), ...priv.sections };
    await AsyncStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

/** Prefill personal section from registration (name/email already collected earlier). */
export async function enrichCoupleIntakePersonalSection(coupleId, partnerKey, form = {}) {
  const merged = { ...form };
  const user = auth.currentUser;

  if (!merged.fullName?.trim()) {
    const storedName = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myPartnerName);
    let profileName = '';
    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      if (profileStr) {
        const p = JSON.parse(profileStr);
        profileName = (p.name || p.displayName || p.clientName || '').trim();
      }
    } catch {
      /* ignore */
    }
    const userName = (await AsyncStorage.getItem('userName')) || '';

    let coupleName = '';
    if (coupleId) {
      try {
        const couple = await loadCouple(coupleId);
        coupleName = (couple?.[partnerKey]?.name || '').trim();
      } catch {
        /* ignore */
      }
    }

    let authName = '';
    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, 'auth', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          authName = (d.name || d.displayName || d.clientName || '').trim();
        }
      } catch {
        /* ignore */
      }
    }

    merged.fullName =
      storedName?.trim() ||
      profileName ||
      userName.trim() ||
      authName ||
      (user?.displayName || '').trim() ||
      coupleName ||
      '';
  }

  if (!merged.email?.trim()) {
    merged.email =
      user?.email?.trim() ||
      (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myRegistrationEmail)) ||
      '';
  }

  if (merged.dateOfBirth) {
    merged.age = calculateAgeFromDob(merged.dateOfBirth);
  }
  return merged;
}

export async function savePartnerSection(coupleId, partnerKey, sectionId, sectionData) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  draft.sections[sectionId] = sectionData;
  await AsyncStorage.setItem(coupleDraftKey(coupleId, partnerKey), JSON.stringify(draft));

  try {
    const fn = httpsCallable(functions, 'saveCouplePartnerIntake');
    await fn({ coupleId, partnerKey, sectionId, sectionData });
  } catch (e) {
    console.warn('saveCouplePartnerIntake:', e?.message);
  }
}

export async function markPartnerIntakeComplete(coupleId, partnerKey) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  const fn = httpsCallable(functions, 'completeCouplePartnerIntake');
  const { data } = await fn({ coupleId, partnerKey, sections: draft.sections });
  await AsyncStorage.removeItem(coupleDraftKey(coupleId, partnerKey));
  return data;
}

export function isTherapistSelectionUnlocked(couple) {
  if (!couple) return false;
  return (
    couple.therapistSelectionUnlocked === true ||
    couple.status === COUPLE_STATUSES.READY_FOR_THERAPIST ||
    couple.status === COUPLE_STATUSES.THERAPIST_PENDING_CONFIRM ||
    couple.status === COUPLE_STATUSES.THERAPIST_SELECTED
  );
}

export function isPaymentAllowed(couple) {
  return isTherapistSelectionUnlocked(couple) && !couple?.paymentComplete;
}

export function canBrowseTherapists(couple) {
  return isTherapistSelectionUnlocked(couple) && couple?.paymentComplete === true;
}

export async function linkCouplePartnerAuth(coupleId, partnerKey, { authUid, clientId, name }) {
  await linkCouplePartnerAccount(coupleId, partnerKey, {
    clientId: clientId || authUid,
    name,
  });
}

export async function clearCoupleLocalSession() {
  await Promise.all(
    Object.values(COUPLE_STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key)),
  );
}

async function callClaimCoupleSession(coupleIdHint, claimAs) {
  const fn = httpsCallable(functions, 'claimCoupleSession');
  const { data } = await fn({ coupleId: coupleIdHint || undefined, claimAs });
  return data;
}

export function waitForAuthUser(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('Auth session not ready'));
    }, timeoutMs);
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        clearTimeout(timer);
        unsub();
        resolve(user);
      }
    });
  });
}

export async function getAuthCoupleHints() {
  try {
    const user = auth.currentUser || (await waitForAuthUser());
    const snap = await getDoc(doc(db, 'auth', user.uid));
    if (!snap.exists()) return {};
    const d = snap.data();
    return {
      coupleId: d.coupleId || null,
      partnerRole: d.couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA',
    };
  } catch {
    return {};
  }
}

async function applyClaimToStorage(data) {
  await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, data.coupleId);
  await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, data.partnerRole);
  if (data.registeredEmail) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myRegistrationEmail, data.registeredEmail);
  }
  if (data.otherPartnerName) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.otherPartnerName, data.otherPartnerName);
  }
  if (data.coupleId && data.partnerRole) {
    try {
      const couple = await loadCouple(data.coupleId);
      const name = (couple?.[data.partnerRole]?.name || '').trim();
      if (name) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, name);
    } catch {
      /* ignore */
    }
  }
  if (data.intakeComplete) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
  } else {
    await AsyncStorage.removeItem(COUPLE_STORAGE_KEYS.myIntakeComplete);
  }
}

async function partnerClaimKey() {
  const role = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole);
  return role === 'partnerB' ? 'partnerB' : 'partnerA';
}

/**
 * Links signed-in user to couple by email; syncs storage.
 * @returns {Promise<{ok:boolean, coupleId?:string, partnerRole?:string, reason?:string, message?:string, ...}>}
 */
export async function ensureCoupleSession(coupleIdHint, options = {}) {
  let user;
  try {
    user = auth.currentUser || (await waitForAuthUser());
  } catch {
    return { ok: false, reason: 'not_signed_in', message: 'Please sign in first.' };
  }

  const claimAs =
    options.claimAs === 'partnerB'
      ? 'partnerB'
      : options.claimAs === 'partnerA'
        ? 'partnerA'
        : await partnerClaimKey();
  try {
    let data = await callClaimCoupleSession(coupleIdHint, claimAs);

    if (!data?.linked && data?.reason === 'email_mismatch') {
      await clearCoupleLocalSession();
      data = await callClaimCoupleSession(undefined, claimAs);
    }

    if (!data?.linked && data?.reason === 'link_failed') {
      const hints = await getAuthCoupleHints();
      const repairCoupleId = coupleIdHint || hints.coupleId;
      if (repairCoupleId) {
        try {
          await linkCouplePartnerAccount(repairCoupleId, claimAs, { clientId: user.uid });
          data = await callClaimCoupleSession(repairCoupleId, claimAs);
        } catch (repairErr) {
          console.warn('ensureCoupleSession link repair:', repairErr?.message);
        }
      }
    }

    if (!data?.linked) {
      if (data?.reason === 'no_couple_for_email') {
        return {
          ok: false,
          reason: data.reason,
          message:
            'No couple registration found for this email. Use the same email you entered when starting couple therapy.',
        };
      }
      if (data?.reason === 'email_mismatch') {
        return {
          ok: false,
          reason: data.reason,
          message: `This couple was registered with different emails (Partner A: ${data.partnerAEmail || '—'}, Partner B: ${data.partnerBEmail || '—'}). You are signed in as ${data.signedInEmail || user.email}.`,
        };
      }
      if (data?.reason === 'link_failed') {
        return {
          ok: false,
          reason: data.reason,
          message:
            'We found your couple registration but could not attach it to this login. Sign out, then sign in with the same email you used when you started couple therapy.',
        };
      }
      return { ok: false, reason: data.reason, message: 'Could not link your couple account.' };
    }

    await applyClaimToStorage(data);

    return {
      ok: true,
      coupleId: data.coupleId,
      partnerRole: data.partnerRole,
      intakeComplete: !!data.intakeComplete,
      inviteUrl: data.inviteUrl,
      otherPartnerName: data.otherPartnerName,
      partnerAIntakeComplete: data.partnerAIntakeComplete,
      partnerBIntakeComplete: data.partnerBIntakeComplete,
      therapistSelectionUnlocked: data.therapistSelectionUnlocked,
      paymentComplete: data.paymentComplete,
      therapistId: data.therapistId || null,
    };
  } catch (e) {
    return { ok: false, reason: 'error', message: mapCoupleCallableError(e) };
  }
}

/** @deprecated use ensureCoupleSession */
export async function ensureCouplePartnerLinked(coupleId, partnerKey) {
  const claimAs = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  return ensureCoupleSession(coupleId, { claimAs });
}

export async function isCoupleIntakeDoneLocally() {
  return (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
}

export async function syncCoupleSessionFromProfile(profile) {
  if (!profile) return;
  if (profile.coupleId) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, profile.coupleId);
  if (profile.couplePartnerRole) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, profile.couplePartnerRole);
  }
  const regName = (profile.name || profile.displayName || profile.clientName || '').trim();
  if (regName) await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myPartnerName, regName);
  if (profile.coupleIntakeComplete === true) {
    await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');
  }
}

export function mapCoupleCallableError(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  if (code === 'functions/internal' || msg === 'internal') {
    return 'Could not load couple status from the server. Your intake progress is still saved locally.';
  }
  if (/permission|insufficient|not linked|not a couple/i.test(msg)) {
    return 'Could not verify your couple account. Sign out, sign in with the email you used when starting couple registration, then retry.';
  }
  return msg;
}

export async function buildLocalWaitingFallback(coupleId) {
  const partnerName =
    (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName)) || 'your partner';
  const intakeDone = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
  if (!coupleId || !intakeDone) return null;
  return {
    myRole: 'partnerA',
    couple: {
      id: coupleId,
      status: COUPLE_STATUSES.AWAITING_PARTNER_B,
      partnerA: { intakeComplete: true, consentComplete: true },
      partnerB: { intakeComplete: false, name: partnerName },
    },
    otherPartnerName: partnerName,
    waitingForPartner: true,
    inviteUrl: null,
    _localFallback: true,
  };
}

export async function enrichCoupleProfile(profile) {
  const merged = { ...(profile || {}) };
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.therapyType === 'couples') merged.therapyType = 'couples';
    if (onboard.coupleId && !merged.coupleId) merged.coupleId = onboard.coupleId;
  } catch {
    /* ignore */
  }
  if (!merged.coupleId) {
    const stored = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
    if (stored) merged.coupleId = stored;
  }
  return merged;
}

export async function getCoupleIdHint(profile) {
  if (profile?.coupleId) return profile.coupleId;
  const stored = await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId);
  if (stored) return stored;
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.coupleId) return onboard.coupleId;
  } catch {
    /* ignore */
  }
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const authSnap = await getDoc(doc(db, 'auth', user.uid));
    if (authSnap.exists() && authSnap.data().coupleId) return authSnap.data().coupleId;
  } catch {
    /* ignore */
  }
  return null;
}

export async function isCouplesClient(profile) {
  if (profile?.therapyType === 'couples' || profile?.coupleId) return true;
  try {
    const onboard = JSON.parse((await AsyncStorage.getItem('th.onboard')) || '{}');
    if (onboard.therapyType === 'couples') return true;
  } catch {
    /* ignore */
  }
  return !!(await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
}

function partnerKeyFromProfile(profile, sessionRole) {
  if (sessionRole === 'partnerB' || sessionRole === 'partnerA') return sessionRole;
  if (profile?.couplePartnerRole === 'partnerB') return 'partnerB';
  return 'partnerA';
}

function coupleNavStateFromClaim(data) {
  if (!data || data.partnerAIntakeComplete === undefined) return null;
  return {
    partnerAIntakeComplete: !!data.partnerAIntakeComplete,
    partnerBIntakeComplete: !!data.partnerBIntakeComplete,
    therapistSelectionUnlocked: !!data.therapistSelectionUnlocked,
    paymentComplete: !!data.paymentComplete,
    therapistId: data.therapistId || null,
  };
}

/** Mobile screen + params for couple onboarding funnel. */
export function resolveCoupleFunnelScreen(coupleId, partnerKey, navState) {
  const partnerRole = partnerKey === 'partnerB' ? 'partnerB' : 'partnerA';
  const params = { coupleId, partnerRole };
  const myDone =
    partnerKey === 'partnerA' ? navState.partnerAIntakeComplete : navState.partnerBIntakeComplete;

  if (!myDone) {
    return { screen: 'CoupleIntake', params };
  }
  if (!navState.partnerAIntakeComplete || !navState.partnerBIntakeComplete) {
    if (partnerKey === 'partnerA') return { screen: 'CoupleWaitingPartner', params: { coupleId } };
    return { screen: 'CoupleDashboard', params: { coupleId } };
  }
  if (!navState.therapistSelectionUnlocked) {
    return { screen: 'CoupleDashboard', params: { coupleId } };
  }
  if (!navState.paymentComplete) {
    return { screen: 'Payment', params: { coupleId, therapyType: 'couples' } };
  }
  if (navState.therapistId) {
    return { screen: 'Main', params: {} };
  }
  return { screen: 'MatchTherapist', params: { coupleId, therapyType: 'couples' } };
}

/**
 * Where couple partner should land after login / app resume.
 * @returns {Promise<{screen:string, params:object}|null>}
 */
export async function resolveCoupleLandingScreen(profile) {
  const enriched = await enrichCoupleProfile(profile);
  await syncCoupleSessionFromProfile(enriched);
  const hint = await getCoupleIdHint(enriched);
  const likelyCouple = (await isCouplesClient(enriched)) || !!hint;
  const claimAs = enriched?.couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA';

  if (!likelyCouple) {
    const probe = await ensureCoupleSession(undefined, { claimAs });
    if (!probe.ok) return null;
  }

  const session = await ensureCoupleSession(hint || undefined, { claimAs });
  if (!session.ok) {
    if (!likelyCouple && session.reason === 'no_couple_for_email') return null;

    const coupleId = hint || enriched?.coupleId;
    if (coupleId) {
      const partnerKey = partnerKeyFromProfile(enriched, null);
      await AsyncStorage.multiSet([
        [COUPLE_STORAGE_KEYS.coupleId, coupleId],
        [COUPLE_STORAGE_KEYS.partnerRole, partnerKey],
      ]);
      return { screen: 'CoupleIntake', params: { coupleId, partnerRole: partnerKey } };
    }
    if (session.reason === 'no_couple_for_email') return null;
    return { screen: 'CoupleInitiation', params: {} };
  }

  const coupleId = session.coupleId;
  const partnerKey = partnerKeyFromProfile(enriched, session.partnerRole);

  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) {
    return resolveCoupleFunnelScreen(coupleId, partnerKey, navFromClaim);
  }

  if (!session.intakeComplete && !(await isCoupleIntakeDoneLocally())) {
    return { screen: 'CoupleIntake', params: { coupleId, partnerRole: partnerKey } };
  }

  try {
    const navState = await resolveCoupleNavState(coupleId);
    return resolveCoupleFunnelScreen(coupleId, partnerKey, navState);
  } catch {
    return { screen: 'CoupleDashboard', params: { coupleId, partnerRole: partnerKey } };
  }
}

function stackRootNavigation(navigation) {
  let nav = navigation;
  while (nav.getParent?.()) nav = nav.getParent();
  return nav;
}

/** Redirect to couple intake / waiting / payment if onboarding incomplete. Returns true if redirected. */
export async function applyCoupleLandingIfNeeded(navigation, profile, options = {}) {
  const landing = await resolveCoupleLandingScreen(profile);
  if (!landing || landing.screen === 'Main') return false;
  const current = navigation.getState?.();
  const currentRoute = current?.routes?.[current.index]?.name;
  if (options.allowCoupleDashboard && currentRoute === 'CoupleDashboard' && landing.screen === 'CoupleWaitingPartner') {
    return false;
  }
  stackRootNavigation(navigation).replace(landing.screen, landing.params);
  return true;
}

async function resolveCoupleNavState(coupleId, completionResult) {
  if (completionResult?.partnerAIntakeComplete != null) {
    return {
      partnerAIntakeComplete: completionResult.partnerAIntakeComplete,
      partnerBIntakeComplete: completionResult.partnerBIntakeComplete,
      therapistSelectionUnlocked: completionResult.therapistSelectionUnlocked,
      paymentComplete: completionResult.paymentComplete,
      therapistId: completionResult.therapistId,
    };
  }

  const session = await ensureCoupleSession(coupleId);
  const navFromClaim = coupleNavStateFromClaim(session);
  if (navFromClaim) return navFromClaim;

  try {
    const dash = await fetchCoupleDashboard(coupleId, { skipEnsure: true });
    const c = dash.couple;
    return {
      partnerAIntakeComplete: !!c.partnerA?.intakeComplete,
      partnerBIntakeComplete: !!c.partnerB?.intakeComplete,
      therapistSelectionUnlocked: !!c.therapistSelectionUnlocked,
      paymentComplete: !!c.paymentComplete,
      therapistId: c.therapistId || null,
    };
  } catch {
    const couple = await loadCouple(coupleId);
    if (!couple) throw new Error('Could not load couple status.');
    return {
      partnerAIntakeComplete: !!couple.partnerA?.intakeComplete,
      partnerBIntakeComplete: !!couple.partnerB?.intakeComplete,
      therapistSelectionUnlocked: isTherapistSelectionUnlocked(couple),
      paymentComplete: !!couple.paymentComplete,
      therapistId: couple.therapistId || null,
    };
  }
}

export async function getCoupleMatchedTherapists(coupleId) {
  const fn = httpsCallable(functions, 'getCoupleMatchedTherapists');
  const { data } = await fn({ coupleId });
  return data;
}

export async function proposeCoupleTherapist(coupleId, therapistId, therapistName) {
  const fn = httpsCallable(functions, 'proposeCoupleTherapist');
  const { data } = await fn({ coupleId, therapistId, therapistName });
  return data;
}

export async function confirmCoupleTherapist(coupleId, accept = true) {
  const fn = httpsCallable(functions, 'confirmCoupleTherapist');
  const { data } = await fn({ coupleId, accept });
  return data;
}

export async function markCouplePaymentComplete(coupleId, plan) {
  const fn = httpsCallable(functions, 'markCouplePaymentComplete');
  const { data } = await fn({ coupleId, plan });
  return data;
}

export async function getCoupleDashboard(coupleId, claimAs) {
  const fn = httpsCallable(functions, 'getCoupleDashboard');
  const role = claimAs || (await partnerClaimKey());
  const { data } = await fn({ coupleId, claimAs: role });
  return data;
}

async function buildDashboardFromSession(session, coupleId) {
  const myRole = session.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
  const otherName =
    session.otherPartnerName ||
    (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.otherPartnerName)) ||
    'your partner';
  const mineDone = !!session.intakeComplete;
  return {
    couple: {
      id: coupleId,
      status: COUPLE_STATUSES.AWAITING_PARTNER_B,
      therapistSelectionUnlocked: false,
      paymentComplete: false,
      partnerA: {
        name: myRole === 'partnerA' ? '' : otherName,
        intakeComplete: myRole === 'partnerA' ? mineDone : false,
        consentComplete: myRole === 'partnerA' ? mineDone : false,
      },
      partnerB: {
        name: myRole === 'partnerB' ? '' : otherName,
        intakeComplete: myRole === 'partnerB' ? mineDone : false,
        consentComplete: myRole === 'partnerB' ? mineDone : false,
      },
    },
    myRole,
    otherPartnerName: otherName,
    waitingForPartner: true,
    inviteUrl: session.inviteUrl || null,
    _sessionFallback: true,
  };
}

function buildDashboardFromCoupleDoc(couple) {
  const uid = auth.currentUser?.uid;
  const isA = couple.partnerA?.authUid === uid;
  const isB = couple.partnerB?.authUid === uid;
  if (!isA && !isB) {
    throw new Error('Your account is not linked to this couple registration yet.');
  }
  const partnerKey = isA ? 'partnerA' : 'partnerB';
  const otherKey = isA ? 'partnerB' : 'partnerA';
  return {
    couple: {
      id: couple.id,
      status: couple.status,
      relationshipType: couple.relationshipType,
      therapistSelectionUnlocked: couple.therapistSelectionUnlocked,
      paymentComplete: couple.paymentComplete,
      therapistId: couple.therapistId,
      therapistName: couple.therapistName,
      therapistProposal: couple.therapistProposal,
      partnerA: {
        name: couple.partnerA?.name,
        intakeComplete: couple.partnerA?.intakeComplete,
        consentComplete: couple.partnerA?.consentComplete,
      },
      partnerB: {
        name: couple.partnerB?.name,
        intakeComplete: couple.partnerB?.intakeComplete,
        consentComplete: couple.partnerB?.consentComplete,
      },
    },
    myRole: partnerKey,
    otherPartnerName: couple[otherKey]?.name,
    waitingForPartner: !couple[otherKey]?.intakeComplete,
    inviteUrl: couple.partnerB?.inviteUrl || null,
  };
}

export async function fetchCoupleDashboard(coupleId, { skipEnsure = false } = {}) {
  const session = skipEnsure
    ? { ok: true, coupleId, partnerRole: await partnerClaimKey() }
    : await ensureCoupleSession(coupleId);
  const activeId = session.coupleId || coupleId;
  if (!session.ok) {
    const fallback = await buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    throw new Error(session.message || 'Could not verify couple account.');
  }
  const claimAs = session.partnerRole || (await partnerClaimKey());

  try {
    return await getCoupleDashboard(activeId, claimAs);
  } catch (callableErr) {
    try {
      const couple = await loadCouple(activeId);
      if (couple) return buildDashboardFromCoupleDoc(couple);
    } catch {
      // Firestore rules may block until linked
    }
    const fallback = await buildLocalWaitingFallback(activeId);
    if (fallback) return fallback;
    if (session.ok) {
      return buildDashboardFromSession(session, activeId);
    }
    throw new Error(mapCoupleCallableError(callableErr));
  }
}

export function isSectionDataComplete(section, data) {
  if (!data || typeof data !== 'object') return false;
  return Object.keys(validateSection(section, data)).length === 0;
}

/** First section that is not fully saved (resume intake). Uses validation, not just non-empty objects. */
export async function findResumeSectionIndex(coupleId, partnerKey, sections) {
  const draft = await loadLocalCoupleDraft(coupleId, partnerKey);
  let saved = { ...(draft.sections || {}) };
  try {
    const priv = await loadPartnerPrivate(coupleId, partnerKey);
    saved = { ...saved, ...(priv.sections || {}) };
  } catch {
    // private read may fail until linked
  }
  for (let i = 0; i < sections.length; i++) {
    if (!isSectionDataComplete(sections[i], saved[sections[i].id] || {})) {
      return i;
    }
  }
  return Math.max(0, sections.length - 1);
}

export function isMyCoupleIntakeComplete(dashboardData) {
  if (!dashboardData?.couple || !dashboardData?.myRole) return false;
  const p = dashboardData.couple[dashboardData.myRole];
  return p?.intakeComplete === true && p?.consentComplete === true;
}

export function calculateAgeFromDob(dob) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob).trim())) return '';
  const today = new Date();
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

export function validateSection(section, form) {
  const errors = {};
  for (const field of section.fields) {
    if (field.readOnly) continue;
    if (field.type === 'consent_check') {
      if (field.required && !form[field.name]) errors[field.name] = 'Required';
      continue;
    }
    if (field.type === 'signature') {
      if (field.required && !String(form[field.name] || '').trim()) errors[field.name] = 'Signature is required';
      continue;
    }

    if (field.name === 'previousCoupleOutcome' && form.previousCoupleCounselling !== 'Yes') {
      continue;
    }
    if (field.name === 'treatmentObjectivesOther') {
      const selected = form.treatmentObjectives || [];
      if (!Array.isArray(selected) || !selected.some((v) => /other/i.test(v))) continue;
    }
    if (field.name === 'infidelityWho' && form.infidelity === 'No') {
      continue;
    }

    if (!field.required) continue;
    const val = form[field.name];
    if (field.type === 'multiselect') {
      if (!Array.isArray(val) || val.length === 0) errors[field.name] = 'Required';
    } else if (field.type === 'scale') {
      if (val === undefined || val === null || val === '') errors[field.name] = 'Required';
    } else if (field.type === 'number') {
      if (val === '' || val === undefined || val === null) errors[field.name] = 'Required';
    } else if (field.type === 'birthdate' || field.type === 'date') {
      if (!String(val || '').trim()) {
        errors[field.name] = 'Required';
      } else if (field.name === 'dateOfBirth') {
        const ageErr = validateAdultDateOfBirth(val, calculateAgeFromDob);
        if (ageErr) errors[field.name] = ageErr;
      }
    } else if (!val && val !== 0) {
      errors[field.name] = 'Required';
    }
  }
  return errors;
}

export async function createPartnerClientRecord(coupleId, partnerKey, partnerEmail, displayName, authUid) {
  if (!authUid) throw new Error('authUid is required to create a client profile');
  const clientId = authUid;
  await setDoc(doc(db, 'clients', clientId), {
    authUid,
    therapyType: 'couples',
    coupleId,
    couplePartnerRole: partnerKey,
    email: partnerEmail,
    displayName,
    clientName: displayName,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  return clientId;
}

function postIntakeFallbackScreen(coupleId, partnerKey) {
  if (partnerKey === 'partnerA') {
    return { screen: 'CoupleWaitingPartner', params: { coupleId } };
  }
  return { screen: 'CoupleDashboard', params: { coupleId } };
}

export async function navigateAfterCoupleIntake(navigation, coupleId, partnerKey, completionResult) {
  const navState = await resolveCoupleNavState(coupleId, completionResult);
  let landing = resolveCoupleFunnelScreen(coupleId, partnerKey, navState);
  if (landing.screen === 'CoupleIntake') {
    const localDone = (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.myIntakeComplete)) === 'true';
    if (localDone || completionResult?.partnerAIntakeComplete || completionResult?.partnerBIntakeComplete) {
      landing = postIntakeFallbackScreen(coupleId, partnerKey);
    }
  }
  let nav = navigation;
  while (nav.getParent?.()) nav = nav.getParent();
  nav.replace(landing.screen, landing.params);
}

export async function getCoupleCaseForTherapist(coupleId) {
  const fn = httpsCallable(functions, 'getCoupleCaseForTherapist');
  const { data } = await fn({ coupleId });
  return data;
}

export { sectionsForPartner };
