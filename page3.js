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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Required access level for this page
const REQUIRED_ACCESS_LEVEL = 3;

document.addEventListener('DOMContentLoaded', () => {

    // =================================================
    // 2. HTML要素の取得
    // =================================================
    const appView = document.getElementById('app-view');
    const logoutButton = document.getElementById('logout-button');
    const userEmailDisplay = document.getElementById('user-email');
    const timerDisplay = document.getElementById('timer-display');
    const appContent = document.getElementById('app-content');
    const timeUpOverlay = document.getElementById('time-up-overlay');

    let mainTimerInterval = null;
    let saveTimerInterval = null;
    let currentUser = null;
    let currentRemainingTime = 0;

    // =================================================
    // 3. ログイン状態の監視
    // =================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check access level before allowing access
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (!snap.exists()) {
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }

            const userData = snap.data();
            const userAccessLevel = userData?.accessLevel;
            
            // Validate access level exists
            if (userAccessLevel === undefined || userAccessLevel === null) {
                console.error("Access level not set for user:", user.uid);
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }
            
            const accessLevel = parseInt(userAccessLevel, 10);
            
            // Check if user has correct access level for this page
            if (accessLevel !== REQUIRED_ACCESS_LEVEL) {
                console.warn(`User access level ${accessLevel} does not match required level ${REQUIRED_ACCESS_LEVEL}`);
                await signOut(auth);
                alert(`このページにアクセスする権限がありません。\nあなたのアクセスレベル: ${accessLevel}\n必要なアクセスレベル: ${REQUIRED_ACCESS_LEVEL}`);
                window.location.href = 'index.html';
                return;
            }

            // User has correct access level, proceed
            currentUser = user;
            appView.style.display = 'block';
            timeUpOverlay.style.display = 'none';
            if (appContent) appContent.style.pointerEvents = 'auto';
            userEmailDisplay.textContent = user.email ?? "";

            const timerData = userData?.timer || null;
            startTimerForUser(user.uid, timerData);
        } else {
            // Not logged in - redirect to login page
            try { await saveTime(true); } catch {}
            currentUser = null;
            window.location.href = 'index.html';
        }
    });

    // =================================================
    // 5. ログアウト処理
    // =================================================
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // Redirect to login page after successful logout
            window.location.href = 'index.html';
        } catch (error) {
            console.error("Logout error:", error);
            // Still redirect even if there's an error
            window.location.href = 'index.html';
        }
    });

    // Save time when the page is hidden or closed
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

    function saveTime(isFinalSave = false) {
        if (!currentUser || isNaN(currentRemainingTime)) return;

        const userDocRef = doc(db, 'users', currentUser.uid);
        updateDoc(userDocRef, { 
            remainingTime: currentRemainingTime, 
            updatedAt: serverTimestamp()
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

            currentRemainingTime = parseInt(docSnap.data().remainingTime, 10) || 0;
            updateTimerDisplay(currentRemainingTime);

            if (currentRemainingTime <= 0) {
                lockApp("利用時間が終了しました。");
                return;
            }

            mainTimerInterval = setInterval(() => {
                currentRemainingTime--;
                updateTimerDisplay(currentRemainingTime);
                if (currentRemainingTime <= 0) {
                    lockApp("利用時間が終了しました。");
                }
            }, 1000);

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

