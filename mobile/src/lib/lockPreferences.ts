import * as SecureStore from 'expo-secure-store';
import {md5} from 'js-md5';

/** Opt-in local application lock; WHMCS server credentials remain in encrypted storage. */
export type LockPolicy='off'|'on_launch'|'after_5m'|'immediate';
const allowed:LockPolicy[]=['off','on_launch','after_5m','immediate'];
const key=(baseUrl:string)=>'whmcs-lock-policy-v2-'+md5(baseUrl.trim().toLowerCase().replace(/\/+$/,''));
const opts={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
export async function readLockPolicy(baseUrl:string):Promise<LockPolicy>{
 const value=await SecureStore.getItemAsync(key(baseUrl));
 return allowed.includes(value as LockPolicy)?value as LockPolicy:'after_5m';
}
export async function saveLockPolicy(baseUrl:string,policy:LockPolicy):Promise<void>{
 if(!allowed.includes(policy))throw Error('سياسة قفل غير صالحة');
 await SecureStore.setItemAsync(key(baseUrl),policy,opts);
}
export function shouldLockOnResume(policy:LockPolicy,backgroundAt:number,now:number):boolean{
 if(policy==='off'||policy==='on_launch'||backgroundAt<=0)return false;
 if(policy==='immediate')return true;
 return now-backgroundAt>=5*60*1000;
}
