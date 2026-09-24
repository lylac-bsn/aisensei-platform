# ラーニー先生 水族館クエスト Part 3 — Presentation Practice 全セリフ台本

**想定時間：25〜30分**  
**目的：** このあとのリアルレッスンで、自分が作った水族館について英語で発表できるように練習する。

最終的に以下の発表ができる状態を目指す。

```text
I'm [name].
This is my aquarium.
I chose [glassColor] glass.
I put [decoration1] here.
I put [decoration2] here.
I chose [presentationFish].
I like this fish.
```

> **Learny が話す日本語はすべてひらがな**（TTS 読み上げ用。漢字・カタカナは使わない）。

> このファイルは `js/lessons/aquarium-presentation.js` の台本ソースと揃える。フロー／セリフを変えたら **必ずここも更新** する。

---

## 画面・入力のルール（実装どおり）

| 項目 | 内容 |
| --- | --- |
| メイン入力 | Chapter 0 は **8択ボタン**。Chapter 1〜5 / Mini Quiz は **4択ボタン**。Chapter 6〜7 / Final Challenge は発表練習 |
| マイク | **デフォルト OFF（ミュート）**。選択肢表示中はボタン回答を優先。発表練習ではマイク入力を使用できる |
| 8択 / 4択の並び | **毎回ランダム**。正解や特定の選択肢が常に同じ位置にならない |
| Chapter 0 | **自由回答にしない**。Beat 1〜5 はすべて選択式。選んだ内容を変数に保存する |
| 不正解 | `おしい！もういちど！` — **正解は言わない**。同じビートの選択肢を再表示 |
| 章のつなぎ | 「つぎの章へ…」ローディング。**Learny が次章の発話を始めるまで選択肢を出さない** |
| 回答の利用 | Chapter 0 で取得した内容を、その後の4択・Mini Quiz・発表文に自動反映する |
| 発表判定 | Chapter 6〜Final は発音の完全一致を求めない。**意味が伝われば進行する** |
| 選択肢の音声 | **すべての英語の選択肢ボタンに音声再生ボタンを付ける**。音声は Gemini で事前生成したものを再生する |

### 区間ごとの入力

| 区間 | 入力 |
| --- | --- |
| Chapter 0 | **8択**（Beat 1〜5） |
| Chapter 1 | **4択** |
| Chapter 2 | **4択** |
| Chapter 3 | **4択** |
| Chapter 4 | **4択** |
| Chapter 5 | **4択** |
| Mini Quiz | **4択**（3問・Learny は日本語ひらがなのみ） |
| Chapter 6 | 発表練習（2文ずつ） |
| Chapter 7 | 発表練習（前半／後半） |
| Final Challenge | 発表練習（全文 → 穴あき） |
| Ending | ボタンなし |

---

# 選択肢の事前音声 — Gemini 必須

**このレッスン内で表示する英語の選択肢には、すべて音声再生ボタンを付ける。**

音声はボタンを押した瞬間に生成するのではなく、**Gemini を使って事前に生成・保存した音声**を再生する。

## Gemini 音声生成ルール

- 画面に表示される **英語の選択肢テキストと完全に同じ文**を読み上げる
- 正解だけでなく、**誤答を含むすべての選択肢**の音声を作る
- 単語だけの選択肢も対象（例: `blue`, `Coral`, `Salmon`）
- 自然で明瞭な英語発音にする
- 子ども向けに聞き取りやすい速さにする
- 文の前後に説明・番号・追加フレーズを入れない
- 1つの選択肢につき1つの音声ファイルを用意する
- スピーカーボタンを押したときは、対応する事前生成音声だけを再生する
- **スピーカーボタン押下時に Gemini API を呼ばない**
- 同じ英文は可能な限り同じ音声アセットを再利用する

## 動的な選択肢の音声

`[glassColor]` / `[decoration1]` / `[decoration2]` / `[fishColor]` / `[presentationFish]` のように有限リストから生成できる英文は、**使用可能な組み合わせを Gemini で事前生成しておく**。

例：

```text
I chose blue glass.
I chose red glass.
I put coral here.
I put amethyst here.
I chose a blue tropical fish.
I chose a salmon.
```

`[name]` を含む文は生徒ごとに変わるため、**レッスン開始時または `[name]` が確定した時点で Gemini で1回だけ生成してキャッシュし、選択肢を表示する前に再生可能な状態にする**。

例：

```text
I'm Yuki.
This is Yuki.
I like Yuki.
My aquarium is Yuki.
```

**重要：** Learny が問題文の中で正解の英語を先に読み上げない。選択肢の英語を聞きたい場合は、子どもが各選択肢のスピーカーボタンを押す。

---

# 保存する変数

```text
[name]
[glassColor]
[decoration1]
[decoration2]
[fishType]
[fishColor]
[presentationFish]
```

- Chapter 0 で保存した値は **セッション終了まで保持する**
- 途中で勝手に別の色・飾り・魚へ変更しない
- `[presentationFish]` は魚の名詞句を保存する。例: `blue tropical fish`, `salmon`, `cod`, `puffer fish`
- `I chose ...` に入れるときは必要な冠詞を自動補完する

### 冠詞の表示ルール

| `[presentationFish]` | 発表文 |
| --- | --- |
| `blue tropical fish` | `I chose a blue tropical fish.` |
| `salmon` | `I chose a salmon.` |
| `cod` | `I chose a cod.` |
| `puffer fish` | `I chose a puffer fish.` |

---

# 使用できる飾りリスト

回答は以下のどれかに正規化する。

- Coral
- Red Coral
- Pink Coral
- Purple Coral
- Blue Coral
- Yellow Coral
- Coral Fan
- Kelp
- Seagrass
- Coral Block
- Dead Coral Block
- Soul Sand
- Amethyst
- Moss Carpet

色つき Coral については以下のみ使用する。

- Red
- Pink
- Purple
- Blue
- Yellow

---

# 使用できる魚リスト

## 魚の種類

- Cod
- Salmon
- Tropical Fish
- Puffer Fish

## Tropical Fish の色

- White
- Orange
- Magenta
- Light Blue
- Yellow
- Lime
- Pink
- Gray
- Light Gray
- Cyan
- Purple
- Blue
- Brown
- Green
- Red
- Black

---

# CHAPTER 0 — どんな水族館を作ったか思い出そう（8択）

Chapter 0 は **自由回答を使わない**。Beat 1〜5 はすべて選択式にする。

選択肢は毎回ランダム表示。英語表記の各選択肢には **Gemini で事前生成した音声再生ボタン**を付ける。

Chapter 0 は「英語の正解を当てる」章ではなく、**本人が作った水族館の内容を選んで保存する章**。

---

## Beat 1 — ガラスの色を聞く（8択）

**Learny:**  
`First, let's remember your aquarium! What color glass did you choose?`  
`まずは じぶんの すいぞくかんを おもいだそう！なにいろの がらすを えらんだ？`

**8択（各ボタンに事前生成音声 🔊）:**

- blue
- red
- green
- yellow
- orange
- pink
- purple
- white

→ タップした色を小文字に正規化して `[glassColor]` に保存する。  
例：`blue` → `[glassColor] = blue`

※ここでは正解／不正解判定をしない。  
※ラーニー先生が色を勝手に決めない。  
※以降の Chapter 2 / Mini Quiz / 発表文では、**ここで本人が選んだ色を必ず使う**。

---

## Beat 2 — 飾り1を聞く（8択）

**Learny:**  
`What did you put in your aquarium?`  
`すいぞくかんに なにを おいた？`

**8択（各ボタンに事前生成音声 🔊）:**

- Coral
- Red Coral
- Pink Coral
- Blue Coral
- Yellow Coral
- Kelp
- Amethyst
- Soul Sand

→ 選んだ値を正規化して `[decoration1]` に保存する。

例：

```text
Coral → coral
Kelp → kelp
Amethyst → amethyst
Soul Sand → soul sand
```

※ここでは正解／不正解判定をしない。

---

## Beat 3 — 飾り2を聞く（8択）

**Learny:**  
`Nice! What else did you put in your aquarium?`  
`いいね！ほかには なにを おいた？`

Beat 2 で選んだ `[decoration1]` は選択肢から外し、**別の飾りを8個表示**する。

この Beat では以下の候補プールを使う。

- Coral
- Red Coral
- Pink Coral
- Purple Coral
- Blue Coral
- Yellow Coral
- Kelp
- Amethyst
- Soul Sand

→ `[decoration1]` と同じ値を除外すると8個残る。  
→ その8個をランダム表示する。  
→ 各ボタンに Gemini 事前生成音声 `🔊` を付ける。

→ 選んだ値を `[decoration2]` に保存する。

※ `[decoration2]` は `[decoration1]` と違うものにする。  
※ここでは正解／不正解判定をしない。

---

## Beat 4 — 魚の種類を聞く（8択）

**Learny:**  
`What fish did you choose?`  
`どんな おさかなを えらんだ？`

Part 3 で使用できる魚は **4種類だけ**なので、新しい魚は追加しない。  
8択にするため、4種類の魚に加えて、Part 3 内にすでに存在する水族館アイテム4つを distractor として表示する。

**8択（各ボタンに事前生成音声 🔊）:**

- Cod
- Salmon
- Tropical Fish
- Puffer Fish
- Coral
- Kelp
- Amethyst
- Soul Sand

**保存可能な選択肢:**

- Cod → `[fishType] = cod`
- Salmon → `[fishType] = salmon`
- Tropical Fish → `[fishType] = tropical fish`
- Puffer Fish → `[fishType] = puffer fish`

**Coral / Kelp / Amethyst / Soul Sand を押した場合:**  
`おしい！もういちど！`  
→ 正解は言わず、同じ8択を再表示する。  
→ `[fishType]` は更新しない。

### Tropical Fish 以外を選んだ場合

- cod → `[presentationFish] = cod`
- salmon → `[presentationFish] = salmon`
- puffer fish → `[presentationFish] = puffer fish`

→ Beat 5 をスキップして **Chapter 1 へ**。

### Tropical Fish を選んだ場合

→ **Beat 5 へ**。

---

## Beat 5 — Tropical Fish の色を聞く（8択）

`[fishType] = tropical fish` の場合のみ表示する。

**Learny:**  
`What color was your tropical fish?`  
`ねったいぎょは なにいろだった？`

**8択（各ボタンに事前生成音声 🔊）:**

- blue
- orange
- red
- yellow
- pink
- purple
- white
- green

→ 選んだ色を小文字で `[fishColor]` に保存する。  
→ `[presentationFish] = [fishColor] tropical fish`

例：

```text
blue → [fishColor] = blue
[presentationFish] = blue tropical fish
```

※ここでは正解／不正解判定をしない。  
→ **Chapter 1 へ**。

---

# CHAPTER 1 — 自己紹介から練習しよう（4択）

## Beat 1 — I'm [name].

**Learny:**  
`Let's start your presentation!`  
`「わたしは [name] です」の えいごを えらんでね！`

**4択（各ボタンに事前生成音声 🔊）:**

- I'm [name].
- This is [name].
- I like [name].
- My aquarium is [name].

→ **正解: `I'm [name].`**

※ `[name]` を含む4つの音声は、生徒名が確定した時点で Gemini で事前生成してキャッシュする。  
※ Learny が `I'm [name].` を先に読み上げない。

---

## Beat 2 — This is my aquarium.

**Learny:**  
`Now introduce your aquarium!`  
`「これが わたしの すいぞくかんです」の えいごを えらんでね！`

**4択（各ボタンに事前生成音声 🔊）:**

- This is my aquarium.
- This is my fish.
- I like my aquarium.
- I chose my aquarium.

→ **正解: `This is my aquarium.`**  
→ **Chapter 2 へ**

---

# CHAPTER 2 — ガラスの色を紹介しよう（4択）

Chapter 0 で保存した `[glassColor]` を使用する。

例：

```text
[glassColor] = blue
```

## Beat 1

**Learny:**  
`Do you remember the color you told me?`  
`「あおい がらすを えらびました」の えいごを えらんでね！`

※日本語側の色は `[glassColor]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I chose blue glass.
- I put blue glass here.
- I found blue glass.
- I chose red glass.

→ **正解: `I chose blue glass.`**

### 動的生成

正解：

```text
I chose [glassColor] glass.
```

誤答：

```text
I put [glassColor] glass here.
I found [glassColor] glass.
I chose [otherColor] glass.
```

- `[otherColor]` は Chapter 0 Beat 1 の8色から選ぶ
- `[otherColor] != [glassColor]`
- 4つすべてに Gemini 事前生成音声を割り当てる

**重要：** Chapter 0 で本人が選んだ色を、必ず正解の選択肢に入れる。  
→ **Chapter 3 へ**

---

# CHAPTER 3 — 飾りを紹介しよう（4択）

## Beat 1 — decoration1

例：

```text
[decoration1] = coral
```

**Learny:**  
`You told me you put coral in your aquarium!`  
`「ここに さんごを おきました」の えいごを えらんでね！`

※英語・日本語のアイテム名は `[decoration1]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I put coral here.
- I chose coral.
- I found coral.
- I like this fish.

→ **正解: `I put coral here.`**

### 動的生成

```text
I put [decoration1] here.
I chose [decoration1].
I found [decoration1].
I like this fish.
```

→ 全候補の音声を Gemini で事前生成する。

---

## Beat 2 — decoration2

例：

```text
[decoration2] = amethyst
```

**Learny:**  
`And you also had amethyst!`  
`「ここに あめじすとを おきました」の えいごを えらんでね！`

※英語・日本語のアイテム名は `[decoration2]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I put amethyst here.
- I chose amethyst.
- I found amethyst.
- I need amethyst.

→ **正解: `I put amethyst here.`**

### 動的生成

```text
I put [decoration2] here.
I chose [decoration2].
I found [decoration2].
I need [decoration2].
```

→ 全候補の音声を Gemini で事前生成する。  
→ **Chapter 4 へ**

---

# CHAPTER 4 — 魚を紹介しよう（4択）

Chapter 0 で本人が選んだ魚を使用する。

---

## Tropical Fish の場合

例：

```text
[fishType] = tropical fish
[fishColor] = blue
[presentationFish] = blue tropical fish
```

**Learny:**  
`You chose a blue tropical fish!`  
`「あおい ねったいぎょを えらびました」の えいごを えらんでね！`

※色は `[fishColor]` に合わせて変える。

**4択（各ボタンに事前生成音声 🔊）:**

- I chose a blue tropical fish.
- I found a blue tropical fish.
- I put a blue tropical fish here.
- I like blue glass.

→ **正解: `I chose a blue tropical fish.`**

### 動的生成

```text
I chose a [fishColor] tropical fish.
I found a [fishColor] tropical fish.
I put a [fishColor] tropical fish here.
I like [fishColor] glass.
```

→ Chapter 0 Beat 5 で使用する8色分を Gemini で事前生成する。

---

## Salmon の場合

**Learny:**  
`You chose a salmon!`  
`「さけを えらびました」の えいごを えらんでね！`

**4択（各ボタンに事前生成音声 🔊）:**

- I chose a salmon.
- I found a salmon.
- I put salmon here.
- I need a salmon.

→ **正解: `I chose a salmon.`**

---

## Cod の場合

**4択（各ボタンに事前生成音声 🔊）:**

- I chose a cod.
- I found a cod.
- I put cod here.
- I need a cod.

→ **正解: `I chose a cod.`**

---

## Puffer Fish の場合

**4択（各ボタンに事前生成音声 🔊）:**

- I chose a puffer fish.
- I found a puffer fish.
- I put a puffer fish here.
- I need a puffer fish.

→ **正解: `I chose a puffer fish.`**

→ **Chapter 5 へ**

---

# CHAPTER 5 — 好きな魚を伝えよう（4択）

## Beat 1

**Learny:**  
`You chose your fish. Now tell us how you feel about it!`  
`「この おさかなが すきです」の えいごを えらんでね！`

**4択（各ボタンに事前生成音声 🔊）:**

- I like this fish.
- I chose this fish.
- I found this fish.
- I put this fish here.

→ **正解: `I like this fish.`**  
→ **Mini Quiz へ**

---

# 不正解時（Chapter 1〜5 / Mini Quiz 共通）

**Learny:**

```text
おしい！もういちど！
```

- **正解は言わない**
- 同じビートの選択肢を再表示する
- 選択肢の並びは再度ランダムにしてよい
- 誤答を押した場合も、その選択肢の Gemini 事前生成音声は通常どおり再生できる

---

# MINI QUIZ — 発表フレーズを確認しよう（4択）

Learny は **日本語ひらがなのみ**。  
Learny 自身は英語の選択肢を読み上げない。  
英語を聞きたい場合は、各選択肢の **Gemini 事前生成音声ボタン `🔊`** を使う。

並びは毎回ランダム。

---

## Q1 — ガラス

例：`[glassColor] = blue`

**Learny:**  
`「あおい がらすを えらびました」は えいごで？`

※色は `[glassColor]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I chose blue glass.
- I put blue glass here.
- I chose red glass.
- I found blue glass.

→ **正解: `I chose [glassColor] glass.`**

---

## Q2 — 飾り

例：`[decoration1] = coral`

**Learny:**  
`「ここに さんごを おきました」は えいごで？`

※アイテム名は `[decoration1]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I put coral here.
- I chose coral.
- I found coral.
- I like coral fish.

→ **正解: `I put [decoration1] here.`**

---

## Q3 — 魚

例：`[presentationFish] = blue tropical fish`

**Learny:**  
`「あおい ねったいぎょを えらびました」は えいごで？`

※魚・色は `[presentationFish]` に合わせて変える。

**4択例（各ボタンに事前生成音声 🔊）:**

- I chose a blue tropical fish.
- I found a blue tropical fish.
- I put a blue tropical fish here.
- I chose blue glass.

→ **正解: `I chose a blue tropical fish.`**

※ Cod / Salmon / Puffer Fish の場合は Chapter 4 と同じ冠詞ルールを使う。  
→ **Chapter 6 へ**

---

# CHAPTER 6 — 2文ずつ発表しよう

ここからは4択で覚えるだけではなく、**実際に声に出して発表する練習**に入る。

- 画面に2文を表示する
- 子どもが2文を続けて言う
- 発音の完全一致は求めない
- 意味が伝われば次へ進む
- MCQ 選択肢ではないため、ここでは選択肢ボタンを出さない

---

## Set 1

画面表示：

```text
I'm [name].
This is my aquarium.
```

**Learny:**  
`Let's say these two sentences together!`  
`この 2つを つづけて いってみよう！`

---

## Set 2

画面表示：

```text
I chose [glassColor] glass.
I put [decoration1] here.
```

---

## Set 3

画面表示：

```text
I put [decoration2] here.
I chose [presentationFish].
```

`I chose ...` は冠詞を自動補完する。

例：

```text
I chose a blue tropical fish.
```

---

## Set 4

画面表示：

```text
I chose [presentationFish].
I like this fish.
```

`I chose ...` は冠詞を自動補完する。

→ **Chapter 7 へ**

---

# CHAPTER 7 — 半分ずつ発表しよう

## 前半

画面表示：

```text
I'm [name].
This is my aquarium.
I chose [glassColor] glass.
I put [decoration1] here.
```

**Learny:**  
`Great! Let's try the first half!`  
`いいね！まずは まえの はんぶんを いってみよう！`

---

## 後半

画面表示：

```text
I put [decoration2] here.
I chose [presentationFish].
I like this fish.
```

`I chose ...` は冠詞を自動補完する。

**Learny:**  
`Nice! Now let's try the second half!`  
`いいね！つぎは うしろの はんぶんを いってみよう！`

→ **Final Challenge へ**

---

# FINAL CHALLENGE — 最初から発表しよう

**Learny:**  
`Final presentation practice! Let's go!`  
`さいごの はっぴょう れんしゅうだよ！れっつごー！`

画面には **Chapter 0 で本人が選んだ内容を使った、その子専用の発表文**を表示する。

例：

```text
I'm Yuki.
This is my aquarium.
I chose blue glass.
I put coral here.
I put amethyst here.
I chose a blue tropical fish.
I like this fish.
```

---

## 1回目 — 全文表示

全文を表示する。  
子どもが上から順番に読む。

発音の完全一致は求めない。  
意味が伝われば進行する。

---

## 2回目 — 一部を穴あきにする

例：

```text
I'm Yuki.
This is my ________.
I chose blue ________.
I put ________ here.
I put ________ here.
I chose a blue ________ fish.
I like this ________.
```

※子どもが難しそうなら **全文表示のままでもよい**。

→ 完了したら **Ending へ**。

---

# リアクションフレーズ

発表途中や最後に、Learny が自然に使ってよい。

```text
That looks great!
みためが いいね！
```

```text
That's cool!
すごいね！かっこいい！
```

```text
So creative!
はっそうが すごいね！
```

```text
Nice one!
いいね！
```

- 毎回全部は使わない
- 発表の途中で邪魔しない
- 1セクションが終わった時などに **1つだけ**使う

---

# ENDING — 発表の準備ばっちり！（ボタンなし）

## ターン A

```text
Great job! You practiced your whole presentation!
ぐれーと じょぶ！さいしょから さいごまで れんしゅう できたね！
```

---

## ターン B

```text
You talked about your glass, decorations, and fish!
がらすも かざりも おさかなも えいごで いえたね！
```

---

## ターン C

```text
Now you're ready to show your aquarium to your teacher! Good luck!
これで せんせいの まえでも はっぴょう できるね！がんばってね！
```

→ **終了**

---

# 実装上の重要ルール

Chapter 0 で取得した以下の値は **セッション終了まで保持する**。

```text
[glassColor]
[decoration1]
[decoration2]
[fishType]
[fishColor]
[presentationFish]
```

たとえば Chapter 0 で、

- Blue
- Coral
- Amethyst
- Tropical Fish
- Orange

を選んだ場合、その後の練習をすべて以下に統一する。

```text
I chose blue glass.
I put coral here.
I put amethyst here.
I chose an orange tropical fish.
I like this fish.
```

途中で勝手に別の色・飾り・魚へ変更しない。  
**本人の水族館について発表している感覚を最優先にする。**

## 選択肢音声の最終チェック

実装完了前に、Chapter 0〜5 と Mini Quiz の **全選択肢**について以下を確認する。

- 表示される英語テキストに対応する Gemini 事前生成音声が存在する
- 正解だけでなく誤答にも音声がある
- 動的変数を入れた文にも対応音声がある
- `[name]` を含む文は、その生徒用の音声が選択肢表示前に生成済み
- スピーカーボタンからライブ生成を行わない
- スピーカーボタンを押しても回答として送信されない
- 音声再生と選択肢タップは別操作として扱う
- Mini Quiz では Learny が英語の答えを自動読み上げず、必要な場合だけ子どもがスピーカーを押す
