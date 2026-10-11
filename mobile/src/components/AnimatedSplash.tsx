import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,StatusBar,View} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {C} from '../theme';
import {T} from './UI';

/**
 * Original WHMCS motion identity: bars converge, a light sweep reveals the
 * wordmark, then the intro exits ONLY after local session restoration.
 * The native OS splash is the first frame. Never block on network requests.
 * All animations use the native driver; reduce-motion accessibility is honored.
 */
export function AnimatedSplash({ready,onFinish}:{ready:boolean;onFinish:()=>void}){
 const entrance=useRef(new Animated.Value(0)).current;
 const reveal=useRef(new Animated.Value(0)).current;
 const breath=useRef(new Animated.Value(0)).current;
 const exit=useRef(new Animated.Value(1)).current;
 const [sequenceFinished,setSequenceFinished]=useState(false);
 const [reduceMotion,setReduceMotion]=useState(false);
 const hidden=useRef(false),finishing=useRef(false);
 const onFinishRef=useRef(onFinish);
 onFinishRef.current=onFinish;

 useEffect(()=>{
  let mounted=true;
  let active:Animated.CompositeAnimation|undefined;
  const begin=async()=>{
   let reduced=false;
   try{reduced=await AccessibilityInfo.isReduceMotionEnabled();}catch{}
   if(!mounted)return;
   setReduceMotion(reduced);
   if(reduced){
    entrance.setValue(1);reveal.setValue(1);breath.setValue(1);
    setSequenceFinished(true);
    return;
   }
   active=Animated.sequence([
    Animated.parallel([
     Animated.timing(entrance,{toValue:1,duration:680,
      easing:Easing.out(Easing.cubic),useNativeDriver:true}),
     Animated.timing(breath,{toValue:1,duration:760,
      easing:Easing.inOut(Easing.quad),useNativeDriver:true})
    ]),
    Animated.timing(reveal,{toValue:1,duration:440,
     easing:Easing.out(Easing.cubic),useNativeDriver:true}),
    Animated.delay(220)
   ]);
   active.start(({finished})=>{if(mounted&&finished)setSequenceFinished(true);});
  };
  void begin();
  return()=>{mounted=false;active?.stop();};
 },[entrance,reveal,breath]);

 useEffect(()=>{
  if(!ready||!sequenceFinished||finishing.current)return;
  finishing.current=true;
  if(reduceMotion){onFinishRef.current();return;}
  const animation=Animated.timing(exit,{toValue:0,duration:340,
   easing:Easing.inOut(Easing.cubic),useNativeDriver:true});
  animation.start(({finished})=>{if(finished)onFinishRef.current();});
  return()=>animation.stop();
 },[ready,sequenceFinished,reduceMotion,exit]);

 const markOpacity=entrance.interpolate({inputRange:[0,0.12,1],outputRange:[0,0.2,1]});
 const slide=entrance.interpolate({inputRange:[0,1],outputRange:[56,0]});
 const scale=entrance.interpolate({inputRange:[0,0.65,1],outputRange:[0.7,1.09,1]});
 const titleSlide=reveal.interpolate({inputRange:[0,1],outputRange:[24,0]});
 const glowScale=breath.interpolate({inputRange:[0,1],outputRange:[0.65,1.3]});
 const wipe=reveal.interpolate({inputRange:[0,1],outputRange:[-130,190]});
 return <Animated.View
  accessibilityLabel="جاري تشغيل تطبيق إدارة WHMCS"
  accessible
  onLayout={()=>{
   if(hidden.current)return;
   hidden.current=true;
   // Let React Native paint this actual frame before dismissing the native splash.
   requestAnimationFrame(()=>{void SplashScreen.hideAsync().catch(()=>{});});
  }}
  style={{flex:1,backgroundColor:'#080B12',justifyContent:'center',alignItems:'center',
   overflow:'hidden',opacity:exit}}>
  <StatusBar barStyle="light-content" backgroundColor="#080B12"/>
  <Animated.View pointerEvents="none" style={{position:'absolute',width:360,height:360,borderRadius:180,
   backgroundColor:'#391822',opacity:breath.interpolate({inputRange:[0,1],outputRange:[0,0.52]}),
   transform:[{scale:glowScale}]}}/>
  <View style={{alignItems:'center',justifyContent:'center',gap:28}}>
   <Animated.View style={{width:134,height:134,alignItems:'center',justifyContent:'center',
    opacity:markOpacity,transform:[{translateY:slide},{scale}]}}>
    <View style={{width:122,height:122,borderRadius:37,borderWidth:1,borderColor:'#57313B',
     backgroundColor:'#151923',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
     <Animated.View style={{position:'absolute',width:24,height:195,backgroundColor:'#F4445A',
      opacity:0.19,transform:[{rotate:'38deg'},{translateX:wipe}]}}/>
     <View style={{height:51,width:66,flexDirection:'row',alignItems:'flex-end',gap:8,transform:[{rotate:'-14deg'}]}}>
      <View style={{width:13,height:30,borderRadius:5,backgroundColor:'#F54A60'}}/>
      <View style={{width:13,height:49,borderRadius:5,backgroundColor:'#FA7282'}}/>
      <View style={{width:13,height:38,borderRadius:5,backgroundColor:'#FFFFFF'}}/>
     </View>
     <View style={{position:'absolute',width:6,height:6,borderRadius:3,backgroundColor:C.red,
      top:27,right:24}}/>
    </View>
   </Animated.View>
   <Animated.View style={{alignItems:'center',gap:7,
    opacity:reveal,transform:[{translateY:titleSlide}]}}>
    <T size={35} weight="900" color={C.white} style={{textAlign:'center',letterSpacing:2.6,writingDirection:'ltr'}}>WHMCS</T>
    <T size={11} color="#B2BECC" weight="600" style={{textAlign:'center',letterSpacing:1.9,writingDirection:'ltr'}}>
     ADMIN CONSOLE
    </T>
   </Animated.View>
  </View>
  <View style={{position:'absolute',bottom:50,alignItems:'center',gap:12,minHeight:46}}>
   {!ready?<T size={12} color="#9FAABA" style={{textAlign:'center'}}>بنجهّز مساحة العمل بأمان...</T>:
    <T size={12} color="#9FAABA" style={{textAlign:'center'}}>كل حاجة في مكانها</T>}
   <View style={{width:72,height:3,borderRadius:3,backgroundColor:'#34323C',overflow:'hidden'}}>
    <Animated.View style={{width:'100%',height:'100%',backgroundColor:C.red,
     transform:[{translateX:entrance.interpolate({inputRange:[0,1],outputRange:[-72,0]})}]}}/>
   </View>
  </View>
 </Animated.View>;
}
