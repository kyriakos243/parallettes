import type { MotionGuideDefinition } from "../../MotionGuide";
import type { OwnedMotionPose, OwnedMotionPoint } from "../media/phase10OwnedMotion";

type Point = OwnedMotionPoint;
type Guide = MotionGuideDefinition & Readonly<{
  camera: string; phases: readonly string[]; phasePoseIndexes: readonly number[];
  benchmarkPoseWindow: readonly [number, number];
}>;
const p = (x:number,y:number):Point => ({x,y});
const add = (a:Point,b:Point) => p(a.x+b.x,a.y+b.y);
const mix = (a:number,b:number,t:number) => a+(b-a)*t;
const mixPoint = (a:Point,b:Point,t:number) => p(mix(a.x,b.x,t),mix(a.y,b.y,t));
const radians = (degrees:number) => degrees*Math.PI/180;
const polar = (length:number,degrees:number) => p(length*Math.cos(radians(degrees)),length*Math.sin(radians(degrees)));
const fromUp = (length:number,degrees:number) => polar(length,degrees-90);
const distance = (a:Point,b:Point) => Math.hypot(b.x-a.x,b.y-a.y);
// Equal-length two-link inverse kinematics; the branch keeps the knee/elbow
// folded consistently. Authored dense angular samples avoid limb-length morphs.
const hinge = (a:Point,b:Point,length:number,branch=-1):Point => {
  const d=distance(a,b); if(d>length*2+1e-6) throw new Error(`Unreachable owned-motion limb: ${JSON.stringify({a,b,length,d})}`);
  const middle=mixPoint(a,b,.5), height=Math.sqrt(Math.max(0,length*length-d*d/4));
  return add(middle,p(-(b.y-a.y)/d*height*branch,(b.x-a.x)/d*height*branch));
};
const angles = (hip:Point,foot:Point,length:number) => {
  const knee=hinge(hip,foot,length);
  return [Math.atan2(knee.y-hip.y,knee.x-hip.x)*180/Math.PI,Math.atan2(foot.y-knee.y,foot.x-knee.x)*180/Math.PI] as const;
};
const samples=16;
const frame=(key:number)=>key*samples;
const sequence = (times:readonly number[],at:(segment:number,t:number)=>OwnedMotionPose) => {
  const duration=times.at(-1)!; const poses:OwnedMotionPose[]=[at(0,0)], keyframeTimes=[0];
  for(let i=0;i<times.length-1;i++) for(let step=1;step<=samples;step++) {
    poses.push(at(i,step/samples)); keyframeTimes.push(mix(times[i]!,times[i+1]!,step/samples)/duration);
  }
  return {poses,keyframeTimes,duration,phasePoseIndexes:times.map((_,i)=>i*samples)};
};
const leftHip=p(340,250),rightHip=p(358,258),leftShoulder=p(500,250),rightShoulder=p(518,258);
const leftWrist=p(438,400),rightWrist=p(456,400);
type PlancheKey = readonly [number,number,number,number];
const plancheSequence = (wall:boolean) => {
  const rightLength=wall?Math.hypot(276,8)/2:129;
  const groundLeft=angles(leftHip,p(174,420),129),groundRight=angles(rightHip,p(194,420),rightLength);
  const ground:PlancheKey=[...groundLeft,...groundRight], tuck:PlancheKey=[50,166,50,166];
  const rightAngle=wall?Math.atan2(-8,-276)*180/Math.PI+360:180;
  const target:PlancheKey=[180,180,rightAngle,rightAngle];
  // Arrival, marker fade-in, scored hold and marker fade-out are identical
  // contact poses. The shared renderer never draws a tether while toes travel.
  const keys:readonly PlancheKey[]=wall?[ground,tuck,target,target,target,target,tuck,ground]:[ground,tuck,target,target,tuck,ground];
  const times=wall?[0,2,4,4.5,10.5,11,13,15]:[0,2,4,9,11,13];
  return sequence(times,(i,t)=>{
    const a=keys[i]!,b=keys[i+1]!,v=a.map((x,j)=>mix(x,b[j]!,t));
    let lk=add(leftHip,polar(129,v[0]!)),la=add(lk,polar(129,v[1]!));
    let rk=add(rightHip,polar(rightLength,v[2]!)),ra=add(rk,polar(rightLength,v[3]!));
    if(i===0||i===keys.length-2) {
      const ankle=(k:PlancheKey,hip:Point,length:number,offset:number)=>add(add(hip,polar(length,k[offset]!)),polar(length,k[offset+1]!));
      la=mixPoint(ankle(a,leftHip,129,0),ankle(b,leftHip,129,0),t); lk=hinge(leftHip,la,129);
      ra=mixPoint(ankle(a,rightHip,rightLength,2),ankle(b,rightHip,rightLength,2),t); rk=hinge(rightHip,ra,rightLength);
    }
    return {head:p(555,226),neck:p(527,243),ls:leftShoulder,le:mixPoint(leftShoulder,leftWrist,.5),lw:leftWrist,
      rs:rightShoulder,re:mixPoint(rightShoulder,rightWrist,.5),rw:rightWrist,lh:leftHip,lk,la,rh:rightHip,rk,ra};
  });
};
const assisted=plancheSequence(true),full=plancheSequence(false);

type PressKey = Readonly<{arm:number;body:number;bend?:number;leftAngle?:number;rightAngle?:number;leftFoot?:Point;rightFoot?:Point}>;
const pressBody = (k:PressKey) => {
  const shoulder=add(leftWrist,fromUp(110*(1-(k.bend??0)),k.arm));
  const hip=add(shoulder,fromUp(100,k.body)); return {shoulder,hip};
};
const foot = (k:PressKey,side:"left"|"right"):Point => {
  const hip=add(pressBody(k).hip,p(side==="right"?18:0,0));
  return k[`${side}Foot`]??add(hip,fromUp(160,k[`${side}Angle`]!));
};
const groundBody=pressBody({arm:20,body:-80});
const groundedAngle=180+Math.acos((420-groundBody.hip.y)/160)*180/Math.PI;
const top:PressKey={arm:0,body:0,leftAngle:360,rightAngle:360};
const exitBody=pressBody({arm:-50,body:-70});
const exitAngle=180-Math.acos((420-exitBody.hip.y)/160)*180/Math.PI;
const exit:PressKey={arm:-50,body:-70,leftAngle:360+exitAngle,rightAngle:270};
const landed:PressKey={arm:-70,body:-70,leftFoot:foot(exit,"left"),rightFoot:p(338,420)};
const pikeKeys:readonly PressKey[]=[
  {arm:20,body:-80,leftAngle:groundedAngle,rightAngle:groundedAngle},
  {arm:15,body:-40,leftAngle:220,rightAngle:220},
  {arm:5,body:-5,leftAngle:260,rightAngle:260},top,top,exit,landed,
];
// The oblique straddle uses the same segment lengths; the two straight legs
// open to opposite sides before the hips stack, and close only afterwards.
const straddleKeys:readonly PressKey[]=[
  {...pikeKeys[0]!,rightAngle:360-groundedAngle},
  {...pikeKeys[1]!,rightAngle:140},
  {...pikeKeys[2]!,rightAngle:100},
  {...top,rightAngle:0},{...top,rightAngle:0},{...exit,rightAngle:-90},landed,
];
const bentMidBody=pressBody({arm:35,body:-15,bend:1-73/110});
const bentKeys:readonly PressKey[]=[
  {arm:0,body:-100,leftFoot:p(330,420),rightFoot:p(348,420)},
  {arm:35,body:-15,bend:1-73/110,leftFoot:add(bentMidBody.hip,p(0,25)),rightFoot:add(bentMidBody.hip,p(18,25))},
  {arm:0,body:0,leftFoot:p(438,240),rightFoot:p(456,240)},top,top,exit,landed,
];
const pressSequence = (keys:readonly PressKey[]) => sequence([0,2,5,7,9,11,13],(i,t)=>{
  const a=keys[i]!,b=keys[i+1]!;
  const k:PressKey={arm:mix(a.arm,b.arm,t),body:mix(a.body,b.body,t),bend:mix(a.bend??0,b.bend??0,t)};
  const {shoulder,hip}=pressBody(k),rs=add(shoulder,p(18,0)),rh=add(hip,p(18,0));
  const ankle=(side:"left"|"right")=>{
    const before=a[`${side}Angle`],after=b[`${side}Angle`];
    return before!==undefined&&after!==undefined
      ? add(side==="left"?hip:rh,fromUp(160,mix(before,after,t)))
      : mixPoint(foot(a,side),foot(b,side),t);
  };
  const la=ankle("left"),ra=ankle("right");
  const exitTurn=Math.min(1,Math.max(0,(-k.arm-40)/30));
  return {head:add(shoulder,p(36,mix(26,6,exitTurn))),neck:add(shoulder,p(16,mix(12,3,exitTurn))),
    ls:shoulder,le:hinge(shoulder,leftWrist,55,1),lw:leftWrist,
    rs,re:hinge(rs,rightWrist,55,1),rw:rightWrist,
    lh:hip,lk:hinge(hip,la,80,la.y>=hip.y?-1:1),la,rh,rk:hinge(rh,ra,80,ra.y>=rh.y?-1:1),ra};
});
const bent=pressSequence(bentKeys),straddle=pressSequence(straddleKeys),pike=pressSequence(pikeKeys);
const gaze=(poses:readonly OwnedMotionPose[],floor=false)=>poses.map(()=>p(floor?8:10,floor?10:6));
const pressBase={
  floor:420,equipment:["parallettes"],playback:"one-way-reset",posterFrame:frame(3),
  auditFrames:{start:0,middle:frame(3),end:frame(6)},benchmarkPoseWindow:[frame(3),frame(4)],
  visuals:[{kind:"landing",x:265,y:427,width:325,label:"separate trained exit · clear landing"}],
} as const;

/** Isolated owned media only. Owner motion acceptance and production grant remain pending. */
export const batchBMotionGuides = {
  "assisted-full-planche-hold":{
    ...assisted,floor:420,equipment:["parallettes","left-wall"],gaze:gaze(assisted.poses),
    label:"Extend together to marked wall contact, hold six seconds, tuck and land",
    playback:"one-way-reset",posterFrame:frame(3),auditFrames:{start:0,middle:frame(3),end:frame(7)},benchmarkPoseWindow:[frame(3),frame(4)],
    phases:["Grounded setup","Tuck","Toes reach equal-height wall contact","Contact settles","Six-second assisted hold","Contact ends before departure","Tuck","Land"],
    camera:"Full-body side-oblique view; fixed bars, locked knees/elbows and equal-height toe contacts stay visible. Contact markers fade only while feet are stationary at the wall, without any upward tether or quantified unloading.",
    visuals:[
      {kind:"assistance",joint:"la",anchor:p(82,250),label:"both toes · wall contact",contactOnly:true,activePoseIndexes:Array.from({length:samples+1},(_,i)=>frame(3)+i)},
      {kind:"assistance",joint:"ra",anchor:p(82,250),label:"",contactOnly:true,activePoseIndexes:Array.from({length:samples+1},(_,i)=>frame(3)+i)},
    ],
  },
  "full-planche-hold":{
    ...full,floor:420,equipment:["parallettes"],gaze:gaze(full.poses),
    label:"Extend both straight legs together, hold five seconds, tuck and land",
    playback:"one-way-reset",posterFrame:frame(2),auditFrames:{start:0,middle:frame(2),end:frame(5)},benchmarkPoseWindow:[frame(2),frame(3)],
    phases:["Grounded setup","Tuck","Full-length unassisted shape","Five-second hold","Tuck","Land"],
    camera:"Full-body side-oblique view with both straight legs together and feet clear. Body and limb lengths remain consistent through entry, extension and return; no wall or assistance graphic.",visuals:[],
  },
  "bent-arm-tuck-press-to-handstand":{
    ...pressBase,...bent,gaze:gaze(bent.poses,true),
    label:"Grounded tuck, bend then press to lockout, settle two seconds, exit separately",
    phases:["Stationary crouch","Feet-clear bent-arm tuck","Press to locked arms in tuck","Extend to straight handstand","Two-second unassisted top","Separate split exit","Land and reset"],
    camera:"Side-oblique full-body view shows grounded feet, visible elbow bend, compact unsupported tuck, unloaded head, locked-arm top and separate split exit. Segment lengths remain coherent; no wall catch.",
  },
  "straddle-press-to-handstand":{
    ...pressBase,...straddle,gaze:gaze(straddle.poses,true),
    label:"Grounded straight-knee straddle, hips rise, close at the top, settle two seconds",
    phases:["Stationary grounded straddle","Quiet toe-off with locked arms","Hips stack while straddled","Close straight legs into handstand","Two-second unassisted top","Separate split exit","Land and reset"],
    camera:"Full-body oblique view keeps both straight straddled legs and locked elbows visible; hips stack before the legs close. Grounded setup, unassisted top and separate landing stay in frame.",
  },
  "pike-press-to-handstand":{
    ...pressBase,...pike,gaze:gaze(pike.poses,true),
    label:"Grounded together-leg pike, lift hips through locked arms, settle two seconds",
    phases:["Stationary grounded feet-together pike","Quiet together-leg toe-off","Hips stack before legs unfold","Unfold to straight handstand","Two-second unassisted top","Separate split exit","Land and reset"],
    camera:"Full-body side view shows straight together legs and locked elbows through the ascent, followed by a separately scored top and safe exit. No wall catch, jump or L-sit start.",
  },
} as const satisfies Readonly<Record<string,Guide>>;
export type BatchBMotionReference = keyof typeof batchBMotionGuides;
