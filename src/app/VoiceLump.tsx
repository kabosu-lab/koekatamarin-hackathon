"use client";

import { useEffect, useRef, useState } from "react";
import type { DolphinState } from "./Dolphin";

/**
 * 声のかたまり。最初の相棒で、育つと動物になる。絵のファイルを使わず、距離関数で描く。
 * 形は LUMP_SHAPES の数字で増やす。先のとがった形にせず、大きな目と口も付けない。
 */
export type LumpShape = {
  /** 幅、高さ、奥行きの半径 */
  size: [number, number, number];
  /** 表面のうねりの大きさと細かさ */
  wobble: number;
  lobes: number;
  /** 吹き出しのしっぽの長さ。0 ならなく、底を少し平らにする */
  tail: number;
};

export const LUMP_SHAPES = {
  bubble: { size: [1.02, 0.7, 0.84], wobble: 0.02, lobes: 2, tail: 1 },
  mochi: { size: [0.98, 0.74, 0.92], wobble: 0.025, lobes: 2, tail: 0 },
} satisfies Record<string, LumpShape>;

export type LumpShapeName = keyof typeof LUMP_SHAPES;

const VERTEX = `#version 300 es
void main(){vec2 p=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1))*4.-1.;gl_Position=vec4(p,0.,1.);}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec3 uSize,uColor;
uniform float uT,uWobble,uLobes,uTail,uListen,uHop,uBlink;
out vec4 o;
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
float rcone(vec3 p,vec3 a,vec3 b,float r1,float r2){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-mix(r1,r2,h);}
float ell(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,1e-4);}
float map(vec3 p){
  p.y-=uHop*.28;
  float squash=1.+.03*sin(uT*1.6)+uListen*.05*sin(uT*7.)-uHop*.1;
  vec3 r=uSize*vec3(1./sqrt(squash),squash,1./sqrt(squash));
  float k=uLobes;
  float amp=uWobble+uListen*.02;
  float w=sin(p.x*k*2.+uT*1.3)*sin(p.y*k*2.3-uT)*sin(p.z*k*1.9+uT*.7);
  float d=ell(p,r)-amp*w;
  // 吹き出しは丸いしっぽを足す。先はとがらせない
  if(uTail>0.)return smin(d,rcone(p,vec3(-.42,-.42,.06),vec3(-.62,-.42-.42*uTail,.06),.24,.09),.16);
  // ほかの形は底を平らに近づけて、置いてある重さを出す
  return max(d,-(p.y+r.y*.82));
}
vec3 nor(vec3 p){vec2 e=vec2(1,-1)*.002;return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
void main(){
  vec2 uv=(2.*gl_FragCoord.xy-uRes)/min(uRes.x,uRes.y);
  vec3 ro=vec3(0.,uTail>0.?-.12:.12,6.),rd=normalize(vec3(uv*.5,-2.25));
  float t=4.2,near=1e3;bool hit=false;
  for(int i=0;i<56;i++){float d=map(ro+rd*t);near=min(near,d);if(d<.0015){hit=true;break;}t+=d*.9;if(t>8.5)break;}
  o=vec4(0.);
  if(!hit){float e=1.-smoothstep(0.,.012,near);if(e>0.)o=vec4(uColor*.8*e,e);return;}
  vec3 p=ro+rd*t,n=nor(p),v=-rd,L=normalize(vec3(-.45,.8,.62));
  float wrap=clamp((dot(n,L)+.5)/1.5,0.,1.);
  vec3 col=mix(uColor*.84,mix(uColor,vec3(1.),.16),smoothstep(.15,.8,wrap));
  col+=vec3(1.)*pow(max(dot(n,normalize(L+v)),0.),32.)*.3;
  col+=vec3(1.,.96,.92)*pow(1.-max(dot(n,v),0.),3.)*.22;
  // 小さな点の目だけ。口は描かない
  vec2 f=p.xy-vec2(0.,uHop*.28+.1);
  if(n.z>.2){
    float open=mix(.05,.008,uBlink);
    float e=length((vec2(abs(f.x)-.27,f.y))/vec2(.042,open))-1.;
    col=mix(col,vec3(.13,.14,.2),smoothstep(.1,-.1,e));
  }
  o=vec4(col,1.);
}`;

function wants3d(): boolean {
  try {
    if (localStorage.getItem("koekata_3d") === "on") return true;
  } catch {
    // 読めなければ、下の判定に任せる
  }
  return !navigator.webdriver;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function start(canvas: HTMLCanvasElement, shape: LumpShape, color: string, state: { current: DolphinState }, replies: { current: number }): (() => void) | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const made = gl.createShader(type);
    if (!made) return null;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  gl.clearColor(0, 0, 0, 0);
  const at = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform3fv(at("uSize"), shape.size);
  gl.uniform3fv(at("uColor"), hexToRgb(color));
  gl.uniform1f(at("uWobble"), shape.wobble);
  gl.uniform1f(at("uLobes"), shape.lobes);
  gl.uniform1f(at("uTail"), shape.tail);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let scale = Math.min(window.devicePixelRatio || 1, 2);
  const pose = { t: 0, listen: 0, hop: 0, blink: 0, nextBlink: 2.5 };
  const draw = () => {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width * scale));
    const h = Math.max(1, Math.round(box.height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(at("uRes"), w, h);
    gl.uniform1f(at("uT"), pose.t);
    gl.uniform1f(at("uListen"), pose.listen);
    gl.uniform1f(at("uHop"), pose.hop);
    gl.uniform1f(at("uBlink"), pose.blink);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // 動きを減らす設定の端末では止めた1枚だけを描く
  if (reduce) {
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }

  let frame = 0;
  let last = performance.now();
  let times: number[] = [];
  let seen = replies.current;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pose.t += dt;
    times.push(dt);
    if (times.length >= 30) {
      const average = times.reduce((sum, value) => sum + value, 0) / times.length;
      times = [];
      // 描画が遅い端末では解像度を落とす
      if (average > 0.05 && scale > 0.75) scale = Math.max(0.75, scale - 0.25);
    }
    if (replies.current !== seen) {
      seen = replies.current;
      pose.hop = 1;
    }
    pose.hop += (0 - pose.hop) * (1 - Math.exp(-5 * dt));
    pose.listen += ((state.current === "listening" ? 1 : 0) - pose.listen) * (1 - Math.exp(-9 * dt));
    if (pose.t > pose.nextBlink) {
      const k = (pose.t - pose.nextBlink) / 0.14;
      pose.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
      if (k >= 1) pose.nextBlink = pose.t + 2 + Math.random() * 3;
    }
    draw();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** WebGL が使えない端末で出す静止画。 */
function LumpStill({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 200" className="dolphin-still" aria-hidden="true">
      <path d="M100 30c50 0 84 26 84 62s-34 62-84 62c-6 0-12 0-18-1-6 10-20 20-32 21-5 0-7-4-4-8 5-7 8-14 8-22-24-10-38-29-38-52 0-36 34-62 84-62z" fill={color} />
      <ellipse cx="66" cy="58" rx="20" ry="10" fill="#fff" opacity="0.4" transform="rotate(-20 66 58)" />
      <circle cx="74" cy="92" r="5" fill="#212133" />
      <circle cx="126" cy="92" r="5" fill="#212133" />
    </svg>
  );
}

/** 窓の中の相棒。3D が描けない端末や自動テストでは静止画に戻す。 */
export function VoiceLump({
  alt,
  state,
  replyCount,
  shape = "bubble",
  color = "#7fcfc9",
}: {
  alt: string;
  state: DolphinState;
  replyCount: number;
  shape?: LumpShapeName;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const replyRef = useRef(replyCount);
  const [still, setStill] = useState(true);

  useEffect(() => {
    stateRef.current = state;
    replyRef.current = replyCount;
  }, [state, replyCount]);

  useEffect(() => {
    if (wants3d()) setStill(false);
  }, []);

  useEffect(() => {
    if (still || !canvasRef.current) return;
    let stop: (() => void) | null = null;
    try {
      stop = start(canvasRef.current, LUMP_SHAPES[shape], color, stateRef, replyRef);
    } catch {
      stop = null;
    }
    if (!stop) {
      setStill(true);
      return;
    }
    return stop;
  }, [still, shape, color]);

  return (
    <div className="dolphin" role="img" aria-label={alt} data-state={state}>
      {still ? <LumpStill color={color} /> : <canvas ref={canvasRef} aria-hidden="true" />}
    </div>
  );
}
