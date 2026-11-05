"use client";

import { useEffect, useRef, useState } from "react";
import { DOLPHIN_FRAGMENT, DOLPHIN_VERTEX } from "./dolphin-shader";

export type DolphinState = "idle" | "listening" | "thinking";

/** 自動テストは 3D を重く描かない。撮影や確かめるときだけ localStorage の印で動かす。 */
function wants3d(): boolean {
  try {
    if (localStorage.getItem("koekata_3d") === "on") return true;
  } catch {
    // 読めなければ、下の判定に任せる
  }
  return !navigator.webdriver;
}

type Vec3 = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (current: number, goal: number, speed: number, dt: number) => current + (goal - current) * (1 - Math.exp(-speed * dt));
const rotY = (a: number) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

function multiply(a: number[], b: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[j + 3] + a[i * 3 + 2] * b[j + 6];
  }
  return out;
}

function rotHead(x: number, y: number, z: number): number[] {
  const X = [1, 0, 0, 0, Math.cos(x), -Math.sin(x), 0, Math.sin(x), Math.cos(x)];
  const Z = [Math.cos(z), -Math.sin(z), 0, Math.sin(z), Math.cos(z), 0, 0, 0, 1];
  return multiply(multiply(rotY(y), X), Z);
}

const apply = (m: number[], v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** 描き始められたら止める関数を返す。WebGL2 が使えなければ null。 */
function startDolphin(canvas: HTMLCanvasElement, state: { current: DolphinState }, replyAt: { current: number }): (() => void) | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type);
    if (!made) return null;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null;
  };
  const vertex = shader(gl.VERTEX_SHADER, DOLPHIN_VERTEX);
  const fragment = shader(gl.FRAGMENT_SHADER, DOLPHIN_FRAGMENT);
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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let scale = Math.min(window.devicePixelRatio || 1, 2);
  let quality = 1;
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width * scale));
    const h = Math.max(1, Math.round(box.height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(at("uRes"), canvas.width, canvas.height);
  };

  const pose = { t: 0, listen: 0, reply: 0, mouth: 0, blink: 0, zoom: 0, hop: 0, spin: 0, nextBlink: 2 };

  function draw() {
    const { t, listen: li, reply: re, hop } = pose;
    const breathe = reduce ? 0 : Math.sin(t * 1.7);
    const sway = reduce ? 0.4 : 0.4 + 0.12 * Math.sin(t * 0.5);
    gl!.uniformMatrix3fv(at("uBody"), false, new Float32Array(rotY(-sway - pose.spin)));
    const hm = rotHead(li * 0.1 + 0.016 * breathe + re * 0.05 * Math.sin(t * 5.2), 0.07 * Math.sin(t * 0.43) * (1 - li), 0.05 * Math.sin(t * 0.6) * (1 - li) + li * 0.17 - re * 0.07 * Math.sin(t * 2.6));
    gl!.uniformMatrix3fv(at("uHead"), false, new Float32Array(hm));
    const neck: Vec3 = [0, 0.96 + 0.006 * breathe, li * 0.03];
    const hc = apply(hm, [0, 0.35, 0]);
    gl!.uniform3f(at("uHC"), hc[0] + neck[0], hc[1] + neck[1], hc[2] + neck[2]);
    const sw = reduce ? 0 : Math.sin(t * 1.5) * 0.02;
    const clap = li * 0.012 * Math.sin(t * 6);
    const wave = Math.sin(t * 9) * 0.08 * re;
    let rightElbow: Vec3 = [-0.5, 0.68 + sw, 0.16];
    let rightHand: Vec3 = [-0.6, 0.53 + sw * 2, 0.14];
    let leftElbow: Vec3 = [0.5, 0.68 - sw, 0.16];
    let leftHand: Vec3 = [0.6, 0.53 - sw * 2, 0.14];
    rightElbow = lerp3(lerp3(rightElbow, [-0.36, 0.82, 0.38], li), [-0.54, 0.9, 0.14], re);
    rightHand = lerp3(lerp3(rightHand, [-0.1 - clap, 0.9, 0.5], li), [-0.72 + wave, 1.1, 0.14], re);
    leftElbow = lerp3(leftElbow, [0.36, 0.82, 0.38], li);
    leftHand = lerp3(leftHand, [0.1 + clap, 0.9, 0.5], li);
    const arms: [string, Vec3][] = [
      ["uRS", [-0.37, 0.82, 0.14]],
      ["uRE", rightElbow],
      ["uRH", rightHand],
      ["uLS", [0.37, 0.82, 0.14]],
      ["uLE", leftElbow],
      ["uLH", leftHand],
    ];
    for (const [name, value] of arms) gl!.uniform3fv(at(name), value);
    gl!.uniform1f(at("uBlink"), pose.blink);
    gl!.uniform1f(at("uMouth"), pose.mouth);
    gl!.uniform1f(at("uHappy"), re > 0.5 ? 1 : 0);
    gl!.uniform1f(at("uBob"), 0.09 + (reduce ? 0 : 0.035 * Math.sin(t * 1.6)) + Math.max(0, hop) * 0.16);
    gl!.uniform1f(at("uSquash"), 1 + 0.012 * breathe + hop * 0.04 - Math.max(0, -hop) * 0.09);
    gl!.uniform1f(at("uQ"), quality);
    gl!.uniform1f(at("uCamZ"), lerp(5.5, 4.6, pose.zoom));
    gl!.uniform1f(at("uCamY"), lerp(0.93, 1.05, pose.zoom));
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // 動きを減らす設定の端末では、最初の1枚だけ描いて止める
  if (reduce) {
    draw();
    const redraw = new ResizeObserver(draw);
    redraw.observe(canvas);
    return () => {
      observer.disconnect();
      redraw.disconnect();
    };
  }

  let frame = 0;
  let last = performance.now();
  let times: number[] = [];
  let seenReply = replyAt.current;
  let replyUntil = 0;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pose.t += dt;
    // 描画が遅い端末では、解像度と影を落とす
    times.push(dt);
    if (times.length >= 30) {
      const average = times.reduce((sum, value) => sum + value, 0) / times.length;
      times = [];
      if (average > 0.05 && scale > 0.75) {
        scale = Math.max(0.75, scale - 0.25);
        resize();
      } else if (average > 0.05) quality = 0;
    }
    if (replyAt.current !== seenReply) {
      seenReply = replyAt.current;
      replyUntil = pose.t + 2.2;
      pose.hop = 1;
      pose.spin = Math.PI * 2;
    }
    const replying = pose.t < replyUntil;
    const listening = state.current === "listening";
    pose.listen = ease(pose.listen, listening ? 1 : 0, 9, dt);
    pose.reply = ease(pose.reply, replying ? 1 : 0, 7, dt);
    pose.zoom = ease(pose.zoom, listening || replying ? 1 : 0, 3.2, dt);
    pose.mouth = replying ? Math.max(0, Math.sin(pose.t * 11) * 0.5 + 0.5 * Math.sin(pose.t * 6.3)) * 0.9 : 0;
    pose.hop = ease(pose.hop, 0, 6, dt);
    pose.spin = ease(pose.spin, 0, 3.6, dt);
    if (pose.t > pose.nextBlink) {
      const k = (pose.t - pose.nextBlink) / 0.14;
      pose.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
      if (k >= 1) pose.nextBlink = pose.t + 1.8 + Math.random() * 2.8;
    }
    draw();
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

/** WebGL が使えない端末で出す、同じ色の静止画。 */
function DolphinStill() {
  return (
    <svg viewBox="0 0 200 200" className="dolphin-still" aria-hidden="true">
      <path d="M100 24c-20 18-16 30-16 30h32s4-12-16-30z" fill="#4c99b3" transform="translate(-34 74) rotate(-30 100 40)" />
      <ellipse cx="100" cy="112" rx="50" ry="60" fill="#87d6d1" />
      <circle cx="100" cy="74" r="50" fill="#87d6d1" />
      <ellipse cx="100" cy="134" rx="30" ry="36" fill="#fffaf2" />
      <ellipse cx="100" cy="92" rx="26" ry="15" fill="#fffaf2" />
      <circle cx="78" cy="68" r="7" fill="#212133" />
      <circle cx="122" cy="68" r="7" fill="#212133" />
      <circle cx="80" cy="65" r="2.2" fill="#fff" />
      <circle cx="124" cy="65" r="2.2" fill="#fff" />
      <path d="M86 92q14 10 28 0" fill="none" stroke="#3a3a4d" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="46" cy="118" rx="9" ry="22" fill="#6fbdc4" transform="rotate(24 46 118)" />
      <ellipse cx="154" cy="118" rx="9" ry="22" fill="#6fbdc4" transform="rotate(-24 154 118)" />
      <path d="M58 112q42 18 84 0v10q-42 18-84 0z" fill="#ffd15c" />
    </svg>
  );
}

/** 窓の中のパートナー。3D が描けない端末や自動テストでは静止画に戻す。 */
export function Dolphin({ alt, state, replyCount }: { alt: string; state: DolphinState; replyCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const replyRef = useRef(replyCount);
  const [still, setStill] = useState(true);

  useEffect(() => {
    stateRef.current = state;
    replyRef.current = replyCount;
  }, [state, replyCount]);

  useEffect(() => {
    if (!wants3d()) return;
    setStill(false);
  }, []);

  useEffect(() => {
    if (still || !canvasRef.current) return;
    let stop: (() => void) | null = null;
    try {
      stop = startDolphin(canvasRef.current, stateRef, replyRef);
    } catch {
      stop = null;
    }
    if (!stop) {
      setStill(true);
      return;
    }
    return stop;
  }, [still]);

  return (
    <div className="dolphin" role="img" aria-label={alt} data-state={state}>
      {still ? <DolphinStill /> : <canvas ref={canvasRef} aria-hidden="true" />}
    </div>
  );
}
