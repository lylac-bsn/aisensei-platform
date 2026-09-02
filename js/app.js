// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { mountLevelPicker } from "./level-picker.js";

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

    const loginView = document.getElementById('login-view');
    const loginForm = document.getElementById('login-form');
    const displayNameInput = document.getElementById('display-name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const levelSelectionOverlay = document.getElementById('level-selection-overlay');

    function setLoginLoading(loading) {
        if (!loginSubmitBtn) return;
        loginSubmitBtn.classList.toggle('is-loading', loading);
        loginSubmitBtn.disabled = loading;
        loginSubmitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
        const label = loginSubmitBtn.querySelector('span');
        if (label) label.textContent = loading ? 'ログイン中…' : 'ログイン';
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (!snap.exists()) {
                loginError.textContent = 'アカウントが見つかりません。先生に連絡してください。';
                await signOut(auth);
                return;
            }

            loginView.style.display = 'none';
            mountLevelPicker(levelSelectionOverlay, {
                onNavigate: (page) => {
                    window.location.href = page;
                },
                onLogout: async () => {
                    await signOut(auth);
                    levelSelectionOverlay.hidden = true;
                    levelSelectionOverlay.classList.remove('is-open');
                    loginView.style.display = 'grid';
                },
            });
        } else {
            loginView.style.display = 'grid';
            levelSelectionOverlay.hidden = true;
            levelSelectionOverlay.classList.remove('is-open');
            setLoginLoading(false);
        }
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const displayName = displayNameInput.value.trim().substring(0, 50);
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!displayName) {
            loginError.textContent = 'なまえを入力してください。';
            displayNameInput.focus();
            return;
        }

        setLoginLoading(true);
        signInWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                const userRef = doc(db, "users", userCredential.user.uid);
                await updateDoc(userRef, { displayName: displayName });
            })
            .catch(() => {
                loginError.textContent = 'メールアドレスまたはパスワードが正しくありません。';
                setLoginLoading(false);
            });
    });
});
