/** 見た目の設定。データはどの見た目でも同じで、見せ方だけが変わる。 */
export const APPEARANCE_OPTIONS = [
  {
    name: "theme",
    label: "きせかえ",
    options: [
      { value: "modern", label: "モダン" },
      { value: "retro", label: "レトロ" },
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
    label: "パートナー（隠しても、裏で育ちます）",
    options: [
      { value: "show", label: "表示する" },
      { value: "hide", label: "隠す" },
    ],
  },
] as const;

export type AppearanceName = (typeof APPEARANCE_OPTIONS)[number]["name"];
export type Appearance = Record<AppearanceName, string>;

export const APPEARANCE_COOKIES: Record<AppearanceName, string> = {
  theme: "koekata_theme",
  size: "koekata_size",
  avatar: "koekata_avatar",
};

const DEFAULTS: Appearance = { theme: "retro", size: "normal", avatar: "show" };

export function isAppearanceValue(name: string, value: string): name is AppearanceName {
  const group = APPEARANCE_OPTIONS.find((g) => g.name === name);
  return group !== undefined && group.options.some((option) => option.value === value);
}

/** 見た目は全員同じ1つにした。選べるのは文字の大きさとパートナーの表示だけ（音はいつも鳴らす）。内部の名前は retro のまま。 */
export function readAppearance(read: (cookie: string) => string | undefined): Appearance {
  const get = (name: AppearanceName) => {
    const value = read(APPEARANCE_COOKIES[name]);
    return value !== undefined && isAppearanceValue(name, value) ? value : DEFAULTS[name];
  };
  return { theme: DEFAULTS.theme, size: get("size"), avatar: get("avatar") };
}
