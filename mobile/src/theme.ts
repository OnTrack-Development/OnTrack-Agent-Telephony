/** Premium, calm dark-on-dark system. Keep OnTrack's red identity; no Thndr branding. */
export const C={
 bg:'#090D14',
 surface:'#141B26',
 surface2:'#1D2735',
 elevated:'#263244',
 stroke:'#2C394A',
 muted:'#A1AEC1',
 text:'#F7F9FD',
 red:'#EF5067',
 redDark:'#3C212B',
 green:'#47D9B3',
 orange:'#F3B95E',
 blue:'#7CB5FF',
 purple:'#B99BFE',
 white:'#FFFFFF'
} as const;
export const SP={xs:6,sm:10,md:16,lg:22,xl:28,xxl:36};
export const RADII={sm:11,md:15,lg:20,xl:25} as const;
export function compact(n:number){return n>=1000?(n/1000).toFixed(1)+'K':String(n);}
export function money(n:number,currency='EGP'){
 return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)+' '+currency;
}
