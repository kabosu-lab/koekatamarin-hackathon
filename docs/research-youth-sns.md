# 若者に広がったサービスの調査（2026-11-04）

コエカタの設計に使える点を探すために調べた。原因の説明は、多くが解説記事の見方で、測定された結果ではない。「解釈」は作る側の推測。

## 分かったこと

| サービス | 分かっていること | 解釈 |
|---|---|---|
| Zenly | 親しい友人と位置を共有。待ち合わせやスマホの紛失時に便利で、日本の高校生に広がった。終了は Snap の事業の都合と報じられ、不振が理由ではない。位置共有が絡む事件の報道もある | 何も書かなくても存在が伝わり、まず便利だった |
| BeReal | 通知から2分以内に撮る。映えへの疲れの反動とゲーム性が理由に挙げられる。日本の月間利用者は450万人超で、83%が Z 世代（2025年3月）。世界の利用者は減少が報じられたが、会社は数字に反論している。授業中の撮影や更衣室での写り込みの問題も報告された | 「いま投稿する理由」をアプリが与えた。写りの良さを求めないので、投稿の怖さが下がった |
| TikTok | おすすめに、無名の人の再生数の少ない動画も混ぜる。視聴はフォロワー数より推薦に左右される。一方で作り手の燃え尽きや、10代への有害な推薦の問題も報告がある。16歳未満の投稿はおすすめの対象外 | フォロワーがいなくても見てもらえる |
| Gas | 高校で学校ごとに広がった。友人を褒める質問に、ワンタップで答える。悪い質問はない。誰が投票したかは課金で見える形で、不安を収益にしていると批判された。2023年に終了 | 褒める言葉をアプリが用意し、反応の手間をなくした。学校ごとに密度を作った。ただし流行は短かった |
| Locket | 親しい人の写真がホーム画面に出る。友達は20人まで、フォロワー数はない。毎月、写真のふりかえり動画を作る | 開かなくても届く。少人数に絞っている |
| Duolingo | 連続記録は、失うのが惜しいという心理を使うと担当者が語っている。友達との協力の課題もある。休む手段がないと、途切れたときに離れるという指摘もある | 協力は使えるが、失う怖さは先生には合わない |

## 共通して見えること（解釈）

1. **少人数**：Locket の20人、BeReal や Zenly の友達どうし
2. **反応や投稿の手間がとても小さい**：ワンタップ、撮るだけ、位置なら何もしない
3. **アプリが理由を作る**：通知、質問、おすすめ
4. **流行は続きにくい**：目新しさが薄れると減る。使い続ける理由が別に要る

## コエカタとの決定的な違い

調べたサービスは、どれも友人どうしの自発的な場で、先生は見ていない。コエカタは校内の場で、先生が見える。生徒が投稿しない理由の1つが「先生に見られる」なので、これらの成功をそのまま当てはめることはできない。

## 取り入れる案

| 案 | もとになったもの |
|---|---|
| 投稿の理由を毎日作る。決まった時間に Claude が1つだけ問いかける | BeReal |
| 少人数の組を基本にする | Locket |
| 投稿は必ず誰かに届く | TikTok |
| 「今週助けてくれた人は？」と問いかけ、ワンタップでサンクスカードを送る。実名で、肯定的なものだけ | Gas |
| 全校ではなく、学年や勉強会などのまとまりで一斉に始める | Gas |
| 毎月の短いふりかえりも作る | Locket |
| 開かなくても朝のカードが届く。Teams の通知などから入る | Locket |
| 個人の連続記録ではなく、組で協力する目標にする | Duolingo |

## 取り入れないもの

- 2分などの時間制限と不意の通知（授業中の撮影や写り込みの問題）
- 位置情報（安全上の問題）
- 匿名、誰が反応したかを課金で見せること（不安を収益にする）
- 途切れると失う連続記録（責める仕組みになる）
- 際限なく流れるおすすめ（10代への有害な推薦の問題）

## 確かめられなかったこと

- 日本の高校生の「見る専」や非公開アカウントの最近の調査
- BeReal や Locket の利用継続の信頼できる数字。BeReal の数字は調査会社と会社の間で食い違う
- Gas が終了した理由
- 先生が見ている校内 SNS で、生徒の交流が定着した事例

## 出典

- Zenly：[週刊アスキー](https://weekly.ascii.jp/elem/000/004/116/4116127/)、[プレジデント](https://president.jp/articles/-/72704)、[すまほん!!](https://smhn.info/202209-zenly-fin)
- BeReal：[GIGAZINE](https://gigazine.net/gsc_news/en/20250313-bereal-japanese-active-users)、[プレジデント](https://president.jp/articles/-/83367)、[PetaPixel](https://petapixel.com/2023/02/22/bereal-may-be-on-the-out-users-have-nearly-halved-since-peak)、[Gizmodo](https://gizmodo.com/bereal-userbase-continues-to-shrink-similarweb-1850887998)
- TikTok：[MIT Technology Review](https://www.technologyreview.com/2021/02/24/1017814/tiktok-algorithm-famous-social-media/)、[EurekAlert（Penn State の研究）](https://www.eurekalert.org/news-releases/974102)、[TikTok 公式](https://www.tiktok.com/transparency/recommendation-system/?lang=hi)、[Digital Watch](https://dig.watch/?p=114397)
- Gas：[TODAY](https://www.today.com/today/amp/rcna64969)、[CBC](https://amp.cbc.ca/lite/story/1.6718229)、[The Andover View](https://andoverview.net/tag/gas/)、[SmartSocial](https://www.smartsocial.com/post/gas-app)
- Locket：[9to5Mac](https://9to5mac.com/2022/01/13/locket-app-iphone-widgets/)、[iMore](https://www.imore.com/locket-puts-your-friends-photos-your-home-screen-using-widgets)、[YR Media](https://yr.media/?p=96761)
- Duolingo：[Desirability Lab（連続記録）](https://desirabilitylab.com/backfill/backfill-2024-205-duolingo-streak-mechanic)、[Desirability Lab（友達機能）](https://desirabilitylab.com/backfill/backfill-2023-278-duolingo-social-features)、[Yu-kai Chou](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term/)
