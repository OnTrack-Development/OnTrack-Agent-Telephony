import * as SecureStore from 'expo-secure-store';
import {Appearance} from 'react-native';
import {applyThemePalette,ThemePreference} from '../theme';

const key='whmcs-display-theme-preference-v1';
export function realAppearance(preference:ThemePreference):'light'|'dark'{
 return preference==='system'?(Appearance.getColorScheme()==='dark'?'dark':'light'):preference;
}
export function setPalettePreference(preference:ThemePreference):'light'|'dark'{
 const actual=realAppearance(preference);
 applyThemePalette(actual);
 return actual;
}
export async function readThemePreference():Promise<ThemePreference>{
 const raw=await SecureStore.getItemAsync(key).catch(()=>null);
 if(raw==='light'||raw==='dark')return raw;
 return 'system';
}
export async function writeThemePreference(value:ThemePreference):Promise<void>{
 if(value!=='system'&&value!=='light'&&value!=='dark')throw Error('Invalid theme preference');
 await SecureStore.setItemAsync(key,value,{
  keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
 });
}
