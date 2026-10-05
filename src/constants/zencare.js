// ─── ZenCare theme (mobile) ──────────────────────────────────────────────────
// The mobile half of the therapy module's visual language: a warm off-white
// ground, pine-green accent, near-black ink, and frosted glass panels.
//
// Kept in step with the web tokens in Telehealth/src/styles/zencare.css. The two
// files are the same design expressed twice, so a colour changed in one must be
// changed in the other — there is no shared build between the apps to do it for
// us, and drift between platforms is exactly what this module cannot afford.
// Every value below is copied from a --zc-* custom property in that file.

export const ZC = {
  // ── Ground ───────────────────────────────────────────────────────────────
  // Warm off-white, not pure white. The warmth is what keeps a light UI from
  // reading as clinical, and it gives the glass panels something to sit on.
  bg:       '#eceaf2',
  bgWarm:   '#e6e3ee',
  surface:  '#ffffff',
  surface2: '#f7f7fb',

  // ── Accent ───────────────────────────────────────────────────────────────
  // Deep pine. The only saturated colour: primary actions, active nav, the one
  // emphasised word in a headline. Never body text.
  accent:      '#5046bd',
  // Used wherever accent text may land on the BARE artwork rather than on a
  // card: #4a41b0 measures 4.02 there, just under the floor, so the deep step
  // goes to #3f3796 (4.89 on artwork, 7.33 on a card, 9.55 under white).
  accentDeep:  '#3f3796',
  accentLight: '#7870e8',
  accentWash:  'rgba(120, 112, 232, 0.10)',

  // ── Ink ──────────────────────────────────────────────────────────────────
  // A four-step ramp on light. `ink` is headlines, `ink2` body, `ink3` the
  // quietest text that still has to pass contrast (~7:1 on the ground). `ink4`
  // is for disabled and decorative only — it does NOT pass AA, so never put
  // real information in it.
  ink:  '#101010',
  ink2: '#3d3d3d',
  ink3: '#44474f',
  ink4: '#9a9a9a',

  white: '#ffffff',

  // ── Glass ────────────────────────────────────────────────────────────────
  // React Native has no backdrop-filter, so the frosted effect comes from
  // expo-blur's BlurView (see components/GlassCard). These are the tint and
  // stroke that go OVER that blur.
  //
  // The stroke is not decoration. On a plain light ground, blur alone does not
  // separate a panel from the page — the near-white border is what reads as the
  // thickness of the glass edge and makes the panel legible as a distinct
  // surface. Dropping it is what makes glass collapse into "just a white card".
  glass:       'rgba(255, 255, 255, 0.60)',
  glassStrong: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.75)',
  // A second, darker hairline under the top edge sells the refraction.
  glassEdge:   'rgba(120, 112, 232, 0.12)',
  blurAmount:  32,

  // Status — muted to belong to the palette, but each dark enough to stay
  // readable as text on the light ground rather than being merely decorative.
  // #15803d failed even on a glass card (3.85). This is the lightest green
  // that clears 4.5 on the bare artwork too.
  success: '#0f5628',
  // Both of these failed even on a glass card over this artwork (3.58 and
  // 4.20). Deepened to the lightest step that clears 4.5 on a card AND on the
  // bare ground, so a status label is safe wherever it lands.
  warning: '#734e12',
  danger:  '#8c322d',
};

/**
 * Display face. Web uses Outfit; mobile falls back to the platform sans rather
 * than shipping a font file. Load Outfit through expo-font if the match needs
 * to be exact.
 */
export const ZC_SERIF = undefined;      // kept: older screens still import it

export const ZC_TRACK_WIDE = 1.6;
export const ZC_TRACK = 0.8;

export const ZC_RADIUS = 20;            // the reference's cards are softly round
export const ZC_RADIUS_PILL = 999;

/**
 * Layered shadow. NN/G's point about simple backgrounds: when there is no busy
 * imagery behind the glass, depth has to come from strokes and shadow instead
 * of from the blur. Two stacked shadows read as a panel floating above the
 * ground; a single hard one reads as a sticker.
 */
export const zcShadow = {
  shadowColor: '#1c2a27',
  shadowOpacity: 0.07,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};

/** Shared shapes, so a card or a button looks the same on every screen. */
export const zcStyles = {
  screen:     { flex: 1, backgroundColor: ZC.bg },
  heroScreen: { flex: 1, backgroundColor: ZC.bgWarm },

  card: {
    // Translucent rather than solid white, with a near-white stroke: over the
    // ground artwork this reads as a glass panel instead of a flat sheet. Every
    // MedPsych panel comes through here, so the treatment is set once.
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: ZC_RADIUS,
    padding: 18,
    ...zcShadow,
  },

  cardSelected: { borderColor: ZC.accent, borderWidth: 1.5 },

  display: { fontSize: 30, lineHeight: 36, color: ZC.ink, fontWeight: '700', letterSpacing: -0.5 },
  title:   { fontSize: 21, color: ZC.ink, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 16, fontWeight: '700', color: ZC.ink },

  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: ZC_TRACK_WIDE,
    textTransform: 'uppercase',
    color: ZC.accent,
  },

  body: { fontSize: 15, lineHeight: 23, color: ZC.ink2 },
  meta: { fontSize: 12, color: ZC.ink3 },
  stat: { fontSize: 30, color: ZC.ink, fontWeight: '700', letterSpacing: -0.5 },

  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: ZC_RADIUS_PILL,
    borderWidth: 1,
    borderColor: 'rgba(47,93,84,0.22)',
    backgroundColor: ZC.accentWash,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: ZC_TRACK_WIDE,
    textTransform: 'uppercase',
    color: ZC.accentDeep,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────
  // Pills, per the reference. Primary is pine with a WHITE label (12.8:1);
  // the old gold fill needed dark text, this does not.
  btnPrimary: {
    backgroundColor: ZC.accent,
    borderRadius: ZC_RADIUS_PILL,
    paddingVertical: 16,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: ZC.white, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  btnWhite: {
    backgroundColor: ZC.white,
    borderRadius: ZC_RADIUS_PILL,
    paddingVertical: 16,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.10)',
  },
  btnWhiteText: { color: ZC.ink, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // Outline: a pine border on light. The old near-white border was written for
  // the navy ground and is invisible here.
  btnGhost: {
    borderWidth: 1.5,
    borderColor: 'rgba(47,93,84,0.35)',
    borderRadius: ZC_RADIUS_PILL,
    paddingVertical: 16,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { color: ZC.accentDeep, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  btnGoldOutline: {           // name kept so existing imports keep resolving
    borderWidth: 1.5,
    borderColor: 'rgba(47,93,84,0.35)',
    borderRadius: ZC_RADIUS_PILL,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoldOutlineText: { color: ZC.accentDeep, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: ZC_TRACK,
    textTransform: 'uppercase',
    color: ZC.ink3,
    marginBottom: 7,
  },

  input: {
    backgroundColor: ZC.white,
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: ZC.ink,
    fontSize: 15,
  },

  /* The whole row is the tap target for a policy tick, not just the box. */
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.10)',
    borderRadius: 12,
    backgroundColor: ZC.white,
  },
  checkOn: { borderColor: ZC.accent, backgroundColor: ZC.accentWash },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: ZC_RADIUS_PILL,
    backgroundColor: ZC.accentWash,
    borderWidth: 1,
    borderColor: 'rgba(47,93,84,0.20)',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: ZC_TRACK,
    textTransform: 'uppercase',
    color: ZC.accentDeep,
  },

  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ZC.accentWash,
    borderWidth: 1, borderColor: 'rgba(47,93,84,0.25)',
  },
  avatarText: { fontSize: 18, color: ZC.accentDeep, fontWeight: '700' },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,13,13,0.07)',
  },

  rule: { height: 1, backgroundColor: 'rgba(13,13,13,0.08)', marginVertical: 18 },
};

/* ─── Back-compat aliases ─────────────────────────────────────────────────────
   The navy/gold theme these screens were written against is gone, but ~40 files
   still reference its token names. Left unmapped they resolve to `undefined`,
   which React Native silently ignores — so text keeps its default black and
   borders vanish, with no error to point at it.

   Each is mapped by HOW IT WAS USED, not by name. The gold tokens were the
   accent, so they become pine; the navy tokens were grounds and hairlines, so
   they become the light ground and a dark hairline. `cream`/`muted`/`faint`
   were light-on-dark text and become the dark ink ramp — none lighter than
   ink3, so nothing drops below AA on the new ground.

   Deprecated: use the ZC.* names above in new code. */
ZC.gold       = ZC.accent;
ZC.goldBright = ZC.accent;
ZC.goldPale   = ZC.accentLight;
ZC.goldDeep   = 'rgba(95,84,214,0.35)';
ZC.cream      = ZC.ink2;
ZC.body       = ZC.ink2;
ZC.muted      = ZC.ink3;
ZC.faint      = ZC.ink3;
ZC.navy       = ZC.bg;
ZC.navyDeep   = ZC.bg;
ZC.navyRaised = ZC.surface;
ZC.hero       = ZC.bgWarm;
ZC.navyLine   = 'rgba(16,16,16,0.10)';
