"use client";

import { useEffect, useRef, useState } from "react";
import { renderLoopGently } from "@/lib/music/arrange";
import { loopPosition, type TrackId, TRACKS, trackOf } from "@/lib/music/tracks";
import type { RoomMusic as Music } from "@/lib/room-music";
import { audioOutput } from "../../sound";

/** 誰かが曲を変えたら、数秒のうちに全員に届く */
const POLL_MS = 8_000;
/** 曲はこの細かさで作る（声の帯域には十分で、作る時間とメモリが半分になる） */
const SAMPLE_RATE = 22_050;
/** 勉強の邪魔をしない大きさ */
const VOLUME = 0.4;
/** 曲の入れ替えは、やわらかく重ねる */
const CROSSFADE_S = 0.8;
const NOTICE_MS = 4_000;

type Playing = { trackId: TrackId; source: AudioBufferSourceNode; gain: GainNode };

/**
 * 曲を鳴らす係。曲は端末の中でコードから作り（ファイルを持たない）、ひと回りを継ぎ目なくくり返す。
 * 鳴らす位置はサーバーの時刻から決めるので、全員が同じところを聴く。
 */
class RoomPlayer {
  private buffers = new Map<TrackId, AudioBuffer>();
  private making = new Map<TrackId, Promise<AudioBuffer | null>>();
  private current: Playing | null = null;
  private wanted: TrackId | null = null;
  private aborter = new AbortController();
  private bus: GainNode;

  constructor(
    private audio: AudioContext,
    out: AudioNode,
    private serverNow: () => number,
  ) {
    this.bus = audio.createGain();
    this.bus.gain.value = VOLUME;
    this.bus.connect(out);
  }

  private make(id: TrackId): Promise<AudioBuffer | null> {
    const ready = this.buffers.get(id);
    if (ready) return Promise.resolve(ready);
    const going = this.making.get(id);
    if (going) return going;
    const promise = renderLoopGently(id, SAMPLE_RATE, this.aborter.signal).then((mix) => {
      if (!mix) return null;
      const buffer = this.audio.createBuffer(2, mix.L.length, mix.sr);
      buffer.copyToChannel(mix.L, 0);
      buffer.copyToChannel(mix.R, 1);
      this.buffers.set(id, buffer);
      return buffer;
    });
    this.making.set(id, promise);
    return promise;
  }

  /** その曲へ移る。前の曲はやわらかく消える */
  async play(id: TrackId): Promise<void> {
    this.wanted = id;
    if (this.current?.trackId === id) return;
    const buffer = await this.make(id);
    if (!buffer || this.wanted !== id || this.current?.trackId === id) return;
    const { audio } = this;
    const at = audio.currentTime + 0.05;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + CROSSFADE_S);
    source.connect(gain).connect(this.bus);
    source.start(at, loopPosition(trackOf(id), this.serverNow() + 50));
    this.fadeOut(CROSSFADE_S);
    this.current = { trackId: id, source, gain };
    // 次に変わったときすぐ鳴らせるよう、残りの曲も手の空いたときに作っておく
    for (const other of TRACKS) if (other.id !== id) void this.make(other.id);
  }

  private fadeOut(seconds: number) {
    if (!this.current) return;
    const { source, gain } = this.current;
    const now = this.audio.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    source.stop(now + seconds + 0.05);
    this.current = null;
  }

  stop() {
    this.wanted = null;
    this.aborter.abort();
    this.fadeOut(0.2);
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), 400);
  }
}

/** 部屋に流れる曲。全員が同じ曲の同じ位置を聴く。音を出すかは一人ずつ選び、初めは出さない。 */
export function RoomMusic({ initial }: { initial: Music }) {
  const [music, setMusic] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const offset = useRef(initial.serverNow - Date.now());
  const trackId = useRef(initial.trackId);
  const seenAt = useRef(initial.serverNow);
  const player = useRef<RoomPlayer | null>(null);

  const apply = (next: Music, mine = false) => {
    if (next.serverNow < seenAt.current) return;
    seenAt.current = next.serverNow;
    offset.current = next.serverNow - Date.now();
    if (next.trackId !== trackId.current || mine) {
      // 誰が変えたかは出さない。自分で変えたときだけ、そう伝える
      setNotice({ text: mine ? "みんなの曲を変えました" : `曲が『${next.name}』に変わりました`, key: next.serverNow });
    }
    trackId.current = next.trackId;
    setMusic(next);
  };

  // 画面が新しくなったとき（30秒ごと）も、人数と曲を合わせる
  useEffect(() => {
    apply(initial);
  }, [initial]);

  useEffect(() => {
    const timer = setInterval(() => {
      void fetch("/api/room-music")
        .then((response) => response.json() as Promise<Music>)
        .then((next) => apply(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!playing) return;
    // 本人が押してから音を作る（ブラウザの決まりでもある）。音の設定に従う
    const output = audioOutput();
    if (!output) {
      setPlaying(false);
      setSilenced(true);
      return;
    }
    const room = new RoomPlayer(output.audio, output.out, () => Date.now() + offset.current);
    player.current = room;
    return () => {
      room.stop();
      player.current = null;
    };
  }, [playing]);

  useEffect(() => {
    const room = player.current;
    if (!playing || !room) return;
    let alive = true;
    setPreparing(true);
    void room.play(music.trackId).finally(() => {
      if (alive) setPreparing(false);
    });
    return () => {
      alive = false;
    };
  }, [playing, music.trackId]);

  return (
    <section className="card room-music" aria-label="みんなで聴く曲">
      <div className="room-music-now">
        <span className="room-music-label">いまの曲</span>
        <strong className="room-music-name">{music.name}</strong>
        <span className="room-music-together">いま {music.listening} 人が一緒に聴いています</span>
      </div>
      <div className="room-music-actions">
        <button
          type="button"
          className="room-music-play"
          aria-pressed={playing}
          onClick={() => {
            setSilenced(false);
            setPlaying((value) => !value);
          }}
        >
          {playing ? "音を止める" : "音を出す"}
        </button>
        <button
          type="button"
          className="room-music-change secondary"
          disabled={!music.canChange}
          onClick={() =>
            void fetch("/api/room-music", { method: "POST" })
              .then((response) => response.json() as Promise<Music>)
              .then((next) => apply(next, next.trackId !== trackId.current))
              .catch(() => undefined)
          }
        >
          {music.canChange ? "曲を変える" : "少し待つと変えられます"}
        </button>
      </div>
      <p className="room-music-note">
        {silenced
          ? "音の設定が「切」になっています。「履歴と設定」で変えられます"
          : playing && preparing
            ? "音を用意しています…"
            : "みんなで同じ曲を聴きます。誰かが変えると、全員の曲が変わります。音は自分だけ消せます"}
      </p>
      <p className="room-music-notice" role="status" aria-live="polite">
        {notice && (
          <span key={notice.key} className="room-music-toast">
            {notice.text}
          </span>
        )}
      </p>
    </section>
  );
}
