/**
 * The voice orbs: five glassy, layered shapes, one picked at random for each voice
 * conversation. Each is a stack of translucent layers with bright rims around a glowing core,
 * drawn from a shape function so it can move with the voice. A copy of the web's
 * Telehealth/src/component/Common/voice/orbThemes.js — keep the two in step.
 */

export const ORB_THEMES = [
  {
    id: 'lotus',            // eight-pointed star petals, interleaved — violet
    shape: 'star', lobes: 8, amp: 0.3, layers: 4, interleave: true,
    bg: '#45405a', base: '#7d6bd6', light: '#d9ccff', core: '#a77ff0', deep: '#4b2fb0', rim: '#efe8ff',
  },
  {
    id: 'ripple',           // soft wavy rings — blue
    shape: 'wave', lobes: 9, amp: 0.075, layers: 5,
    bg: '#454a58', base: '#6f97ec', light: '#d6e4ff', core: '#86b1ff', deep: '#2d5fd6', rim: '#f2f6ff',
  },
  {
    id: 'pebble',           // rounded pentagon pebbles — mint
    shape: 'round', lobes: 5, amp: 0.045, layers: 4,
    bg: '#525a54', base: '#8fcfac', light: '#eef8e2', core: '#c9ecc8', deep: '#3f9b78', rim: '#f4fff6',
  },
  {
    id: 'lime',             // soft five-point star — lime
    shape: 'round', lobes: 5, amp: 0.12, layers: 5,
    bg: '#565b45', base: '#b9da4e', light: '#f3ffb8', core: '#cdea5a', deep: '#7fa21d', rim: '#fbffd9',
  },
  {
    id: 'blossom',          // five-petal flower — gold
    shape: 'flower', lobes: 5, amp: 0.2, layers: 3,
    bg: '#5e5444', base: '#f0c24c', light: '#fff1b0', core: '#ffc93f', deep: '#d58a12', rim: '#fff8d6',
  },
];

export const pickOrbTheme = () => Math.floor(Math.random() * ORB_THEMES.length);

/** Radius multiplier (around 1) at angle `a` for a theme's outline. */
export function outline(theme, a, energy) {
  const t = theme.lobes * a;
  const amp = theme.amp * (1 + energy * 0.6);
  switch (theme.shape) {
    case 'star': {
      // 0 at a tip, 1 in a valley: straight-ish petal edges with pointed tips.
      const g = Math.acos(Math.cos(t)) / Math.PI;
      return 1 - amp * Math.pow(g, 1.15);
    }
    case 'wave':
      return 1 + amp * Math.sin(t);
    case 'flower': {
      // Fuller petals, narrower gaps between them.
      const c = Math.cos(t);
      return 1 + amp * (c >= 0 ? Math.pow(c, 0.7) : -Math.pow(-c, 1.6));
    }
    default:           // 'round'
      return 1 + amp * Math.cos(t) + amp * 0.18 * Math.cos(2 * t);
  }
}

/** Points of one layer, as [x, y] pairs around (cx, cy). */
export function layerPoints(theme, cx, cy, radius, rotation, energy, wobble, points = 96) {
  const out = [];
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (outline(theme, a, energy) + wobble * Math.sin(a * (theme.lobes + 2)));
    out.push([cx + r * Math.cos(a + rotation), cy + r * Math.sin(a + rotation)]);
  }
  return out;
}
