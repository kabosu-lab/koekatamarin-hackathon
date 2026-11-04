/**
 * レトロの相棒のドット絵。すべてコードの中の文字で描く（画像ファイルを使わない）。
 * 「.」は透明、「#」は濃い、「+」は中間、「o」は明るい色。左半分だけ書いて左右対称に広げる。
 * たまご→こども→おとなの段階と、おとなの分岐は、この表を足すだけで差し替えられる。
 */
export type Sprite = readonly string[];
export type PixelStage = "egg" | "child" | "adult";

export const PIXEL_SIZE = 24;

function mirrored(left: readonly string[]): Sprite {
  return left.map((row) => row + [...row].reverse().join(""));
}

export type PixelForms = {
  egg: Sprite;
  child: Sprite;
  /** 分岐の名前（今は相棒の系統）ごとの姿。ないものは default になる */
  adult: Record<string, Sprite> & { default: Sprite };
};

export const PIXEL_FORMS: PixelForms = {
  // 声がまだ固まっていない、角ばった石。中に細い光が走る
  egg: mirrored([
    "............",
    "............",
    "...........#",
    ".........##+",
    ".......##+++",
    "......#+++++",
    ".....#+++++#",
    ".....#++++#o",
    "....#++++#oo",
    "....#++++#oo",
    "....#+++++#o",
    "...#++++++#o",
    "...#+++++#oo",
    "...#+++++#oo",
    "...#++++++#o",
    "...#+++++++#",
    "....#+++++++",
    "....#+++++++",
    ".....#++++++",
    "......##++++",
    "........####",
    "............",
    "............",
    "............",
  ]),
  // 固まり始めた声。帽子のような頭に、細い目の窓
  child: mirrored([
    "............",
    "............",
    "...#........",
    "...##.......",
    "...#+#...###",
    "...#++###+++",
    "....#+++++++",
    "....#+++++++",
    "...#++++++++",
    "...#########",
    "...#oo#oooo#",
    "...#oo##ooo#",
    "...#oooooo##",
    "...#########",
    "....#+++++++",
    ".....##+++++",
    "....#++#++++",
    "...#+#.#++++",
    "...##..#++++",
    "......#+++##",
    "......#++#..",
    "......####..",
    "............",
    "............",
  ]),
  adult: {
    // 声を届ける者。頭の中央に一本の飾り、広い目の窓、胸に声の印
    default: mirrored([
      "...........#",
      "..........#+",
      "..........#+",
      ".........#++",
      ".......##+++",
      "......#+++++",
      ".....#++++++",
      ".....#######",
      ".....#oooo#o",
      ".....#ooo###",
      ".....#######",
      "......#+++++",
      "..#####.####",
      ".#+++++#++++",
      "#+++++++#+o+",
      "#++###++#o+o",
      "#++#.#++#+o+",
      "#+#..#++#+++",
      "###..#+++#++",
      ".....#+++#++",
      ".....#++###+",
      ".....#++#.#+",
      "....#+++#.#+",
      "....#####.##",
    ]),
  },
};

/** 今の「人とのやり取りで育つ」段階を、絵の3段階に分ける。進化の条件そのものはここで決めない。 */
export function pixelStageFor(family: string | null, stage: number): PixelStage {
  if (family === null || stage <= 0) return "egg";
  return stage >= 3 ? "adult" : "child";
}

export function pixelSprite(stage: PixelStage, branch: string | null, forms: PixelForms = PIXEL_FORMS): Sprite {
  if (stage === "egg") return forms.egg;
  if (stage === "child") return forms.child;
  return (branch !== null && Object.hasOwn(forms.adult, branch) ? forms.adult[branch] : undefined) ?? forms.adult.default;
}

export const PIXEL_STAGE_LABELS: Record<PixelStage, string> = { egg: "たまご", child: "こども", adult: "おとな" };

/** 同じ色が横に続く点を、1つの四角にまとめる。 */
export function spriteRects(sprite: Sprite): { x: number; y: number; width: number; tone: string }[] {
  const rects: { x: number; y: number; width: number; tone: string }[] = [];
  sprite.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const tone = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === tone) end += 1;
      if (tone !== ".") rects.push({ x, y, width: end - x, tone });
      x = end;
    }
  });
  return rects;
}
