// Checks every text token against canvas, surface and its own 13% tinted pill, in both themes (WCAG AA 4.5:1).
const T = {
  light: { canvas: '#F5F3FA', surface: '#FFFFFF', 'surface-2': '#EEEBF6', ink: '#1C1830', 'ink-2': '#5A5470', dusk: '#4B3FA8', ember: '#A3460F', cure: '#15734D', caution: '#8F5A00', roll: '#B42345', sample: '#6B4BB8' },
  dark: { canvas: '#100D1C', surface: '#191529', 'surface-2': '#231E37', ink: '#ECE9F7', 'ink-2': '#ABA5C2', dusk: '#A99DF7', ember: '#F4A672', cure: '#5BD39A', caution: '#F0BE5A', roll: '#FF7D98', sample: '#C3AEFF' },
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
let fail = 0;
for (const [theme, t] of Object.entries(T)) for (const tok of ['ink', 'ink-2', 'dusk', 'ember', 'cure', 'caution', 'roll', 'sample']) {
  const fg = rgb(t[tok]);
  for (const [bgName, bg] of [['canvas', rgb(t.canvas)], ['surface', rgb(t.surface)], ['surface-2', rgb(t['surface-2'])], ['pill', mix(fg, rgb(t.surface), 0.13)]]) {
    const r = ratio(fg, bg); if (r < 4.5) { fail++; console.log(`FAIL ${theme} ${tok} on ${bgName}: ${r.toFixed(2)}`); }
  }
}
console.log(fail ? `${fail} failures` : 'All text tokens pass WCAG AA in both themes');
process.exit(fail ? 1 : 0);
