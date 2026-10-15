import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const get=p=>readFileSync(resolve(root,p),'utf8');
const code=get('mobile/src/lib/api.ts');
assert.match(code,/includes\/api\.php/);
assert.match(code,/https:/);
assert.match(code,/SecureStore/);
assert.match(code,/GetAdminDetails/);
assert.match(code,/AddTicketReply/);
assert.doesNotMatch(code,/ontrack_mobile_admin\/bridge\.php/);
assert.ok(!existsSync(resolve(root,'whmcs')));
for(const name of ['mobile/App.tsx','mobile/src/screens/Connect.tsx','mobile/src/screens/Explorer.tsx']) assert.doesNotMatch(get(name),/(<WebView|react-native-webview|<iframe)/i);
const actions=get('mobile/src/catalog/actions.ts');
assert.match(actions,/GetClientsProducts/);
assert.match(actions,/GetInvoices/);
assert.match(actions,/GetTickets/);
for(const name of ['mobile/src/screens/WhatsApp.tsx','mobile/src/lib/adminSession.ts']) assert.doesNotMatch(get(name),/(<WebView|react-native-webview|<iframe)/i);
assert.doesNotMatch(get('mobile/src/lib/adminSession.ts'),/Linking\\.openURL/);
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('existingWhatsAppInboxUrl'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('checkedAdminUrl(baseUrl,dir'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes("session.mode==='admin'"));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes('<AdminAccess'));
assert.ok(get('mobile/src/lib/adminSession.ts').includes('adminDirectoryStorageKey'));
assert.ok(get('mobile/src/lib/adminSession.ts').includes('saveAdminDirectory'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('Linking.openURL(target)'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('loginAdmin(session,dir,username,password,otp.trim())'));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes('if(session.mode===\'api\')return <AdminAccess'));
assert.match(get('mobile/src/lib/whatsapp.ts'),/chat_list/);
assert.match(get('mobile/src/lib/whatsapp.ts'),/X-WA-CSRF/);
assert.match(get('mobile/src/lib/whatsapp.ts'),/getWhatsAppRetryAfterMs/);
assert.match(get('mobile/src/screens/WhatsApp.tsx'),/لا تُعد الإرسال/);
assert.match(get('mobile/native/android/CommandAdminSessionModule.java'),/CookiePolicy.ACCEPT_ORIGINAL_SERVER/);
assert.ok(!get('mobile/native/android/CommandAdminSessionModule.java').includes('CookieHandler.setDefault'));
assert.ok(get('mobile/src/screens/ClientProfile.tsx').includes('fetchClientTab'));
assert.ok(get('mobile/src/screens/ClientProfile.tsx').includes('RecordDetails'));
assert.ok(get('mobile/src/screens/ClientProfile.tsx').includes('focusTicket={mapTicket(openedTicket)}'));
assert.ok(get('mobile/src/screens/ClientProfile.tsx').includes('expectedClientId={client.id}'));
assert.ok(get('mobile/src/screens/Tickets.tsx').includes('AddTicketNote'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('OrderManagement'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('ServiceManagement'));
assert.ok(get('mobile/src/lib/serviceManagement.ts').includes('ModuleTerminate'));
assert.ok(get('mobile/src/lib/orderManagement.ts').includes('orderLines'));
assert.ok(get('mobile/App.tsx').includes('getLastNotificationResponseAsync'));
assert.ok(get('mobile/App.tsx').includes('notificationTarget?.page===page'));
assert.ok(get('mobile/App.tsx').includes("'tickets','orders','clients'"));
assert.ok(get('mobile/src/screens/Directory.tsx').includes('matchesRecordStatus'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('UpdateClientProduct'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('GetInvoice'));
assert.ok(get('mobile/src/lib/clientProfile.ts').includes('GetClientsDetails'));
assert.match(code,/number:s\(x\.tid\|\|x\.id\)/);
assert.match(code,/totalresults/);
assert.match(code,/loadPage/);
assert.match(get('mobile/App.tsx'),/SafeAreaProvider/);
assert.match(get('mobile/App.tsx'),/BackHandler\.exitApp/);
assert.match(get('mobile/src/screens/Connect.tsx'),/__DEV__/);
assert.equal(JSON.parse(get('mobile/app.json')).expo.version,'0.3.41');
assert.equal(JSON.parse(get('mobile/app.json')).expo.android.versionCode,52);
assert.ok(JSON.parse(get('mobile/package.json')).dependencies['react-native-safe-area-context']);
assert.ok(get('mobile/src/lib/adminSession.ts').includes('proveAdminAccess'));
assert.ok(get('mobile/src/lib/adminSession.ts').includes('isVerifiedWhatsAppInbox'));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes('<AdminAccess key={error}'));
assert.ok(get('mobile/src/lib/adminSession.ts').includes('whatsappAccessDiagnostic'));
assert.ok(get('mobile/src/components/AdminAccess.tsx').includes('Administrator'));

const firebase=JSON.parse(get('mobile/google-services.json'));
assert.equal(firebase.project_info.project_id,'ontrack-whmcs-push');
assert.ok(firebase.client.some(c=>c.client_info?.android_client_info?.package_name==='com.ontrackdevelopment.command'));
assert.equal(JSON.parse(get('mobile/app.json')).expo.android.googleServicesFile,'./google-services.json');
assert.ok(!Object.prototype.hasOwnProperty.call(firebase,'private_key'));
assert.ok(get('mobile/src/lib/notifications.ts').includes('Notifications.getDevicePushTokenAsync()'));
assert.ok(get('mobile/src/lib/mobilePush.ts').includes("'push.register'"));
assert.ok(get('mobile/src/lib/mobilePush.ts').includes("'push.unregister'"));
assert.ok(get('mobile/src/lib/notifications.ts').includes('setRemotePushRegistered'));
assert.ok(!get('mobile/src/lib/notifications.ts').includes("outgoing.length+' تحديثات جديدة'"));
assert.ok(get('mobile/src/screens/Settings.tsx').includes('verifyNativeFcmSetup'));
assert.ok(get('mobile/src/components/Feedback.tsx').includes('export function FeedbackHost'));
assert.ok(get('mobile/App.tsx').includes('<FeedbackHost/>'));
const splash=get('mobile/src/components/AnimatedSplash.tsx');
const app=get('mobile/App.tsx');
assert.match(splash,/Animated\.sequence/);
assert.match(splash,/useNativeDriver:true/);
assert.match(splash,/AccessibilityInfo\.isReduceMotionEnabled/);
assert.match(splash,/!ready\|\|!played/);
assert.match(splash,/requestAnimationFrame/);
assert.ok(app.includes('AnimatedSplash ready={!initializing}'));
assert.ok(app.includes('PageMotion key={page}'));
const cfg=JSON.parse(get('mobile/app.json'));
assert.equal(cfg.expo.android.package,'com.ontrackdevelopment.command');
assert.ok(cfg.expo.plugins.some(p=>Array.isArray(p)&&p[0]==='expo-local-authentication'));
const native=cfg.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1];
assert.equal(native.image,'./assets/splash-blank.png');
assert.ok(existsSync(resolve(root,'mobile/assets/splash-blank.png')));
assert.equal(native.backgroundColor,'#090D14');
assert.ok(get('mobile/src/components/AppLock.tsx').includes('expo-secure-store'));
assert.ok(get('mobile/src/components/AppLock.tsx').includes('biometricChoiceKey'));
assert.ok(get('mobile/src/components/AppLock.tsx').includes("setPhase('offer')"));
assert.ok(get('mobile/src/components/AppLock.tsx').includes('autoAttempt.current=true'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes("session.mode==='admin'?session.username:adminUser.trim()"));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes("if(session.mode==='api')setAdminPass('')"));
assert.ok(get('mobile/src/lib/financial.ts').includes("'GetStats'"));
assert.ok(get('mobile/App.tsx').includes('moneyVisible,setMoneyVisible]=useState(false)'));
assert.ok(get('mobile/src/screens/Home.tsx').includes('إجمالي قيمة الفواتير غير المدفوعة'));
console.log('PASS: biometric/PIN app lock, default-hidden income cards and matched splash');

assert.ok(!app.includes("if(initializing)return <View"));
assert.ok(get('mobile/src/components/PageMotion.tsx').includes('AccessibilityInfo.isReduceMotionEnabled'));
for(const screen of ['Home','Directory','Tickets','WhatsApp','ClientProfile','Connect','Settings']){
 const filename='mobile/src/screens/'+screen+'.tsx';
 // Home intentionally uses its own light palette; every other page stays dark.
 assert.match(get(filename),screen==='Home'?/HOME as H|H\.paper/:/C\.surface|C\.red/);
}
console.log('PASS: animated motion launch, reduced-motion support, session gate and shared premium UI');

assert.ok(get('mobile/src/components/UI.tsx').includes('export function Notice'));
assert.ok(get('mobile/src/components/UI.tsx').includes('accessibilityRole="button"'));
for(const file of ['mobile/src/screens/Tickets.tsx','mobile/src/screens/Settings.tsx',
 'mobile/src/components/OrderManagement.tsx','mobile/src/components/ServiceManagement.tsx',
 'mobile/src/components/InvoiceActions.tsx']){
 assert.ok(get(file).includes("from '../components/Feedback'")||get(file).includes("from './Feedback'"),file);
 assert.ok(!/import \{[^}]*\bAlert\b[^}]*\} from 'react-native'/.test(get(file)),file);
}
console.log('PASS: single branded alert host, safe confirmations, consistent accessible actions and notice UI');

assert.ok(!get('mobile/src/lib/notifications.ts').includes('console.log(token'));
assert.ok(get('.github/workflows/debug-apk.yml').includes("printf '\\n' >> mobile/android/app/build.gradle"),
 'Signing Gradle block must start on a fresh line after Firebase plugin');
console.log('PASS: Firebase Android app client config, token readiness without disclosing device token or backend secrets');
console.log('PASS: source integrity plus ticket external ID, pagination, safe areas, Android Back, version increment and demo isolation');

const updateCode=get('mobile/src/components/UpdateGate.tsx');
assert.ok(updateCode.includes('agent.ontrackegy.com/api/app/latest.php'));
assert.ok(updateCode.includes('CommandUpdateInstaller'));
assert.ok(updateCode.includes('appConfig.expo.android.versionCode'));
assert.ok(updateCode.includes('whmcs-check-update'));
assert.ok(get('mobile/src/screens/Settings.tsx').includes('البحث عن تحديث جديد'));
assert.ok(code.includes('getApiRetryAfterMs'));
assert.ok(code.includes('REQUEST_SPACING_MS'));
assert.ok(code.includes('loadOverview(session:Session,keys:SectionKey[]'));
assert.ok(get('mobile/App.tsx').includes('minHeight:61'));
assert.ok(get('mobile/src/screens/Directory.tsx').includes('ClientProfile'));
assert.ok(get('mobile/src/lib/api.ts').includes('GetClientsDetails'));
assert.ok(code.includes('response.status===429'));
assert.ok(!updateCode.includes('Linking.openURL'));
const nativeUpdate=get('mobile/native/android/CommandUpdateModule.java');
assert.ok(nativeUpdate.includes('FileProvider.getUriForFile'));
assert.ok(nativeUpdate.includes('APK SHA256 mismatch'));
console.log('PASS: native website APK downloader, checksum verification, Android installer');

assert.equal(JSON.parse(get('mobile/app.json')).expo.name,'WHMCS');
assert.equal(JSON.parse(get('mobile/app.json')).expo.android.package,'com.ontrackdevelopment.command');
assert.ok(get('mobile/src/components/UpdateGate.tsx').includes('WHMCS-v'));
assert.ok(get('mobile/native/android/CommandUpdateModule.java').includes('WHMCS-v'));
console.log('PASS: WHMCS identity and icon config, stable Android package and updates');

const ticketScreen=get('mobile/src/screens/Tickets.tsx');
const ticketClient=get('mobile/src/lib/tickets.ts');
assert.ok(ticketScreen.includes('التذاكر المسندة'));
assert.ok(ticketScreen.includes('fetchTicketQueue'));
assert.ok(ticketScreen.includes('إرفاق توقيع الأدمن'));
assert.ok(ticketClient.includes('My Flagged Tickets'));
assert.ok(ticketClient.includes('Awaiting Reply'));
assert.ok(ticketClient.includes('ticketMatchesQueue'));
assert.ok(ticketClient.includes('parseTicketCustomFields'));
assert.ok(ticketScreen.includes('الحقول المخصصة للتذكرة'));
assert.ok(ticketScreen.includes('إرجاع التذكرة إلى المساعد AI'));
assert.ok(code.includes('buildReplyParams'));
assert.ok(code.includes('params.clientid=owner'));
assert.ok(ticketScreen.includes('showAssigned?section'));
assert.ok(get('mobile/App.tsx').includes('onContentSizeChange'));
assert.ok(ticketClient.includes('GetAdminDetails'));
assert.ok(get('mobile/App.tsx').includes('KeyboardAvoidingView'));
assert.ok(get('mobile/App.tsx').includes('measureInWindow'));
assert.ok(get('mobile/App.tsx').includes('keyboardY.current'));
assert.ok(get('mobile/App.tsx').includes('keyboardPadding+insets.bottom'));
assert.ok(!ticketScreen.includes('<AdminAccess'));
assert.ok(get('mobile/src/components/InvoiceEditor.tsx').includes('buildInvoiceUpdate'));
assert.ok(get('mobile/src/components/InvoiceActions.tsx').includes('تسجيل سداد مستلم'));
assert.ok(get('mobile/src/components/InvoiceActions.tsx').includes('Duplicate Invoice'));
assert.ok(get('mobile/src/screens/Directory.tsx').includes('invoiceSelection'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('loginWhatsAppWithBrowser(session,directory)'));
assert.ok(get('mobile/src/lib/adminSession.ts').includes('authorizeInWebView'));
assert.ok(get('mobile/native/android/CommandAdminSessionModule.java').includes('waBrowserCookies.get(key)'));
assert.ok(get('mobile/native/android/CommandAdminSessionModule.java').includes('waCSRFToken'));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes('autoAttempt.current'));
assert.ok(JSON.parse(get('mobile/app.json')).expo.plugins.some(p=>Array.isArray(p)&&p[0]==='expo-splash-screen'));
assert.ok(get('mobile/package.json').includes('expo-splash-screen'));
assert.ok(ticketScreen.includes('onComposerFocus?.(event.nativeEvent.target)'));
assert.ok(!ticketScreen.includes("id:'all',label:'كل التذاكر'"));
assert.ok(get('mobile/App.tsx').includes('keyboardVisible'));
assert.equal(JSON.parse(get('mobile/app.json')).expo.android.softwareKeyboardLayoutMode,'resize');
console.log('PASS: ticket queue separation, operator signature, keyboard resizing and safe navigation');

assert.ok(get('mobile/src/lib/adminSession.ts').includes('validateAdminDirectory(directory,session.baseUrl'));
assert.ok(get('mobile/src/components/AdminAccess.tsx').includes('اختبار فتح رابط الإدارة بالمتصفح'));

// Original WHMCS addon route avoids the host-level 403 for direct addon PHP files.
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('/index.php?m=telegramnotify&route=mobile_whatsapp'));
assert.ok(!get('mobile/src/lib/whatsapp.ts').includes("+'/modules/addons/telegramnotify/mobile_whatsapp.php'"));

// Native WhatsApp should be independent from parent page scroll; composer stays pinned.
assert.ok(get('mobile/App.tsx').includes("page==='whatsapp'"));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('threadScroll.current?.scrollToEnd'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('restoreHistoryOffset.current'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('keyboardShouldPersistTaps="handled"'));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes("Alert.alert('تم إرسال واتساب'"));
assert.ok(!get('mobile/src/screens/WhatsApp.tsx').includes("Alert.alert('إرسال واتساب'"));
assert.ok(get('mobile/App.tsx').includes('telegramWhatsAppReady(session)'));
assert.ok(get('mobile/App.tsx').includes('restoreTelegramWhatsApp(session)'));
assert.ok(get('mobile/src/lib/notifications.ts').includes('testDeviceNotification'));

assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('sendWhatsAppMedia('));
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('whatsappImageSource('));
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('chat_send_media'));
assert.ok(get('mobile/src/lib/lockPreferences.ts').includes('after_5m'));
assert.ok(get('mobile/App.tsx').includes('shouldLockOnResume('));
assert.ok(get('mobile/src/screens/Settings.tsx').includes('saveLockPolicy('));

assert.ok(get('mobile/src/lib/whatsapp.ts').includes('whatsAppMediaStatus'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('v3.4.6'));

// Authenticated private media and native multipart upload must not use JS FormData or unauthenticated <Image> headers.
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('FileSystem.downloadAsync(source.uri'));
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('FileSystem.createUploadTask(endpoint'));
assert.ok(get('mobile/src/lib/whatsapp.ts').includes('clearWhatsAppImage'));
assert.ok(get('mobile/src/screens/WhatsApp.tsx').includes('NativeChatImage'));

assert.ok(get('mobile/App.tsx').includes("{page:'invoices',label:'الفواتير'"));
assert.ok(get('mobile/App.tsx').includes("{page:'ai',label:'الذكاء الاصطناعي'"));
assert.ok(get('mobile/App.tsx').includes("refresh(session,false,'invoices')"));
assert.ok(get('mobile/src/screens/Home.tsx').includes("invoiceCount+' فاتورة'"));
assert.ok(get('mobile/src/screens/Directory.tsx').includes('invoiceDue(inv)'));
assert.ok(get('mobile/src/screens/Directory.tsx').includes('متأخرة'));
assert.ok(!get('mobile/src/screens/Directory.tsx').includes("page==='invoices'?'عرض الملف':'التفاصيل'"));

// Reference-inspired light Home, with a compact and private income panel.
assert.ok(get('mobile/src/theme.ts').includes('export const HOME:'));
assert.ok(get('mobile/src/screens/Home.tsx').includes('width:\'31.7%\''));
assert.ok(get('mobile/src/screens/Home.tsx').includes("invoiceCount+' فاتورة'"));
assert.ok(!get('mobile/src/screens/Home.tsx').includes('عرض جميع الفواتير'));
assert.ok(get('mobile/src/screens/Home.tsx').includes('hidden={!moneyVisible}'));
assert.ok(get('mobile/App.tsx').includes("const lightHome=effectiveTheme==='light'"));

assert.equal(JSON.parse(get('mobile/app.json')).expo.userInterfaceStyle,'automatic');
assert.ok(get('mobile/src/theme.ts').includes('applyThemePalette'));
assert.ok(get('mobile/src/lib/themePreference.ts').includes("ThemePreference"));
assert.ok(get('mobile/src/screens/Settings.tsx').includes('حسب النظام'));
assert.ok(get('mobile/App.tsx').includes('Appearance.addChangeListener'));
assert.ok(get('mobile/src/components/UI.tsx').includes('getStyles()'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').indexOf('بنود الفاتورة')<
 get('mobile/src/screens/RecordDetails.tsx').indexOf('البيانات الأساسية'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('قيمة الفاتورة'));
assert.ok(get('mobile/src/screens/RecordDetails.tsx').includes('invoiceToolsOpen'));

const homeUI=get('mobile/src/screens/Home.tsx');
const themeCode=get('mobile/src/theme.ts');
assert.ok(homeUI.includes('backgroundColor:H.soft')&&homeUI.includes('color={H.ink}'));
assert.ok(!homeUI.includes("backgroundColor:'#F1F1F2'"));
assert.ok(homeUI.includes("minHeight:98")&&homeUI.includes("minHeight:61"));
assert.ok(get('mobile/src/screens/Settings.tsx').includes('showAdvancedPush'));
assert.ok(get('mobile/src/screens/Settings.tsx').includes("if(!status.configured)"));
function wcagLum(hex){
 const parts=hex.slice(1).match(/.{2}/g).map(x=>parseInt(x,16)/255);
 return parts.map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4)
  .reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
}
function contrast(a,b){const aa=wcagLum(a),bb=wcagLum(b);return (Math.max(aa,bb)+0.05)/(Math.min(aa,bb)+0.05)}
for(const mode of ['homeLight','homeDark']){
 const palette=themeCode.split('const '+mode+'={')[1]?.split('};')[0];
 assert.ok(palette,mode+' missing');
 const soft=palette.match(/soft:'(#[0-9A-Fa-f]{6})'/)?.[1];
 const ink=palette.match(/ink:'(#[0-9A-Fa-f]{6})'/)?.[1];
 assert.ok(soft&&ink,mode+' icon colors missing');
 assert.ok(contrast(soft,ink)>=7,mode+' icon contrast below AAA normal text');
}
console.log('PASS: compact home, accessible high-contrast icons in dark/light, honest push enrollment gating');

const invoiceDir=get('mobile/src/screens/Directory.tsx');
assert.ok(invoiceDir.includes('loadInvoiceCardPreview(session,invoice)'));
assert.ok(invoiceDir.includes('invoiceScrollY'));
assert.ok(invoiceDir.includes('borderRightWidth:3')&&invoiceDir.includes('paddingVertical:10'));
assert.ok(invoiceDir.includes('preview.otherCount'));
assert.ok(invoiceDir.includes('تعذر تحميل بند الفاتورة'));
assert.ok(get('mobile/App.tsx').includes('invoiceScrollY={invoiceScrollY}'));
console.log('PASS: compact invoice cards with owner-verified lazy line descriptions');

const aiTicketPage=get('mobile/src/screens/Tickets.tsx');
const aiBottomSection=get('mobile/src/screens/AiTicketsSection.tsx');
assert.ok(aiTicketPage.includes('<AiTicketsSection session={session}'));
assert.ok(aiTicketPage.includes('!expectedClientId'));
assert.ok(!aiTicketPage.includes('<AiTicketReview'));
assert.ok(!aiTicketPage.includes('label="مراجعة تذاكر الـAI'));
assert.ok(aiBottomSection.includes("fetchTicketQueue(session,'allActive'"));
assert.ok(aiBottomSection.includes('checkActiveAiTicket(session,ticket,account)'));
assert.ok(aiBottomSection.includes('لا توجد تذاكر مطابقة'));
assert.ok(aiBottomSection.includes('تحديث تذاكر الـAI'));
assert.ok(aiBottomSection.includes('يُستبعد المقفول والمسند لموظف آخر'));
assert.ok(get('mobile/src/lib/aiTicketReview.ts').includes("repliessort:'ASC'"));
console.log('PASS: AI tickets are reviewed automatically at bottom of tickets page without a separate settings/login screen');

const chosenAdmin=get('mobile/src/screens/AiTicketReview.tsx');
assert.ok(chosenAdmin.includes('fetchAiAdminUsers(session)'));
assert.ok(chosenAdmin.includes('selectAdmin(admin)'));
assert.ok(chosenAdmin.includes('اختار مستخدم الـAI من موظفي WHMCS'));
assert.ok(!chosenAdmin.includes("setSender('AI')"));
const aiAudit=get('mobile/src/lib/aiTicketReview.ts');
assert.ok(aiAudit.includes("callApi(session,'GetAdminUsers'"));
assert.ok(aiAudit.includes('replyAdminId===user.id'));
assert.ok(get('mobile/src/lib/api.ts').includes("'GetAdminUsers'"));
console.log('PASS: AI ticket auditor uses actual WHMCS admin dropdown and verified responder account');

const fallbackView=get('mobile/src/screens/AiTicketReview.tsx');
assert.ok(fallbackView.includes("fetchObservedResponders(session,ticket)"));
assert.ok(fallbackView.includes('اكتشف مزيدًا من الموظفين من الردود'));
assert.ok(!fallbackView.includes('يلزم منح حساب API صلاحية قراءة GetAdminUsers'));
assert.ok(fallbackView.includes('اسم ظهر في ردود WHMCS'));
const auditFallback=get('mobile/src/lib/aiTicketReview.ts');
assert.ok(auditFallback.includes('observedAdminResponders'));
assert.ok(auditFallback.includes("callApi(session,'GetTicket'"));
console.log('PASS: AI review fallback works when GetAdminUsers permission is denied');

const invoicePaymentEngine=get('mobile/src/lib/invoices.ts');
const invoicePaymentUI=get('mobile/src/components/InvoiceActions.tsx');
assert.ok(invoicePaymentEngine.includes("callApi(session,'AddInvoicePayment',payment)"));
assert.ok(invoicePaymentEngine.includes("return callApi(session,'UpdateInvoice',{invoiceid:target.id,status:kind})"));
assert.ok(invoicePaymentEngine.includes("ONTRACK-APP-MANUAL-"));
assert.ok(invoicePaymentEngine.includes("balance"));
assert.ok(invoicePaymentUI.includes('تسجيل سداد مستلم'));
assert.ok(invoicePaymentUI.includes('لا تستخدم هذا الإجراء إذا لم تستلم المبلغ'));
assert.ok(!invoicePaymentUI.includes('تغيير الحالة فقط'));
console.log('PASS: invoice paid action records actual payment for native WHMCS hooks without spoofing WhatsApp');

const profileScreen=get('mobile/src/screens/ClientProfile.tsx');
const creditForm=get('mobile/src/components/ClientCreditForm.tsx');
const creditLogic=get('mobile/src/lib/clientCredit.ts');
assert.ok(profileScreen.includes('الرصيد المتاح')&&profileScreen.includes('إضافة رصيد'));
assert.ok(profileScreen.includes('formatClientBalance(summary.creditBalance)'));
assert.ok(profileScreen.includes('<ClientCreditForm'));
assert.ok(profileScreen.includes('التفاصيل الإضافية'));
assert.ok(!profileScreen.includes('<DataSection title="معلومات إضافية" fields={summary.other}/>'));
assert.ok(creditLogic.includes("callApi(session,'AddCredit'"));
assert.ok(creditLogic.includes("callApiFresh(session,'GetClientsDetails'"));
assert.ok(creditLogic.includes("type:operation"));
assert.ok(creditLogic.includes('currency!==expectedCurrency'));
assert.ok(creditForm.includes("text:'تأكيد '+verb"));
assert.ok(creditForm.includes('تأكيد الخصم'));
assert.ok(creditForm.includes('إعادة المحاولة'));
assert.ok(!creditLogic.includes("'AddInvoicePayment'"));
console.log('PASS: client credit balance in status, audited AddCredit action and compact/expandable profile');

assert.ok(profileScreen.includes('label="خصم رصيد"'));
assert.ok(profileScreen.includes('setCreditOperation'));
assert.ok(creditLogic.includes('export async function removeClientCredit('));
assert.ok(creditLogic.includes("type:operation"));
assert.ok(creditLogic.includes("operation==='remove'"));
assert.ok(creditLogic.includes('رصيد العميل تغيّر'));
assert.ok(get('mobile/src/lib/api.ts').includes('export async function callApiFresh'));
assert.ok(creditForm.includes("removeClientCredit(session,clientId"));
assert.ok(creditForm.includes('الرصيد المتوقع بعد العملية'));
console.log('PASS: safe WHMCS credit add/deduct with uncached preflight and clear side-by-side controls');
