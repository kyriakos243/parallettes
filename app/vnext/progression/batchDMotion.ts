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
const sideCamera={azimuthDegrees:20,originX:430,handHalfWidth:9/Math.sin(radians(20)),hipHalfWidth:20,ankleHalfWidth:8,elevationDegrees:0,worldFloor:448} as const;
const frontCamera={azimuthDegrees:75,originX:320,handHalfWidth:50/Math.sin(radians(75)),hipHalfWidth:20,ankleHalfWidth:8,elevationDegrees:0,worldFloor:448} as const;
const plancheCamera={...sideCamera,elevationDegrees:8,worldFloor:400+(48-Math.sin(radians(8))*Math.sin(radians(20))*60)/Math.cos(radians(8))} as const;
export const batchDCameras={side:sideCamera,frontOblique:frontCamera,plancheOblique:plancheCamera};
type Camera=Readonly<{azimuthDegrees:number;originX:number;handHalfWidth:number;hipHalfWidth:number;ankleHalfWidth:number;elevationDegrees:number;worldFloor:number}>;
export const projectBatchDPoint=(p:Vec,camera:Camera):Point=>({
  x:camera.originX+Math.cos(radians(camera.azimuthDegrees))*p.x+Math.sin(radians(camera.azimuthDegrees))*p.z,
  y:400+(p.y-400)*Math.cos(radians(camera.elevationDegrees))+(-Math.sin(radians(camera.azimuthDegrees))*p.x+Math.cos(radians(camera.azimuthDegrees))*p.z)*Math.sin(radians(camera.elevationDegrees)),
});
// Genuine 3D straddle abduction is projected obliquely. Screen segment lengths
// may foreshorten; world bones never scale. This avoids faking a straddle by
// bending knees or stretching one leg in a sagittal drawing.
const arm=110,leg=160,floor=448,samples=32;
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
    worldPoses.push(world);poses.push(Object.fromEntries(Object.entries(world).map(([j,p])=>[j,projectBatchDPoint(p,camera)])) as OwnedMotionPose);
    gazes.push(gaze(k.body));bodyAngles.push(k.body);keyframeTimes.push(time/duration);
  };
  append(0,0,0);
  for(let i=0;i<keys.length-1;i++)for(let step=1;step<=samples;step++)append(i,step/samples,mix(times[i]!,times[i+1]!,step/samples));
  return {camera,worldPoses,poses,gaze:gazes,bodyAngles,keyframeTimes,duration,phasePoseIndexes:keys.map((_,i)=>f(i))};
};
const ground:Key={arm:0,body:180,leftFoot:v(-140,floor,-14),rightFoot:v(-140,floor,14)};
const lSit:Key={arm:0,body:180,leftAngle:-90,rightAngle:-90};
const compressed:Key={arm:-40,body:135,leftAngle:-80,rightAngle:-80};
const rising:Key={arm:-50,body:90,leftAngle:-80,rightAngle:-80};
const stacked:Key={arm:0,body:0,leftAngle:-90,rightAngle:-90};
const top:Key={arm:0,body:0,leftAngle:0,rightAngle:0};
const split:Key={arm:-35,body:-55,leftAngle:-150,rightAngle:-90};
const landing:Key={arm:-60,body:-80,leftFoot:v(-220,floor,-14),rightFoot:v(-200,floor,14)};
const straddleL:Key={...lSit,arm:25,straddle:60};
const straddleStack:Key={...stacked,straddle:60};
const straddleTop:Key={...top,straddle:60};
const frontGround:Key={...ground,leftFoot:v(-140,floor,-20),rightFoot:v(-140,floor,20)};
const frontLanding:Key={...landing,leftFoot:v(-120,floor,-20),rightFoot:v(-120,floor,20)};
const straddle=sequence([frontGround,straddleL,straddleL,{...compressed,body:110,straddle:60},{...rising,straddle:60},straddleStack,straddleTop,top,top,split,frontLanding],[0,2,4,6,8,10,11.5,13,15,17,19],frontCamera);
const pike=sequence([ground,lSit,lSit,compressed,rising,stacked,top,top,split,landing],[0,2,4,6,8,10,12,14,16,18]);
const entryGround:Key={arm:0,body:170,leftFoot:v(-100,floor,-14),rightFoot:v(-100,floor,14)};
const kick:Key={arm:-15,body:45,leftAngle:-20,rightAngle:150};
const negative=sequence([entryGround,kick,top,top,stacked,rising,compressed,lSit,lSit,ground],[0,1.5,3,5,6,7.5,9,10.5,12.5,14.5]);
const plancheGround:Key={arm:20,body:-100,leftFoot:v(-60,plancheCamera.worldFloor,-8),rightFoot:v(-60,plancheCamera.worldFloor,8)};
const plancheSplit:Key={arm:-55,body:80,leftFoot:v(-60,plancheCamera.worldFloor,-8),rightAngle:70};
const plancheLanding:Key={...plancheSplit,rightFoot:v(-60,plancheCamera.worldFloor,8)};
const plancheLift:Key={...plancheGround,leftFoot:v(-70,plancheCamera.worldFloor-40,-8),rightFoot:v(-70,plancheCamera.worldFloor-40,8)};
const plancheStart:Key={arm:45,body:-90,leftAngle:-90,rightAngle:-90,straddle:45};
const planche=sequence([plancheGround,plancheLift,plancheStart,plancheStart,{arm:30,body:-55,leftAngle:-55,rightAngle:-55,straddle:45},{arm:15,body:-25,leftAngle:-25,rightAngle:-25,straddle:45},{...top,straddle:45},top,top,plancheSplit,plancheLanding],[0,1.5,3,5,7,9,11,13,15,17,19],plancheCamera);
export const batchDWorldMotion={
  "straddle-l-press-handstand-transition":straddle,
  "full-l-pike-press-to-handstand-transition":pike,
  "handstand-to-l-sit-negative":negative,
  "straddle-planche-to-handstand-press":planche,
} as const;
const playback=(s:ReturnType<typeof sequence>)=>({poses:s.poses,gaze:s.gaze,keyframeTimes:s.keyframeTimes,duration:s.duration,phasePoseIndexes:s.phasePoseIndexes});
const base={floor,barTop:400,equipment:["parallettes"],playback:"one-way-reset",
  visuals:[{kind:"landing",x:270,y:456,width:260,label:"separate trained landing"}],
} as const;
const camera="Full-body view keeps both fixed grips, straight limbs, the complete feet-clear path and the separate grounded setup/reset visible.";
export const batchDMotionGuides={
  "straddle-l-press-handstand-transition":{...base,...playback(straddle),camera:`Front-oblique view shows the open straddle and both hands. ${camera}`,paralletteView:"front-oblique",
    label:"Straddle-L 2s, continuous press, handstand 2s, then exit",
    posterFrame:f(1),auditFrames:{start:f(1),middle:f(7),end:f(10)},startHold:[f(1),f(2)],finishHold:[f(7),f(8)],performanceWindow:[f(2),f(7)],
    phases:["Grounded setup","Feet-clear horizontal straddle L-sit","Two-second straddle-L start","Compress with locked elbows","Hips rise while legs stay straddled","Hips stack before closing","Unfold in straddle handstand","Close into straight handstand","Two-second straight top","Separate split exit","Grounded landing"]},
  "full-l-pike-press-to-handstand-transition":{...base,...playback(pike),camera,
    label:"Full L-sit 2s, together-leg pike press, handstand 2s, exit",
    posterFrame:f(1),auditFrames:{start:f(1),middle:f(6),end:f(9)},startHold:[f(1),f(2)],finishHold:[f(6),f(7)],performanceWindow:[f(2),f(6)],
    phases:["Grounded setup","Feet-clear horizontal full L-sit","Two-second L-sit start","Compress through locked arms","Hips rise with legs together","Stack hips before unfolding","Straight together-leg handstand","Two-second straight top","Separate split exit","Grounded landing"]},
  "handstand-to-l-sit-negative":{...base,...playback(negative),camera,
    label:"Handstand 2s, one-way lower at least 4s, L-sit 2s, land",
    posterFrame:f(7),auditFrames:{start:f(2),middle:f(7),end:f(9)},startHold:[f(2),f(3)],finishHold:[f(7),f(8)],performanceWindow:[f(3),f(7)],
    phases:["Grounded setup","Controlled split entry","Straight handstand","Two-second settled top","Begin one-way pike lower","Hips lower with legs together","Continue compressed lower","Feet-clear horizontal full L-sit","Two-second L-sit finish","Separate fold-and-land reset"]},
  "straddle-planche-to-handstand-press":{...base,...playback(planche),camera:`Slightly elevated side-oblique view keeps both straddled legs visible. ${camera}`,
    label:"Straddle Planche 2s, locked-arm press, handstand 2s, exit",
    posterFrame:f(2),auditFrames:{start:f(2),middle:f(7),end:f(10)},startHold:[f(2),f(3)],finishHold:[f(7),f(8)],performanceWindow:[f(3),f(7)],
    phases:["Grounded setup","Fold and lift both feet clear before opening","Feet-clear horizontal straddle Planche","Two-second straddle Planche start","Raise hips with straight arms and knees","Keep the straddle through hip rise","Stack into straddle handstand","Close into straight handstand","Two-second straight top","Separate split exit","Grounded landing"]},
} as const satisfies Readonly<Record<string,Guide>>;
