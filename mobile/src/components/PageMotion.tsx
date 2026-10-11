import React,{useEffect,useRef} from 'react';
import {AccessibilityInfo,Animated,Easing} from 'react-native';

/** One subtle screen transition per navigation. Disabled for reduce-motion users. */
export function PageMotion({children}:{children:React.ReactNode}){
 const value=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
  let disposed=false;
  let animation:Animated.CompositeAnimation|undefined;
  void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
   if(disposed)return;
   if(reduced){value.setValue(1);return;}
   animation=Animated.timing(value,{toValue:1,duration:250,
    easing:Easing.out(Easing.cubic),useNativeDriver:true});
   animation.start();
  }).catch(()=>value.setValue(1));
  return()=>{disposed=true;animation?.stop();};
 },[value]);
 return <Animated.View style={{opacity:value,
  transform:[{translateY:value.interpolate({inputRange:[0,1],outputRange:[12,0]})}]}}>
  {children}
 </Animated.View>;
}
