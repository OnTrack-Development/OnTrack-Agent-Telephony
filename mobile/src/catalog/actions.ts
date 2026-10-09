/** Only documented WHMCS External API READ actions. Never call arbitrary user-provided action names. */
export type ReadAction={category:string; title:string;action:string; root:string;item:string; icon:string; params?:Record<string,string|number>};
export const READ_ACTIONS:ReadAction[]=[
 {category:'الدعم الفني',title:'التذاكر',action:'GetTickets',root:'tickets',item:'ticket',icon:'ticket-outline'},
 {category:'الدعم الفني',title:'الأقسام',action:'GetSupportDepartments',root:'departments',item:'department',icon:'account-group-outline'},
 {category:'الدعم الفني',title:'حالات التذاكر',action:'GetTicketStatuses',root:'statuses',item:'status',icon:'label-outline'},
 {category:'الدعم الفني',title:'الردود الجاهزة',action:'GetTicketPredefinedReplies',root:'predefinedreplies',item:'predefinedreply',icon:'message-reply-text-outline'},
 {category:'العملاء',title:'العملاء',action:'GetClients',root:'clients',item:'client',icon:'account-multiple-outline'},
 {category:'العملاء',title:'مجموعات العملاء',action:'GetClientGroups',root:'groups',item:'group',icon:'account-group-outline'},
 {category:'الفواتير',title:'الفواتير',action:'GetInvoices',root:'invoices',item:'invoice',icon:'receipt-text-outline'},
 {category:'الفواتير',title:'التحصيلات',action:'GetTransactions',root:'transactions',item:'transaction',icon:'cash-multiple'},
 {category:'الفواتير',title:'طرق الدفع',action:'GetPaymentMethods',root:'paymentmethods',item:'paymentmethod',icon:'credit-card-outline'},
 {category:'الطلبات',title:'الطلبات',action:'GetOrders',root:'orders',item:'order',icon:'cart-outline'},
 {category:'الطلبات',title:'المنتجات المعروضة',action:'GetProducts',root:'products',item:'product',icon:'package-variant'},
 {category:'الخدمات',title:'خدمات العملاء',action:'GetClientsProducts',root:'products',item:'product',icon:'server-network'},
 {category:'الخدمات',title:'الإضافات',action:'GetClientsAddons',root:'addons',item:'addon',icon:'puzzle-outline'},
 {category:'الدومينات',title:'دومينات العملاء',action:'GetClientsDomains',root:'domains',item:'domain',icon:'web'},
 {category:'الإدارة',title:'الموظفون',action:'GetAdminUsers',root:'admin_users',item:'admin_user',icon:'account-tie-outline'},
 {category:'الإدارة',title:'إحصائيات النظام',action:'GetStats',root:'',item:'',icon:'chart-line'},
];
export const READ_CATEGORIES=[...new Set(READ_ACTIONS.map(x=>x.category))];
