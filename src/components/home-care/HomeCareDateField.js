import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { HomeCareColors as C } from '../../constants/homeCareColors';
import { hc } from './homeCareStyles';

export function formatHomeCareDate(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseHomeCareDate(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function HomeCareDateField({
  label,
  value,
  onChange,
  minimumDate,
  placeholder = 'Select date',
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseHomeCareDate(value);
  const pickerValue = parsed || minimumDate || new Date();

  const onPickerChange = (event, date) => {
    if (Platform.OS !== 'ios') setOpen(false);
    if (event?.type === 'dismissed') return;
    if (date) onChange(formatHomeCareDate(date));
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={hc.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[hc.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 15, color: value ? C.text : C.textLight }}>
          {value || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={C.primary} />
      </TouchableOpacity>
      {open ? (
        <DateTimePicker
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
          value={pickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          onChange={onPickerChange}
        />
      ) : null}
      {Platform.OS === 'ios' && open ? (
        <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 6 }} onPress={() => setOpen(false)}>
          <Text style={{ color: C.primary, fontWeight: '700' }}>Done</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
