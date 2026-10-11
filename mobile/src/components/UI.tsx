import React from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {C} from '../theme';

export function Icon({name,size=22,color=C.text}:{name:string,size?:number;color?:string}){
 return <MaterialCommunityIcons name={name as any} size={size} color={color}/>;
}
export function T({children,size=14,weight='400',color=C.text,style,lines}:{
 children:React.ReactNode;size?:number;
 weight?:'400'|'500'|'600'|'700'|'800'|'900';color?:string;style?:any;lines?:number;
}){
 return <Text numberOfLines={lines} allowFontScaling style={[{
  fontSize:size,fontWeight:weight,color,textAlign:'right',writingDirection:'rtl',
  lineHeight:Math.ceil(size*1.56),includeFontPadding:false},style]}>{children}</Text>;
}
export function Card({children,style,onPress}:{children:React.ReactNode;style?:any;onPress?:()=>void}){
 const body=<View style={[s.card,style]}>{children}</View>;
 return onPress?<Pressable accessibilityRole="button" onPress={onPress}
  style={({pressed})=>({opacity:pressed?.76:1})}>{body}</Pressable>:body;
}
export function Header({title,subtitle,right}:{title:string;subtitle?:string;right?:React.ReactNode}){
 return <View style={s.header}>
  <View style={{flex:1,gap:5}}>
   <T size={27} weight="900">{title}</T>
   {subtitle?<T size={12} color={C.muted}>{subtitle}</T>:null}
  </View>
  {right?<View style={{width:46,height:46,borderRadius:15,backgroundColor:C.surface2,
   borderWidth:1,borderColor:C.stroke,alignItems:'center',justifyContent:'center'}}>{right}</View>:null}
 </View>;
}
export function Section({title,action,onPress}:{title:string;action?:string;onPress?:()=>void}){
 return <View style={s.section}>
  <T size={18} weight="800">{title}</T>
  {action?<Pressable accessibilityRole="button" onPress={onPress}
   style={({pressed})=>({flexDirection:'row-reverse',alignItems:'center',gap:4,opacity:pressed?0.6:1})}>
   <T size={12} color={C.red} weight="700">{action}</T>
   <Icon name="arrow-left" size={15} color={C.red}/>
  </Pressable>:null}
 </View>;
}
export function Pill({label,color=C.blue,bg,icon}:{label:string;color?:string;bg?:string;icon?:string}){
 return <View style={{flexDirection:'row-reverse',alignItems:'center',gap:6,backgroundColor:bg||color+'16',
  borderWidth:1,borderColor:color+'30',alignSelf:'flex-start',paddingHorizontal:11,
  paddingVertical:6,borderRadius:100}}>
  {icon?<Icon name={icon} color={color} size={12}/>:null}
  <T size={10} color={color} weight="800">{label}</T>
 </View>;
}
export function Action({label,onPress,icon,secondary=false,disabled=false,compact=false}:{
 label:string;onPress:()=>void;icon?:string;secondary?:boolean;disabled?:boolean;compact?:boolean;
}){
 const tint=secondary?C.text:C.white;
 return <Pressable accessibilityRole="button" accessibilityLabel={label}
  disabled={disabled} onPress={onPress}
  style={({pressed})=>({minHeight:compact?43:52,backgroundColor:secondary?C.surface2:C.red,
   borderWidth:1,borderColor:secondary?C.stroke:C.red,borderRadius:14,
   paddingHorizontal:compact?13:19,paddingVertical:compact?9:13,
   flexDirection:'row-reverse',justifyContent:'center',alignItems:'center',gap:9,
   opacity:disabled?0.42:pressed?0.78:1})}>
  {icon?<Icon name={icon} color={tint} size={19}/>:null}
  <T size={13} weight="800" color={tint}>{label}</T>
 </Pressable>;
}
export function Search({value,onChange,placeholder='بحث...'}:{
 value:string;onChange:(value:string)=>void;placeholder?:string;
}){
 return <View style={s.search}>
  <Icon name="magnify" color={C.muted} size={22}/>
  <TextInput autoCorrect={false} accessibilityLabel={placeholder} value={value} onChangeText={onChange}
   placeholder={placeholder} placeholderTextColor={C.muted}
   style={{flex:1,color:C.text,fontSize:14,textAlign:'right',height:47,paddingHorizontal:7}}/>
 </View>;
}
export function Avatar({label,color=C.blue,size=45}:{label:string;color?:string;size?:number}){
 return <View style={{width:size,height:size,borderRadius:size*.34,
  backgroundColor:color+'15',borderWidth:1,borderColor:color+'30',
  alignItems:'center',justifyContent:'center'}}>
  <T weight="900" size={size*.30} color={color}>{label}</T>
 </View>;
}
export function Empty({text='لا توجد بيانات حاليًا',icon='inbox-outline'}:{text?:string;icon?:string}){
 return <View style={{alignItems:'center',justifyContent:'center',paddingVertical:38,
  paddingHorizontal:16,gap:12}}>
  <View style={{width:69,height:69,borderRadius:23,alignItems:'center',justifyContent:'center',
   backgroundColor:C.surface2,borderWidth:1,borderColor:C.stroke}}>
   <Icon name={icon} color={C.muted} size={32}/>
  </View>
  <T size={13} color={C.muted} style={{textAlign:'center',maxWidth:290}}>{text}</T>
 </View>;
}
export function Busy(){
 return <View style={{padding:33,alignItems:'center',gap:12}}>
  <ActivityIndicator color={C.red} size="large"/>
  <T size={12} color={C.muted}>بنحمّل البيانات المطلوبة...</T>
 </View>;
}
export function Divider(){return <View style={{height:1,backgroundColor:C.stroke,marginVertical:13}}/>;}
export function Metric({icon,label,value,sub,color=C.red,onPress}:{
 icon:string;label:string;value:string;sub?:string;color?:string;onPress?:()=>void;
}){
 return <Pressable disabled={!onPress} accessibilityRole={onPress?'button':'text'} onPress={onPress}
  style={({pressed})=>({width:'48.3%',minHeight:150,borderRadius:20,borderWidth:1,
   borderColor:C.stroke,backgroundColor:C.surface,padding:16,justifyContent:'space-between',
   opacity:pressed?0.75:1})}>
  <View style={{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center'}}>
   <View style={{backgroundColor:color+'18',borderRadius:13,height:40,width:40,
    justifyContent:'center',alignItems:'center'}}>
    <Icon name={icon} size={20} color={color}/>
   </View>
   {onPress?<Icon name="arrow-top-left" color={C.muted} size={15}/>:null}
  </View>
  <View style={{gap:2}}>
   <T size={27} weight="900">{value}</T>
   <T size={12} weight="700">{label}</T>
   {sub?<T size={10} color={C.muted}>{sub}</T>:null}
  </View>
 </Pressable>;
}
export function ItemRow({icon,heading,subtitle,right,onPress,color=C.blue}:{
 icon:string;heading:string;subtitle?:string;right?:React.ReactNode;onPress?:()=>void;color?:string;
}){
 return <Pressable accessibilityRole={onPress?'button':'text'} onPress={onPress} disabled={!onPress}
  style={({pressed})=>[s.item,{opacity:pressed?0.72:1}]}>
  <View style={{backgroundColor:color+'13',width:43,height:43,borderRadius:14,
   justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:color+'23'}}>
   <Icon name={icon} color={color} size={21}/>
  </View>
  <View style={{flex:1,gap:5}}>
   <T weight="800" size={13} lines={2}>{heading}</T>
   {subtitle?<T size={11} color={C.muted} lines={2}>{subtitle}</T>:null}
  </View>
  {right||(onPress?<Icon name="chevron-left" color={C.muted} size={20}/>:null)}
 </Pressable>;
}
export const s=StyleSheet.create({
 card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:20,
  padding:17,gap:4},
 header:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',
  marginBottom:19,gap:12,paddingBottom:17,borderBottomWidth:1,borderBottomColor:C.stroke},
 section:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',
  marginTop:24,marginBottom:13,gap:10},
 search:{height:53,flexDirection:'row-reverse',alignItems:'center',gap:8,backgroundColor:C.surface,
  borderWidth:1,borderColor:C.stroke,borderRadius:15,paddingHorizontal:14,marginBottom:8},
 item:{flexDirection:'row-reverse',alignItems:'center',gap:12,paddingVertical:15,
  minHeight:76,borderBottomWidth:1,borderBottomColor:C.stroke}
});
export function Notice({tone='info',title,message,onPress}:{
 tone?:'info'|'warning'|'danger'|'success';title:string;message?:string;onPress?:()=>void;
}){
 const color=tone==='danger'?C.red:tone==='warning'?C.orange:tone==='success'?C.green:C.blue;
 const symbol=tone==='danger'?'alert-octagon-outline':tone==='warning'?'alert-circle-outline':
  tone==='success'?'check-circle-outline':'information-outline';
 return <Pressable disabled={!onPress} accessibilityRole={onPress?'button':'text'} onPress={onPress}
  style={({pressed})=>({flexDirection:'row-reverse',alignItems:'flex-start',gap:11,
   padding:15,backgroundColor:color+'0D',borderWidth:1,borderColor:color+'40',
   borderRadius:15,opacity:pressed?0.8:1})}>
  <View style={{backgroundColor:color+'13',padding:7,borderRadius:11}}>
   <Icon name={symbol} size={19} color={color}/>
  </View>
  <View style={{flex:1,gap:3}}>
   <T size={12} weight="800" color={color}>{title}</T>
   {message?<T size={12} color={C.muted}>{message}</T>:null}
  </View>
  {onPress?<Icon name="arrow-left" color={color} size={17}/>:null}
 </Pressable>;
}
