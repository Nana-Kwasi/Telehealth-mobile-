import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { calculateAgeFromDob } from '../../services/coupleTherapyService';

function parseDate(val) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(String(val))) return new Date();
  const [y, m, d] = String(val).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DateFieldPicker({ field, form, errors, onChange, showAge }) {
  const err = errors[field.name];
  const [open, setOpen] = useState(false);
  const value = form[field.name];
  const display = value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : 'Select date';

  const onPick = (_event, selected) => {
    if (Platform.OS === 'android') setOpen(false);
    if (!selected) return;
    const iso = formatIso(selected);
    if (showAge) {
      onChange({ ...form, [field.name]: iso, age: calculateAgeFromDob(iso) });
    } else {
      onChange({ ...form, [field.name]: iso });
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {field.label}
        {field.required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TouchableOpacity
        style={[styles.input, styles.dateBtn, err && styles.inputError]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.dateText, !value && styles.placeholder]}>{display}</Text>
      </TouchableOpacity>
      {showAge && form.age ? <Text style={styles.ageHint}>Age: {form.age}</Text> : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}
      {open ? (
        <DateTimePicker
          value={parseDate(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          minimumDate={showAge ? new Date(1900, 0, 1) : undefined}
          onChange={onPick}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <TouchableOpacity style={styles.doneBtn} onPress={() => setOpen(false)}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  req: { color: Colors.error },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: Colors.surface,
  },
  inputError: { borderColor: Colors.error },
  dateBtn: { justifyContent: 'center' },
  dateText: { fontSize: 16, color: Colors.text },
  placeholder: { color: Colors.textSecondary },
  ageHint: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 4 },
  error: { color: Colors.error, fontSize: 12, marginTop: 4 },
  doneBtn: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 6, paddingHorizontal: 12 },
  doneText: { color: Colors.primary, fontWeight: '700' },
});
