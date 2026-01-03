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

    // =================================================
    // 3. ログイン状態の監視
    // =================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is logged in - check access level and redirect
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (!snap.exists()) {
                loginError.textContent = 'エラー: ユーザーデータが見つかりません。';
                await signOut(auth);
                return;
            }

            const userData = snap.data();
            const userAccessLevel = userData?.accessLevel;
            
            // Validate access level exists
            if (userAccessLevel === undefined || userAccessLevel === null) {
                console.error("Access level not set for user:", user.uid);
                await signOut(auth);
                loginError.textContent = 'エラー: アクセスレベルが設定されていません。管理者に連絡してください。';
                return;
            }
            
            // Parse and validate accessLevel (should be 1, 2, or 3)
            const accessLevel = parseInt(userAccessLevel, 10);
            
            if (isNaN(accessLevel) || accessLevel < 1 || accessLevel > 3) {
                console.error("Invalid access level for user:", user.uid, "Level:", accessLevel);
                await signOut(auth);
                loginError.textContent = 'エラー: 無効なアクセスレベルです。管理者に連絡してください。';
                return;
            }
            
            console.log("✓ User access level verified:", accessLevel);
            loginError.textContent = ''; // Clear any previous error messages

            // Redirect user to appropriate page based on access level
            let redirectPage = '';
            switch(accessLevel) {
                case 1:
                    redirectPage = 'page1.html';
                    break;
                case 2:
                    redirectPage = 'page2.html';
                    break;
                case 3:
                    redirectPage = 'page3.html';
                    break;
                default:
                    console.error("Unexpected access level:", accessLevel);
                    await signOut(auth);
                    loginError.textContent = 'エラー: 無効なアクセスレベルです。管理者に連絡してください。';
                    return;
            }
            
            // Redirect to the appropriate page
            console.log(`Redirecting user to ${redirectPage}`);
            window.location.href = redirectPage;
        } else {
            // User is not logged in - show login screen
            loginView.style.display = 'block';
        }
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
