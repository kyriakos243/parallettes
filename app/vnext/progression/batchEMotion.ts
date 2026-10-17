import type { MotionGuideDefinition } from "../../MotionGuide";
import type { OwnedMotionJoint, OwnedMotionPose } from "../media/phase10OwnedMotion";

type Vec=Readonly<{x:number;y:number;z:number}>;
type WorldPose=Readonly<Record<OwnedMotionJoint,Vec>>;
type Point=Readonly<{x:number;y:number}>;
type Guide=MotionGuideDefinition & Readonly<{
  camera:string; phases:readonly string[]; phasePoseIndexes:readonly number[];
  performanceWindow:readonly [number,number]; startHold:readonly [number,number]; finishHold:readonly [number,number];
}>;
const v=(x:number,y:number,z=0):Vec=>({x,y,z});
const add=(a:Vec,b:Vec)=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:Vec,b:Vec)=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const scale=(a:Vec,n:number)=>v(a.x*n,a.y*n,a.z*n);
const length=(a:Vec)=>Math.hypot(a.x,a.y,a.z);
const normal=(a:Vec)=>scale(a,1/length(a));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const mixVec=(a:Vec,b:Vec,t:number)=>add(scale(a,1-t),scale(b,t));
const radians=(degrees:number)=>degrees*Math.PI/180;
const up=(n:number,degrees:number)=>v(n*Math.sin(radians(degrees)),-n*Math.cos(radians(degrees)));
const sideCamera={azimuthDegrees:20,originX:430,handHalfWidth:9/Math.sin(radians(20)),hipHalfWidth:20,ankleHalfWidth:8,elevationDegrees:0,worldFloor:420} as const;
const frontCamera={azimuthDegrees:75,originX:320,handHalfWidth:50/Math.sin(radians(75)),hipHalfWidth:20,ankleHalfWidth:8,elevationDegrees:0,worldFloor:420} as const;
export const batchECameras={side:sideCamera,frontOblique:frontCamera};
type Camera=Readonly<{azimuthDegrees:number;originX:number;handHalfWidth:number;hipHalfWidth:number;ankleHalfWidth:number;elevationDegrees:number;worldFloor:number}>;
export const projectBatchEPoint=(p:Vec,camera:Camera):Point=>({
  x:camera.originX+Math.cos(radians(camera.azimuthDegrees))*p.x+Math.sin(radians(camera.azimuthDegrees))*p.z,
  y:400+(p.y-400)*Math.cos(radians(camera.elevationDegrees))+(-Math.sin(radians(camera.azimuthDegrees))*p.x+Math.cos(radians(camera.azimuthDegrees))*p.z)*Math.sin(radians(camera.elevationDegrees)),
});
// Genuine 3D straddle abduction is projected obliquely. Screen segment lengths
// may foreshorten; world bones never scale. This avoids faking a straddle by
// bending knees or stretching one leg in a sagittal drawing.
const arm=110,leg=160,floor=420,samples=32;
const f=(key:number)=>key*samples;
type Key=Readonly<{arm:number;body:number;straddle?:number;leftAngle?:number;rightAngle?:number;leftFoot?:Vec;rightFoot?:Vec}>;
const body=(k:Key,side:"left"|"right",camera:Camera)=>{
  const torso=Math.sqrt(100*100-(camera.handHalfWidth-camera.hipHalfWidth)**2);
  const sign=side==="left"?-1:1,w=v(0,400,sign*camera.handHalfWidth),s=add(w,up(arm,k.arm));
  return {w,s,h:add(add(s,up(torso,k.body)),v(0,0,sign*(camera.hipHalfWidth-camera.handHalfWidth)))};
};
const foot=(k:Key,side:"left"|"right",camera:Camera)=>{
  if(k[`${side}Foot`])return k[`${side}Foot`]!;
  const sideSign=side==="left"?-1:1,closed=-Math.asin((camera.hipHalfWidth-camera.ankleHalfWidth)/leg);
  const spread=radians(k.straddle??0)+closed*(1-(k.straddle??0)/60);
  return add(body(k,side,camera).h,add(up(leg*Math.cos(spread),k[`${side}Angle`]!),v(0,0,sideSign*leg*Math.sin(spread))));
};
const knee=(a:Vec,b:Vec):Vec=>{
  const d=length(sub(b,a));if(d>leg+1e-6||d<1e-6)throw Error(`Unreachable D leg ${JSON.stringify({a,b,d})}`);
  const delta=sub(b,a),perpendicular=Math.hypot(delta.x,delta.y)>1e-6?normal(v(delta.y,-delta.x)):v(0,1,0);
  return add(mixVec(a,b,.5),scale(perpendicular,-Math.sqrt(Math.max(0,80*80-d*d/4))));
};
const offset=(a:Vec,b:Vec,t:number)=>{
  const direction=mixVec(normal(a),normal(b),t);
  if(length(direction)<1e-6)throw Error("Ambiguous opposite leg reset path");
  return scale(normal(direction),mix(length(a),length(b),t));
};
const gaze=(bodyAngle:number):Point=>bodyAngle<=90?{x:8*(1-Math.max(0,bodyAngle)/90),y:12}
  :{x:-12*Math.cos(radians(180-bodyAngle)),y:12*Math.sin(radians(180-bodyAngle))};
const sequence=(keys:readonly Key[],times:readonly number[],camera:Camera=sideCamera)=>{
  const worldPoses:WorldPose[]=[],poses:OwnedMotionPose[]=[],gazes:Point[]=[],bodyAngles:number[]=[],keyframeTimes:number[]=[];
  const duration=times.at(-1)!;
  const append=(i:number,t:number,time:number)=>{
    const a=keys[i]!,b=keys[i+1]!,k:Key={arm:mix(a.arm,b.arm,t),body:mix(a.body,b.body,t),straddle:mix(a.straddle??0,b.straddle??0,t)};
    const l=body(k,"left",camera),r=body(k,"right",camera);
    const ankle=(side:"left"|"right")=>{
      let point:Vec;
      if(!a[`${side}Foot`]&&!b[`${side}Foot`])point=foot({...k,[`${side}Angle`]:mix(a[`${side}Angle`]!,b[`${side}Angle`]!,t)},side,camera);
      else point=add(body(k,side,camera).h,offset(sub(foot(a,side,camera),body(a,side,camera).h),sub(foot(b,side,camera),body(b,side,camera).h),t));
      return {...point,y:Math.min(camera.worldFloor,point.y)};
    };
    const la=ankle("left"),ra=ankle("right"),shoulder=scale(add(l.s,r.s),.5);
    const world:WorldPose={head:add(shoulder,up(38,k.body+180)),neck:add(shoulder,up(14,k.body+180)),
      ls:l.s,le:mixVec(l.s,l.w,.5),lw:l.w,rs:r.s,re:mixVec(r.s,r.w,.5),rw:r.w,
      lh:l.h,lk:knee(l.h,la),la,rh:r.h,rk:knee(r.h,ra),ra};
    worldPoses.push(world);poses.push(Object.fromEntries(Object.entries(world).map(([j,p])=>[j,projectBatchEPoint(p,camera)])) as OwnedMotionPose);
    gazes.push(gaze(k.body));bodyAngles.push(k.body);keyframeTimes.push(time/duration);
  };
  append(0,0,0);
  for(let i=0;i<keys.length-1;i++)for(let step=1;step<=samples;step++)append(i,step/samples,mix(times[i]!,times[i+1]!,step/samples));
  return {camera,worldPoses,poses,gaze:gazes,bodyAngles,keyframeTimes,duration,phasePoseIndexes:keys.map((_,i)=>f(i))};
};
const ground:Key={arm:0,body:180,leftFoot:v(-140,floor,-14),rightFoot:v(-140,floor,14)};
const lSit:Key={arm:0,body:180,leftAngle:-90,rightAngle:-90};
const highV:Key={...lSit,leftAngle:-14,rightAngle:-14};
const high=sequence([ground,lSit,highV,highV,lSit,ground],[0,2,4,9,11,13]);
const pressSequence=(straddle:boolean)=>{
  const camera=straddle?frontCamera:sideCamera;
  const spread=straddle?20:0;
  const closed=-Math.asin((camera.hipHalfWidth-camera.ankleHalfWidth)/leg);
  const abduction=radians(spread)+closed*(1-spread/60);
  const g:Key={arm:20,body:-80,straddle:spread};
  const angle=180+Math.acos((floor-body(g,"left",camera).h.y)/(leg*Math.cos(abduction)))*180/Math.PI;
  const grounded:Key={...g,leftAngle:angle,rightAngle:angle};
  const lift:Key={arm:15,body:-40,leftAngle:220,rightAngle:220,straddle:straddle?60:0};
  const rise:Key={arm:5,body:-5,leftAngle:260,rightAngle:260,straddle:straddle?60:0};
  const stack:Key={arm:0,body:0,leftAngle:270,rightAngle:270,straddle:straddle?60:0};
  const open:Key={arm:0,body:0,leftAngle:360,rightAngle:360,straddle:straddle?60:0};
  const top:Key={...open,straddle:0};
  const keys=[grounded,grounded,lift,rise,stack,open,top,top,open,stack,rise,lift,grounded,grounded,lift,rise,stack,open,top,top,open,stack,rise,lift,grounded];
  const times=[0,2,4,6,7,8,9,11,12,13,14,16,18,21,23,25,26,27,28,30,31,32,33,35,37];
  return sequence(keys,times,camera);
};
const straddle=pressSequence(true),pike=pressSequence(false);

type BalanceKey=Readonly<{tilt:number;release?:number;side?:-1|1;straddle?:number;leftAngle?:number;rightAngle?:number;leftFoot?:Vec;rightFoot?:Vec}>;
const twoHandBody=(tilt:number)=>{
  const n=v(Math.cos(radians(tilt)),Math.sin(radians(tilt)));
  const delta=sub(scale(n,35),v(50,0));
  const c=add(v(0,400),scale(normal(v(-delta.y,delta.x)),Math.sqrt(110*110-length(delta)**2)));
  return {c,n};
};
const balanceBody=(k:BalanceKey)=>{
  const release=k.release??0,side=k.side??-1;
  let {c,n}=twoHandBody(k.tilt);
  if(release>0){
    const pre=twoHandBody(-side*5),tilt=mix(-side*5,side*20,release);
    n=v(Math.cos(radians(tilt)),Math.sin(radians(tilt)));
    const preSupport=add(pre.c,scale(pre.n,side*35));
    const x=mix(preSupport.x,side*45,release);
    const s=v(x,400-Math.sqrt(110*110-(x-side*50)**2));
    c=sub(s,scale(n,side*35));
  }
  const tilt=Math.atan2(n.y,n.x)*180/Math.PI;
  const h=add(c,up(100,tilt));
  const ls=sub(c,scale(n,35)),rs=add(c,scale(n,35));
  const lh=sub(h,scale(n,20)),rh=add(h,scale(n,20));
  let lw=v(-50,400),rw=v(50,400);
  if(release>0){
    const pre=twoHandBody(-side*5),freeSide=-side;
    const preShoulder=add(pre.c,scale(pre.n,freeSide*35));
    const start=sub(v(freeSide*50,400),preShoulder);
    const angle=Math.atan2(start.x,-start.y)*180/Math.PI;
    const hand=add(freeSide<0?ls:rs,up(110,mix(angle,freeSide*120,release)));
    if(freeSide<0)lw=hand;else rw=hand;
  }
  return {c,n,h,ls,rs,lh,rh,lw,rw,tilt};
};
const balanceFoot=(k:BalanceKey,side:"left"|"right")=>{
  const b=balanceBody(k),hip=side==='left'?b.lh:b.rh;
  return k[`${side}Foot`]??add(hip,up(160,k[`${side}Angle`]??b.tilt+(side==='left'?-1:1)*(k.straddle??65)));
};
const balanceSequence=()=>{
  const g:BalanceKey={tilt:80,leftFoot:v(80,420),rightFoot:v(135,420)};
  const kick:BalanceKey={tilt:30,leftAngle:-30,rightAngle:150};
  const base:BalanceKey={tilt:0,straddle:65};
  const exit:BalanceKey={tilt:65,leftFoot:v(20,420),rightAngle:90};
  const keys:readonly BalanceKey[]=[g,kick,base,base,{...base,tilt:5,side:-1},{...base,tilt:5,side:-1,release:1},{...base,tilt:5,side:-1,release:1},{...base,tilt:5,side:-1},base,base,exit,g,g,kick,base,base,{...base,tilt:-5,side:1},{...base,tilt:-5,side:1,release:1},{...base,tilt:-5,side:1,release:1},{...base,tilt:-5,side:1},base,base,exit,g];
  const times=[0,1.5,3,4,5,6.5,9.5,11,12,13,15,17,19,20.5,22,23,24,25.5,28.5,30,31,32,34,36];
  const worldPoses:WorldPose[]=[],poses:OwnedMotionPose[]=[],keyframeTimes:number[]=[],bodyAngles:number[]=[];
  const camera={...sideCamera,azimuthDegrees:0,originX:320};
  const append=(i:number,t:number,time:number)=>{
    const a=keys[i]!,b=keys[i+1]!;
    const k:BalanceKey={tilt:mix(a.tilt,b.tilt,t),release:mix(a.release??0,b.release??0,t),side:(a.release??0)>0?a.side:b.side??a.side,straddle:65};
    const frame=balanceBody(k);
    const ankle=(side:"left"|"right")=>{
      if(!a[`${side}Foot`]&&!b[`${side}Foot`]){
        const angle=(key:BalanceKey)=>key[`${side}Angle`]??balanceBody(key).tilt+(side==='left'?-1:1)*(key.straddle??65);
        return balanceFoot({...k,[`${side}Angle`]:a[`${side}Angle`]===undefined&&b[`${side}Angle`]===undefined?undefined:mix(angle(a),angle(b),t)},side);
      }
      const ah=balanceBody(a)[side==='left'?'lh':'rh'],bh=balanceBody(b)[side==='left'?'lh':'rh'];
      const hip=frame[side==='left'?'lh':'rh'];
      return add(hip,offset(sub(balanceFoot(a,side),ah),sub(balanceFoot(b,side),bh),t));
    };
    const la0=ankle('left'),ra0=ankle('right'),la={...la0,y:Math.min(420,la0.y)},ra={...ra0,y:Math.min(420,ra0.y)};
    const world:WorldPose={head:sub(frame.c,up(38,frame.tilt)),neck:sub(frame.c,up(14,frame.tilt)),
      ls:frame.ls,le:mixVec(frame.ls,frame.lw,.5),lw:frame.lw,rs:frame.rs,re:mixVec(frame.rs,frame.rw,.5),rw:frame.rw,
      lh:frame.lh,lk:knee(frame.lh,la),la,rh:frame.rh,rk:knee(frame.rh,ra),ra};
    worldPoses.push(world);poses.push(Object.fromEntries(Object.entries(world).map(([j,p])=>[j,projectBatchEPoint(p,camera)])) as OwnedMotionPose);
    keyframeTimes.push(time/36);bodyAngles.push(frame.tilt);
  };
  append(0,0,0);for(let i=0;i<keys.length-1;i++)for(let j=1;j<=samples;j++)append(i,j/samples,mix(times[i]!,times[i+1]!,j/samples));
  return {camera,worldPoses,poses,keyframeTimes,bodyAngles,gaze:poses.map(()=>({x:0,y:12})),duration:36,phasePoseIndexes:keys.map((_,i)=>f(i))};
};
const balance=balanceSequence();
export const batchEWorldMotion={"extended-v-sit-hold":high,"assisted-one-arm-parallette-balance":balance,"one-arm-parallette-handstand":balance,"repeated-straddle-press-to-handstand":straddle,"repeated-pike-press-to-handstand":pike} as const;
const playback=(s:typeof high)=>({poses:s.poses,gaze:s.gaze,keyframeTimes:s.keyframeTimes,duration:s.duration,phasePoseIndexes:s.phasePoseIndexes});
const base={floor:420,barTop:400,equipment:["parallettes"],playback:"one-way-reset"} as const;
const contactWindows=[[f(3),f(9)],[f(15),f(21)]] as const;
const active=contactWindows.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i));
const balanceBase={...base,...playback(balance),paralletteView:"front-oblique",posterFrame:f(5),auditFrames:{start:f(5),middle:f(17),end:f(23)},holdWindows:[[f(5),f(6)],[f(17),f(18)]],contactWindows,
  phases:["Grounded setup","Controlled split entry","Two-hand straddle","Coach contact before release if assisted","Shift toward left support","Lift free hand completely","Three-second left hold","Full free-hand regrip","Return to two-hand centre","Coach releases only after both grips return","Separate split exit","Grounded landing","Recovery shortened in guide; follow timer","Second split entry","Two-hand straddle","Coach contact before release if assisted","Shift toward right support","Lift free hand completely","Three-second right hold","Full free-hand regrip","Return to two-hand centre","Coach releases after full regrip","Separate split exit","Grounded landing"],
  camera:"Front-oblique view shows the supporting locked arm, fully raised free hand and straight straddle on each side. Both grips return before each separate grounded exit; floor reset/rest separates the sides. The coach chooses a comfortable straddle width; the drawing does not prescribe an angle."} as const;
const pressGuide=(s:typeof high,straddled:boolean)=>({...base,...playback(s),...(straddled?{paralletteView:"front-oblique" as const}:{}),posterFrame:f(6),auditFrames:{start:f(6),middle:f(18),end:f(24)},holdWindows:[[f(6),f(7)],[f(18),f(19)]] as const,resetWindow:[f(12),f(13)] as const,ascentWindows:[[f(1),f(6)],[f(13),f(18)]] as const,
  label:straddled?"Two straddle presses; 2s tops, 3s floor reset":"Two pike presses; 2s tops, 3s floor reset",
  phases:["Grounded setup","Stationary start","Quiet toe-off","Hips rise","Stack hips before unfolding","Straddled top or pike unfolding","Straight handstand","Two-second first top","Begin controlled lower","Fold through the same branch","Hips lower","Prepare both-foot contact","Both feet land","Three-second stationary floor reset","Second quiet toe-off","Second hip rise","Stack before unfolding","Open to top","Straight second handstand","Two-second second top","Separate controlled return","Fold through the same branch","Hips lower","Both feet approach ground","Grounded finish"],
  camera:`${straddled?'Front-oblique straddle':'Side-oblique together-leg pike'} view shows two complete grounded-start ascents with fixed grips and straight elbows/knees, two settled tops and an actual three-second stationary grounded reset. Lowering is deliberately authored between ascents; playback never reverses the entire guide.`,visuals:[{kind:"landing" as const,x:180,y:428,width:300,label:"both feet reset 2–4s · no bounce"}]});
export const batchEMotionGuides={
  "extended-v-sit-hold":{...base,...playback(high),posterFrame:f(2),auditFrames:{start:f(1),middle:f(2),end:f(5)},holdWindows:[[f(2),f(3)]],label:"High V: straight legs at least 75°, hold 5s, lower",
    camera:"Side-oblique full-body view keeps the upright torso, fixed grips and both straight together legs visible at the 75-degree landmark. Entry and exit pass through L-sit without recoil.",
    phases:["Grounded setup","Full L-sit","Raise straight legs to at least 75 degrees","Five-second higher V hold","Lower to full L-sit","Controlled landing"],
    visuals:[{kind:"landmark",x1:430,y1:390,x2:389,y2:237,label:""},{kind:"direction",points:[{x:150,y:220},{x:380,y:237}],label:"75° above horizontal"}]},
  "assisted-one-arm-parallette-balance":{...balanceBase,label:"Coach supports pelvis; free hand clear, 3s each side",
    visuals:[{kind:"assistance",joint:"lh",anchor:{x:30,y:280},label:"coach hands at pelvis",contactOnly:true,activePoseIndexes:active},{kind:"assistance",joint:"rh",anchor:{x:30,y:300},label:"unmeasured assistance",contactOnly:true,activePoseIndexes:active}]},
  "one-arm-parallette-handstand":{...balanceBase,label:"Coach present, no contact; free hand clear, 3s each side",visuals:[]},
  "repeated-straddle-press-to-handstand":pressGuide(straddle,true),
  "repeated-pike-press-to-handstand":pressGuide(pike,false),
} as const satisfies Readonly<Record<string,MotionGuideDefinition & Readonly<{camera:string;phases:readonly string[];phasePoseIndexes:readonly number[];holdWindows:readonly (readonly [number,number])[]}>>>;
