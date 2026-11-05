# Teams のタブに置く

校内の桜と自習室を、Teams のチャネルのタブで見られるようにする手順。提出版では作り方までで、タブの追加は人が行う。

## 置く画面

| URL | 中身 |
|---|---|
| `/tab` | 校内の桜と自習室。名前も投稿の本文も出さず、操作もない |
| `/study/room` | 自習室だけ |

この2つだけ、Teams の中に埋め込めるように `Content-Security-Policy: frame-ancestors` を付けている（`next.config.ts`）。

## 手順

1. こえかたを HTTPS で開ける場所に置く（Teams のタブは HTTPS でないと開けない）
2. `teams-tab/manifest.template.json` の `{{APP_ID}}`（新しい GUID）と `{{HOST}}`（置いた場所のホスト名）を埋め、`manifest.json` として保存する
3. `manifest.json` と、大きさの決まったアイコン2枚（`color.png` 192px、`outline.png` 32px）を zip にする
4. テナントの管理者が許可している場合に、Teams の「アプリの管理」から zip をアップロードし、チャネルにタブとして追加する

## 決まり

- タブの中でサインインはしない。誰が見ても同じ画面で、個人の情報は出さない
- 実際の学校で置くときは、学校の管理者の確認を取る
