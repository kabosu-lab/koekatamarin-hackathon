/** 見た目の設定。色と書体、文字の大きさ、音だけで、配置は変えない。 */
export const APPEARANCE_OPTIONS = [
  {
    name: "theme",
    label: "きせかえ",
    options: [
      { value: "modern", label: "モダン" },
      { value: "pop", label: "ポップ" },
      { value: "game", label: "ゲーム" },
      { value: "clear", label: "くっきり" },
    ],
  },
  {
    name: "size",
    label: "文字の大きさ",
    options: [
      { value: "small", label: "小さめ" },
      { value: "normal", label: "ふつう" },
      { value: "large", label: "大きめ" },
      { value: "xlarge", label: "とても大きい" },
    ],
  },
  {
    name: "avatar",
    label: "相棒（隠しても、裏で育ちます）",
    options: [
      { value: "show", label: "表示する" },
      { value: "hide", label: "隠す" },
    ],
  },
  {
    name: "sound",
    label: "音（いつでも消せます。最初の画面からも切り替えられます）",
    options: [
      { value: "off", label: "音なし" },
      { value: "on", label: "音あり" },
    ],
  },
] as const;

export type AppearanceName = (typeof APPEARANCE_OPTIONS)[number]["name"];
export type Appearance = Record<AppearanceName, string>;

export const APPEARANCE_COOKIES: Record<AppearanceName, string> = {
  theme: "koekata_theme",
  size: "koekata_size",
  sound: "koekata_sound",
  avatar: "koekata_avatar",
};

const DEFAULTS: Appearance = { theme: "modern", size: "normal", sound: "on", avatar: "show" };

export function isAppearanceValue(name: string, value: string): name is AppearanceName {
  const group = APPEARANCE_OPTIONS.find((g) => g.name === name);
  return group !== undefined && group.options.some((option) => option.value === value);
}

export function readAppearance(read: (cookie: string) => string | undefined): Appearance {
  const get = (name: AppearanceName) => {
    const value = read(APPEARANCE_COOKIES[name]);
    return value !== undefined && isAppearanceValue(name, value) ? value : DEFAULTS[name];
  };
  return { theme: get("theme"), size: get("size"), sound: get("sound"), avatar: get("avatar") };
}
