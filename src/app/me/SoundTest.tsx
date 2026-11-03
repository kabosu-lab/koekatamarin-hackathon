"use client";

import { playSendSound } from "../sound";

/** 「音あり」のときだけ出す。送らなくても音を確かめられる。 */
export function SoundTest() {
  return (
    <button type="button" onClick={() => playSendSound("話した言葉が、固まって、飛んで、届く")}>
      音を試す
    </button>
  );
}
