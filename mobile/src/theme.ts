export const C = {
 bg:'#0A0E15',surface:'#141B26',surface2:'#1D2735',elevated:'#243143',
 stroke:'#2B3645',muted:'#A3B0C1',text:'#F4F7FB',
 red:'#E84657',redDark:'#3A1A27',green:'#3AD6AD',
 orange:'#F5B968',blue:'#75B2FC',purple:'#B99AF9',white:'#FFFFFF'
} as const;
export const SP={xs:6,sm:10,md:16,lg:22,xl:28};
export function compact(n:number){return n>=1000?`${(n/1000).toFixed(1)}K`:`${n}`;}
export function money(n:number,currency='EGP'){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)} ${currency}`;}
