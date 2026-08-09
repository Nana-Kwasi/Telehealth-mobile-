import React, { useEffect, useMemo, useState, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  BackHandler,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';
import { sectionsForPartner } from '../../constants/coupleIntakeSections';
import CoupleSectionForm from '../../components/couple/CoupleSectionForm';
import {
  loadSectionData,
  savePartnerSection,
  validateSection,
  markPartnerIntakeComplete,
  navigateAfterCoupleIntake,
  ensureCoupleSession,
  findResumeSectionIndex,
  isCoupleIntakeDoneLocally,
  getAuthCoupleHints,
  enrichCoupleIntakePersonalSection,
  syncLocalCoupleDraftFromServer,
} from '../../services/coupleTherapyService';
import { useCoupleSignOutHeader } from '../../hooks/useCoupleSignOutHeader';

export default function CoupleIntakeScreen({ navigation, route }) {
  useCoupleSignOutHeader(navigation);
  const initialCoupleId = route.params?.coupleId;
  const initialRole = route.params?.partnerRole || 'partnerA';

  const [activeCoupleId, setActiveCoupleId] = useState(initialCoupleId);
  const [activePartnerKey, setActivePartnerKey] = useState(
    initialRole === 'partnerB' ? 'partnerB' : 'partnerA',
  );

  const sections = useMemo(() => sectionsForPartner(activePartnerKey), [activePartnerKey]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  const current = sections[sectionIndex];
  const progress = ((sectionIndex + 1) / sections.length) * 100;

  const exitIntake = useCallback(() => {
    const state = navigation.getState?.();
    const canPop = (state?.index ?? 0) > 0 && navigation.canGoBack();
    if (canPop) {
      navigation.goBack();
    } else {
      navigation.replace('Welcome');
    }
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: false,
      headerLeft: () => (
        <TouchableOpacity
          onPress={exitIntake}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginLeft: 4, padding: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, exitIntake]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sectionIndex > 0) {
        setSectionIndex((i) => i - 1);
        setErrors({});
        setLoading(true);
        return true;
      }
      exitIntake();
      return true;
    });
    return () => sub.remove();
  }, [sectionIndex, exitIntake]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setBootstrapError('');
      try {
        const authHints = await getAuthCoupleHints();
        const storedCoupleId =
          initialCoupleId ||
          (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId)) ||
          authHints.coupleId;
        const claimAs =
          initialRole === 'partnerB' || authHints.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
        let session = await ensureCoupleSession(storedCoupleId || undefined, { claimAs });
        if (!session.ok && storedCoupleId && session.reason !== 'no_couple_for_email') {
          await new Promise((r) => setTimeout(r, 400));
          session = await ensureCoupleSession(storedCoupleId, { claimAs });
        }
        if (!session.ok) {
          if (session.reason === 'no_couple_for_email' && !storedCoupleId && !(await AsyncStorage.getItem('th.token'))) {
            navigation.replace('CoupleInitiation');
            return;
          }
          setBootstrapError(
            session.message ||
              'Could not verify your couple account. Sign in with the email you used when starting couple therapy.',
          );
          return;
        }

        const resolvedCoupleId =
          session.coupleId || initialCoupleId || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
        if (!resolvedCoupleId) {
          setBootstrapError('Could not resolve your couple registration.');
          return;
        }

        const resolvedKey = session.partnerRole === 'partnerB' ? 'partnerB' : 'partnerA';
        setActiveCoupleId(resolvedCoupleId);
        setActivePartnerKey(resolvedKey);
        const partnerSections = sectionsForPartner(resolvedKey);

        if (session.intakeComplete || (await isCoupleIntakeDoneLocally())) {
          await navigateAfterCoupleIntake(navigation, resolvedCoupleId, resolvedKey);
          return;
        }

        await syncLocalCoupleDraftFromServer(resolvedCoupleId, resolvedKey);
        const resumeIdx = await findResumeSectionIndex(
          resolvedCoupleId,
          resolvedKey,
          partnerSections,
        );
        setSectionIndex(resumeIdx);
        setBootstrapped(true);
      } catch (e) {
        setBootstrapError(e.message || 'Could not load intake.');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCoupleId, initialRole, navigation, bootstrapAttempt]);

  useEffect(() => {
    if (!activeCoupleId || !bootstrapped) return;
    (async () => {
      setLoading(true);
      try {
        const section = sections[sectionIndex];
        let merged = { ...(await loadSectionData(activeCoupleId, activePartnerKey, section)) };
        if (section.id === 'personal') {
          merged = await enrichCoupleIntakePersonalSection(activeCoupleId, activePartnerKey, merged);
        }
        setForm(merged);
      } catch (e) {
        console.warn('Could not load section:', e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCoupleId, activePartnerKey, sectionIndex, sections, bootstrapped]);

  const persistSection = async () => {
    const section = sections[sectionIndex];
    const payload =
      section.id === 'consent'
        ? {
            ...form,
            signedAt: new Date().toISOString(),
            consentDate: new Date().toISOString().split('T')[0],
          }
        : form;
    await savePartnerSection(activeCoupleId, activePartnerKey, section.id, payload);
  };

  const onNext = async () => {
    const section = sections[sectionIndex];
    const v = validateSection(section, form);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      Alert.alert('Incomplete', 'Please complete required fields.');
      return;
    }

    if (section.id === 'consent') {
      const allConsent = section.fields.filter((f) => f.type === 'consent_check').every((f) => form[f.name]);
      if (!allConsent) {
        Alert.alert('Consent required', 'Please accept all agreements.');
        return;
      }
    }

    setSaving(true);
    try {
      await persistSection();

      if (sectionIndex < sections.length - 1) {
        setSectionIndex((i) => i + 1);
        setErrors({});
        setLoading(true);
        return;
      }

      const completion = await markPartnerIntakeComplete(activeCoupleId, activePartnerKey);
      await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.coupleId, activeCoupleId);
      await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.partnerRole, activePartnerKey);
      await AsyncStorage.setItem(COUPLE_STORAGE_KEYS.myIntakeComplete, 'true');

      await navigateAfterCoupleIntake(navigation, activeCoupleId, activePartnerKey, completion);
    } catch (e) {
      console.error(e);
      const msg = e.message || 'Could not save. Please try again.';
      Alert.alert(
        'Error',
        /permission/i.test(msg)
          ? 'Could not save intake — sign out, sign back in with the email used at registration, then try again.'
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  const onBack = async () => {
    if (sectionIndex === 0) {
      exitIntake();
      return;
    }
    try {
      await persistSection();
    } catch (e) {
      console.warn('Could not save draft on back:', e?.message);
    }
    setSectionIndex((i) => i - 1);
    setErrors({});
    setLoading(true);
  };

  if (bootstrapError) {
    return (
      <ScrollView
        style={styles.errorPage}
        contentContainerStyle={styles.errorPageContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Couple account not linked</Text>
          <Text style={styles.errorText}>{bootstrapError}</Text>
          <TouchableOpacity
            style={styles.errorPrimaryBtn}
            onPress={() => {
              setBootstrapError('');
              setBootstrapped(false);
              setBootstrapAttempt((n) => n + 1);
            }}
          >
            <Text style={styles.errorPrimaryBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.errorSecondaryBtn}
            onPress={() => navigation.replace('Welcome')}
          >
            <Text style={styles.errorSecondaryBtnText}>Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (loading && !Object.keys(form).length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.privateNote}>Your answers are confidential and not shared with your partner.</Text>
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>
          Section {sectionIndex + 1} of {sections.length}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <CoupleSectionForm section={current} form={form} errors={errors} onChange={setForm} />

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onBack}>
          <Text style={styles.btnGhostText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]} onPress={onNext} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {sectionIndex === sections.length - 1 ? 'Complete intake' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorPage: { flex: 1, backgroundColor: Colors.background },
  errorPageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    padding: 20,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#b91c1c',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  errorPrimaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
    marginBottom: 10,
  },
  errorPrimaryBtnText: { color: Colors.surface, fontWeight: '700', fontSize: 16 },
  errorSecondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorSecondaryBtnText: { color: Colors.text, fontWeight: '600', fontSize: 16 },
  privateNote: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  progressWrap: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  progressBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: Colors.border },
  btnGhostText: { color: Colors.text, fontWeight: '600' },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: Colors.surface, fontWeight: '700' },
  btnDisabled: { opacity: 0.7 },
});
