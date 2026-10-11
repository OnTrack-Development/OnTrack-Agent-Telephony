import React from 'react';
import {View,Text,Pressable,StyleSheet,TextInput,ActivityIndicator} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {C} from '../theme';

export function Icon({name,size=22,color=C.text}: {name:string,size?:number,color?:string}) {return <MaterialCommunityIcons name={name as any} size={size} color={color}/>;}
export function T({children,size=14,weight='400',color=C.text,style,lines}: {children:React.ReactNode,size?:number,weight?:'400'|'500'|'600'|'700'|'800'|'900',color?:string,style?:any,lines?:number}) {return <Text numberOfLines={lines} style={[{fontSize:size,fontWeight:weight,color,textAlign:'right',writingDirection:'rtl',lineHeight:size*1.5},style]}>{children}</Text>;}
export function Card({children,style,onPress}: {children:React.ReactNode,style?:any,onPress?:()=>void}) {
  const body=<View style={[s.card,style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({pressed})=>({opacity:pressed?.79:1})}>{body}</Pressable> : body;
}
export function Header({title,subtitle,right}: {title:string,subtitle?:string,right?:React.ReactNode}) {return <View style={s.header}><View style={{flex:1}}><T size={24} weight="800">{title}</T>{subtitle?<T size={12} color={C.muted}>{subtitle}</T>:null}</View>{right}</View>;}
export function Section({title,action,onPress}: {title:string,action?:string,onPress?:()=>void}) {return <View style={s.section}><T size={17} weight="800">{title}</T>{action?<Pressable onPress={onPress}><T size={12} color={C.red} weight="700">{action} ←</T></Pressable>:null}</View>;}
export function Pill({label,color=C.blue,bg,icon}: {label:string,color?:string,bg?:string,icon?:string}) {return <View style={{flexDirection:'row-reverse',alignItems:'center',gap:4,backgroundColor:bg||color+'1F',alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:5,borderRadius:100}}>{icon?<Icon name={icon} color={color} size={11}/>:null}<T size={11} color={color} weight="700">{label}</T></View>;}
export function Action({label,onPress,icon,secondary=false,disabled=false,compact=false}: {label:string,onPress:()=>void,icon?:string,secondary?:boolean,disabled?:boolean,compact?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
  style={({pressed})=>[{minHeight:compact?41:49,backgroundColor:secondary?C.surface2:C.red,
   paddingVertical:compact?9:12,paddingHorizontal:compact?13:17,borderRadius:12,
   borderWidth:1,borderColor:secondary?C.stroke:C.red,flexDirection:'row-reverse',
   gap:8,alignItems:'center',justifyContent:'center',
   opacity:disabled?.42:pressed?.83:1}]}>
   {icon?<Icon name={icon} color={secondary?C.text:C.white} size={17}/>:null}
   <T size={13} weight="700" color={secondary?C.text:C.white}>{label}</T>
 </Pressable>;
}
export function Search({value,onChange,placeholder='بحث...'}: {value:string,onChange:(s:string)=>void,placeholder?:string}) {return <View style={s.search}><Icon name="magnify" color={C.muted} size={21}/><TextInput autoCorrect={false} placeholder={placeholder} placeholderTextColor={C.muted} value={value} onChangeText={onChange} style={{flex:1,color:C.text,fontSize:14,textAlign:'right',height:43,paddingHorizontal:6}}/></View>;}
export function Avatar({label,color=C.blue,size=45}: {label:string,color?:string,size?:number}) {return <View style={{width:size,height:size,borderRadius:size*.35,backgroundColor:color+'22',borderColor:color+'44',borderWidth:1,alignItems:'center',justifyContent:'center'}}><T weight="800" size={size*.30} color={color}>{label}</T></View>;}
export function Empty({text='مفيش بيانات حاليًا',icon='inbox-outline'}: {text?:string,icon?:string}) {return <View style={{alignItems:'center',justifyContent:'center',paddingVertical:46,gap:9}}><Icon name={icon} color={C.muted} size={37}/><T size={13} color={C.muted}>{text}</T></View>;}
export function Busy() {return <View style={{padding:36,alignItems:'center'}}><ActivityIndicator color={C.red}/><T color={C.muted}>جارِ تحميل البيانات...</T></View>;}
export function Divider() {return <View style={{height:1,backgroundColor:C.stroke,marginVertical:12}}/>;}
export function Metric({icon,label,value,sub,color=C.red,onPress}: {icon:string,label:string,value:string,sub?:string,color?:string,onPress?:()=>void}) {return <Card onPress={onPress} style={{flex:1,minWidth:'45%',padding:15,gap:9}}><View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}><View style={{backgroundColor:color+'1D',borderRadius:12,padding:9}}><Icon name={icon} size={20} color={color}/></View>{sub?<T size={10} color={C.muted}>{sub}</T>:null}</View><T size={26} weight="900">{value}</T><T size={12} color={C.muted}>{label}</T></Card>;}
export function ItemRow({icon,heading,subtitle,right,onPress,color=C.blue}: {icon:string,heading:string,subtitle?:string,right?:React.ReactNode,onPress?:()=>void,color?:string}) {return <Pressable onPress={onPress} disabled={!onPress} style={s.item}><View style={{backgroundColor:color+'18',padding:10,borderRadius:13}}><Icon name={icon} color={color}/></View><View style={{flex:1,gap:3}}><T weight="700" lines={1}>{heading}</T>{subtitle?<T size={11} color={C.muted} lines={1}>{subtitle}</T>:null}</View>{right|| (onPress?<Icon name="chevron-left" color={C.muted}/>:null)}</Pressable>;}
export const s=StyleSheet.create({
  card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:17,padding:17,gap:2},
  header:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:19,gap:12,paddingBottom:15,borderBottomWidth:1,borderBottomColor:C.stroke},
  section:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginTop:22,marginBottom:12},
  search:{height:49,flexDirection:'row-reverse',alignItems:'center',gap:9,backgroundColor:C.surface,borderWidth:1,borderColor:C.stroke,borderRadius:12,paddingHorizontal:13,marginBottom:14},
  item:{flexDirection:'row-reverse',alignItems:'center',gap:12,paddingVertical:14,minHeight:66,borderBottomWidth:1,borderBottomColor:C.stroke}
});

export function Notice({tone='info',title,message,onPress}:{
 tone?:'info'|'warning'|'danger'|'success';title:string;message?:string;onPress?:()=>void;
}){
 const color=tone==='danger'?C.red:tone==='warning'?C.orange:tone==='success'?C.green:C.blue;
 const name=tone==='danger'?'alert-octagon-outline':tone==='warning'?'alert-circle-outline':
  tone==='success'?'check-circle-outline':'information-outline';
 return <Pressable disabled={!onPress} accessibilityRole={onPress?'button':'text'} onPress={onPress}
  style={{flexDirection:'row-reverse',alignItems:'flex-start',gap:11,
   padding:13,backgroundColor:color+'0D',borderWidth:1,borderColor:color+'45',borderRadius:12}}>
   <Icon name={name} size={20} color={color}/>
   <View style={{flex:1,gap:3}}>
    <T size={12} weight="800" color={color}>{title}</T>
    {message?<T size={12} color={C.muted}>{message}</T>:null}
   </View>
   {onPress?<Icon name="arrow-left" color={color} size={17}/>:null}
 </Pressable>;
}
