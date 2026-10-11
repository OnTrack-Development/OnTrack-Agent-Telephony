import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,StatusBar,View} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {C} from '../theme';
import {T} from './UI';

/**
 * Typography-led original motion identity. The Android native splash is the
 * SAME blank dark frame. No invented icon, particles, fake progress or network
 * waiting. Native-driver opacity/transforms, and reduced-motion fallback.
 */
export function AnimatedSplash({ready,onFinish}:{ready:boolean;onFinish:()=>void}){
 const reveal=useRef(new Animated.Value(0)).current;
 const line=useRef(new Animated.Value(0)).current;
 const subtitle=useRef(new Animated.Value(0)).current;
 const leave=useRef(new Animated.Value(1)).current;
 const [played,setPlayed]=useState(false),[reduced,setReduced]=useState(false);
 const firstFrame=useRef(false),exiting=useRef(false);
 const finish=useRef(onFinish);finish.current=onFinish;

 useEffect(()=>{
  let alive=true;
  let animation:Animated.CompositeAnimation|undefined;
  const start=async()=>{
   let shouldReduce=false;
   try{shouldReduce=await AccessibilityInfo.isReduceMotionEnabled();}catch{}
   if(!alive)return;
   setReduced(shouldReduce);
   if(shouldReduce){
    reveal.setValue(1);line.setValue(1);subtitle.setValue(1);setPlayed(true);return;
   }
   animation=Animated.sequence([
    Animated.parallel([
     Animated.timing(reveal,{toValue:1,duration:520,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
     Animated.timing(line,{toValue:1,duration:650,easing:Easing.out(Easing.cubic),useNativeDriver:true})
    ]),
    Animated.timing(subtitle,{toValue:1,duration:290,easing:Easing.out(Easing.quad),useNativeDriver:true}),
    Animated.delay(130)
   ]);
   animation.start(({finished})=>{if(alive&&finished)setPlayed(true);});
  };
  void start();
  return()=>{alive=false;animation?.stop();};
 },[reveal,line,subtitle]);

 useEffect(()=>{
  if(!ready||!played||exiting.current)return;
  exiting.current=true;
  if(reduced){finish.current();return;}
  const a=Animated.timing(leave,{toValue:0,duration:260,
   easing:Easing.inOut(Easing.quad),useNativeDriver:true});
  a.start(({finished})=>{if(finished)finish.current();});
  return()=>a.stop();
 },[ready,played,reduced,leave]);

 const titleShift=reveal.interpolate({inputRange:[0,1],outputRange:[22,0]});
 const accentShift=line.interpolate({inputRange:[0,1],outputRange:[-135,0]});
 const descShift=subtitle.interpolate({inputRange:[0,1],outputRange:[10,0]});
 return <Animated.View accessible accessibilityLabel="جاري فتح إدارة WHMCS"
  onLayout={()=>{
   if(firstFrame.current)return;firstFrame.current=true;
   requestAnimationFrame(()=>{void SplashScreen.hideAsync().catch(()=>{});});
  }}
  style={{flex:1,backgroundColor:'#090D14',justifyContent:'center',
   alignItems:'center',opacity:leave}}>
  <StatusBar backgroundColor="#090D14" barStyle="light-content"/>
  <View style={{width:'100%',alignItems:'center',gap:16,paddingHorizontal:32}}>
   <Animated.View style={{opacity:reveal,transform:[{translateY:titleShift}]}}>
    <T size={49} color="#FAFBFF" weight="900" style={{
     letterSpacing:4.7,writingDirection:'ltr',textAlign:'center'}}>WHMCS</T>
   </Animated.View>
   <View style={{width:136,height:3,backgroundColor:'#252F3D',overflow:'hidden',borderRadius:3}}>
    <Animated.View style={{backgroundColor:C.red,height:3,width:136,
     transform:[{translateX:accentShift}]}}/>
   </View>
   <Animated.View style={{opacity:subtitle,transform:[{translateY:descShift}]}}>
    <T color="#B0BCCA" size={11} weight="700"
     style={{letterSpacing:3.7,writingDirection:'ltr',textAlign:'center'}}>
     ADMIN CONSOLE
    </T>
   </Animated.View>
  </View>
  <Animated.View style={{position:'absolute',bottom:55,opacity:subtitle}}>
   <T size={10} color="#7D8B9F" style={{textAlign:'center'}}>SECURE OPERATIONS</T>
  </Animated.View>
 </Animated.View>;
}
