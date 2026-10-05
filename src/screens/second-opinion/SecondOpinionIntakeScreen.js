import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import {
  REVIEW_AREAS, INTAKE_FIELDS, canSubmitIntake, toIntakeAnswers,
} from '../../constants/secondOpinionIntake';
import { getFlow, updateFlow } from '../../services/medpsychFlow';

/**
 * Second Opinion — the case intake.
 *
 * Sits between the policy gate and choosing a specialist. Deliberately one
 * short screen: this client already has a clinician and wants a view on one
 * decision, not a treatment plan. The full 27-step questionnaire belongs to
 * membership and is asked only if they convert.
 *
 * Nothing is written here — the answers go into the cached flow and commit with
 * the account after payment, exactly like the rest of it.
 */
export default function SecondOpinionIntakeScreen({ navigation }) {
  const [intake, setIntake] = useState({
    reviewAreas: [], reason: '', currentDiagnosis: '', currentTreatment: '',
  });
  const [touched, setTouched] = useState(false);

  React.useEffect(() => {
    (async () => {
      const flow = await getFlow();
      if (flow?.intake) setIntake((prev) => ({ ...prev, ...flow.intake }));
    })();
  }, []);

  const toggleArea = (key) => {
    setIntake((prev) => {
      const areas = new Set(prev.reviewAreas || []);
      if (areas.has(key)) areas.delete(key); else areas.add(key);
      return { ...prev, reviewAreas: [...areas] };
    });
  };

  const ready = canSubmitIntake(intake);

  const cont = async () => {
    setTouched(true);
    if (!ready) return;
    await updateFlow({
      serviceType: 'second_opinion',
      intake: toIntakeAnswers(intake),
      step: 'therapist',
    });
    navigation.navigate('MedPsychPsychiatrists');
  };

  return (
    <ZCGround>
      <ScrollView
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <View style={zcStyles.badge}>
          <Text style={zcStyles.badgeText}>Second Opinion</Text>
        </View>
        <Text style={[zcStyles.display, styles.title]}>An independent view</Text>
        <Text style={[zcStyles.body, styles.lead]}>
          Tell us what you would like reviewed. Your answers go only to the
          specialist you choose.
        </Text>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>What would you like reviewed?</Text>
          <Text style={zcStyles.meta}>Choose everything that applies.</Text>
          <View style={styles.chips}>
            {REVIEW_AREAS.map((area) => {
              const on = (intake.reviewAreas || []).includes(area.key);
              return (
                <TouchableOpacity
                  key={area.key}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => toggleArea(area.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  {on ? <Ionicons name="checkmark" size={13} color="#ffffff" /> : null}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{area.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {touched && !(intake.reviewAreas || []).length ? (
            <Text style={styles.error}>Choose at least one area to review.</Text>
          ) : null}
        </View>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          <Text style={zcStyles.eyebrow}>About your care</Text>
          {INTAKE_FIELDS.map((f) => (
            <View key={f.key} style={styles.field}>
              <Text style={zcStyles.label}>
                {f.label}{!f.required ? '  (optional)' : ''}
              </Text>
              <TextInput
                style={[zcStyles.input, f.multiline && styles.multiline]}
                placeholder={f.placeholder}
                placeholderTextColor={ZC.ink4}
                value={intake[f.key] || ''}
                onChangeText={(v) => setIntake({ ...intake, [f.key]: v })}
                multiline={f.multiline}
              />
              {touched && f.required && !String(intake[f.key] || '').trim() ? (
                <Text style={styles.error}>
                  This one is needed so the specialist knows where to start.
                </Text>
              ) : null}
            </View>
          ))}

          {/* Reports are uploaded AFTER the account exists: the upload endpoint
              needs an owner id, and there is no account until payment. */}
          <Text style={[zcStyles.meta, styles.note]}>
            You can upload reports and previous assessments from your dashboard
            once your consultation is booked.
          </Text>
        </View>

        <TouchableOpacity style={zcStyles.btnPrimary} onPress={cont}>
          <Text style={zcStyles.btnPrimaryText}>Choose a specialist</Text>
        </TouchableOpacity>
      </ScrollView>
    </ZCGround>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { marginTop: 12 },
  lead: { marginBottom: 6 },
  card: { borderRadius: 20, padding: 18, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.14)', backgroundColor: '#ffffff',
  },
  chipOn: { backgroundColor: ZC.accent, borderColor: ZC.accent },
  chipText: { fontSize: 13.5, fontWeight: '600', color: ZC.ink },
  chipTextOn: { color: '#ffffff', fontWeight: '800' },
  field: { marginTop: 6 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  note: { marginTop: 10 },
  error: { color: ZC.danger, fontSize: 12.5, fontWeight: '600', marginTop: 6 },
});
