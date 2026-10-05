import { TherapistColors } from '../constants/colors';

/**
 * The therapy module's button system.
 *
 * Taken from the Appointments card, which is the treatment to match: a pill
 * with a visible border, a white (or near-white) fill, and the ACTION'S OWN
 * COLOUR carried by the border and the label. That is what makes Remove read as
 * destructive and Cancel as neutral without either shouting.
 *
 * Three ranks, and only one of them is filled:
 *
 *   primary   solid pine, white label — one per screen, the thing you came to do
 *   outline   white fill, pine border and label — the ordinary action
 *   danger    white fill, red border and label — destructive, never solid
 *
 * A solid fill for every button is what made these screens look heavy; the
 * outline is the default and `primary` is the exception.
 */

const base = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 12,
  paddingHorizontal: 16,
  // Pill, per the reference. The old 10px radius read as a form control.
  borderRadius: 999,
  borderWidth: 1,
};

export const btn = {
  primary: {
    ...base,
    backgroundColor: TherapistColors.primary,
    borderColor: TherapistColors.primary,
  },
  // White, not the glass tint: a button must stay legible when it sits on a
  // card that is already translucent.
  outline: {
    ...base,
    backgroundColor: '#ffffff',
    borderColor: TherapistColors.primary,
  },
  danger: {
    ...base,
    backgroundColor: '#ffffff',
    borderColor: '#c98b86',
  },
  disabled: { opacity: 0.45 },
};

export const btnText = {
  // White on the pine fill — 10:1. The label was near-black here, which on
  // pine is barely legible.
  primary: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  outline: { color: TherapistColors.primary, fontSize: 14, fontWeight: '700' },
  danger:  { color: '#8c322d', fontSize: 14, fontWeight: '700' },
};

export default btn;
