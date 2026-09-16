# ラーニー先生 水族館クエスト Part 2 — 全セリフ台本

**想定時間：40〜60分以上**
**目的：** 3週目リアルレッスンの復習。実際に作った水族館を思い出しながら、飾りつけ・魚探し・魚を水槽に入れた内容を復習する。

> **Learny が話す日本語はすべてひらがな**（TTS 読み上げ用。漢字・カタカナは使わない）。

> このファイルは `js/lessons/aquarium-part2.js` の台本ソースと揃える。フロー／セリフを変えたら **必ずここも更新** する。

---

## 画面・入力のルール（実装どおり）

| **項目** | **内容**                                         |
| ------ | ---------------------------------------------- |
| メイン入力  | **4択ボタン**（テキスト／マイクは補助）                         |
| マイク    | **デフォルト OFF（ミュート）**                            |
| 4択の並び  | **毎回ランダム**（正解が常に左上にならない）                       |
| 不正解    | `おしい！もういちど！` — **正解は言わない**。同じビートの4択を再表示        |
| バッジ    | Part 2 では付与オフ（表示は 0/0）                         |
| 章のつなぎ  | 「つぎの章へ…」ローディング。**Learny が次章の発話を始めるまで 4択は出さない** |
| 自由会話中  | **4択を隠す**。MCQ に戻ったら **また表示**                   |

| **区間**          | **4択ボタン**          |
| --------------- | ------------------ |
| Chapter 0       | **なし（自由会話）**       |
| Chapter 1       | **あり**             |
| Chapter 2       | **あり**             |
| Chapter 3       | **あり**             |
| Mini quiz 1     | **あり**             |
| Chapter 4       | **あり**             |
| DAILY ENGLISH   | **なし（自由会話）**       |
| Chapter 5       | **最初のみなし → その後あり** |
| Chapter 6       | **あり**             |
| Final Challenge | **あり**             |
| Ending          | **なし（会話ビート）**      |

- **正解** → 次のビート（章の最後なら次の章へ）
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
   ※別の日常質問に差し替えない


3. 子どもが具体的な話をしたら、その話に触れてから質問する。

   例：

   `Minecraft! That sounds fun! What did you do?`
   `まいんくらふと！たのしそう！なにを したの？`

   ※同じ質問を繰り返さない


4. `no` / `nothing` / `とくにない` のとき：

   `Okay!` / `そっか！だいじょうぶ！`

   → 質問は1つだけ追加してよい。


5. 3ターン前後の会話のあと：

   `Okay! Oh! Do you remember the aquarium you made in Minecraft? Let's remember it together!`
   `そっか！そうだ！このまえ まいんくらふとで つくった すいぞくかん、おぼえてる？いっしょに おもいだしてみよう！`


6. 子どもが yes / うん / おぼえてる

→ **Chapter 1 へ**

---

# CHAPTER 1 — 水槽を飾ろう（4択）

## Beat 1 — I put kelp here.

**Learny:**

```
Let's remember how you decorated your tank!
「ここに こんぶを おいた」の えいごを 選んでね！
```

※答えを先に言わない
**4択：**

- I put kelp here.
- I found kelp here.
- I need kelp.
- I like kelp.

→ **正解：I put kelp here.**

---

## Beat 2 — I put coral here.

**Learny:**

```
How about coral?
「ここに さんごを おいた」の えいごを 選んでね！
```

**4択：**

- I put coral here.
- I found coral here.
- I want coral.
- I made coral.

→ **正解：I put coral here.**

---

## Beat 3 — I choose this one.

**Learny:**

```
You had different decorations!
「これを えらぶ」の えいごを 選んでね！
```

**4択：**

- I choose this one.
- I put this one.
- I found this one.
- I need this one.

→ **正解：I choose this one.**

---

## Beat 4 — I like this coral.

**Learny:**

```
You found coral you liked!
「この さんごが すき」の えいごを 選んでね！
```

**4択：**

- I like this coral.
- I need this coral.
- I found this coral.
- I put this coral.

→ **正解：I like this coral.**

---

## Beat 5 — It looks cool!

**Learny:**

```
Your tank looked great!
「かっこいい！」の えいごを 選んでね！
```

**4択：**

- It looks cool!
- I need more!
- I found it!
- It is a fish!

→ **正解：It looks cool!**
→ **Chapter 2 へ**
**不正解時共通：**

```
Almost! Try again!
おしい！もういちど！
```

※答えは言わない

---

# CHAPTER 2 — 魚を探そう（4択）

## Beat 1 — Let's go to the ocean!

**Learny:**

```
Do you remember going to find fish?
「うみに いこう！」の えいごを 選んでね！
```

**4択：**

- Let's go to the ocean!
- Let's make the ocean!
- I found the ocean!
- I like the ocean!

→ **正解：Let's go to the ocean!**

---

## Beat 2 — I found a fish!

**Learny:**

```
You found a fish!
「おさかなを みつけた！」の えいごを 選んでね！
```

**4択：**

- I found a fish!
- I caught a fish!
- I have a fish!
- I want a fish!

→ **正解：I found a fish!**

---

## Beat 3 — I found a blue fish!

**Learny:**

```
You found a blue fish!
「あおい おさかなを みつけた！」の えいごを 選んでね！
```

**4択：**

- I found a blue fish!
- I want a blue fish!
- I have a blue fish!
- I put a blue fish!

→ **正解：I found a blue fish!**

---

## Beat 4 — I want this fish.

**Learny:**

```
You found a fish you wanted!
「この おさかなが ほしい」の えいごを 選んでね！
```

**4択：**

- I want this fish.
- I found this fish.
- I put this fish.
- I like the ocean.

→ **正解：I want this fish.**

---

## Beat 5 — I choose this fish.

**Learny:**

```
You decided which fish you wanted!
「この おさかなを えらぶ」の えいごを 選んでね！
```

**4択：**

- I choose this fish.
- I want this fish.
- I caught this fish.
- I found this fish.

→ **正解：I choose this fish.**
→ **Chapter 3 へ**

---

# CHAPTER 3 — 魚を捕まえよう（4択）

## Beat 1 — I caught a fish!

**Learny:**

```
You caught the fish with a bucket!
「おさかなを つかまえた！」の えいごを 選んでね！
```

**4択：**

- I caught a fish!
- I found a fish!
- I made a fish!
- I need a fish!

→ **正解：I caught a fish!**

---

## Beat 2 — I have a fish!

**Learny:**

```
Now you have the fish!
「おさかなを もってる！」の えいごを 選んでね！
```

**4択：**

- I have a fish!
- I found a fish!
- I want a fish!
- I put a fish!

→ **正解：I have a fish!**
→ **Mini quiz 1 へ**

---

# MINI QUIZ 1（4択）

Learny は**にほんご ひらがなのみ**。
英語の選択肢は読み上げない。
並びはランダム。

### Q1

```
くいずたいむ！「ここに さんごを おいた」は えいごで？
```

**4択：**

- I put coral here.
- I found coral here.
- I choose this one.
- I like this coral.

→ **正解：I put coral here.**

---

### Q2

```
じゃあ つぎは「この おさかなが ほしい」は えいごで？
```

**4択：**

- I want this fish.
- I choose this fish.
- I found a fish!
- I have a fish!

→ **正解：I want this fish.**

---

### Q3

```
じゃあ つぎは「おさかなを つかまえた！」は えいごで？
```

**4択：**

- I caught a fish!
- I found a fish!
- I have a fish!
- I want this fish.

→ **正解：I caught a fish!**
→ **Chapter 4 へ**

---

# CHAPTER 4 — 魚を水槽に入れよう（4択）

## Beat 1 — I put the fish in the tank.

**Learny:**

```
You caught the fish. What did you do next?
「おさかなを すいそうに いれた」の えいごを 選んでね！
```

**4択：**

- I put the fish in the tank.
- I found the fish in the tank.
- I caught the fish in the tank.
- I want the fish in the tank.

→ **正解：I put the fish in the tank.**

---

## Beat 2 — I put it in here.

**Learny:**

```
How about "ここに いれた"?
「ここに いれた」の えいごを 選んでね！
```

**4択：**

- I put it in here.
- I found it in here.
- I want it in here.
- I made it in here.

→ **正解：I put it in here.**

---

## Beat 3 — Look! There's a fish!

**Learny:**

```
You looked in the tank and saw a fish!
「みて！おさかなが いる！」の えいごを 選んでね！
```

**4択：**

- Look! There's a fish!
- Look! I need a fish!
- Look! I made a fish!
- Look! I want glass!

→ **正解：Look! There's a fish!**
→ **DAILY ENGLISH へ**

---

# DAILY ENGLISH — 突然英会話！（ボタンなし）

**Learny（最初の一言 — イントロなし）：**

```
Oh by the way, [name], what did you eat today?
そういえば、[name]さんは きょう なにを たべたの？
```

**禁止：**

```
Let's practice today's English!
きょうの えいごを れんしゅうしよう！
```

### 続き

子どもの答えに具体的に反応する。

例：

**Child：** `カレー！`

**Learny：**

```
Curry! Nice! Was it spicy?
かれー！いいね！からかった？
```

- 同じ話題を1〜2ターン続ける
- すでに答えたことを聞き返さない
- 新しい質問を大量に追加しない
- 食べ物の話を自然に少しだけ広げる

**4ラリー以上のあと：**
子どもの直前の発言に短く反応してから、

```
Nice! Now let's get back to your aquarium!
いいね！じゃあ すいぞくかんの はなしに もどろう！
```

→ **Chapter 5 へ**

---

# CHAPTER 5 — 魚は何匹いた？（混合）

※このChapterのみ、**自由回答 → 回答を4択に反映**する。

## Beat A1 — 魚の数を思い出す（ボタンなし）

**Learny:**

```
Do you remember how many fish were in your tank?
すいそうに おさかなが なんびき いたか おぼえてる？
```

→ 子どもの回答を `fishCount` として記録

例：

**Child：** `4`

→ `fishCount = 4`
「よんひき」「4匹」なども4として認識してよい。
覚えていない場合：

```
That's okay! About how many do you think there were?
だいじょうぶ！だいたい なんびき くらいだったと おもう？
```

※ここでは4択を表示しない

---

## Beat A2 — その数字でフレーズを作る（4択）

例：`fishCount = 4`
**Learny:**

```
You had four fish!
「おさかなが 4ひき いる」の えいごを 選んでね！
```

**4択例：**

- There are four fish.
- There are three fish.
- There are five fish.
- There is four fish.

→ **正解：There are four fish.**

### 動的生成ルール

正解：

```
There are [fishCount] fish.
```

誤答例：

- `There are [fishCount - 1] fish.`
- `There are [fishCount + 1] fish.`
- `There is [fishCount] fish.`

※fishCountが1の場合：
**正解：**

```
There is one fish.
```

複数形ルールを適切に変更する。

---

## Beat A3 — There are three fish.（4択）

**Learny:**

```
How about three fish?
「おさかなが 3びき いる」の えいごを 選んでね！
```

**4択：**

- There are three fish.
- There is three fish.
- I have three glass.
- I found three fish.

→ **正解：There are three fish.**

---

## Beat A4 — There are five fish.（4択）

**Learny:**

```
How about five fish?
「おさかなが 5ひき いる」の えいごを 選んでね！
```

**4択：**

- There are five fish.
- There is five fish.
- I have five glass.
- I found five sand.

→ **正解：There are five fish.**
→ **Chapter 6 へ**

---

# CHAPTER 6 — 先生からの質問チャレンジ（4択）

## Beat 1 — What color did you choose?

**Learny:**

```
Your teacher may ask this question!
「なにいろを えらびましたか？」は どれ？
```

**4択：**

- What color did you choose?
- What fish did you choose?
- How many fish are there?
- Do you like your aquarium?

→ **正解：What color did you choose?**

---

## Beat 2 — What fish did you choose?

**Learny:**

```
How about this one?
「どの おさかなを えらびましたか？」は どれ？
```

**4択：**

- What fish did you choose?
- What color did you choose?
- What fish did you find?
- How many fish are there?

→ **正解：What fish did you choose?**

---

## Beat 3 — How many fish are in your tank?

**Learny:**

```
Your teacher might ask about the number of fish!
「すいそうに おさかなが なんびき いますか？」は どれ？
```

**4択：**

- How many fish are in your tank?
- What fish are in your tank?
- Where is your tank?
- Do you like your tank?

→ **正解：How many fish are in your tank?**

---

## Beat 4 — What do you like about your aquarium?

**Learny:**

```
How about this question?
「すいぞくかんの どんなところが すき？」は どれ？
```

**4択：**

- What do you like about your aquarium?
- What do you need for your aquarium?
- Where is your aquarium?
- How many aquariums do you have?

→ **正解：What do you like about your aquarium?**

---

## Beat 5 — Do you like your aquarium?

**Learny:**

```
Last one!
「じぶんの すいぞくかんが すき？」は どれ？
```

**4択：**

- Do you like your aquarium?
- Do you need an aquarium?
- Did you find an aquarium?
- Can you make an aquarium?

→ **正解：Do you like your aquarium?**
→ **Final Challenge へ**

---

# FINAL CHALLENGE（4択）

**Learny オープニング（1ターン — 準備確認なし）：**

```
Final challenge time! Let's go!
さいごの ちゃれんじだよ！れっつごー！
```

→ すぐ第1問へ

**禁止：**

```
Are you ready?
じゅんびは できてる？
```

各問は「〜は えいごで？」＋画面4択。

| **日本語キュー**      | **正解**                      |
| --------------- | --------------------------- |
| ここに こんぶを おいた    | I put kelp here.            |
| ここに さんごを おいた    | I put coral here.           |
| これを えらぶ         | I choose this one.          |
| この さんごが すき      | I like this coral.          |
| かっこいい！          | It looks cool!              |
| うみに いこう！        | Let's go to the ocean!      |
| おさかなを みつけた！     | I found a fish!             |
| あおい おさかなを みつけた！ | I found a blue fish!        |
| この おさかなが ほしい    | I want this fish.           |
| この おさかなを えらぶ    | I choose this fish.         |
| おさかなを つかまえた！    | I caught a fish!            |
| おさかなを もってる！     | I have a fish!              |
| おさかなを すいそうに いれた | I put the fish in the tank. |
| ここに いれた         | I put it in here.           |
| みて！おさかなが いる！    | Look! There's a fish!       |
| おさかなが 3びき いる    | There are three fish.       |
| おさかなが 5ひき いる    | There are five fish.        |

**ランダム5〜6問。**

不正解：

```
Almost! Try again!
おしい！もういちど！
```

正解は言わない。

残り1問：

```
さいごの もんだい！
```

全部終わったら Ending へ。

---

# ENDING — 水族館を思い出せた！（ボタンなし）

**話しは3ターンだけ。**

### ターンA

```
Perfect! You remembered a lot about your aquarium!
ぱーふぇくと！このまえの すいぞくかんのこと、たくさん おもいだせたね！
You remembered the decorations and the fish too!
かざりも おさかなも おもいだせたね！
```

---

### ターンB

```
Your teacher might ask you some of the same questions next time!
つぎの レッスンで せんせいが おなじ しつもんを するかもしれないよ！
You'll be ready!
これで ばっちりだね！
```

---

### ターンC

```
If you play Minecraft again, try using today's English too! See you next time!
つぎに まいんくらふとで あそぶときも、きょうの えいごを つかってみてね！また ね！
```

→ **終わったら自動切断**

---

# 管理画面に残る統計（イメージ）

各4択について記録：

- セグメントID / ビートID
- 選んだ選択肢
- 正解か不正解か
- 何回目の挑戦か
- 時刻

Chapter 5では追加で：

- `fishCount`
- 魚の数の自由回答
- その回答を使った4択の正誤

集計：

- 生徒ごとの ○正解
- ×不正解
- 総回答数
- 再挑戦回数
- アクティビティタイムラインに「4択正解」「4択不正解」
