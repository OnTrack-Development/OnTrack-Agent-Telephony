export type Page = 'home'|'tickets'|'clients'|'invoices'|'services'|'orders'|'domains'|'whatsapp'|'ai'|'more'|'settings'|'explorer';
export interface Ticket { id:number; number:string; subject:string; customer:string; department:string; priority:string; status:string; updated:string; message?:string; }
export interface Client { id:number; name:string; email:string; status:string; services:number; initials:string; }
export interface Invoice { id:number; customer:string; amount:number; currency:string; status:string; due:string; }
export interface Service { id:number; domain:string; customer:string; plan:string; status:string; renewal:string; }
export interface Order { id:number; customer:string; product:string; amount:number; status:string; created:string; }
export interface Domain { id:number; name:string; customer:string; expiry:string; status:string; }
export interface ChatMessage { id:string; from:'agent'|'customer'; body:string; at:string; }
export interface Chat { id:string; name:string; phone:string; last:string; time:string; unread:number; messages:ChatMessage[]; }
export interface AiAgent { id:string; name:string; role:string; status:'working'|'idle'|'review'|'offline'; tasks:number; icon:string; }
export interface QueueJob { id:number; ticket:number; agent:string; state:string; since:string; }
export interface DemoState { tickets:Ticket[]; clients:Client[]; invoices:Invoice[]; services:Service[]; orders:Order[]; domains:Domain[]; chats:Chat[]; agents:AiAgent[]; queue:QueueJob[]; }
export interface Session { baseUrl:string; mode:'admin'|'api'; username:string; password:string; accessKey:string; identifier:string; secret:string; }
export interface ApiResult<T> {ok:boolean; data?:T; error?:string; code?:string;}
