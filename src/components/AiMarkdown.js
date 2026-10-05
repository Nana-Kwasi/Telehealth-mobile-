import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ZC } from '../constants/zencare';

/**
 * Render the small slice of Markdown the assistant actually produces.
 *
 * Written by hand rather than pulled from a library for two reasons: it keeps
 * a dependency out of the app for maybe eighty lines of work, and — more
 * importantly — it renders to React Native <Text> elements, so there is no
 * HTML anywhere. The model stays untrusted as an author; the worst a malformed
 * response can do is look odd.
 *
 * Handles: ### headings, **bold**, * and - bullets, 1. numbered lists, and
 * paragraph spacing. Anything else falls through as plain text rather than
 * showing its syntax, which is the failure people actually notice.
 */
export default function AiMarkdown({ text, color = ZC.ink, size = 15 }) {
  if (!text) return null;

  const blocks = [];
  const lines = String(text).split('\n');

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      // Collapse runs of blank lines into ONE gap. The model emits several in a
      // row, and one spacer each turned into an empty half-screen between
      // paragraphs.
      if (blocks.length && blocks[blocks.length - 1].type !== 'gap') {
        blocks.push({ type: 'gap', key: `g${i}` });
      }
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2], key: `h${i}` });
      return;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1], key: `b${i}` });
      return;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      blocks.push({ type: 'numbered', n: numbered[1], text: numbered[2], key: `n${i}` });
      return;
    }

    blocks.push({ type: 'para', text: line, key: `p${i}` });
  });

  while (blocks.length && blocks[0].type === 'gap') blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === 'gap') blocks.pop();

  return (
    <View>
      {blocks.map((b) => {
        if (b.type === 'gap') return <View key={b.key} style={styles.gap} />;

        if (b.type === 'heading') {
          return (
            <Text key={b.key} style={[
              styles.heading,
              { fontSize: b.level <= 2 ? size + 3 : size + 1, color },
            ]}>
              {inline(b.text, size, color)}
            </Text>
          );
        }

        if (b.type === 'bullet') {
          return (
            <View key={b.key} style={styles.row}>
              <Text style={[styles.dot, { color: ZC.accent }]}>•</Text>
              <Text style={[styles.rowBody, { fontSize: size, color }]}>
                {inline(b.text, size, color)}
              </Text>
            </View>
          );
        }

        if (b.type === 'numbered') {
          return (
            <View key={b.key} style={styles.row}>
              <Text style={[styles.num, { color: ZC.accent, fontSize: size - 1 }]}>{b.n}.</Text>
              <Text style={[styles.rowBody, { fontSize: size, color }]}>
                {inline(b.text, size, color)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={b.key} style={[styles.body, { fontSize: size, color }]}>
            {inline(b.text, size, color)}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * Inline formatting: **bold** and `code`.
 *
 * Split on the markers rather than replacing them, so an unmatched ** is
 * rendered as literal text instead of swallowing the rest of the paragraph.
 */
function inline(text, size, color) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={i} style={{ fontWeight: '700', color }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={i} style={{ fontFamily: 'Courier', fontSize: size - 1, color: ZC.accent }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  gap: { height: 8 },
  heading: { fontWeight: '800', marginTop: 4, marginBottom: 4, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 3 },
  dot: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  num: { fontWeight: '700', lineHeight: 22, minWidth: 18 },
  // NO flex here. A standalone paragraph sits directly in a column, and flex:1
  // made every one of them stretch to fill the available height — which is
  // where the screen-high gaps between paragraphs came from.
  body: { lineHeight: 22 },
  // Inside a row, flex:1 is correct: it lets the text wrap beside the marker.
  rowBody: { flex: 1, lineHeight: 22 },
});
