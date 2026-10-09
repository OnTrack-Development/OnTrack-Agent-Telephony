import React, {useEffect, useRef, useState} from 'react';
import {AppState, Linking, Modal, Platform, Pressable, View} from 'react-native';
import {C} from '../theme';
import {Action, Icon, T} from '../components/UI';

type Release = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  body?: string;
  assets?: Array<{name?: string; browser_download_url?: string; size?: number}>;
};
type Update = {version: string; downloadUrl: string; size: number; notes: string};
const INSTALLED_VERSION = '0.2.2'; // Must match mobile/app.json; checked by CI.
const API = 'https://api.github.com/repos/OnTrack-Development/OnTrack-Agent-Telephony/releases?per_page=15';
const RELEASE_DOWNLOAD_PREFIX = 'https://github.com/OnTrack-Development/OnTrack-Agent-Telephony/releases/download/';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// A release is eligible only if it belongs to the Command app, carries a signed APK,
// and has a strictly higher semantic version than the installed Android package.
export function parseVersion(value: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function newerThan(incoming: string, current: string): boolean {
  const next = parseVersion(incoming), prev = parseVersion(current);
  if (!next || !prev) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] !== prev[i]) return (next[i] ?? 0) > (prev[i] ?? 0);
  }
  return false;
}
export function chooseRelease(releases: Release[], currentVersion: string): Update | null {
  let selected: Update | null = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const match = /^command-v(\d+\.\d+\.\d+)-(\d+)$/.exec(release.tag_name || '');
    const version = match?.[1];
    if (!version || !newerThan(version, currentVersion)) continue;
    const file = (release.assets || []).find(asset =>
      /^OnTrack-Command-v\d+\.\d+\.\d+-ARM64-release-signed\.apk$/.test(asset.name || '') &&
      (asset.browser_download_url || '').startsWith(RELEASE_DOWNLOAD_PREFIX + release.tag_name + '/') &&
      (asset.size || 0) > 0
    );
    if (!file || !file.browser_download_url) continue;
    if (!selected || newerThan(version, selected.version)) {
      selected = {
        version,
        downloadUrl: file.browser_download_url,
        size: file.size || 0,
        notes: (release.body || '').slice(0, 400)
      };
    }
  }
  return selected;
}

export function UpdateGate() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);
  const lastCheck = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    const check = async () => {
      const now = Date.now();
      if (busy.current || now - lastCheck.current < CHECK_INTERVAL_MS) return;
      busy.current = true;
      lastCheck.current = now;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(API, {
          headers: {Accept: 'application/vnd.github+json'},
          signal: controller.signal
        });
        if (!response.ok) return;
        const json: unknown = await response.json();
        if (!Array.isArray(json)) return;
        const installedVersion = INSTALLED_VERSION;
        const available = chooseRelease(json as Release[], installedVersion);
        if (mounted) setUpdate(available);
      } catch {
        // Network problems never interrupt WHMCS administration.
      } finally {
        clearTimeout(timeout);
        busy.current = false;
      }
    };
    void check();
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') void check();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, CHECK_INTERVAL_MS);
    return () => { mounted = false; sub.remove(); clearInterval(timer); };
  }, []);

  const download = async () => {
    if (!update) return;
    // External Android download/installer, NOT an embedded WebView. Android verifies
    // the APK's existing signing certificate before allowing an in-place upgrade.
    try {
      await Linking.openURL(update.downloadUrl);
      setHiddenVersion(update.version);
    } catch {
      setHiddenVersion(null);
    }
  };
  if (!update || hiddenVersion === update.version) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={() => setHiddenVersion(update.version)}>
    <View style={{flex:1,justifyContent:'center',padding:22,backgroundColor:'#000C'}}>
      <View style={{padding:22,borderRadius:24,borderColor:C.stroke,borderWidth:1,backgroundColor:C.surface,gap:13}}>
        <View style={{alignItems:'center',gap:8}}>
          <View style={{padding:13,borderRadius:18,backgroundColor:C.redDark}}>
            <Icon name="cellphone-arrow-down" size={32} color={C.red}/>
          </View>
          <T size={22} weight="900">تحديث جديد متاح</T>
          <T size={13} color={C.muted}>OnTrack Command v{update.version}</T>
          <T size={12} color={C.muted}>حجم التحميل: {(update.size / 1048576).toFixed(1)} MB</T>
        </View>
        <T size={12} color={C.muted}>يمكن تنزيل الإصدار الجديد وتثبيته فوق النسخة الحالية بدون حذف بيانات التطبيق. سيطلب أندرويد تأكيد التثبيت.</T>
        <Action label="تحديث الآن" icon="download" onPress={() => { void download(); }}/>
        <Pressable onPress={() => setHiddenVersion(update.version)} style={{alignItems:'center',padding:9}}>
          <T size={13} color={C.muted}>لاحقًا</T>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
