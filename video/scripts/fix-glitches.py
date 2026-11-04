#!/usr/bin/env python3
"""書き出しの崩れたコマを見つけて描き直す。使い方: fix-glitches.py 動画.mp4 作品ID
前後のコマは似ているのに、そのコマだけ大きく違うものを崩れと判定する（1〜2コマの崩れを見つける）。"""
import subprocess, sys, os, shutil
import numpy as np
video, comp = sys.argv[1:3]
W, H = 96, 54
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", video, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.int16)
d = lambda a, b: float(np.abs(fr[a] - fr[b]).mean())
bad = []
for n in range(2, len(fr) - 3):
    for span in (1, 2):
        before, after = n - 1, n + span
        if d(before, n) > 6 and d(n + span - 1, after) > 6 and d(before, after) < max(2.5, d(before, n) * .35):
            bad += list(range(n, n + span))
            break
bad = sorted(set(bad))
print(video, "コマ数", len(fr), "崩れ", bad)
if not bad: sys.exit(0)
CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp = video + ".fix"; os.makedirs(tmp, exist_ok=True)
for n in bad:
    if os.path.exists(f"{tmp}/{n}.png"): continue
    for attempt in range(3):
        r = subprocess.run(["npx", "remotion", "still", "out/bundle", comp, f"{tmp}/{n}.png", f"--frame={n}", "--timeout=120000", f"--browser-executable={CH}", "--log=error"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode == 0: break
    r.check_returncode()
subprocess.run(["pkill", "-f", "puppeteer_dev_chrome_profile"])
inputs, chain, last = ["-i", video], [], "0:v"
for i, n in enumerate(bad):
    inputs += ["-i", f"{tmp}/{n}.png"]
    chain.append(f"[{last}][{i+1}:v]overlay=enable='eq(n,{n})'[v{i}]"); last = f"v{i}"
out = video + ".fixed.mp4"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chain), "-map", f"[{last}]", "-map", "0:a?", "-c:a", "copy", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", out], check=True)
os.replace(out, video); shutil.rmtree(tmp)
print("描き直しました", len(bad), "コマ")
