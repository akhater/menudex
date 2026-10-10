// Inline SVG icons. Tab icons approximate the camera's own menu glyphs.
const P = {
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.3" r="3.4"/>',
  movie: '<rect x="3" y="7" width="12" height="10" rx="1.5"/><path d="m15 11 6-3.5v9L15 13"/>',
  play: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="m10 8.5 5.5 3.5-5.5 3.5Z" fill="currentColor"/>',
  af: '<text x="12" y="16.6" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui,sans-serif" fill="currentColor" stroke="none">AF</text>',
  network: '<path d="M3 15.5 7 9l4 6.5L15 9l2.6 4.2"/><path d="m15.5 13.6 2.3.4.6-2.3"/>',
  wrench: '<path d="M19.6 7.4a4.6 4.6 0 1 1-3-3.1l-2.5 2.5.6 2.4 2.4.6Z"/><path d="m11.2 12.8-6.4 6.4" stroke-width="2.6"/>',
  dial: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  cfn: '<rect x="3.5" y="7" width="17" height="12" rx="1.5"/><path d="M8.5 7 10 4.5h4L15.5 7"/><path d="M14 11.2a2.6 2.6 0 1 0 0 3.6" />',
  star: '<path d="m12 3.5 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7Z" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  chevron: '<path d="m9.5 5 7 7-7 7"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5h14V12"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  starOutline: '<path d="m12 3.5 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7Z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 2"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
