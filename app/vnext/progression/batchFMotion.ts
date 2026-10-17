import type { MotionGuideDefinition } from "../../MotionGuide";
import type { OwnedMotionJoint, OwnedMotionPose } from "../media/phase10OwnedMotion";

type Vec=Readonly<{x:number;y:number;z:number}>;
type WorldPose=Readonly<Record<OwnedMotionJoint,Vec>>;
type Key=Readonly<{arm:number;body:number;reach?:number;leftAngle?:number;rightAngle?:number;leftFoot?:Vec;rightFoot?:Vec}>;
type Camera=Readonly<{azimuthDegrees:number;originX:number;worldFloor:number}>;
const v=(x:number,y:number,z=0):Vec=>({x,y,z});
const add=(a:Vec,b:Vec)=>v(a.x+b.x,a.y+b.y,a.z+b.z),sub=(a:Vec,b:Vec)=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const scale=(a:Vec,n:number)=>v(a.x*n,a.y*n,a.z*n),length=(a:Vec)=>Math.hypot(a.x,a.y,a.z);
const normal=(a:Vec)=>scale(a,1/length(a)),mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const mixVec=(a:Vec,b:Vec,t:number)=>add(scale(a,1-t),scale(b,t));
const rad=(n:number)=>n*Math.PI/180,up=(n:number,angle:number)=>v(n*Math.sin(rad(angle)),-n*Math.cos(rad(angle)));
const camera:Camera={azimuthDegrees:20,originX:430,worldFloor:420};
export const projectBatchFPoint=(p:Vec,c:Camera)=>({x:c.originX+Math.cos(rad(c.azimuthDegrees))*p.x+Math.sin(rad(c.azimuthDegrees))*p.z,y:p.y});
const floor=420,samples=48,f=(key:number)=>key*samples;
// The two horizontal-only guides use a larger fixed authored skeleton to fill
// the same player. Every individual guide preserves its dimensions throughout.
const dimensions=(size:number)=>({arm:110*size,torso:100*size,leg:160*size,head:38*size,neck:14*size,hipWidth:20*size,ankleWidth:8*size,handWidth:9/Math.sin(rad(20))});
const hinge=(a:Vec,b:Vec,half:number,branch=1):Vec=>{
  const delta=sub(b,a),d=length(delta);if(d>half*2+1e-5||d<1e-6)throw Error(`Unreachable F limb ${JSON.stringify({a,b,half,d})}`);
  const perpendicular=normal(v(-delta.y,delta.x));
  return add(mixVec(a,b,.5),scale(perpendicular,branch*Math.sqrt(Math.max(0,half*half-d*d/4))));
};
const offset=(a:Vec,b:Vec,t:number)=>scale(normal(mixVec(normal(a),normal(b),t)),mix(length(a),length(b),t));
const body=(k:Key,side:"left"|"right",size:number)=>{
  const d=dimensions(size),sign=side==='left'?-1:1;
  const w=v(0,400,sign*d.handWidth),s=add(w,up(d.arm*(k.reach??1),k.arm));
  const h=add(add(s,up(Math.sqrt(d.torso*d.torso-(d.handWidth-d.hipWidth)**2),k.body)),v(0,0,sign*(d.hipWidth-d.handWidth)));
  return{w,s,h};
};
const foot=(k:Key,side:"left"|"right",size:number)=>{
  if(k[`${side}Foot`])return k[`${side}Foot`]!;
  const d=dimensions(size),sign=side==='left'?-1:1,closed=-Math.asin((d.hipWidth-d.ankleWidth)/d.leg);
  return add(body(k,side,size).h,add(up(d.leg*Math.cos(closed),k[`${side}Angle`]!),v(0,0,sign*d.leg*Math.sin(closed))));
};
const sequence=(keys:readonly Key[],times:readonly number[],size=1)=>{
  const d=dimensions(size),worldPoses:WorldPose[]=[],poses:OwnedMotionPose[]=[],gaze:{x:number;y:number}[]=[],bodyAngles:number[]=[],keyframeTimes:number[]=[];
  const duration=times.at(-1)!;
  const append=(i:number,t:number,time:number)=>{
    const a=keys[i]!,b=keys[i+1]!,k:Key={arm:mix(a.arm,b.arm,t),body:mix(a.body,b.body,t),reach:mix(a.reach??1,b.reach??1,t)};
    const l=body(k,'left',size),r=body(k,'right',size),shoulder=scale(add(l.s,r.s),.5);
    const ankle=(side:'left'|'right')=>{
      const hip=side==='left'?l.h:r.h;
      const p=!a[`${side}Foot`]&&!b[`${side}Foot`]
        ?foot({...k,[`${side}Angle`]:mix(a[`${side}Angle`]!,b[`${side}Angle`]!,t)},side,size)
        :add(hip,offset(sub(foot(a,side,size),body(a,side,size).h),sub(foot(b,side,size),body(b,side,size).h),t));
      return{...p,y:Math.min(floor,p.y)};
    };
    const la=ankle('left'),ra=ankle('right');
    const world:WorldPose={head:add(shoulder,up(d.head,k.body+180)),neck:add(shoulder,up(d.neck,k.body+180)),
      ls:l.s,le:hinge(l.s,l.w,d.arm/2),lw:l.w,rs:r.s,re:hinge(r.s,r.w,d.arm/2),rw:r.w,
      lh:l.h,lk:hinge(l.h,la,d.leg/2),la,rh:r.h,rk:hinge(r.h,ra,d.leg/2),ra};
    worldPoses.push(world);poses.push(Object.fromEntries(Object.entries(world).map(([j,p])=>[j,projectBatchFPoint(p,camera)])) as OwnedMotionPose);
    gaze.push({x:8,y:12});bodyAngles.push(k.body);keyframeTimes.push(time/duration);
  };
  append(0,0,0);for(let i=0;i<keys.length-1;i++)for(let j=1;j<=samples;j++)append(i,j/samples,mix(times[i]!,times[i+1]!,j/samples));
  return{camera,dimensions:d,worldPoses,poses,gaze,bodyAngles,keyframeTimes,duration,phasePoseIndexes:keys.map((_,i)=>f(i))};
};
const planche:Key={arm:45,body:-90,leftAngle:-90,rightAngle:-90};
const bottom:Key={...planche,reach:Math.SQRT1_2};
const flatGround:Key={...planche,leftFoot:v(-120,floor,-11.6),rightFoot:v(-120,floor,11.6)};
const flatLift:Key={...planche,leftFoot:v(-100,370,-11.6),rightFoot:v(-100,370,11.6)};
const bentLanding:Key={...bottom,leftFoot:v(-110,floor,-11.6),rightFoot:v(-110,floor,11.6)};
const eccentric=sequence([flatGround,flatLift,planche,planche,bottom,bentLanding],[0,1.5,3,5,9,12],1.45);
const pushup=sequence([flatGround,flatLift,planche,planche,bottom,planche,planche,flatLift,flatGround],[0,1.5,3,5,8,11,13,15,17],1.45);
const top:Key={arm:0,body:0,leftAngle:0,rightAngle:0};
const midHigh:Key={arm:10,body:-35,reach:.96,leftAngle:-35,rightAngle:-35};
const midLow:Key={arm:30,body:-65,reach:.84,leftAngle:-65,rightAngle:-65};
const entryGround:Key={...planche,leftFoot:v(-80,floor,-8),rightFoot:v(-80,floor,8)};
const kick:Key={arm:20,body:-45,leftAngle:-40,rightFoot:v(-100,340,8)};
const split:Key={arm:-35,body:-55,leftAngle:-150,rightAngle:-90};
const landing:Key={arm:-60,body:-80,leftFoot:v(-220,floor,-8),rightFoot:v(-200,floor,8)};
const ninety=sequence([entryGround,kick,top,top,midHigh,midLow,bottom,midLow,midHigh,top,top,split,landing],[0,1.5,3,5,6.5,8,9,10.5,12,14,16,18,20]);
const smallGround:Key={...planche,leftFoot:v(-80,floor,-8),rightFoot:v(-80,floor,8)};
const smallLift:Key={...planche,leftFoot:v(-70,370,-8),rightFoot:v(-70,370,8)};
const plancheToHandstand=sequence([smallGround,smallLift,planche,planche,{arm:30,body:-55,leftAngle:-55,rightAngle:-55},{arm:15,body:-25,leftAngle:-25,rightAngle:-25},top,top,split,landing],[0,1.5,3,5,7,9,11,13,15,17]);
const handstandToPlanche=sequence([entryGround,kick,top,top,midHigh,midLow,bottom,planche,planche,smallLift,smallGround],[0,1.5,3,5,6.5,8,9,12,14,16,18]);
export const batchFWorldMotion={"full-planche-push-up-eccentric":eccentric,"full-planche-push-up":pushup,"ninety-degree-parallette-hspu":ninety,"full-planche-to-handstand-transition":plancheToHandstand,"ninety-degree-handstand-to-planche-transition":handstandToPlanche} as const;
const playback=(s:typeof ninety)=>({poses:s.poses,gaze:s.gaze,keyframeTimes:s.keyframeTimes,duration:s.duration,phasePoseIndexes:s.phasePoseIndexes});
const base={floor,barTop:400,equipment:["parallettes"],playback:"one-way-reset",visuals:[{kind:"landing",x:230,y:428,width:300,label:"separate trained landing"}],
  camera:"Side-oblique full-body view shows both fixed full grips, the exact elbow path, straight together legs, unloaded head and separate grounded entry/exit. All scored attempts are unassisted; a coach is present for the planned exit."} as const;
type Guide=MotionGuideDefinition & Readonly<{camera:string;phases:readonly string[];phasePoseIndexes:readonly number[];scoreWindow:readonly[number,number];holdWindows:readonly(readonly[number,number])[];bottomFrame?:number;loweringWindow?:readonly[number,number];lockoutWindow?:readonly[number,number]}>;
export const batchFMotionGuides={
  "full-planche-push-up-eccentric":{...base,...playback(eccentric),posterFrame:f(4),auditFrames:{start:f(2),middle:f(4),end:f(5)},scoreWindow:[f(2),f(4)],holdWindows:[[f(2),f(3)]],loweringWindow:[f(3),f(4)],bottomFrame:f(4),
    label:"Full Planche 2s, lower 4s, land from bent arms",
    phases:["Grounded setup","Fold and lift feet clear","Locked-arm full Planche","Two-second held start","Four-second lower to shoulders at elbow height","Direct bent-arm fold and landing; no ascent"]},
  "full-planche-push-up":{...base,...playback(pushup),posterFrame:f(4),auditFrames:{start:f(2),middle:f(6),end:f(8)},scoreWindow:[f(2),f(6)],holdWindows:[[f(2),f(3)],[f(5),f(6)]],bottomFrame:f(4),
    label:"Full Planche: 2s start, full down/up, 2s finish",
    phases:["Grounded setup","Fold and lift feet clear","Locked-arm full Planche","Two-second held start","Shoulders reach elbow height","Press back to the same full Planche","Two-second locked-arm finish","Separate folded return","Grounded landing"]},
  "ninety-degree-parallette-hspu":{...base,...playback(ninety),posterFrame:f(6),auditFrames:{start:f(2),middle:f(10),end:f(12)},scoreWindow:[f(2),f(10)],holdWindows:[[f(2),f(3)],[f(9),f(10)]],loweringWindow:[f(3),f(6)],bottomFrame:f(6),
    label:"Handstand 2s, 4s lower to 90°, press back, hold 2s",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Two-second start","Begin bent-arm full-length lower","Approach horizontal","Horizontal bent-arm 90-degree bottom","Begin complete return","Continue pressing upward","Straight handstand lockout","Two-second returned handstand","Separate split exit","Grounded landing"]},
  "full-planche-to-handstand-transition":{...base,...playback(plancheToHandstand),posterFrame:f(2),auditFrames:{start:f(2),middle:f(7),end:f(9)},scoreWindow:[f(2),f(7)],holdWindows:[[f(2),f(3)],[f(6),f(7)]],
    label:"Full Planche 2s, straight-arm press, handstand 2s",
    phases:["Grounded setup","Fold and lift feet clear","Full-length locked-arm Planche","Two-second start","Raise the line with locked elbows","Continue legs-together straight-arm rise","Straight handstand","Two-second finish","Separate split exit","Grounded landing"]},
  "ninety-degree-handstand-to-planche-transition":{...base,...playback(handstandToPlanche),posterFrame:f(7),auditFrames:{start:f(2),middle:f(8),end:f(10)},scoreWindow:[f(2),f(8)],holdWindows:[[f(2),f(3)],[f(7),f(8)]],loweringWindow:[f(3),f(6)],bottomFrame:f(6),lockoutWindow:[f(6),f(7)],
    label:"Handstand 2s, 4s lower, active Planche lockout 2s",
    camera:`${base.camera} The final elbow extension actively raises the shoulders into locked-arm full Planche. This lowering-first connection is not purely eccentric and never returns to handstand.`,
    phases:["Grounded setup","Controlled split entry","Straight handstand","Two-second start","Begin full-length bent-arm lower","Continue toward horizontal","Horizontal bent-arm 90-degree position","Actively extend elbows into full Planche","Two-second locked-arm full Planche","Separate folded return","Grounded landing"]},
} as const satisfies Readonly<Record<string,Guide>>;
