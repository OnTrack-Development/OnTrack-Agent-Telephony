/** Small pure state holder: does not load expo-notifications during WhatsApp tests. */
let registered=false;
export function setRemotePushRegistered(value:boolean):void{registered=value;}
export function isRemotePushRegistered():boolean{return registered;}
