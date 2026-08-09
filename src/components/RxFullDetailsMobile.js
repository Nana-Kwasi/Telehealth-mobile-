import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { patientVisibleNotes } from '../utils/pharmacyRxNotes';

/**
 * Collapsible read-only view of everything the doctor put on a prescription.
 *
 * The pharmacy/branch screens are built around the dispensing workflow and only
 * render the few fields that workflow needs, so form-specific prescribing detail
 * (route, injection site, PRN limits, refills, schedule…) was invisible to the
 * dispenser. This surfaces the full record without touching the ops controls.
 *
 * Mirrors the web panel in
 * Telehealth/src/component/Dashboard/Pharmacy/RxFullDetails.js — keep them in step.
 */

const row = (k, v) => [k, v === 0 || v ? String(v) : ''];
const kept = rows => rows.filter(([, v]) => v && v.trim() !== '');

function medRows(m) {
  return kept([
    row('Strength', m.strength),
    row('Form', m.drugForm),
    row('Dosage', m.dosage),
    row('Frequency', m.frequency),
    row('Direction', m.direction),
    row('Duration', m.duration ? `${m.duration} ${m.durationUnit || ''}`.trim() : ''),
    row('Route', m.route),
    row('Injection site', m.injectionSite),
    row('Application site', m.applicationSite),
    row('Administration site', m.dropSite),
    row('Volume unit', m.drugForm === 'Syrup' ? m.volumeUnit : ''),
    row('Shake well', m.drugForm === 'Syrup' ? (m.shakeWell ? 'Yes' : 'No') : ''),
    row('Spacer required', m.drugForm === 'Inhaler' ? (m.spacerRequired ? 'Yes' : 'No') : ''),
    row('Rinse after use', m.drugForm === 'Inhaler' ? (m.rinseAfter ? 'Yes' : 'No') : ''),
    row('Change interval', m.changeInterval),
    row('Rotate site', m.drugForm === 'Patch' ? (m.rotationRequired ? 'Yes' : 'No') : ''),
    row('Special instructions', m.specialInstructions),
    row('PRN indication', m.prn?.indication),
    row('PRN max/day', m.prn?.maxPerDay),
    row('PRN interval', m.prn?.interval),
    row('Refill allowed', m.refill ? (m.refill.allowed ? 'Yes' : 'No') : ''),
    row('Refill count', m.refill?.count),
    row('Refill expiry', m.refill?.expiryDate),
    row('Schedule', Array.isArray(m.schedule) && m.schedule.length ? m.schedule.join(', ') : ''),
    row('Partial fill reason', m.partialFillReasoning),
  ]);
}

function summaryRows(rx) {
  return kept([
    row('Patient', rx.patientName),
    row('Prescriber', rx.doctorName ? `Dr. ${rx.doctorName}` : ''),
    // Contact numbers: the dispenser needs to reach the prescriber about a dose, or
    // the patient about a substitution/transfer.
    row('Prescriber phone', rx.doctorPhone),
    row('Patient phone', rx.patientPhone),
    row('Diagnosis', rx.diagnosis),
    row('Date', rx.date),
    row('Follow-up', rx.followUpDate),
    row('Reference', rx.prescriptionRef),
    row('Pharmacy', rx.pharmacyName),
    row('Branch', rx.branchName),
    row('Rx status', rx.status),
    row('Pharmacy status', rx.pharmacyStatus),
    row('Delivered at', rx.deliveredAt ? new Date(rx.deliveredAt).toLocaleString() : ''),
    row('Dispensed brand/pack', rx.dispensedBrandPackUsed),
    row('Counseling / pickup', rx.counselingPickupInstruction),
    row('Cold chain / storage', rx.coldChainStorageHandling),
    row('Dispense exception', rx.dispenseExceptionDetail),
  ]);
}

function FieldRows({ rows }) {
  return (
    <View>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.key}>{k}</Text>
          <Text style={styles.value}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export default function RxFullDetailsMobile({ rx }) {
  const [open, setOpen] = useState(false);
  if (!rx) return null;

  return (
    <View style={styles.box}>
      <TouchableOpacity onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
        <Text style={styles.toggle}>
          {open ? '▾ Hide full prescription details' : '▸ View full prescription details'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 10 }}>
          <FieldRows rows={summaryRows(rx)} />

          {rx.instructions ? (
            <Text style={styles.instructions}>General instructions: {rx.instructions}</Text>
          ) : null}

          {(rx.medications || []).map((m, i) => {
            const rows = medRows(m);
            const notes = patientVisibleNotes(m);
            return (
              <View key={i} style={styles.medBlock}>
                <Text style={styles.medName}>
                  {m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}
                </Text>
                {rows.length > 0
                  ? <FieldRows rows={rows} />
                  : <Text style={styles.emptyDetail}>No further prescribing detail recorded.</Text>}
                {m.alternativeSuggested ? (
                  <Text style={[styles.alt, { color: m.drugStatus === 'approved_replacement' ? '#16a34a' : '#7c3aed' }]}>
                    🔁 {m.alternativeSuggested} · {m.drugStatus === 'approved_replacement' ? 'Approved by doctor' : 'Awaiting doctor approval'}
                    {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                  </Text>
                ) : null}
                {notes.map((n, ni) => (
                  <Text key={ni} style={styles.note}>
                    💊 {n.label || 'Pharmacy note'}: {n.note}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 12, marginBottom: 12,
  },
  toggle: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 3, gap: 12 },
  key: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 },
  value: { fontSize: 13, color: '#334155', flex: 1, textAlign: 'right' },
  instructions: { fontSize: 13, color: '#334155', marginTop: 10 },
  medBlock: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  medName: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  emptyDetail: { fontSize: 12, color: '#94a3b8' },
  alt: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  note: { fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 },
});
