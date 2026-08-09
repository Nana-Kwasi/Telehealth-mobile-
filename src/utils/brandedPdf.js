// ─── brandedPdf (mobile) ─────────────────────────────────────────────────────
// Export a note, therapy book or resource as a branded PDF and hand it to the
// system share sheet (which is how you "download" on iOS/Android).
//
// expo-print renders HTML, so the layout is written as HTML/CSS here rather than
// drawn command-by-command like the web build — but the result is deliberately
// the same document: NessaHub header band, watermark, labelled sections, footer.
//
// The mark is drawn in CSS: there is no logo image in the repo
// (assets/icon.png is a 0-byte placeholder).

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getNoteSections } from './noteDisplayUtils';

const NOTE_TYPE_LABELS = {
  soap: 'SOAP note',
  progress: 'Progress note',
  risk: 'Risk assessment',
  discharge: 'Discharge summary',
  therapyBook: 'Therapy book',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function safeFilename(name) {
  return String(name || 'document').replace(/[^\w\d\-. ]+/g, '').trim().slice(0, 80) || 'document';
}

function buildHtml({ title, subtitle, meta, sections, footer }) {
  const metaLine = meta.filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const body = sections.length
    ? sections
        .map(
          (s) => `
        <section class="sec">
          <div class="label">${escapeHtml(s.label).toUpperCase()}</div>
          <div class="value">${escapeHtml(s.value)}</div>
        </section>`,
        )
        .join('')
    : '<section class="sec"><div class="value empty">No content recorded.</div></section>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; }
  .band { background: #4f46e5; color: #fff; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .mark { width: 34px; height: 34px; border-radius: 9px; background: #fff; color: #3730a3;
          font-weight: 800; font-size: 18px; display: flex; align-items: center; justify-content: center; }
  .brand { font-size: 18px; font-weight: 800; line-height: 1.15; }
  .kicker { font-size: 10px; opacity: .9; }
  .page { padding: 28px 24px 70px; position: relative; }
  .wm { position: fixed; top: 45%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg);
        font-size: 78px; font-weight: 800; color: #4f46e5; opacity: .06; z-index: 0; }
  .content { position: relative; z-index: 1; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta { font-size: 11px; color: #64748b; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
  .sec { margin-top: 18px; page-break-inside: avoid; }
  .label { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: #3730a3; margin-bottom: 5px; }
  .value { font-size: 12px; line-height: 1.65; white-space: pre-wrap;
           padding: 9px 12px; background: #f8fafc; border: 1px solid #e8edf3;
           border-left: 3px solid #4f46e5; border-radius: 7px; }
  .empty { color: #6b7280; font-style: italic; background: transparent; border: none; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; padding: 8px 24px;
          border-top: 1px solid #e2e8f0; font-size: 8px; color: #64748b; }
</style></head>
<body>
  <div class="band">
    <div class="mark">N</div>
    <div><div class="brand">NessaHub</div><div class="kicker">${escapeHtml(subtitle)}</div></div>
  </div>
  <div class="wm">NessaHub</div>
  <div class="page"><div class="content">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${metaLine}</div>
    ${body}
  </div></div>
  <div class="foot">${escapeHtml(footer)}</div>
</body></html>`;
}

async function renderAndShare(html, filename) {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

/** Download a clinical note or therapy book. */
export async function downloadNotePdf(note) {
  if (!note) throw new Error('Nothing to download.');
  const isBook = note.noteType === 'therapyBook';
  const title = isBook
    ? note.bookTitle || note.title || 'Therapy Book'
    : NOTE_TYPE_LABELS[note.noteType] || 'Clinical note';

  // getNoteSections expands structuredData (notes) and the content JSON (books),
  // so the file carries the same fields the app shows — reading the raw record
  // here is what left the web download empty.
  const sections = getNoteSections(note);

  const html = buildHtml({
    title,
    subtitle: isBook ? 'Therapy book' : 'Clinical note',
    meta: [
      note.clientName && `Client: ${escapeHtml(note.clientName)}`,
      note.therapistName && `Therapist: ${escapeHtml(note.therapistName)}`,
      formatDate(note.sessionDate || note.createdAt) && `Date: ${formatDate(note.sessionDate || note.createdAt)}`,
    ],
    sections,
    footer: 'Confidential — for the named client only.',
  });

  return renderAndShare(html, `${safeFilename(title)}.pdf`);
}

/** Download a resource / assigned material. */
export async function downloadResourcePdf(resource) {
  if (!resource) throw new Error('Nothing to download.');
  const title = resource.title || resource.name || 'Resource';

  const sections = [
    { key: 'description', label: 'Description', value: resource.description },
    { key: 'details', label: 'Details', value: resource.content || resource.body || resource.notes },
    { key: 'instructions', label: 'Instructions', value: resource.instructions },
    { key: 'goal', label: 'Goal', value: resource.goal },
    { key: 'link', label: 'Link', value: resource.url || resource.fileUrl },
  ].filter((s) => String(s.value ?? '').trim());

  const html = buildHtml({
    title,
    subtitle: 'Therapy resource',
    meta: [
      resource.category && `Category: ${escapeHtml(resource.category)}`,
      resource.therapistName && `Shared by: ${escapeHtml(resource.therapistName)}`,
      formatDate(resource.createdAt) && `Date: ${formatDate(resource.createdAt)}`,
    ],
    sections,
    footer: 'Shared with you via NessaHub.',
  });

  return renderAndShare(html, `${safeFilename(title)}.pdf`);
}
