# Teams でできることの調査（2026-11-04）

コエカタを Teams の窓口にするために、公式資料と Microsoft の Q&A を調べた。実際のテナントでは試していない。

| やりたいこと | 結果 | コエカタへの影響 |
|---|---|---|
| 本人として投稿する | できる。委任の権限 `ChannelMessage.Send` で、サインインした本人として投稿する。管理者の同意は不要と記載（学校の方針による制限はありうる） | 「本人が送る」という決まりと合う |
| アプリの名義で投稿する | Microsoft Graph ではできない。Microsoft の担当者は、アプリのみのトークンでは通常の投稿を送れないと回答している | AI が勝手に投稿できない作りになる |
| 返信を読む | できる。`ChannelMessage.Read.Group` など | 校内の知恵や、人の紹介に使える |
| リアクションを読む | できる。投稿の情報に、誰がいつ付けたかが含まれる | 分身や桜を育てる材料にできる |
| 変化の通知を受ける | チャネルの投稿と返信は購読できる。リアクションだけの変化で通知が来るかは未確認 | 定期的に読みに行けば足りる |
| チャネルで誰が見たかを知る | 取得方法は見つからなかった。Teams の既読はチャットのもので、資料は古いものも含む | Teams で直接見た人は分からない |
| 無料の試験用テナントを作る | 開発者プログラムに入るだけでは得られない。Visual Studio の契約者やパートナーなどが対象と報告されている | 提出版はダミー画面で進める |

## 自習室を Teams から見せるには

| やりたいこと | 結果 | コエカタへの影響 |
|---|---|---|
| 映像を常時配信する | 向かない。[ライブイベントは 2026 年 6 月 30 日に終了の案内](https://learn.microsoft.com/en-us/microsoftteams/teams-stream-overview)。[会議やイベントには時間の上限がある](https://learn.microsoft.com/en-us/microsoftteams/limits-specifications-teams) | 映像の配信はしない |
| チャネルのタブに Web ページを載せる | できる。[HTTPS、iframe の許可、Teams の SDK の初期化などが必要](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/tab-requirements) | 自習室の画面はタブに載せる |
| 投稿したカードを書き換える | [ボットの機能で更新できる](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/update-and-delete-bot-messages)。更新では新しい通知が出ないという[報告](https://learn.microsoft.com/en-us/answers/questions/5805345/disable-teams-banner-notification-for-adaptive-car)もある | 「いま8人が勉強中」のカードに使える可能性 |

未確認：朝のカードをボットで届ける方法、購読に必要な設定の詳細、学校のテナントの方針。

## 設計への結論

- 投稿は本人のサインインで行う。AI の名義の投稿はしない
- 「誰が見てくれたか」は、コエカタの朝のカードで見た人に限って伝える。Teams で直接見た人は数えない
- いいねと返信は Teams から読み取り、分身と桜に反映する

## 出典

- [チャネルへの投稿](https://learn.microsoft.com/en-us/graph/api/channel-post-messages?view=graph-rest-1.0)
- [権限の一覧](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [アプリのみのトークンについての回答](https://learn.microsoft.com/en-us/answers/questions/5698744/can-a-service-principal-app-be-configured-to-send)
- [返信の一覧](https://learn.microsoft.com/en-us/graph/api/chatmessage-list-replies?view=graph-rest-1.0)
- [Teams のメッセージ API の概要](https://learn.microsoft.com/en-us/graph/teams-messaging-overview)
- [変更の通知](https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage)
- [既読についての回答（2022年）](https://learn.microsoft.com/en-us/answers/questions/1111770/is-it-possible-to-check-read-receipts-using-graph)
- [Teams の既読の説明](https://support.microsoft.com/en-us/teams/chat/use-read-receipts-for-messages-in-microsoft-teams)
- [試験用テナントの要件についての回答](https://learn.microsoft.com/en-us/answers/questions/5771537/clarification-needed-on-requirements-for-ms-develo)
