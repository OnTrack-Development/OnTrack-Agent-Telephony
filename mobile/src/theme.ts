/** Global color tokens. Runtime mutation is deliberate: all C.* references continue
 * to work as screens re-render, avoiding two disconnected theme systems.
 * No data/network or permissions change as a result of a visual preference.
 */
export type ThemePreference='system'|'light'|'dark';
const dark={
 bg:'#090D14',surface:'#141B26',surface2:'#1D2735',elevated:'#263244',
 stroke:'#2C394A',muted:'#A1AEC1',text:'#F7F9FD',red:'#EF5067',
 redDark:'#3C212B',green:'#47D9B3',orange:'#F3B95E',blue:'#7CB5FF',
 purple:'#B99BFE',white:'#FFFFFF'
};
const light={
 bg:'#F3F3F3',surface:'#FFFFFF',surface2:'#F3F3F4',elevated:'#EAEAEC',
 stroke:'#E1E1E5',muted:'#676E7C',text:'#202228',red:'#C83D60',
 redDark:'#F7E5EA',green:'#177D60',orange:'#A46719',blue:'#2867A3',
 purple:'#7550A8',white:'#FFFFFF'
};
export const C:{[K in keyof typeof dark]:string}={...dark};
const homeDark={
 bg:'#090D14',paper:'#141B26',soft:'#1D2735',ink:'#F7F9FD',
 muted:'#A1AEC1',stroke:'#2C394A',accent:'#EF5067',accentSoft:'#3C212B',
 green:'#47D9B3',red:'#EF5067'
};
const homeLight={
 bg:'#F3F3F3',paper:'#FFFFFF',soft:'#F4F4F5',ink:'#1F2024',
 muted:'#777B84',stroke:'#E6E6E8',accent:'#C83D60',accentSoft:'#FBEDF1',
 green:'#178263',red:'#CE4864'
};
export const HOME:{[K in keyof typeof homeDark]:string}={...homeLight};
export function applyThemePalette(mode:'light'|'dark'):void{
 Object.assign(C,mode==='dark'?dark:light);
 Object.assign(HOME,mode==='dark'?homeDark:homeLight);
}
export const SP={xs:6,sm:10,md:16,lg:22,xl:28,xxl:36};
export const RADII={sm:11,md:15,lg:20,xl:25} as const;
export function compact(n:number){return n>=1000?(n/1000).toFixed(1)+'K':String(n);}
export function money(n:number,currency='EGP'){
 return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)+' '+currency;
}
