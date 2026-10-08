import { normalizeColor } from './palette.ts';

export const DEFAULT_SETTINGS = Object.freeze({ color: '#CD9D8A', accent: '#CC397B' });

// Mix 18% white into the reported terminal background, without changing it.
export function lighterBase(background) {
  const hex = normalizeColor(background);
  return '#' + hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16);
    return Math.round(value + (255 - value) * 0.18).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}
