import type {DemoState} from '../types';
// Fictional sample records. NEVER use demo contents as real WHMCS data.
export const seed: DemoState = {
  tickets: [
    {id:8421,subject:'الموقع مش بيفتح من الصبح',customer:'شركة ألفا الرقمية',department:'الدعم الفني',priority:'High',status:'Awaiting Reply',updated:'منذ 5 دقائق',message:'صفحة الموقع بتظهر Error 503، ياريت حد يراجعها.'},
    {id:8419,subject:'استفسار بخصوص تجديد الريسلر',customer:'أحمد مصطفى',department:'المبيعات',priority:'Medium',status:'In Progress',updated:'منذ 18 دقيقة',message:'محتاج أعرف تجديد خطة الريسلر السنوية.'},
    {id:8415,subject:'مطلوب مراجعة فاتورة',customer:'شركة المدار',department:'الحسابات',priority:'High',status:'Awaiting Reply',updated:'منذ 42 دقيقة',message:'هل تم تسجيل التحويل البنكي؟'},
    {id:8408,subject:'تفعيل شهادة SSL',customer:'سارة خالد',department:'الدعم الفني',priority:'Low',status:'Answered',updated:'منذ ساعة',message:'شهادة الحماية محتاجة تجديد.'},
    {id:8398,subject:'رفع حد مساحة البريد',customer:'شركة النور',department:'الدعم الفني',priority:'Medium',status:'In Progress',updated:'منذ ساعتين',message:'ممكن نزود مساحة الإيميل؟'}
  ],
  clients: [
    {id:217,name:'شركة ألفا الرقمية',email:'admin@alpha.example',status:'Active',services:3,initials:'أد'},
    {id:218,name:'أحمد مصطفى',email:'ahmed@example.com',status:'Active',services:2,initials:'أم'},
    {id:219,name:'شركة المدار',email:'contact@almadar.example',status:'Active',services:5,initials:'مم'},
    {id:220,name:'سارة خالد',email:'sara@example.com',status:'Inactive',services:1,initials:'سخ'},
    {id:221,name:'شركة النور',email:'hi@alnoor.example',status:'Active',services:4,initials:'نن'}
  ],
  invoices: [
    {id:10925,customer:'شركة ألفا الرقمية',amount:2550,currency:'EGP',status:'Unpaid',due:'12 أكتوبر'},
    {id:10921,customer:'شركة المدار',amount:6120,currency:'EGP',status:'Overdue',due:'5 أكتوبر'},
    {id:10918,customer:'أحمد مصطفى',amount:714,currency:'EGP',status:'Paid',due:'1 أكتوبر'},
    {id:10912,customer:'شركة النور',amount:3200,currency:'EGP',status:'Paid',due:'28 سبتمبر'}
  ],
  services: [
    {id:301,domain:'alpha.example',customer:'شركة ألفا الرقمية',plan:'Starter Hosting',status:'Active',renewal:'24 نوفمبر'},
    {id:302,domain:'almadar.example',customer:'شركة المدار',plan:'Reseller 15',status:'Suspended',renewal:'14 أكتوبر'},
    {id:303,domain:'alnoor.example',customer:'شركة النور',plan:'VPS Linux',status:'Active',renewal:'19 ديسمبر'},
    {id:304,domain:'ahmed.example',customer:'أحمد مصطفى',plan:'Mail Hosting',status:'Active',renewal:'2 يناير'}
  ],
  orders: [
    {id:7124,customer:'سارة خالد',product:'Starter Hosting',amount:2550,status:'Pending',created:'اليوم'},
    {id:7122,customer:'شركة المدار',product:'Reseller 15',amount:6120,status:'Active',created:'أمس'},
    {id:7121,customer:'شركة النور',product:'VPS Linux',amount:8900,status:'Fraud',created:'7 أكتوبر'}
  ],
  domains: [
    {id:411,name:'alpha.example',customer:'شركة ألفا الرقمية',expiry:'10 ديسمبر',status:'Active'},
    {id:412,name:'almadar.example',customer:'شركة المدار',expiry:'15 أكتوبر',status:'Expiring'},
    {id:413,name:'alnoor.example',customer:'شركة النور',expiry:'5 مارس',status:'Active'}
  ],
  chats: [
    {id:'wa-1',name:'محمد فتحي',phone:'+20 ••• ••• 7412',last:'تمام، هستنى تأكيد الخدمة',time:'03:17',unread:3,messages:[{id:'m1',from:'customer',body:'مساء الخير، هل التجديد تم؟',at:'03:13'},{id:'m2',from:'agent',body:'بنراجع حالة الدفع وهنبلغ حضرتك.',at:'03:15'},{id:'m3',from:'customer',body:'تمام، هستنى تأكيد الخدمة',at:'03:17'}]},
    {id:'wa-2',name:'شركة بيتا',phone:'+20 ••• ••• 2209',last:'ممكن تفاصيل السيرفر؟',time:'02:49',unread:1,messages:[{id:'m4',from:'customer',body:'ممكن تفاصيل السيرفر؟',at:'02:49'}]},
    {id:'wa-3',name:'محمود السيد',phone:'+20 ••• ••• 9902',last:'شكرًا على المساعدة',time:'أمس',unread:0,messages:[{id:'m5',from:'agent',body:'تم تنفيذ الطلب التجريبي.',at:'أمس'},{id:'m6',from:'customer',body:'شكرًا على المساعدة',at:'أمس'}]}
  ],
  agents: [
    {id:'a1',name:'وكيل استضافة المواقع',role:'Shared / cPanel',status:'working',tasks:3,icon:'server'},
    {id:'a2',name:'وكيل الريسلر',role:'WHM / cPanel',status:'idle',tasks:0,icon:'layers'},
    {id:'a3',name:'وكيل VPS Linux',role:'Linux Systems',status:'working',tasks:2,icon:'terminal'},
    {id:'a4',name:'وكيل VPS Windows',role:'Windows Systems',status:'review',tasks:1,icon:'monitor'},
    {id:'a5',name:'وكيل السيرفر Linux',role:'Dedicated Linux',status:'idle',tasks:0,icon:'database'},
    {id:'a6',name:'وكيل السيرفر Windows',role:'Dedicated Windows',status:'idle',tasks:0,icon:'monitor-dashboard'},
    {id:'a7',name:'وكيل التراخيص',role:'Licenses',status:'working',tasks:1,icon:'key'},
    {id:'a8',name:'وكيل الراديو',role:'Radio Hosting',status:'idle',tasks:0,icon:'radio'}
  ],
  queue:[
    {id:1,ticket:8421,agent:'استضافة المواقع',state:'processing',since:'03:20'},
    {id:2,ticket:8419,agent:'المبيعات',state:'pending',since:'03:21'},
    {id:3,ticket:8415,agent:'الحسابات',state:'review',since:'03:22'}
  ]
};
