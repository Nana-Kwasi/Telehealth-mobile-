import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { nessaHubPolicyUrl } from '../../constants/nessaHubPolicies';
import DateFieldPicker from './DateFieldPicker';

function ChipRow({ options, value, onChange, multi }) {
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const selected = multi ? (value || []).includes(opt) : value === opt;
        const press = () => {
          if (multi) {
            const list = value || [];
            onChange(selected ? list.filter((x) => x !== opt) : [...list, opt]);
          } else {
            onChange(opt);
          }
        };
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={press}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function shouldShowField(field, form) {
  if (field.name === 'previousCoupleOutcome' && form.previousCoupleCounselling !== 'Yes') return false;
  if (field.name === 'treatmentObjectivesOther') {
    const selected = form.treatmentObjectives || [];
    return Array.isArray(selected) && selected.some((v) => /other/i.test(v));
  }
  if (field.name === 'infidelityWho' && form.infidelity === 'No') return false;
  return true;
}

function fieldConfig(field, form, section) {
  if (section?.id === 'personal' && field.name === 'email' && form.email) {
    return { ...field, readOnly: true };
  }
  return field;
}

export default function CoupleSectionForm({ section, form, errors, onChange }) {
  const set = (name, val) => onChange({ ...form, [name]: val });

  const renderField = (field) => {
    if (!shouldShowField(field, form)) return null;

    const f = fieldConfig(field, form, section);
    const err = errors[f.name];

    if (f.type === 'consent_check') {
      const policyUrl = f.policySlug ? nessaHubPolicyUrl(f.policySlug) : null;
      return (
        <View key={f.name} style={styles.consentRow}>
          <TouchableOpacity
            style={styles.consentMain}
            onPress={() => set(f.name, !form[f.name])}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, form[f.name] && styles.checkboxOn]} />
            <View style={styles.consentText}>
              <Text style={styles.label}>{f.label}</Text>
              {f.description ? <Text style={styles.hint}>{f.description}</Text> : null}
            </View>
          </TouchableOpacity>
          {policyUrl ? (
            <TouchableOpacity
              style={styles.consentLinkBtn}
              onPress={() => Linking.openURL(policyUrl)}
              accessibilityLabel={`Read full ${f.label} policy`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (f.type === 'signature') {
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>
            {f.label}
            {f.required ? <Text style={styles.req}> *</Text> : null}
          </Text>
          <TextInput
            style={[styles.input, err && styles.inputError]}
            value={String(form[f.name] ?? '')}
            onChangeText={(t) => set(f.name, t)}
            placeholder="Type your full legal name"
            autoCapitalize="words"
          />
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      );
    }

    if (f.type === 'birthdate') {
      return (
        <DateFieldPicker
          key={f.name}
          field={f}
          form={form}
          errors={errors}
          onChange={onChange}
          showAge
        />
      );
    }

    if (f.type === 'date') {
      return (
        <DateFieldPicker
          key={f.name}
          field={f}
          form={form}
          errors={errors}
          onChange={onChange}
          showAge={false}
        />
      );
    }

    if (f.type === 'chips' || f.type === 'multiselect') {
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>
            {f.label}
            {f.required ? <Text style={styles.req}> *</Text> : null}
          </Text>
          <ChipRow
            options={f.options}
            value={form[f.name]}
            onChange={(v) => set(f.name, v)}
            multi={f.type === 'multiselect'}
          />
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      );
    }

    if (f.type === 'yesno') {
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          <ChipRow options={['Yes', 'No']} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      );
    }

    if (f.type === 'yesno_text') {
      const showText = form[f.name] === 'Yes';
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          <ChipRow options={['Yes', 'No']} value={form[f.name]} onChange={(v) => set(f.name, v)} />
          {showText && f.textKey ? (
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form[f.textKey] || ''}
              onChangeText={(t) => set(f.textKey, t)}
              placeholder={f.textPlaceholder || 'Please describe'}
              multiline
            />
          ) : null}
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      );
    }

    if (f.type === 'scale') {
      const min = f.min ?? 1;
      const max = f.max ?? 10;
      const nums = Array.from({ length: max - min + 1 }, (_, i) => String(i + min));
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>
            {f.label}
            {f.required ? <Text style={styles.req}> *</Text> : null}
          </Text>
          <ChipRow options={nums} value={String(form[f.name] ?? '')} onChange={(v) => set(f.name, Number(v))} />
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      );
    }

    if (f.readOnly) {
      return (
        <View key={f.name} style={styles.field}>
          <Text style={styles.label}>{f.label}</Text>
          <Text style={styles.readOnly}>{form[f.name] || '—'}</Text>
        </View>
      );
    }

    const isArea = f.type === 'textarea';
    return (
      <View key={f.name} style={styles.field}>
        <Text style={styles.label}>
          {f.label}
          {f.required ? <Text style={styles.req}> *</Text> : null}
        </Text>
        <TextInput
          style={[styles.input, isArea && styles.textArea, err && styles.inputError]}
          value={String(form[f.name] ?? '')}
          onChangeText={(t) => set(f.name, f.type === 'number' ? t.replace(/\D/g, '') : t)}
          placeholder={f.placeholder}
          keyboardType={
            f.type === 'email' ? 'email-address' : f.type === 'phone' ? 'phone-pad' : 'number-pad'
          }
          editable={!f.readOnly}
          autoCapitalize={f.type === 'email' ? 'none' : 'sentences'}
          multiline={isArea}
          numberOfLines={isArea ? 4 : 1}
        />
        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{section.title}</Text>
      {section.subtitle ? <Text style={styles.subtitle}>{section.subtitle}</Text> : null}
      {section.policySlug ? (
        <TouchableOpacity onPress={() => Linking.openURL(nessaHubPolicyUrl(section.policySlug))}>
          <Text style={styles.policyReadLink}>Read confidential screening policy →</Text>
        </TouchableOpacity>
      ) : null}
      {section.therapistOnly ? (
        <View style={styles.privateBanner}>
          <Text style={styles.privateBannerText}>Therapist-only — not shared with your partner</Text>
        </View>
      ) : null}
      {section.fields.map(renderField)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8, lineHeight: 20 },
  policyReadLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 16,
  },
  privateBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  privateBannerText: { color: '#92400e', fontSize: 13, fontWeight: '600' },
  field: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  req: { color: Colors.error },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputError: { borderColor: Colors.error },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  chipTextSelected: { color: Colors.surface, fontWeight: '700' },
  error: { color: Colors.error, fontSize: 12, marginTop: 4 },
  readOnly: { fontSize: 16, color: Colors.textSecondary, paddingVertical: 8 },
  hint: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  consentMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  consentLinkBtn: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: 12,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: Colors.primary },
  consentText: { flex: 1 },
});
