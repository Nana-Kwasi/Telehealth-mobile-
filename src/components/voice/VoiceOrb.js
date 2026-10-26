import React, { memo, useEffect, useRef, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { ORB_THEMES, layerPoints } from './orbThemes';

/**
 * The voice-mode orb: one of five glassy, layered designs (see orbThemes), chosen at random
 * for each conversation by the dock. The same designs as the web orb.
 *
 * Each state has its own motion so the person can tell whose turn it is without reading:
 *   listening — the layers swell and ripple with the microphone level
 *   thinking  — the layers turn, alternate ones the other way
 *   speaking  — the core breathes and the layers pulse at speech rhythm
 *   muted     — faded and still
 *
 * The level arrives through a ref, not a prop: it changes ~10 times a second, and every change
 * as a prop would re-render the parent chat screen with it.
 */
const SIZE = 168;
const C = SIZE / 2;
// Each frame is a React render plus a few SVG paths sent to native. At the display's 60Hz that
// starved the JS thread the chat also runs on, so frames are capped at about 30 a second.
const FRAME_MS = 33;

const toD = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';

function VoiceOrb({ state = 'listening', levelRef, onPress, variant = 0 }) {
  const [, setFrame] = useState(0);
  const smooth = useRef(0);
  const spin = useRef(0);
  const time = useRef(0);
  const theme = ORB_THEMES[variant % ORB_THEMES.length];

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
      const t = (now - start) / 1000;
      let target;
      if (state === 'listening') target = levelRef?.current ?? 0;
      // No output meter, so speech rhythm is synthesised: two slow beats multiplied give an
      // uneven, syllable-like pulse instead of a metronome.
      else if (state === 'speaking') target = 0.3 + 0.45 * Math.abs(Math.sin(t * 6.1)) * Math.abs(Math.sin(t * 2.3));
      else if (state === 'thinking') target = 0.15;
      else target = 0;
      // Rise fast, fall slow — reads as alive rather than jittery.
      smooth.current += (target - smooth.current) * (target > smooth.current ? 0.35 : 0.08);
      spin.current += dt * (state === 'thinking' ? 1.1 : 0.06);
      time.current = t;
      setFrame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, levelRef]);

  const muted = state === 'muted';
  const energy = muted ? 0 : smooth.current;
  const n = theme.layers;
  // A star's points are its full radius; outward lobes need room to swell inside the circle.
  const outerR = (C * 0.88) / (theme.shape === 'star' ? 1 : 1 + theme.amp * 1.25);
  const innerR = C * 0.3;

  const layers = [];
  for (let k = 0; k < n; k += 1) {
    const f = n === 1 ? 1 : k / (n - 1);                   // 0 outer … 1 core
    const radius = (outerR - (outerR - innerR) * f) * (1 + energy * (0.1 - f * 0.05));
    const dir = k % 2 ? -1 : 1;
    const rotation = (theme.interleave ? (k * Math.PI) / theme.lobes : 0) + spin.current * dir * (1 - f * 0.4);
    const wobble = energy * 0.025 * Math.sin(time.current * (3 + k));
    layers.push({
      k,
      core: k === n - 1,
      f,
      d: toD(layerPoints(theme, C, C, radius, rotation, energy * (1 - f), wobble, 72)),
      inner: toD(layerPoints(theme, C, C, radius * 0.975, rotation, energy * (1 - f), wobble, 56)),
    });
  }
  const hole = toD(layerPoints(theme, C, C, C * 0.055 * (1 + energy * 0.3), spin.current * 2, 0, 0, 36));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={state === 'speaking' ? 'Interrupt' : 'Voice'}
    >
      <Svg width={SIZE} height={SIZE} opacity={muted ? 0.45 : 1}>
        <Defs>
          {/* On white: no tinted tile behind the orb, just a faint glow of its own colour. */}
          <RadialGradient id="bd" cx="50%" cy="50%" r="50%">
            <Stop offset="0.3" stopColor={theme.base} stopOpacity={0.16 + energy * 0.14} />
            <Stop offset="1" stopColor={theme.base} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glass" cx="45%" cy="40%" r="60%">
            <Stop offset="0" stopColor={theme.light} stopOpacity={0.55} />
            <Stop offset="1" stopColor={theme.base} stopOpacity={0.52} />
          </RadialGradient>
          <RadialGradient id="core" cx="45%" cy="40%" r="60%">
            <Stop offset="0" stopColor={theme.light} />
            <Stop offset="0.55" stopColor={theme.core} />
            <Stop offset="1" stopColor={theme.deep} />
          </RadialGradient>
        </Defs>
        <Circle cx={C} cy={C} r={C} fill="url(#bd)" />
        {layers.map((l) => (
          <React.Fragment key={l.k}>
            {/* A coloured edge (it has to show on white) with a bright line just inside. */}
            <Path d={l.d} fill={l.core ? 'url(#core)' : 'url(#glass)'} stroke={theme.deep}
              strokeOpacity={l.core ? 0.7 : 0.6} strokeWidth={l.core ? 1.3 : 1.5} strokeLinejoin="round" />
            <Path d={l.inner} fill="none" stroke={theme.rim} strokeOpacity={0.95} strokeWidth={1.1} />
          </React.Fragment>
        ))}
        <Path d={hole} fill="#ffffff" stroke={theme.deep} strokeOpacity={0.8} strokeWidth={1} />
      </Svg>
    </TouchableOpacity>
  );
}

// Memoised so a chat re-render (every reply tick) does not re-render the orb as well.
export default memo(VoiceOrb);
