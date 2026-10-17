import type { MotionGuideDefinition } from "../../MotionGuide";
import type { OwnedMotionPoint, OwnedMotionPose } from "../media/phase10OwnedMotion";
type Point=OwnedMotionPoint;
type Guide=MotionGuideDefinition & Readonly<{camera:string;phases:readonly string[];phasePoseIndexes:readonly number[];benchmarkPoseWindow:readonly [number,number]}>;
const p=(x:number,y:number):Point=>({x,y});
const add=(a:Point,b:Point)=>p(a.x+b.x,a.y+b.y);
const sub=(a:Point,b:Point)=>p(a.x-b.x,a.y-b.y);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const mp=(a:Point,b:Point,t:number)=>p(mix(a.x,b.x,t),mix(a.y,b.y,t));
const offsetMix=(a:Point,b:Point,t:number)=>{
  const before=Math.atan2(a.y,a.x),after=Math.atan2(b.y,b.x);
  const turn=((after-before+3*Math.PI)%(2*Math.PI))-Math.PI;
  const angle=before+turn*t,length=mix(Math.hypot(a.x,a.y),Math.hypot(b.x,b.y),t);
  return p(Math.cos(angle)*length,Math.sin(angle)*length);
};
const up=(length:number,angle:number)=>p(length*Math.sin(angle*Math.PI/180),-length*Math.cos(angle*Math.PI/180));
const hinge=(a:Point,b:Point,length:number,branch=-1):Point=>{
  const d=Math.hypot(b.x-a.x,b.y-a.y);
  if(d>2*length+1e-6||d<1e-6)throw Error(`Unreachable Batch C limb ${JSON.stringify({a,b,length,d})}`);
  const h=Math.sqrt(Math.max(0,length*length-d*d/4));
  return add(mp(a,b,.5),p(-(b.y-a.y)/d*h*branch,(b.x-a.x)/d*h*branch));
};
const samples=32;
const f=(key:number)=>key*samples;
const sequence=(times:readonly number[],at:(segment:number,t:number)=>OwnedMotionPose)=>{
  const duration=times.at(-1)!;const poses=[at(0,0)],keyframeTimes=[0];
  for(let i=0;i<times.length-1;i++)for(let j=1;j<=samples;j++){
    poses.push(at(i,j/samples));keyframeTimes.push(mix(times[i]!,times[i+1]!,j/samples)/duration);
  }
  return {poses,keyframeTimes,duration,phasePoseIndexes:times.map((_,i)=>f(i))};
};
type Key=Readonly<{shoulder:Point;body:number;leftAngle?:number;rightAngle?:number;leftFoot?:Point;rightFoot?:Point}>;
const wrist=p(438,400);
const hip=(k:Key)=>add(k.shoulder,up(100,k.body));
const foot=(k:Key,side:"left"|"right")=>k[`${side}Foot`]??add(add(hip(k),p(side==="right"?18:0,0)),up(160,k[`${side}Angle`]!));
const grounded:Key={shoulder:p(438,310),body:-90,leftFoot:p(300,420),rightFoot:p(318,420)};
const entry:Key={shoulder:p(438,295),body:-30,leftAngle:350,rightAngle:520};
const top:Key={shoulder:p(438,290),body:0,leftAngle:360,rightAngle:360};
const bottom=(y:number,x=360):Key=>({shoulder:p(x,y),body:0,leftAngle:360,rightAngle:360});
const split:Key={shoulder:p(354,329),body:-70,leftFoot:p(175,420),rightFoot:p(150,340)};
const landed:Key={shoulder:p(354,352),body:-90,leftFoot:p(170,420),rightFoot:p(188,420)};
const keysSequence=(keys:readonly Key[],times:readonly number[],floor=420)=>sequence(times,(i,t)=>{
  const a=keys[i]!,b=keys[i+1]!;
  const k:Key={shoulder:mp(a.shoulder,b.shoulder,t),body:mix(a.body,b.body,t)};
  const ls=k.shoulder,rs=add(ls,p(18,0)),lh=hip(k),rh=add(lh,p(18,0));
  const ankle=(side:"left"|"right")=>a[`${side}Angle`]!==undefined&&b[`${side}Angle`]!==undefined
    ?add(side==="left"?lh:rh,up(160,mix(a[`${side}Angle`]!,b[`${side}Angle`]!,t)))
    :add(side==="left"?lh:rh,offsetMix(sub(foot(a,side),add(hip(a),p(side==="right"?18:0,0))),sub(foot(b,side),add(hip(b),p(side==="right"?18:0,0))),t));
  const la={...ankle("left"),y:Math.min(floor,ankle("left").y)},ra={...ankle("right"),y:Math.min(floor,ankle("right").y)};
  return {head:add(ls,p(36,21)),neck:add(ls,p(16,12)),ls,le:hinge(ls,wrist,55,1),lw:wrist,
    rs,re:hinge(rs,add(wrist,p(18,0)),55,1),rw:add(wrist,p(18,0)),
    lh,lk:hinge(lh,la,80,1),la,rh,rk:hinge(rh,ra,80,1),ra};
});
const partial=keysSequence([grounded,entry,top,top,bottom(321,400),top,top,split,landed],[0,1.5,3,4,6,8,10,12,14]);
const full=keysSequence([grounded,entry,top,top,bottom(352),top,top,split,landed],[0,1.5,3,4,7,10,12,14,16]);
// The deficit animation uses taller bars (same grip plane, lower floor) and the
// exact illustrated below-bar target. It is not an invitation to choose depth.
const deficitGround:Key={...grounded,leftFoot:p(300,448),rightFoot:p(318,448)};
const deficitSplit:Key={...split,leftFoot:p(220,448),rightFoot:p(150,370)};
const deficitLand:Key={shoulder:p(354,370),body:-90,leftFoot:p(170,448),rightFoot:p(188,448)};
const deficit=keysSequence([deficitGround,entry,top,top,bottom(384,350),top,top,deficitSplit,deficitLand],[0,1.5,3,4,7,10,12,14,16],448);
const low=bottom(352);
const folded:Key={shoulder:low.shoulder,body:0,leftFoot:add(hip(low),p(-70,30)),rightFoot:add(hip(low),p(-52,30))};
const bottomExit:Key={shoulder:p(360,352),body:-90,leftFoot:p(170,420),rightFoot:p(188,420)};
const eccentric=keysSequence([grounded,entry,top,top,low,folded,bottomExit],[0,1.5,3,4,8,10,13]);

// Frontal oblique balance view exposes both separate fixed grips. Each arm and
// torso segment retains its length as the stack moves over either support.
type BalanceKey=Readonly<{shift:number;armY:number;body:number;leftFoot?:Point;rightFoot?:Point;leftAngle?:number;rightAngle?:number}>;
const balanceBody=(k:BalanceKey,side:"left"|"right")=>{
  const left=side==="left",wx=left?270:370,dx=k.shift+(left?15:-15);
  const shoulder=p(wx+dx,400-Math.sqrt(k.armY*k.armY-dx*dx));
  return {w:p(wx,400),s:shoulder,h:add(shoulder,up(100,k.body+(left?10:-10)))};
};
const balanceFoot=(k:BalanceKey,side:"left"|"right")=>k[`${side}Foot`]??add(balanceBody(k,side).h,up(160,k[`${side}Angle`]!));
const balanceSequence=(bias:number,hold:number)=>{
  const base:BalanceKey={shift:0,armY:110,body:0,leftAngle:0,rightAngle:0};
  const ground:BalanceKey={shift:0,armY:90,body:80,leftFoot:p(400,420),rightFoot:p(455,420)};
  const kick:BalanceKey={shift:0,armY:106,body:30,leftAngle:0,rightAngle:150};
  const exit:BalanceKey={shift:0,armY:100,body:70,leftFoot:p(430,420),rightFoot:p(490,320)};
  const keys:readonly BalanceKey[]=[ground,kick,base,base,{...base,shift:-bias},{...base,shift:-bias},base,{...base,shift:bias},{...base,shift:bias},base,exit,ground];
  const times=[0,1.5,3,4,5,5+hold,6+hold,7+hold,7+hold*2,8+hold*2,10+hold*2,12+hold*2];
  return sequence(times,(i,t)=>{
    const a=keys[i]!,b=keys[i+1]!;const k:BalanceKey={shift:mix(a.shift,b.shift,t),armY:mix(a.armY,b.armY,t),body:mix(a.body,b.body,t)};
    const l=balanceBody(k,"left"),r=balanceBody(k,"right");
    const ankle=(side:"left"|"right")=>a[`${side}Angle`]!==undefined&&b[`${side}Angle`]!==undefined
      ?add(balanceBody(k,side).h,up(160,mix(a[`${side}Angle`]!,b[`${side}Angle`]!,t)))
      :add(balanceBody(k,side).h,offsetMix(sub(balanceFoot(a,side),balanceBody(a,side).h),sub(balanceFoot(b,side),balanceBody(b,side).h),t));
    const la={...ankle("left"),y:Math.min(420,ankle("left").y)},ra={...ankle("right"),y:Math.min(420,ankle("right").y)},centre=mp(l.s,r.s,.5);
    return {head:add(centre,p(0,31)),neck:add(centre,p(0,13)),ls:l.s,le:hinge(l.s,l.w,55),lw:l.w,
      rs:r.s,re:hinge(r.s,r.w,55),rw:r.w,lh:l.h,lk:hinge(l.h,la,80,1),la,rh:r.h,rk:hinge(r.h,ra,80),ra};
  });
};
const transfer=balanceSequence(18,2),light=balanceSequence(28,3);
const gaze=(poses:readonly OwnedMotionPose[],front=false)=>poses.map(()=>p(front?0:8,12));
const standardVisuals=[{kind:"pad",x:368,y:403,width:58,height:10,label:"standard crown depth"},{kind:"landmark",x1:340,y1:400,x2:520,y2:400,label:"bar-top plane"}] as const;
const pushing={floor:420,barTop:400,equipment:["parallettes"],playback:"one-way-reset",posterFrame:f(4),auditFrames:{start:0,middle:f(4),end:f(8)},benchmarkPoseWindow:[f(4),f(6)]} as const;
const balancing={floor:420,barTop:400,equipment:["parallettes"],paralletteView:"front-oblique",playback:"one-way-reset",posterFrame:f(5),auditFrames:{start:0,middle:f(5),end:f(11)},benchmarkPoseWindow:[f(4),f(8)],
  visuals:[{kind:"direction",points:[p(292,180),p(264,180)],label:"shift · keep both hands touching"},{kind:"direction",points:[p(348,180),p(376,180)],label:""},{kind:"landing",x:420,y:429,width:170,label:"clear landing"}]} as const;
export const batchCMotionGuides={
  "freestanding-parallette-weight-shift":{...balancing,...transfer,gaze:gaze(transfer.poses,true),label:"Both grips stay; shift left two seconds, centre, right two seconds, centre",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Settle","Shift left","Two-second left pause","Centre","Shift right","Two-second right pause","Centre","Separate split exit","Grounded reset"],
    camera:"Front-oblique full-body view exposes both fixed hand-to-bar contacts, straight elbows and both lateral stack shifts. The arrows indicate direction only, not measured forces."},
  "freestanding-parallette-one-hand-light-balance":{...balancing,...light,gaze:gaze(light.poses,true),label:"Bias support left for three seconds, centre, then right; light hand stays touching",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Settle","Bias left; right hand stays touching","Three-second light-hand pause","Centre","Bias right; left hand stays touching","Three-second light-hand pause","Centre","Separate split exit","Grounded reset"],
    camera:"Front-oblique view shows both hands continuously on their separate bars and the larger support bias in both directions. The light hand never lifts. The drawing does not measure unloading or demonstrate a one-arm hold."},
  "freestanding-parallette-hspu-eccentric":{...pushing,...eccentric,gaze:gaze(eccentric.poses),auditFrames:{start:0,middle:f(4),end:f(6)},benchmarkPoseWindow:[f(3),f(4)],visuals:standardVisuals,
    label:"Four-second lower to standard depth; fold and land directly, without pressing up",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Settled lockout","Four-second negative to standard crown depth","Fold legs from bent-arm bottom","Feet land outside bars; no ascent"],
    camera:"Full-body side view shows an unloaded crown at the standard bar-top plane and a direct bent-arm feet-to-floor exit. The shoulders never rise between the scored bottom and grounded landing. One-way reset never plays the negative backwards."},
  "partial-freestanding-parallette-hspu":{...pushing,...partial,gaze:gaze(partial.poses),visuals:[{kind:"landmark",x1:368,y1:369,x2:520,y2:369,label:"halfway crown marker"},...standardVisuals],
    label:"Lower to the fixed halfway crown marker, press, settle two seconds, exit",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Settle","Halfway crown marker","Press to lockout","Two-second straight top","Separate split exit","Grounded reset"],
    camera:"Side view keeps the fixed halfway crown marker visibly above the separate standard bar-top plane. The crown reaches the halfway height, then a complete concentric and two-second top follow. No external support is shown."},
  "freestanding-parallette-hspu":{...pushing,...full,gaze:gaze(full.poses),visuals:standardVisuals,label:"Standard crown depth, press to lockout, settle two seconds, exit",
    phases:["Grounded setup","Controlled split entry","Straight handstand","Settle","Standard bar-top crown depth","Press to lockout","Two-second straight top","Separate split exit","Grounded reset"],
    camera:"Side view shows the crown at the standard bar-top plane without touching the pad, followed by the complete unassisted press, settled top and separate grounded exit. This is not deficit range."},
  "deficit-freestanding-parallette-hspu":{...pushing,...deficit,floor:448,gaze:gaze(deficit.poses),visuals:[{kind:"pad",x:358,y:435,width:58,height:10,label:"reviewed deficit crown depth"},{kind:"landmark",x1:340,y1:400,x2:520,y2:400,label:"bar-top plane"}],
    label:"Use only the reviewed below-bar depth, press, settle two seconds, exit",
    phases:["Grounded setup on taller bars","Controlled split entry","Straight handstand","Settle","Exact reviewed below-bar crown depth","Press to lockout","Two-second straight top","Separate split exit","Grounded reset"],
    camera:"Side view uses taller bars and a clearly below-bar pad with unloaded crown. Only this illustrated reviewed depth is demonstrated; the separate current deeper-exit setup must match. Standard depth cannot substitute."},
} as const satisfies Readonly<Record<string,Guide>>;
