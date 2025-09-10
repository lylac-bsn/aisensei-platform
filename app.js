// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig );
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {

    // =================================================
    // 2. HTML要素の取得
    // =================================================
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const logoutButton = document.getElementById('logout-button');
    const userEmailDisplay = document.getElementById('user-email');
    const timerDisplay = document.getElementById('timer-display');
    const appContent = document.getElementById('app-content');
    const timeUpOverlay = document.getElementById('time-up-overlay');

    let mainTimerInterval = null;
    let saveTimerInterval = null;
    let currentUser = null;
    let currentRemainingTime = 0; // ★★★ NEW: A global variable to track the current time

    // =================================================
    // 3. ログイン状態の監視
    // =================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            loginView.style.display = 'none';
            appView.style.display = 'block';
            timeUpOverlay.style.display = 'none';
            if (appContent) appContent.style.pointerEvents = 'auto';
            userEmailDisplay.textContent = user.email ?? "";

            // 🔎 Read timer data (adjust the path to where you store timers)
            // Option A: timer fields live on the user doc:
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            const timerData = snap.exists() ? snap.data()?.timer : null;

            // Option B: timer doc under a private subcollection:
            // const timerRef = doc(db, "users", user.uid, "private", "timer");
            // const snap = await getDoc(timerRef);
            // const timerData = snap.exists() ? snap.data() : null;

            startTimerForUser(user.uid, timerData); // pass your timer data in
        } else {
            try { await saveTime(true); } catch {}
            currentUser = null;
            loginView.style.display = 'block';
            appView.style.display = 'none';
            clearAllIntervals();
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

    // =================================================
    // 5. ログアウト処理
    // =================================================
    logoutButton.addEventListener('click', () => {
        // The onAuthStateChanged handler will catch the final save.
        signOut(auth);
    });

    // ★★★ THE KEY FIX: Save time when the page is hidden or closed ★★★
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveTime(true);
        }
    });

    // =================================================
    // 6. HELPER FUNCTIONS
    // =================================================
    function clearAllIntervals() {
        if (mainTimerInterval) clearInterval(mainTimerInterval);
        if (saveTimerInterval) clearInterval(saveTimerInterval);
        mainTimerInterval = null;
        saveTimerInterval = null;
    }

    // A new, dedicated function for saving time
    function saveTime(isFinalSave = false) {
        if (!currentUser || isNaN(currentRemainingTime)) return;

        const userDocRef = doc(db, 'users', currentUser.uid);
        updateDoc(userDocRef, { remainingTime: currentRemainingTime, updatedAt: serverTimestamp(),   // <- required by your rules
    });
        
        if (isFinalSave) {
            console.log(`Final time saved on page exit: ${currentRemainingTime}`);
        } else {
            console.log(`Periodic time save: ${currentRemainingTime}`);
        }
    }

    // =================================================
    // 7. タイマー機能
    // =================================================
    async function startTimerForUser(userId) {
        clearAllIntervals();
        const userDocRef = doc(db, 'users', userId);

        try {
            const docSnap = await getDoc(userDocRef);
            if (!docSnap.exists() || docSnap.data().remainingTime === undefined) {
                lockApp("エラー: ユーザーデータが見つかりません。");
                return;
            }

            // Set the global time variable
            currentRemainingTime = parseInt(docSnap.data().remainingTime, 10) || 0;
            updateTimerDisplay(currentRemainingTime);

            if (currentRemainingTime <= 0) {
                lockApp("利用時間が終了しました。");
                return;
            }

            mainTimerInterval = setInterval(() => {
                currentRemainingTime--; // Decrement the global variable
                updateTimerDisplay(currentRemainingTime);
                if (currentRemainingTime <= 0) {
                    lockApp("利用時間が終了しました。");
                }
            }, 1000);

            // The periodic save is now a backup, not the primary method
            saveTimerInterval = setInterval(() => saveTime(false), 30000);

        } catch (error) {
            console.error("Error in startTimerForUser:", error);
            lockApp("エラーが発生しました。");
        }
    }

    function updateTimerDisplay(seconds) {
        if (isNaN(seconds) || seconds < 0) seconds = 0;
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${h}:${m}:${s}`;
    }

    function lockApp(message) {
        // On lock, do one final save to ensure the time is exactly 0.
        currentRemainingTime = 0;
        saveTime(true);
        clearAllIntervals();
        updateTimerDisplay(0);
        timerDisplay.textContent = message;
        timeUpOverlay.style.display = 'flex';
        if (appContent) {
            appContent.style.pointerEvents = 'none';
        }
    }
});
