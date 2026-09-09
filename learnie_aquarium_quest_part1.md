# ラーニー先生 水族館クエスト Part 1 — 全セリフ台本

**想定時間：40〜60分以上**  
**目的：** 1週目リアルレッスンの復習。魚は入れない。最終は「魚を迎える水槽の準備ができた！」

> **Learny が話す日本語はすべてひらがな**（TTS 読み上げ用。漢字・カタカナは使わない）。

> このファイルは `js/lessons/aquarium-part1.js` の台本ソースと揃える。フロー／セリフを変えたら **必ずここも更新** する。

---

## 画面・入力のルール（実装どおり）


| 項目    | 内容                                                                   |
| ----- | -------------------------------------------------------------------- |
| メイン入力 | **4択ボタン**（テキスト／マイクは補助）                                               |
| マイク   | **デフォルト OFF（ミュート）**                                                  |
| 4択の並び | **毎回ランダム**（正解が常に左上にならない）                                             |
| 不正解   | ランダムなソフトリトライ（例: `おしい！もういちど！` / `ざんねん！もういっかい！`）— **正解は言わない**。同じビートの4択を再表示 |
| バッジ   | Part 1 では付与オフ（表示は 0/0）                                               |
| 章のつなぎ | 「つぎの章へ…」ローディング。**Learny が次章の発話を始めるまで 4択は出さない**（Ch2→Ch3 も含む Live 再接続） |
| 自由会話中 | **4択を隠す**（Ch2 ③④・さがし待ち、Ch4「すきないろは？」など）。MCQ に戻ったら **また表示**            |



| 区間                           | 4択ボタン                    |
| ---------------------------- | ------------------------ |
| Chapter 0                    | なし（自由会話）                 |
| Chapter 1                    | **あり**（各ビート）             |
| Chapter 2 ①場所・②左右            | **あり**                   |
| Chapter 2 ③あつい・④みえる          | **なし**（自由会話）             |
| Chapter 2 砂みつけたフレーズ          | **あり**（Beat 4 のあとすぐ再表示）  |
| Mini quiz 1                  | **あり**（3問・Learny は日本語のみ） |
| Chapter 4「すきないろは？」           | **なし**（自由会話中はボタン非表示）     |
| Chapter 4「I made ___ glass!」 | **あり**（いろのあと make+tell 合体ライン） |
| Daily English                | **なし**                   |
| Chapter 3 / 5 / 6 / Final    | **あり**                   |
| Ending                       | なし（会話ビート）                |


- **正解** → 次のビート（章の最後なら次の章へ／章ヒンジでは Live 再接続）
- 回答ログ（正解/不正解・選択肢・回数）は管理画面の学習進捗に集計

---

# CHAPTER 0 — まずは今日のおしゃべり（ボタンなし）

### Learny

1. `Hello! How are you today?`
  `こんにちは！きょうは どうですか？`  
   ※ How are you を同じターンで繰り返さない
2. （気分の返事のあと — **この質問固定**）
  `That's great! What did you do today?`  
   `よかった！きょうは なにを したの？`  
   ※気分の答えに `Thank you` / `ありがとう` は使わない  
   ※ `Did you eat lunch yet?` / `Are you hungry?` など別の日常質問に差し替えない
3. 子どもが具体的な話をしたら（例: cafe / studied）→ その話に触れてから聞く：
  `A cafe! That sounds fun! What did you drink there?`  
   `かふぇ！たのしそう！なにを のんだの？`  
   ※「Oh!」だけで水槽の話に飛ばない／同じ質問を繰り返さない
4. `no` / `nothing` / `とくにない` のとき：
  `Okay!` / `そっか！だいじょうぶ！` → **質問は1つだけ**（例: `Did you play anything fun?` / `なにか たのしいこと した？`）。同じターンで2つ聞かない。`What did you do today?` の繰り返し禁止
5. 3ターン前後の会話のあと（招待ターン）：短い反応のあと、**同じ発話**で水槽へ
  例：  
   `Okay! Oh! Today I want to make a fish tank. Will you help me make it?`  
   `そっか！そうだ！きょうは らーにーせんせいの すいそうづくりを てつだってほしいんだ。いっしょに つくれる？`  
   ※いきなり `Oh! Today…` だけで始めない。日常質問＋招待を同じバブルに混ぜない
6. 子どもが yes / うん / いいよ → **Chapter 1 へ**（ローディングのあと、Thank you + ガラス質問。水槽招待のやり直しはしない）

---

# CHAPTER 1 — ガラスが足りない！（4択）

章オープニング（warmup 完了直後）：  
`Thank you! What do I need to make a tank? Something transparent and hard.`  
`ありがとう！すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。`  
※ `Oh! Today… Will you help…` / `いっしょに つくれる？` を言い直さない

## Beat 1 — タンクに必要なもの

**Learny:**  
`What do I need to make a tank? Something transparent and hard.`  
`すいそうを つくるには なにが いる？ とうめいで かたい ものだよ。`

**4択:** glass / wood / water / dirt → **正解: glass**

## Beat 2 — I need glass

**Learny:**  
`Can you say it in English?`  
`「がらすが ひつよう」の えいごを 選んでね！`  
※ 英語の答え `I need glass` を Learny が先に言わない

**4択:** I need glass. / I found glass. / I made sand. / I need water. → **正解: I need glass.**

## Beat 3 — ガラス材料

**Learny:**  
`To make glass in Minecraft, what do we need?`  
`まいくらふとで がらすを つくるには、なにが いるかな？`  
※ `Did you find the glass?` は禁止

**4択:** sand / water / wood / stone → **正解: sand**

## Beat 4 — I need sand

**Learny:**  
`Can you say it in English?`  
`「すなが ひつよう」の えいごを 選んでね！`

**4択:** I need sand. / I found sand. / I need glass. / I made glass. → **正解: I need sand.**  
→ **Chapter 2 へ**

**不正解時（各ビート共通）:**  
`Almost! Try again!` / `おしい！もういちど！`（答えは言わない）

---

# CHAPTER 2 — 砂を探しに行こう！

## Beat 1 — 場所（4択）

**Learny:**  
`Let's go find some sand! Do you want to go to the beach or the mountains?`  
`すなを さがしに いこう！ びーちと やま、どっちに いく？`

**4択:** beach / mountains / river / forest → **beach または mountains どちらも正解**

## Beat 2 — 左右（4択）

**Learny:**  
`Do you want to go to the left or right?`  
`ひだりと みぎ、どっちに いく？`

**4択:** left / right / straight / back → **left または right どちらも正解**  
※ 次は必ず Beat 3（あつい？）。左右の直後に `You found some sand!` へ飛ばない

## Beat 3 — あつい？（ボタンなし）

**Learny:**  
`Is it hot outside?`  
`そとは あつい？`  
→ 子どもが答えたら短く反応  
※ 次は必ず Beat 4（なにがみえる？）。あつい？の直後に `Keep looking` / さがして へ飛ばない

## Beat 4 — なにがみえる？（ボタンなし）

**Learny:**  
`What can you see around you?`  
`まわりに なにが みえる？`  
→ 短く反応したら **すぐ Beat 5**（`We found some sand!…`）。ユーザーが「みつけた」と言うのを待たない。Keep looking 禁止

## Beat 5 — I found some sand!（4択）

**Learny:**  
`We found some sand! Can you say it in English?`  
`あ！すな あった！「すなを みつけた！」の えいごを 選んでね！`  
※ `Can you say, I found some sand!` / 「I found some sand!」いってみて！ は禁止（英語の答えを先に言わない — 「すなを みつけた！」の えいごを 選んでね！ を使う）

**4択:** I found some sand! / I need sand. / I made glass! / I put sand here. → **正解: I found some sand!**  
→ **Chapter 3 へ**（Live 再接続 → `Let's make some glass!`）

---

# CHAPTER 3 — ガラスを作ろう！（4択）

## Beat 1

**Learny:**  
`Let's make some glass!`  
`「がらすを つくらないと」の えいごを 選んでね！`  
※ `Can you say, I need to make glass` / 「I need to make glass」いってみて！ は禁止（英語の答えを先に言わない — 「がらすを つくらないと」の えいごを 選んでね！ を使う）

**4択:** I need to make glass. / I found some sand! / I need sand. / I put glass here.  
→ **正解: I need to make glass.**

## Beat 2

**Learny:**  
`Are you done making the glass?`  
`「がらすを つくった」の えいごを 選んでね！`  
※ `Can you say, I made glass?` / 「I made glass」いってみて！ は禁止（英語の答えを先に言わない — 「がらすを つくった」の えいごを 選んでね！ を使う）

**4択:** I made glass! / I need glass. / I found sand. / I made a tank!  
→ **正解: I made glass!** → **Mini quiz 1 へ**

---

# MINI QUIZ 1（4択）

Learny は**日本語ひらがなのみ**。英語の選択肢は声に出さない（画面の4択をタップ）。並びはランダム。

### Q1

**Learny:**  
`くいずたいむ！「がらすが ひつよう」は えいごで？`  

**4択:** I need glass. / I found some sand! / I need sand. / I made glass!  
→ **正解: I need glass.**

### Q2

**Learny:**  
`じゃあ つぎは 「すなを みつけた」は えいごで？`  

**4択:** I found some sand! / I need sand. / I need glass. / I made glass!  
→ **正解: I found some sand!**

### Q3

**Learny:**  
`じゃあ つぎは 「がらすを つくった！」は えいごで？`  

**4択:** I made glass! / I need glass. / I found some sand! / I need to make glass.  
→ **正解: I made glass!** → **Chapter 4 へ**

---

# CHAPTER 4 — 好きな色を選ぼう

**流れ:** Beat A1 → **Beat A2+B 合体**（MCQ）

## Beat A1 — すきないろ（ボタンなし）

**Learny:**  
`What's your favorite color?`  
`すきな いろは？`  
→ 子どもが色を言う（例: orange）→ `favoriteColor` を記録  
→ **レッスン外の色（rainbow など）:** 保存しない。`Which colour would you pick out of these?` / `この中だったらどの色がすき？` ＋色ボタンで選び直す  
→ **ここでガラス MCQ は出さない / Chapter 5 へ進まない**

## Beat A2+B — その色のガラスを作ろう＋できたらいってね（1ターン）

**Learny（1メッセージ）:**  
`Let's make orange coloured glass! Tell me when you make one!`  
`おれんじいろの がらすを つくろう！つくれたら「おれんじいろの がらすを つくった！」って えいごで おしえてね！`  
（色は子どもの答えに合わせて変える）  
→ **このあと 4択 MCQ を表示**

**4択例:** I made orange glass! / I need a dye. / I put glass here. / I made a tank!  
→ **正解: I made [その色] glass!** → **Chapter 5 へ**  
※ 染料／花探しフレーズは教えない（花壇に用意済み）  
※ Chapter 3 の `I made glass!` だけではクリアしない — 色つき `I made [color] glass!` が必要  
※ `[color] glass! Great job` のような省略は禁止 — 必ず `Let's make … coloured glass! Tell me when you make one!` を含める

---

# CHAPTER 5 — 水槽の壁を作ろう（4択）

## Beat 1

**Learny:**  
`Now let's make a tank wall! Where do you want to put the glass? Tell me!`  
`すいそうの かべを つくろう！どこに がらすを おく？「ここにガラスをおく」のえいごを選んでね！`  
**4択:** I put glass here. / I put sand here. / I made glass! / I need glass. → **I put glass here.**

## Beat 2

**Learny:**  
`Tell me what you're building!`  
`「すいそうを つくってる」の えいごを 選んでね！`  
**4択:** I'm building a tank. / I made a tank! / It looks good! / I need sand. → **I'm building a tank.**

## Beat 3

**Learny:**  
`Are you done making it?`  
`「すいそうを つくった」の えいごを 選んでね！`  
**4択:** I made a tank! / I'm building a tank. / I put glass here. / My tank is ready! → **I made a tank!**

## Beat 4

**Learny:**  
`How does it look?`  
`「いい かんじに できた！」の えいごを 選んでね！`  
**4択:** It looks good! / I made glass! / I'm done! / I need more sand. → **It looks good!**  
→ **Daily English へ**

---

# DAILY ENGLISH — 突然英会話！（ボタンなし）

**Learny（最初の一言 — イントロなし）:**  
`Oh by the way, do you have a favourite animal?`  
`そういえば、[name]さんは すきな どうぶつとか いるの？`

**禁止:** `Let's practice today's English!` / `きょうの えいごを れんしゅうしよう！`

**続き（4ラリー以上 — 子どもの話に合わせて自然に）:**

- 子どもの答えに具体的に反応（毎回「A dog! / いぬ！」で始めない）
- **同じ話題を 1〜2 ターン**つづけてから話題を変える（変えるときは `そうだね！そういえば…` など）
- すでに答えたことを聞き返さない（例: 「飼ってたよ」のあとに「まえに かっていたの？」は禁止）
- 例（あくまで例・固定リストではない）: ペットの名前 / きょうしたこと / たべもの / うみとやま など

※ `Are you tired?` / `つかれた？` は禁止  
※ `What's your favorite color?` / `すきな いろは？` も禁止（Chapter 4 で既に聞いた）

4ラリー以上のあと（**1ターンで**）:  
**短い反応（子どもの直前の言葉に触れる）** → `Nice! Now let's get back to the tank!`  
`いいね！じゃあ すいそう つくりに もどろう！`  
例: 「竹を食べてたよ」→ `Bamboo! Nice! Now let's get back to the tank!` / `たけ！いいね！じゃあ すいそう つくりに もどろう！`  
※ 橋渡しだけ言って反応なしは禁止  
（言い切ってから）→ **Chapter 6 へ**（Chapter 6 冒頭で Daily English の答えに再反応しない）

---

# CHAPTER 6 — 水槽の底を作ろう（4択）

※ Daily English のあとの再開：子どもの前の答え（ペットなど）への反応は **しない**。すぐ Beat 1 へ。

## Beat 1

**Learny:**  
`Let's make a basement inside the tank!`  
`すいそうの そこに すなを おこう！のえいごを選んでね！`
**4択:** I put the sand on the bottom. / I put sand here. / I put glass here. / I'm done! → **I put the sand on the bottom.**

## Beat 2

**Learny:**  
`Do we have enough sand?`  
`「もっと すなが ひつよう」の えいごを 選んでね！`  
**4択:** I need more sand. / I need glass. / I'm done! / I found some sand! → **I need more sand.**

## Beat 3

**Learny:**  
`Are you done?`  
`「できた！」の えいごを 選んでね！`  
**4択:** I'm done! / My tank is ready! / I put sand here. / It looks good! → **I'm done!**

## Beat 4

**Learny:**  
`Is the tank ready for the fishes to swim?`  
`「すいそうのじゅんびができた」のえいごを選んでね！`
**4択:** My tank is ready! / I'm done! / I need fish. / I made a tank! → **My tank is ready!**  
→ **Final challenge へ**  
※ 魚はまだ入れない（水族館完成ではない）

---

# FINAL CHALLENGE（4択）

**Learny オープニング（1ターン — 準備確認なし）:**  
`Final challenge time! Let's go!`  
`さいごのチャレンジだよ！レッツゴー！`  
→ **すぐ最初の「〜は えいごで？」へ**

**禁止:** `Are you ready?` / `じゅんびは できてる？`（待たずに第1問へ）

各問は「〜は えいごで？」＋画面4択（並びランダム）。例：


| 日本語キュー                | 正解                   |
| --------------------- | -------------------- |
| がらすが ひつよう！             | I need glass.        |
| すなを みつけた！             | I found some sand!   |
| がらすを つくった！            | I made glass!        |
| もっと すなが ひつよう！         | I need more sand.    |
| さかなを いれられる じゅんびが できた！ | My tank is ready!    |
| がらすを ここに おいた！         | I put glass here.    |
| すいそうを つくってる！          | I'm building a tank. |
| いい かんじ！               | It looks good!       |
| できた！                  | I'm done!            |
| あかい がらすを つくった！        | I made red glass.    |


ランダム5〜6問。不正解はやり直し（答えは言わない）。残り1問のとき `さいごの もんだい！`。全部終わったら Ending へ。

---

# ENDING — 水槽の準備できた！（ボタンなし→フリートーク）

**流れ:** ターンA → **フリートーク（制限なし）** →「終わりにする」→ ターンC → 自動切断

**ターン A（1メッセージ・待たない）— 旧 1+2+3:**  
`Perfect! We made a fish tank together! Thank you for helping!`  
`ぱーふぇくと！ いっしょに すいそうを つくれたね！ てつだって くれて ありがとう！`  
`Hold on... we don't have any fish in the fish tank! That's for next time!`  
`あれれ… おさかなが 1ぴきも いない！ それは つぎの レッスンだね！`  
`What kind of fish should we catch?`  
`どんな おさかなを つかまえよう？`  
→ **ここで待つ → フリートーク開始**

**フリートーク:**  
スクリプトなし・制限なし。魚や Minecraft、なんでも自由におしゃべり。  
画面の **「終わりにする」** を押すまでおわかれ（ターンC）に進まない。

**ターン C（1メッセージ）—「終わりにする」のあと・旧 5+6:**  
`Hmm... I can't stop thinking about it!`  
`うーん… わくわく しちゃう！`  
`Next Minecraft lesson we'll decorate this tank and add fish to finish it! See you next time!`  
`つぎの まいんくらふと レッスンで この すいそうを かざって おさかなを いれて かんせい させよう！ また ね！`  
→ **終わったら自動切断**

**禁止（フリートーク中）:** `How many do we want?` / `なんびき ほしい？` / 先におわかれを言う

---

# 管理画面に残る統計（イメージ）

各4択について記録：

- セグメントID / ビートID
- 選んだ選択肢
- 正解か不正解か
- 何回目の挑戦か
- 時刻

集計：生徒ごとの ○正解 / ×不正解 / 総回答数、アクティビティタイムラインに「4択正解」「4択不正解」