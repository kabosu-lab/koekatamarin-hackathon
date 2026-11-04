import type { ClaudeAttachment } from "../claude/types";

export type ProfilePhoto = { mediaType: ClaudeAttachment["mediaType"]; bytes: Uint8Array };

/**
 * 本人が Teams に登録した写真を読む部品。提出版はダミーで、将来は本人の権限で `/me/photo/$value` を読む。
 * 写真がないときは null（Graph では 404 に当たる）。
 */
export type ProfilePhotoSource = {
  /** 画面に出す名前 */
  label: string;
  getPhoto(personId: string): Promise<ProfilePhoto | null>;
};
