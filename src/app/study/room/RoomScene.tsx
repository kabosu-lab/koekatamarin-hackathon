import type { CSSProperties } from "react";
import { StudyBuddy } from "../PresenceView";
import { RoomBackdrop } from "./RoomBackdrop";
import { ROOM_PLACES, type RoomMoment, roomTables } from "./scene";

/**
 * 景色の中の机に、相棒が2人ずつ静かに座る。灯りが机から机へゆっくり渡っていき、部屋がひとつにつながって見える。
 * 夜遅くは促さないよう、ハイタッチと応援をやめ、一人ずつ伸びをするだけにする。
 */
export function RoomScene({ tokens, moment }: { tokens: string[]; moment: RoomMoment }) {
  const { place, label } = ROOM_PLACES[moment.time];

  return (
    <div className="study-room room-scene" data-time={moment.time} data-place={place} data-late={moment.late}>
      <RoomBackdrop place={place} label={label} />
      <div className="room-floor">
        {roomTables(tokens).map((table, order) => {
          const paired = table.length === 2 && !moment.late;
          return (
            <div
              key={table[0]}
              className="room-table"
              style={{ "--wait": `${-order * 5}s`, "--wave": `${order * 1.7}s` } as CSSProperties}
            >
              <div className="room-seats">
                {paired && <span className="room-spark" aria-hidden="true" />}
                {table.map((token, seat) => (
                  <div key={token} className="room-seat">
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
                {table.map((token) => (
                  <span key={token} className="room-things">
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
