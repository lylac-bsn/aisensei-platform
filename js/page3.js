// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { initProgressSync, scheduleProgressSync } from "./progress-sync.js?v=20260928-variant-kind";
import { logUserActivity } from "./activity-log.js";
import { getActiveLevelInfo } from "./lesson-engine.js?v=20260928-admin-sync";
import { openLevelSwitcher } from "./level-picker.js";

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
    const appView = document.getElementById('app-view');
    const logoutButton = document.getElementById('logout-button');
    const levelSwitcherBtn = document.getElementById('level-switcher-btn');
    const userEmailDisplay = document.getElementById('user-email');
    const appContent = document.getElementById('app-content');
    const timeUpOverlay = document.getElementById('time-up-overlay');

    let mainTimerInterval = null;
    let saveTimerInterval = null;
    let currentUser = null;

    // =================================================
    // 3. ログイン状態の監視
    // =================================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if user data exists
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            
            if (!snap.exists()) {
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }

            const userData = snap.data();

            // User is logged in, proceed
            currentUser = user;
            appView.style.display = 'block';
            timeUpOverlay.style.display = 'none';
            if (appContent) appContent.style.pointerEvents = 'auto';
            userEmailDisplay.textContent = userData.displayName || user.email || "";
            syncVoiceUserProfile(userData.displayName || user.email || "");

            const timerData = userData?.timer || null;
            startTimerForUser(user.uid, timerData);

            initProgressSync(db, user.uid);
        } else {
            // Not logged in - redirect to login page
            try { await saveTime(true); } catch {}
            currentUser = null;
            window.location.href = 'index.html';
        }
    });

    // =================================================
    // 4. レベル切替処理
    // =================================================
    levelSwitcherBtn.addEventListener('click', () => {
        openLevelSwitcher('page3.html');
    });

    // =================================================
    // 5. ログアウト処理
    // =================================================
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            window.location.href = 'index.html';
        }
    });

    document.getElementById('time-up-logout-btn')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch {
            // ignore
        }
        window.location.href = 'index.html';
    });

    // Save time when the page is hidden or closed
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            saveTime(true);
        }
    });

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'gc_quest_progress_update' && currentUser) {
            scheduleProgressSync(db, currentUser.uid);
        }
        if (e.data?.type === 'gc_badges_earned' && currentUser) {
            scheduleProgressSync(db, currentUser.uid);
        }
        if (e.data?.type === 'gc_activity_event' && currentUser) {
            logUserActivity(db, currentUser.uid, e.data.event || {});
        }
        if (e.data?.type === 'gc_call_state') {
            document.body.dataset.voiceCallState = e.data.state || 'idle';
        }
        if (e.data?.type === 'gc_request_user_profile' && currentUser) {
            syncVoiceUserProfile(userEmailDisplay.textContent || '');
        }
    });

    function syncVoiceUserProfile(displayName) {
        document.querySelectorAll('#iframe-part1, #iframe-part2').forEach((frame) => {
            try {
                frame.contentWindow?.postMessage({ type: 'gc_user_profile', displayName }, '*');
            } catch {
                // ignore
            }
        });
    }

    window.addEventListener('learny-progress-changed', () => {
        if (currentUser) {
            scheduleProgressSync(db, currentUser.uid);
        }
    });

    window.addEventListener('learny-activity', (e) => {
        if (currentUser) {
            const detail = e.detail || {};
            logUserActivity(db, currentUser.uid, {
                ...detail,
                level: detail.level || getActiveLevelInfo().id,
            });
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

    function saveTime() {
        // Usage timer no longer writes remainingTime. The field stays in Firestore.
    }

    // =================================================
    // 7. タイマー機能
    // =================================================
    async function startTimerForUser() {
        clearAllIntervals();
        const timerPill = document.querySelector('.header-status-pill--timer');
        if (timerPill) timerPill.hidden = true;
        if (timeUpOverlay) timeUpOverlay.style.display = 'none';
        if (appContent) appContent.style.pointerEvents = 'auto';
    }

    function lockApp() {
        clearAllIntervals();
        if (timeUpOverlay) timeUpOverlay.style.display = 'none';
        if (appContent) appContent.style.pointerEvents = 'auto';
    }
});

