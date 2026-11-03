# 気持ちのよい音と動きの調査（2026-11-04）

Duolingo の音と動きがどう作られたかの公式の説明は、今回は見つからなかった。以下は解説記事や技術記事の一般的な手法で、数値は目安。

## 音

| 手法 | 内容 |
|---|---|
| 短くする | 操作の音は 30〜150 ミリ秒、完了の音も 500 ミリ秒ほどまで |
| 上がる音は嬉しい | 肯定は音程が上がる2音、否定は下がる音 |
| 調をそろえる | すべての音を同じ調にして、続けて鳴っても濁らないようにする |
| 立ち上がりを速く | 遅れて聞こえないよう、鳴り始めは速く、余韻で表情を付ける |
| 正弦波や三角波から | 雑味の少ない音を土台にし、鳴り始めだけ少し雑音を足す |
| FM 合成 | 明るさを時間とともに減らすと、ベルや木琴に近づく |
| 残響を少し | 混ぜる量で空間を作る |
| 控えめに | すべての操作を祝わない。音量は小さめに |

## 動き

| 手法 | 内容 |
|---|---|
| バネの計算 | 一定の曲線より、バネの式のほうが自然に見える |
| つぶれと伸び | 横に広がるときは縦に縮める。ボタンは 5〜10% ほどの控えめな量 |
| 素早く | 小さな動きは 100〜200 ミリ秒ほどを中心に |

## コエカタでの使い方

- 音はハ長調のペンタトニックにそろえた。木琴に近い FM 音色と短い残響を足した
- 声のかたまりは1つ出るごとに音階が上がる
- ボタンは押すとつぶれ、離すとバネで戻る
- 素材ファイルは使わず、プログラムで音を作る

## 出典

- [How to Design UI and App Sounds](https://violetrecording.com/how-to-design-ui-sounds/)
- [UI sound design](https://skills.sh/dannyjpwilliams/ui-sound-design-skill/ui-sound-design)
- [UX sound design](https://skills.sh/guia-matthieu/clawfu-skills/ux-sound-design)
- [Squash and Stretch（Josh W. Comeau）](https://www.joshwcomeau.com/animation/squash-and-stretch)
- [Sound design（FM 合成）](https://nimbus-docs.pages.dev/tutorials/04-sound-design)
- [Duolingo の失敗音についての記事](https://out-of-scope-product.beehiiv.com/p/duolingo-has-it-venmo-has-it-even-slack-has-it-your-product-doesn-t)
