export const C = {
  bg: '#080D17', surface: '#121A29', surface2: '#1B2639', elevated: '#1E2D40',
  stroke: '#27344A', muted: '#7E91AD', text: '#F2F6FE', red: '#FF4464', redDark: '#431A2B',
  green: '#33D3A1', orange: '#FFAC63', blue: '#63A7FF', purple: '#B597FF', white: '#FFFFFF'
} as const;
export const SP = {xs: 6, sm: 10, md: 16, lg: 22, xl: 28};
export function compact(n: number) { return n >= 1000 ? `${(n/1000).toFixed(1)}K` : `${n}`; }
export function money(n: number, currency='EGP') { return `${new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n)} ${currency}`; }
