// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4QAYLn2KBxAZ6HZNpzlHS4aNZE9KwAtQ",
  authDomain: "ai-sensei-8849b.firebaseapp.com",
  projectId: "ai-sensei-8849b",
  storageBucket: "ai-sensei-8849b.firebasestorage.app",
  messagingSenderId: "483139385570",
  appId: "1:483139385570:web:cc62d4391366a27db406bb",
  measurementId: "G-1SSEQQ620T"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {

    // =================================================
    // 2. HTML要素の取得
    // =================================================
    const loginView = document.getElementById('login-view');
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const levelSelectionOverlay = document.getElementById('level-selection-overlay');
    const levelBeginnerBtn = document.getElementById('level-beginner');
    const levelIntermediateBtn = document.getElementById('level-intermediate');
    const levelAdvancedBtn = document.getElementById('level-advanced');

    // =================================================
    // 3. ログイン状態の監視
    // =================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in - check if user data exists
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (!snap.exists()) {
                loginError.textContent = 'エラー: ユーザーデータが見つかりません。';
                await signOut(auth);
                return;
            }

            // Show level selection popup
            loginView.style.display = 'none';
            levelSelectionOverlay.style.display = 'flex';
        } else {
            // User is not logged in - show login screen
            loginView.style.display = 'grid';
            levelSelectionOverlay.style.display = 'none';
        }
    });

    // =================================================
    // 3.5. レベル選択処理
    // =================================================
    levelBeginnerBtn.addEventListener('click', () => {
        window.location.href = 'page1.html';
    });

    levelIntermediateBtn.addEventListener('click', () => {
        window.location.href = 'page2.html';
    });

    levelAdvancedBtn.addEventListener('click', () => {
        window.location.href = 'page3.html';
    });

    // =================================================
    // 4. ログイン処理
    // =================================================
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const email = emailInput.value;
        const password = passwordInput.value;
        signInWithEmailAndPassword(auth, email, password)
            .catch(error => {
                loginError.textContent = 'メールアドレスまたはパスワードが間違っています。';
                console.error("Login Error:", error);
            });
    });
});
