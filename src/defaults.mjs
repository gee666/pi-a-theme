import { normalizeColor } from './palette.mjs';

// Mix 18% white into the reported terminal background, without changing it.
export function lighterBase(background) {
  const hex = normalizeColor(background);
  return '#' + hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16);
    return Math.round(value + (255 - value) * 0.18).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}
