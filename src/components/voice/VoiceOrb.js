import React, { memo, useEffect, useRef, useState } from "react";
import { TouchableOpacity } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { ZC } from "../../constants/zencare";

// NessaHub's colours in the places the Bankai orb used its own.
const brand = { teal: ZC.accent, tealDeep: ZC.accentDeep, orange: "#e8a33d" };

/**
 * The voice-mode visual: three wavy rings in NessaHub's colours around a glowing core.
 *
 * Each state has its own motion so the person can tell, without reading anything, whose turn
 * it is:
 *   listening — the rings ripple with the microphone level; silence is almost still.
 *   thinking  — the rings draw in and spin, and an orange spark circles them.
 *   speaking  — the core breathes and the rings pulse at speech rhythm.
 *   muted     — grey and still.
 *
 * The level arrives through a ref, not a prop: it changes ~10 times a second, and every change
 * as a prop would re-render the parent chat screen with it.
 *
 * Ported from the Bankai care assistant (fnb-ai/mobile), colours aside.
 */
const SIZE = 168;
const C = SIZE / 2;
const POINTS = 48;
// Each frame is a React render plus three SVG paths sent to native. At the display's 60Hz that
// starved the JS thread the chat also runs on, and a reply took over a minute to type out.
const FRAME_MS = 33;

const RINGS = [
  { color: brand.teal, base: 50, lobes: 3, speed: 0.9, amp: 0.16, width: 3.2, opacity: 0.95 },
  { color: ZC.accentLight, base: 56, lobes: 5, speed: -0.7, amp: 0.12, width: 2.4, opacity: 0.8 },
  { color: brand.orange, base: 44, lobes: 4, speed: 1.3, amp: 0.1, width: 2, opacity: 0.75 },
];

function ringPath(ring, t, energy, spin) {
  let d = "";
  for (let i = 0; i <= POINTS; i += 1) {
    const a = (i / POINTS) * Math.PI * 2;
    const wobble =
      Math.sin(ring.lobes * a + t * ring.speed * 2 + spin) * ring.amp * energy +
      Math.sin((ring.lobes + 2) * a - t * 1.7) * 0.03 * (0.4 + energy);
    const r = ring.base * (1 + wobble);
    const x = C + r * Math.cos(a + spin * ring.speed);
    const y = C + r * Math.sin(a + spin * ring.speed);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

function VoiceOrb({ state = "listening", levelRef, onPress }) {
  const [t, setT] = useState(0);
  const smooth = useRef(0);
  const spin = useRef(0);

  useEffect(() => {
    let raf;
    let last = Date.now();
    const start = last;
    let drawn = 0;
    const tick = () => {
      const now = Date.now();
      if (now - drawn < FRAME_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      drawn = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const time = (now - start) / 1000;

      let target;
      if (state === "listening") target = levelRef?.current ?? 0;
      else if (state === "speaking")
        // No output meter on every platform, so speech rhythm is synthesised: two slow beats
        // multiplied give an uneven, syllable-like pulse instead of a metronome.
        target = 0.35 + 0.45 * Math.abs(Math.sin(time * 6.1)) * Math.abs(Math.sin(time * 2.3));
      else if (state === "thinking") target = 0.25;
      else target = 0.05;
      // Rise fast, fall slow: how a VU meter reads, and why it looks alive rather than jittery.
      const k = target > smooth.current ? 0.35 : 0.08;
      smooth.current += (target - smooth.current) * k;
      spin.current += dt * (state === "thinking" ? 2.4 : 0.25);

      setT(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, levelRef]);

  const energy = smooth.current;
  const muted = state === "muted";
  const coreR = 30 + energy * (state === "speaking" ? 9 : 6) + (state === "thinking" ? -4 : 0);
  const sparkA = spin.current * 1.6;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={state === "speaking" ? "Interrupt" : "Voice"}
    >
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="core" cx="45%" cy="40%" r="60%">
            <Stop offset="0" stopColor={muted ? "#C9D4D3" : "#E8FFFC"} />
            <Stop offset="0.55" stopColor={muted ? "#9FB1AF" : brand.teal} />
            <Stop offset="1" stopColor={muted ? "#7E918F" : brand.tealDeep} />
          </RadialGradient>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0.5" stopColor={brand.teal} stopOpacity={muted ? 0 : 0.18 + energy * 0.2} />
            <Stop offset="1" stopColor={brand.teal} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={C} cy={C} r={C} fill="url(#halo)" />
        {RINGS.map((ring, i) => (
          <Path
            key={i}
            d={ringPath(ring, t, muted ? 0 : energy, spin.current)}
            stroke={muted ? "#B7C4C2" : ring.color}
            strokeWidth={ring.width}
            strokeOpacity={ring.opacity}
            fill="none"
          />
        ))}
        <Circle cx={C} cy={C} r={coreR} fill="url(#core)" />
        {state === "thinking" && (
          <Circle
            cx={C + 62 * Math.cos(sparkA)}
            cy={C + 62 * Math.sin(sparkA)}
            r={4}
            fill={brand.orange}
          />
        )}
      </Svg>
    </TouchableOpacity>
  );
}

// Memoised so a chat re-render (every reply tick) does not re-render the orb as well.
export default memo(VoiceOrb);
