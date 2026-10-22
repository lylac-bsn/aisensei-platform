// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { renderPlatformPanel } from "./platform-booking.js";

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
    const platformHub = document.getElementById('platform-hub');
    const hubMenu = document.getElementById('hub-menu');
    const hubPanel = document.getElementById('hub-panel');
    const hubPlaceholder = document.getElementById('hub-panel-placeholder');
    const hubPlaceholderTitle = document.getElementById('hub-placeholder-title');
    const hubHomework = document.getElementById('hub-panel-homework');
    const hubGreeting = document.getElementById('hub-greeting');
    const hubRoleLabel = document.getElementById('hub-role-label');
    const hubStudent = document.getElementById('hub-student');
    const hubParent = document.getElementById('hub-parent');
    const hubTeacher = document.getElementById('hub-teacher');
    let currentHubRole = 'student';

    function normalizeRole(role) {
        return String(role || '').trim().toLowerCase();
    }

    function roleLabel(role) {
        const value = normalizeRole(role);
        if (value === 'parent') return '保護者';
        if (value === 'owner') return 'オーナー';
        if (value === 'admin') return '先生';
        return '生徒';
    }

    function hideLevelPicker() {
        if (!levelSelectionOverlay) return;
        levelSelectionOverlay.hidden = true;
        levelSelectionOverlay.classList.remove('is-open');
        levelSelectionOverlay.innerHTML = '';
    }

    function showHubMenu() {
        if (hubMenu) hubMenu.hidden = false;
        if (hubPanel) hubPanel.hidden = true;
        if (hubPlaceholder) hubPlaceholder.hidden = true;
        if (hubHomework) hubHomework.hidden = true;
        const platformPanel = document.getElementById('hub-panel-platform');
        if (platformPanel) platformPanel.hidden = true;
    }

    function showHub(role, displayName) {
        const value = normalizeRole(role);
        currentHubRole = value || 'student';
        const name = String(displayName || '').trim();
        loginView.style.display = 'none';
        hideLevelPicker();
        document.body.classList.add('hub-open');
        document.title = 'Gamecollege';
        if (platformHub) {
            platformHub.hidden = false;
            platformHub.dataset.role = value || 'student';
        }
        if (hubGreeting) {
            hubGreeting.textContent = name ? `おかえりなさい、${name}さん` : 'おかえりなさい';
        }
        if (hubRoleLabel) hubRoleLabel.textContent = roleLabel(value);
        if (hubStudent) hubStudent.hidden = value === 'parent' || value === 'admin' || value === 'owner';
        if (hubParent) hubParent.hidden = value !== 'parent';
        if (hubTeacher) hubTeacher.hidden = value !== 'admin' && value !== 'owner';
        const ticketSettings = document.getElementById('hub-ticket-settings');
        if (ticketSettings) ticketSettings.hidden = value !== 'owner';
        showHubMenu();
    }

    function showLogin() {
        if (platformHub) platformHub.hidden = true;
        document.body.classList.remove('hub-open');
        document.title = 'Gamecollege - ログイン';
        hideLevelPicker();
        showHubMenu();
        loginView.style.display = 'grid';
        setLoginLoading(false);
    }

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

            const userData = snap.data() || {};
            const typedName = displayNameInput.value.trim();
            showHub(userData.role, typedName || userData.displayName || '');
        } else {
            showLogin();
        }
    });

    document.getElementById('hub-logout')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch {
            showLogin();
        }
    });

    platformHub?.addEventListener('click', (event) => {
        if (event.target.closest('#hub-back')) {
            showHubMenu();
            return;
        }
        const actionBtn = event.target.closest('[data-hub-action]');
        if (!actionBtn || !hubPanel) return;
        const action = actionBtn.getAttribute('data-hub-action');
        if (hubMenu) hubMenu.hidden = true;
        hubPanel.hidden = false;
        if (action === 'aquarium-homework') {
            if (hubPlaceholder) hubPlaceholder.hidden = true;
            document.getElementById('hub-panel-platform')?.setAttribute('hidden', '');
            if (hubHomework) hubHomework.hidden = false;
            return;
        }
        if (action === 'book' || action === 'publish-class' || action === 'tickets' || action === 'ticket-settings') {
            if (hubPlaceholder) hubPlaceholder.hidden = true;
            if (hubHomework) hubHomework.hidden = true;
            const panel = document.getElementById('hub-panel-platform');
            if (panel) {
                panel.hidden = false;
                renderPlatformPanel(panel, action, currentHubRole);
            }
            return;
        }
        document.getElementById('hub-panel-platform')?.setAttribute('hidden', '');
        if (hubHomework) hubHomework.hidden = true;
        if (hubPlaceholder) hubPlaceholder.hidden = false;
        if (hubPlaceholderTitle) {
            hubPlaceholderTitle.textContent = actionBtn.getAttribute('data-hub-label') || '';
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
