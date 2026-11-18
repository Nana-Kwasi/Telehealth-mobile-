import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { api } from '../services/apiClient';
import { s } from './PsychRecordMobile';

/*
 * The clinician's own templates on mobile. Same endpoints and field types as web.
 *  - TemplatesMobile: list, build and edit (Practice screen)
 *  - TemplateFieldsMobile: inputs for filling a template in (notes and client forms)
 *  - TemplateNoteMobile: write a clinical note with a note template (client screen)
 *  - AnswersMobile: a submitted form, read-only
 */

export const FIELD_TYPES = [
  ['short', 'Short answer'], ['long', 'Paragraph'], ['choice', 'One choice'], ['multi', 'Several choices'],
  ['scale', 'Scale 0–10'], ['yesno', 'Yes or no'], ['date', 'Date'], ['heading', 'Heading'],
];

const newField = (type = 'short') => ({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type, label: '', required: false });

function Chip({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={[s.chip, on && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
      <Text style={[s.chipText, on && { color: accent, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const missingRequired = (fields, answers) => fields.filter((f) => f.type !== 'heading' && f.required).filter((f) => {
  const v = answers[f.id];
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
});

export function TemplatesMobile({ accent = '#4f46e5' }) {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/api/v1/templates').then((l) => setList(Array.isArray(l) ? l : [])).catch((e) => { setList([]); setError(e?.message || 'Could not load.'); });
  useEffect(() => { load(); }, []);
  if (editing) return <BuilderMobile initial={editing} accent={accent} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  const group = (kind, title) => {
    const items = (list || []).filter((t) => t.kind === kind);
    return (
      <View style={{ marginTop: 8 }}>
        <Text style={s.kind}>{title}</Text>
        {items.length === 0 ? <Text style={s.muted}>None yet.</Text> : items.map((t) => (
          <View key={t.id} style={s.row}>
            <Text style={[s.strong, { flex: 1 }]}>{t.name}</Text>
            <TouchableOpacity onPress={() => setEditing(t)}><Text style={[s.link, { color: accent }]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => api(`/api/v1/templates/${t.id}`, { method: 'DELETE' }).then(load).catch((e) => setError(e?.message || 'Could not delete.'))}>
              <Text style={[s.link, { color: accent }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>Templates</Text>
      <Text style={s.muted}>Your own note layouts, and forms for clients to fill in. Send forms with “Share forms” on a client's page.</Text>
      {list === null ? <Text style={s.muted}>Loading…</Text> : <>{group('note', 'Note templates')}{group('form', 'Client forms')}</>}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.chips}>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => setEditing({ kind: 'note', name: '', fields: [newField('long')] })}><Text style={s.btnText}>New note template</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => setEditing({ kind: 'form', name: '', fields: [newField('short')] })}><Text style={s.btnText}>New client form</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function BuilderMobile({ initial, accent, onClose, onSaved }) {
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  // Options are edited as one line each in a text box.
  const [fields, setFields] = useState(() => (initial.fields || []).map((f) => ({ ...f, optionsText: (f.options || []).join('\n') })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (i, patch) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, d) => setFields((fs) => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async () => {
    setBusy(true); setError('');
    const body = {
      kind: initial.kind, name, description,
      fields: fields.map(({ optionsText, ...f }) => ({
        ...f, options: f.type === 'choice' || f.type === 'multi' ? (optionsText || '').split('\n').map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };
    try {
      await api(initial.id ? `/api/v1/templates/${initial.id}` : '/api/v1/templates', { method: initial.id ? 'PUT' : 'POST', body });
      onSaved();
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>{initial.id ? 'Edit' : 'New'} {initial.kind === 'note' ? 'note template' : 'client form'}</Text>
      <TextInput style={s.input} placeholder="Name" value={name} onChangeText={setName} maxLength={120} />
      <TextInput style={s.input} placeholder="Description (optional)" value={description} onChangeText={setDescription} maxLength={500} />
      {fields.map((f, i) => (
        <View key={f.id} style={[s.domain, { marginTop: 8 }]}>
          <View style={s.chips}>
            {FIELD_TYPES.map(([v, l]) => <Chip key={v} label={l} accent={accent} on={f.type === v} onPress={() => set(i, { type: v })} />)}
          </View>
          <TextInput style={s.input} placeholder={f.type === 'heading' ? 'Section title' : 'Question'} value={f.label} onChangeText={(t) => set(i, { label: t })} maxLength={300} />
          {(f.type === 'choice' || f.type === 'multi') && (
            <TextInput style={[s.input, { minHeight: 70 }]} multiline placeholder={'Options, one per line'} value={f.optionsText} onChangeText={(t) => set(i, { optionsText: t })} />
          )}
          <View style={s.chips}>
            {f.type !== 'heading' && <Chip label={f.required ? 'Required' : 'Optional'} accent={accent} on={!!f.required} onPress={() => set(i, { required: !f.required })} />}
            <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0}><Text style={[s.link, { color: accent }, i === 0 && { opacity: 0.4 }]}>Up</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => move(i, 1)} disabled={i === fields.length - 1}><Text style={[s.link, { color: accent }, i === fields.length - 1 && { opacity: 0.4 }]}>Down</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setFields(fields.filter((_, j) => j !== i))}><Text style={[s.link, { color: '#b91c1c' }]}>Remove</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      {fields.length < 40 ? (
        <View style={s.chips}>
          <TouchableOpacity onPress={() => setFields([...fields, newField('short')])}><Text style={[s.link, { color: accent }]}>+ Question</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setFields([...fields, newField('heading')])}><Text style={[s.link, { color: accent }]}>+ Heading</Text></TouchableOpacity>
        </View>
      ) : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity onPress={onClose} disabled={busy}><Text style={[s.link, { color: accent }]}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={save}>
          <Text style={s.btnText}>{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function TemplateFieldsMobile({ fields, answers, onChange, accent = '#4f46e5' }) {
  const set = (id, v) => onChange({ ...answers, [id]: v });
  return (
    <View>
      {fields.map((f) => {
        if (f.type === 'heading') return <Text key={f.id} style={[s.title, { marginTop: 10 }]}>{f.label}</Text>;
        const v = answers[f.id];
        return (
          <View key={f.id} style={{ marginTop: 10 }}>
            <Text style={s.strong}>{f.label}{f.required ? <Text style={{ color: '#b91c1c' }}> *</Text> : null}</Text>
            {f.type === 'short' && <TextInput style={s.input} value={v || ''} maxLength={300} onChangeText={(t) => set(f.id, t)} />}
            {f.type === 'long' && <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={v || ''} maxLength={5000} onChangeText={(t) => set(f.id, t)} />}
            {f.type === 'date' && <TextInput style={s.input} placeholder="YYYY-MM-DD" value={v || ''} onChangeText={(t) => set(f.id, t)} />}
            {f.type === 'choice' && <View style={s.chips}>{f.options.map((o) => <Chip key={o} label={o} accent={accent} on={v === o} onPress={() => set(f.id, o)} />)}</View>}
            {f.type === 'multi' && (
              <View style={s.chips}>
                {f.options.map((o) => {
                  const cur = Array.isArray(v) ? v : [];
                  return <Chip key={o} label={o} accent={accent} on={cur.includes(o)} onPress={() => set(f.id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} />;
                })}
              </View>
            )}
            {f.type === 'yesno' && <View style={s.chips}>{['yes', 'no'].map((o) => <Chip key={o} label={o === 'yes' ? 'Yes' : 'No'} accent={accent} on={v === o} onPress={() => set(f.id, o)} />)}</View>}
            {f.type === 'scale' && <View style={s.chips}>{Array.from({ length: 11 }, (_, n) => <Chip key={n} label={String(n)} accent={accent} on={v === n} onPress={() => set(f.id, n)} />)}</View>}
          </View>
        );
      })}
    </View>
  );
}

export function AnswersMobile({ fields, answers }) {
  return (
    <View>
      {(fields || []).map((f) => {
        if (f.type === 'heading') return <Text key={f.id} style={[s.title, { marginTop: 8 }]}>{f.label}</Text>;
        const v = answers?.[f.id];
        const text = v === undefined || v === null || v === '' ? 'No answer' : Array.isArray(v) ? v.join(', ') : f.type === 'scale' ? `${v} / 10` : String(v);
        return (
          <View key={f.id} style={{ marginTop: 6 }}>
            <Text style={s.strong}>{f.label}</Text>
            <Text style={[s.detail, { marginTop: 2 }]}>{text}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function TemplateNoteMobile({ clientId, onClose, onSaved, accent = '#4f46e5' }) {
  const [list, setList] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [answers, setAnswers] = useState({});
  const [visible, setVisible] = useState(false);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/v1/templates?kind=note').then((l) => { const a = Array.isArray(l) ? l : []; setList(a); if (a.length === 1) setTpl(a[0]); })
      .catch((e) => { setList([]); setError(e?.message || 'Could not load your templates.'); });
  }, []);
  const save = async (draft) => {
    const missing = missingRequired(tpl.fields, answers);
    if (!draft && missing.length) { setError(`Answer “${missing[0].label}”.`); return; }
    setBusy(true); setError('');
    try {
      await api(`/api/v1/templates/${tpl.id}/notes`, { method: 'POST', body: { clientId, answers, visibleToClient: visible, isDraft: draft, signature: draft ? null : signature } });
      onSaved && onSaved(); onClose();
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>{tpl ? tpl.name : 'Write with my template'}</Text>
      {list === null ? <Text style={s.muted}>Loading…</Text> : !tpl ? (
        list.length === 0 ? <Text style={s.muted}>You have no note templates yet. Make one in My Practice › Templates.</Text>
          : list.map((t) => (
            <View key={t.id} style={s.row}>
              <Text style={[s.strong, { flex: 1 }]}>{t.name}</Text>
              <TouchableOpacity onPress={() => setTpl(t)}><Text style={[s.link, { color: accent }]}>Use</Text></TouchableOpacity>
            </View>
          ))
      ) : (
        <>
          <TemplateFieldsMobile fields={tpl.fields} answers={answers} onChange={setAnswers} accent={accent} />
          <View style={s.chips}><Chip accent={accent} on={visible} onPress={() => setVisible(!visible)} label={visible ? 'Client can see this note' : 'Hidden from the client'} /></View>
          <TextInput style={s.input} placeholder="Sign (type your name)" value={signature} onChangeText={setSignature} />
        </>
      )}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity onPress={onClose} disabled={busy}><Text style={[s.link, { color: accent }]}>Cancel</Text></TouchableOpacity>
        {tpl ? <TouchableOpacity onPress={() => save(true)} disabled={busy}><Text style={[s.link, { color: accent }]}>Save draft</Text></TouchableOpacity> : null}
        {tpl ? (
          <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || !signature.trim()) && { opacity: 0.5 }]} disabled={busy || !signature.trim()} onPress={() => save(false)}>
            <Text style={s.btnText}>{busy ? 'Saving…' : 'Sign and save'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
