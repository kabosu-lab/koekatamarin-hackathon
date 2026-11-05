/** 相棒のイルカ。絵のファイルを使わず、距離関数で形を描く（Claude がコードで書いたもの）。 */
export const DOLPHIN_VERTEX = `#version 300 es
void main(){vec2 p=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1))*4.-1.;gl_Position=vec4(p,0.,1.);}`;

export const DOLPHIN_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uCamZ,uCamY;
uniform mat3 uBody,uHead; uniform vec3 uHC;
uniform vec3 uRS,uRE,uRH,uLS,uLE,uLH;
uniform float uBlink,uMouth,uHappy,uBob,uSquash,uQ;
out vec4 o;
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
float ell(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,1e-4);}
float rcone(vec3 p,vec3 a,vec3 b,float r1,float r2){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-mix(r1,r2,h);}
vec3 toBody(vec3 p){p.y-=uBob;p.y/=uSquash;p.xz*=sqrt(uSquash);return uBody*p;}
float headSDF(vec3 h){
  float d=ell(h-vec3(0.,.02,0.),vec3(.47,.45,.45));
  d=smin(d,ell(h-vec3(0.,-.11,.5),vec3(.17,.115,.25)),.13);
  return d;
}
// x は距離、y は材質（0 は体、2 はスカーフ）
vec2 map(vec3 p){
  vec3 q=toBody(p); vec3 h=uHead*(q-uHC);
  float d=headSDF(h);
  d=smin(d,rcone(q,vec3(0.,.98,.0),vec3(0.,.56,-.05),.43,.335),.12);
  d=smin(d,rcone(q,vec3(0.,.56,-.05),vec3(0.,.26,-.27),.335,.14),.08);
  d=smin(d,rcone(q,vec3(0.,.26,-.27),vec3(0.,.17,-.5),.14,.06),.05);
  float x=abs(q.x);
  d=smin(d,ell(vec3(x,q.yz)-vec3(.17,.13,-.58),vec3(.2,.045,.1)),.05);
  d=smin(d,rcone(q,vec3(0.,1.02,-.4),vec3(0.,1.0,-.62),.1,.03),.09);
  d=smin(d,min(rcone(q,uRS,uRE,.1,.085),rcone(q,uRE,uRH,.085,.06)),.05);
  d=smin(d,min(rcone(q,uLS,uLE,.1,.085),rcone(q,uLE,uLH,.085,.06)),.05);
  float sc=ell(q-vec3(0.,.9,.0),vec3(.475,.085,.475));
  sc=smin(sc,ell(q-vec3(.14,.81,.43),vec3(.085,.1,.055)),.03);
  return sc<d?vec2(sc,2.):vec2(d,0.);
}
vec3 nor(vec3 p){vec2 e=vec2(1,-1)*.0016;return normalize(e.xyy*map(p+e.xyy).x+e.yyx*map(p+e.yyx).x+e.yxy*map(p+e.yxy).x+e.xxx*map(p+e.xxx).x);}
float shadow(vec3 ro,vec3 l){float t=.03,r=1.;for(int i=0;i<14;i++){float d=map(ro+l*t).x;r=min(r,9.*d/t);t+=clamp(d,.02,.16);if(r<.01||t>1.6)break;}return clamp(r,0.,1.);}
float ao(vec3 p,vec3 n){float s=0.,w=1.;for(int i=1;i<=3;i++){float h=.05*float(i);s+=(h-map(p+n*h).x)*w;w*=.55;}return clamp(1.-2.4*s,0.,1.);}
float aa(float d,float w){return smoothstep(w,-w,d);}
vec3 faceCol(vec3 c,vec3 h,float px){
  vec2 f=h.xy; if(h.z<0.)return c;
  float ch=length((vec2(abs(f.x),f.y)-vec2(.335,-.055))/vec2(.075,.05));
  c=mix(c,vec3(1.,.6,.6),.6*smoothstep(1.,.15,ch));
  vec2 ey=vec2(abs(f.x)-.235,f.y-.05);
  vec3 ink=vec3(.13,.13,.2);
  if(uBlink>.75){
    float a=abs(length(ey-vec2(0.,.05))-.055)-.0085;a=max(a,ey.y);c=mix(c,ink,aa(a,px));
  }else if(uHappy>.5){
    float a=abs(length(ey-vec2(0.,-.035))-.055)-.0095;a=max(a,-(ey.y+.012));c=mix(c,ink,aa(a,px));
  }else{
    float e=length(ey/vec2(.05,mix(.068,.012,uBlink)))-1.;
    c=mix(c,ink,aa(e*.05,px));
    float hl=length(vec2(f.x-sign(f.x)*.235,f.y-.05)-vec2(.014,.025))-.014;
    c=mix(c,vec3(1.),aa(hl,px));
  }
  vec2 m=f-vec2(0.,.055);
  if(h.z>.2){
    if(uMouth>.05){
      float w=.05+.015*uMouth,hh=.018+.035*uMouth;
      float d=length((f-vec2(0.,-.165))/vec2(w,hh))-1.;
      c=mix(c,vec3(.62,.24,.3),aa(d*min(w,hh),px));
    }else{
      float a=abs(length(m)-.19)-.0055;a=max(a,f.y+.045);c=mix(c,ink*1.5,aa(a,px));
    }
  }
  return c;
}
void main(){
  vec2 uv=(2.*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 ro=vec3(0.,uCamY,uCamZ);
  vec3 rd=normalize(vec3(uv*.5,-2.25));
  o=vec4(0.);
  vec3 oc=ro-vec3(0.,1.02,0.);float b=dot(oc,rd),c2=dot(oc,oc)-1.5*1.5,dd=b*b-c2;
  if(dd<=0.)return;
  float t=max(-b-sqrt(dd),0.),tm=-b+sqrt(dd),m=-1.,near=1e3,nearT=t;
  for(int i=0;i<64;i++){
    vec2 r=map(ro+rd*t);
    if(r.x<near){near=r.x;nearT=t;}
    if(r.x<.0012*t*.25){m=r.y;break;}
    t+=r.x*.92;
    if(t>tm)break;
  }
  vec3 base=vec3(.53,.84,.82),sh=vec3(.30,.60,.70);
  if(m<-.5){
    // 輪郭だけ、少しだけなじませる
    float edge=1.-smoothstep(0.,.014,near);
    if(edge>0.)o=vec4(sh*edge,edge);
    return;
  }
  vec3 p=ro+rd*t,n=nor(p),v=-rd;
  vec3 q=toBody(p),h=uHead*(q-uHC);
  float gl=.12;
  if(m<.5){
    float bel=ell(q-vec3(0.,.56,.22),vec3(.2,.32,.26));
    float jaw=max(ell(h-vec3(0.,-.17,.46),vec3(.2,.11,.32)),.19-length(h.xy-vec2(0.,.055)));
    float w=smoothstep(.015,-.015,min(bel,jaw));
    base=mix(base,vec3(1.,.98,.95),w);sh=mix(sh,vec3(.84,.80,.88),w);
  }else{base=vec3(1.,.82,.36);sh=vec3(.93,.56,.33);gl=.2;}
  float px=max(.0016,t*.0022);
  vec3 L=normalize(vec3(-.45,.8,.62));
  float ndl=dot(n,L);
  float s=uQ>.5?shadow(p+n*.012,L):1.;
  float wrap=clamp((ndl+.42)/1.42,0.,1.);
  float lit=smoothstep(.2,.72,wrap)*mix(.42,1.,s);
  vec3 col=mix(sh,base,lit);
  if(m<.5)col=mix(col,base,.22);
  col*=mix(.82,1.,ao(p,n));
  if(m<.5&&length(h)<.8)col=faceCol(col,h,px);
  float fr=pow(1.-max(dot(n,v),0.),3.);
  col+=vec3(1.,.9,.85)*fr*.14;
  vec3 hv=normalize(L+v);col+=vec3(1.,.82,.7)*pow(max(dot(n,hv),0.),26.)*.34*gl;
  o=vec4(col,1.);
}`;
