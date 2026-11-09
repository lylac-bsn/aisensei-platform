# AI Sensei / Learny

A Firebase-powered educational platform helping Japanese children learn English through interactive homework and live classroom activities.

## Features

- **Role Hubs**: Dedicated dashboards for students, teachers, parents, and admins
- **Class Booking with Tickets**: Parents purchase ticket packs; teachers schedule lessons
- **Homework Packs (Learny Voice)**: Pre-generated TTS voice clips guide students through vocabulary, sentences, and quizzes
- **Attendance & Reports**: Track student participation and progress over time
- **Parent-Child Linking**: Parents monitor their children's homework and class activity
- **Inbox & Push Notifications**: Keep families informed of upcoming lessons and updates
- **COllAB Live Quizzes**: Real-time multiplayer classroom activities with physics-based interactions
- **Admin & Cost Dashboard**: Monitor usage, costs, and platform health

## Live Platform

[https://learnie.cc/](https://learnie.cc/)

## Project Structure

```
├── functions/         # Cloud Functions (TTS, booking, COllAB, push, etc.)
├── js/                # Client-side JavaScript modules
├── audio/             # Pre-generated homework voice assets
├── scripts/           # Maintenance and check scripts
├── firebase.json      # Hosting, Firestore, Storage configuration
├── firestore.rules    # Security rules for Firestore
└── storage.rules      # Security rules for Cloud Storage
```

## Development

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Access to the `ai-sensei-8849b` Firebase project

### Running Tests

Cloud Functions tests:

```bash
cd functions
npm install
npm test
```

Check scripts (static analysis):

```bash
node scripts/check-admin-student-sync.mjs
# (and other scripts/check-*.mjs)
```

### Local Preview

```bash
firebase serve --only hosting
```

Then open [http://localhost:5000](http://localhost:5000).

### Deployment

Deploy hosting, functions, and rules:

```bash
firebase deploy --project ai-sensei-8849b
```

Deploy only hosting:

```bash
firebase deploy --only hosting --project ai-sensei-8849b
```

Deploy only functions:

```bash
firebase deploy --only functions --project ai-sensei-8849b
```

## TTS Voice Generation

Homework voice clips are generated via Cloud Functions using Chirp TTS / Gemini TTS (Vertex AI `generateContent`). The `synthesizeHomeworkVoice` function handles batch TTS requests from teachers when creating homework packs.

To regenerate legacy clips with the latest TTS model:

```bash
node scripts/regen-homework-voice-gemini.mjs --dry-run
node scripts/regen-homework-voice-gemini.mjs
```

## Contact

For platform access inquiries: **lylac.bsn@gmail.com**

---

# AI Sensei / Learny（日本語）

日本の子どもたちがインタラクティブな宿題やライブ授業を通じて楽しく英語を学べる、Firebase ベースの教育プラットフォームです。

## 主な機能

- **ロールハブ**: 生徒・先生・保護者・管理者それぞれ専用のダッシュボード
- **チケット制クラス予約**: 保護者がチケットパックを購入、先生がレッスンをスケジュール
- **宿題パック（Learny 音声）**: 事前生成された TTS 音声で単語・文章・クイズを学習
- **出席管理とレポート**: 生徒の参加状況と進捗を追跡
- **保護者-子供リンク**: 保護者がお子さまの宿題やクラス活動を確認
- **受信箱とプッシュ通知**: 予定レッスンや更新情報をお知らせ
- **COllAB ライブクイズ**: 物理演算を活用したリアルタイムマルチプレイヤー教室アクティビティ
- **管理・コストダッシュボード**: 利用状況、コスト、プラットフォームの状態を監視

## ライブ版

[https://learnie.cc/](https://learnie.cc/)

## お問い合わせ

**lylac.bsn@gmail.com**
