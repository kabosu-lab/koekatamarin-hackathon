import type { CSSProperties } from "react";
import type { Season } from "@/lib/sakura";
import { StudyBuddy } from "../PresenceView";
import { RoomBackdrop } from "./RoomBackdrop";
import { ROOM_PLACES, ROOM_SEATS, type RoomMoment, roomCrowd, roomTables } from "./scene";

/** 座りきれない人は、奥にぼかした影で描く。影の数はこれまで（数そのものは外の「ほか N人」の札で伝える） */
const SHADOWS_MAX = 8;

/**
 * 景色の中の机に、パートナーが2人ずつ静かに座る。灯りが机から机へゆっくり渡っていき、部屋がひとつにつながって見える。
 * 夜遅くは促さないよう、ハイタッチと応援をやめ、一人ずつ伸びをするだけにする。
 * 人が増えるほど机の列を増やしてキャラクターを小さくし、12人を超えた分は奥のぼかした影にする（0-2s）。景色に文字は置かない。
 */
export function RoomScene({
  tokens,
  moment,
  season,
  pressable = false,
}: {
  tokens: string[];
  moment: RoomMoment;
  season?: Season;
  /** 自習室ではパートナーを押せる（0-3f。名札は RoomPeople が出す）。Teams のタブでは押せない */
  pressable?: boolean;
}) {
  const { place, label } = ROOM_PLACES[moment.time];
  const seated = tokens.slice(0, ROOM_SEATS);
  const shadows = Math.min(SHADOWS_MAX, tokens.length - seated.length);

  return (
    <div
      className="study-room room-scene"
      data-time={moment.time}
      data-place={place}
      data-late={moment.late}
      data-crowd={roomCrowd(seated.length)}
    >
      <RoomBackdrop place={place} label={label} season={season} />
      {shadows > 0 && (
        <div className="room-shadows" aria-hidden="true">
          {Array.from({ length: shadows }, (_, index) => (
            <span key={index} className="room-shadow" />
          ))}
        </div>
      )}
      <div className="room-floor">
        {roomTables(seated).map((table, order) => {
          const paired = table.length === 2 && !moment.late;
          return (
            <div
              key={order}
              className="room-table"
              style={{ "--wait": `${-order * 5}s`, "--wave": `${order * 1.7}s` } as CSSProperties}
            >
              <div className="room-seats">
                {paired && <span className="room-spark" aria-hidden="true" />}
                {table.map((token, seat) => (
                  <div
                    key={seat}
                    className="room-seat"
                    data-seat={order * 2 + seat}
                    tabIndex={pressable ? 0 : undefined}
                  >
                    <span className="room-glow" aria-hidden="true" />
                    <StudyBuddy token={token} side={paired ? (seat === 0 ? "left" : "right") : "solo"} order={order} />
                  </div>
                ))}
                {table.length === 1 && (
                  <div className="room-seat room-seat-empty" aria-hidden="true">
                    <span className="room-chair" />
                  </div>
                )}
              </div>
              <div className="room-desk" aria-hidden="true">
                {table.map((_, seat) => (
                  <span key={seat} className="room-things">
                    <span className="room-book" />
                    <span className="room-cup">
                      <span className="room-steam" />
                    </span>
                  </span>
                ))}
                {table.length === 1 && <span className="room-things" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
