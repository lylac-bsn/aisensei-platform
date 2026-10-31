// =================================================
// 1. Firebaseの初期設定
// =================================================
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { renderPlatformPanel } from "./platform-booking.js?v=20261031-parent-book";
import { renderSchoolPanel, renderReport, stopNotificationWatch, watchNotifications } from "./platform-school.js?v=20261031-hw-learn-ui";
import { renderHome } from "./platform-home.js";
import { preloadHomeworkSfx, setSfxEnabled, sfxEnabled } from "./homework-sfx.js?v=20261031-hw-voicefix";

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

document.addEventListener("click", (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains("gc-modal") || !dialog.open) return;
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) dialog.close(dialog.classList.contains("gc-confirm") ? "cancel" : "");
});

    const sfxButton = document.getElementById('hub-sfx');
    const paintSfx = () => {
        if (!sfxButton) return;
        const on = sfxEnabled();
        sfxButton.setAttribute('aria-pressed', on ? 'true' : 'false');
        sfxButton.setAttribute('aria-label', on ? '効果音オン' : '効果音オフ');
    };
    paintSfx();
    sfxButton?.addEventListener('click', () => {
        setSfxEnabled(!sfxEnabled());
        paintSfx();
    });
    window.addEventListener('learny-sfx', paintSfx);

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
        const platformPanel = document.getElementById('hub-panel-platform');
        if (platformPanel) platformPanel.hidden = true;
        const pageTitle = document.getElementById('hub-page-title');
        if (pageTitle) pageTitle.textContent = 'ホーム';
        platformHub?.classList.remove('is-nav-open');
        platformHub?.querySelectorAll('.gc-nav.is-current').forEach((item) => item.classList.remove('is-current'));
        try {
            sessionStorage.removeItem('gc-hub-action');
        } catch {
            /* ignore */
        }
    }

    function resumeHubAction() {
        let action = '';
        try {
            action = sessionStorage.getItem('gc-hub-action') || '';
        } catch {
            action = '';
        }
        if (!action) return;
        const btn = document.querySelector(`[data-hub-action="${action}"]`);
        if (!btn || btn.hidden) return;
        queueMicrotask(() => btn.click());
    }

    function showHub(role, displayName, uid) {
        const value = normalizeRole(role);
        currentHubRole = value || 'student';
        const name = String(displayName || '').trim();
        loginView.style.display = 'none';
        hideLevelPicker();
        document.body.classList.add('hub-open');
        document.title = 'Gamecollege';
        preloadHomeworkSfx();
        if (platformHub) {
            platformHub.hidden = false;
            platformHub.dataset.role = value || 'student';
        }
        if (hubGreeting) {
            hubGreeting.textContent = name ? `おかえりなさい、${name}さん` : 'おかえりなさい';
        }
        const userName = document.getElementById('hub-user-name');
        if (userName) userName.textContent = name || 'アカウント';
        const userAvatar = document.getElementById('hub-user-avatar');
        if (userAvatar) {
            const initial = (name || '学').trim().charAt(0) || '?';
            userAvatar.textContent = initial;
        }
        const hubDate = document.getElementById('hub-date');
        if (hubDate) {
            hubDate.textContent = new Date().toLocaleDateString('ja-JP', { dateStyle: 'full', timeZone: 'Asia/Tokyo' });
        }
        if (hubRoleLabel) hubRoleLabel.textContent = roleLabel(value);
        if (hubStudent) hubStudent.hidden = value === 'parent' || value === 'admin' || value === 'owner';
        if (hubParent) hubParent.hidden = value !== 'parent';
        if (hubTeacher) hubTeacher.hidden = value !== 'admin' && value !== 'owner';
        const ticketSettings = document.getElementById('hub-ticket-settings');
        if (ticketSettings) ticketSettings.hidden = value !== 'owner';
        document.querySelectorAll('.gc-owner-only').forEach((item) => {
            item.hidden = value !== 'owner';
        });
        decorateNav();
        paintDashboard();
        let pendingAction = '';
        try {
            pendingAction = sessionStorage.getItem('gc-hub-action') || '';
        } catch {
            pendingAction = '';
        }
        showHubMenu();
        if (pendingAction) {
            try {
                sessionStorage.setItem('gc-hub-action', pendingAction);
            } catch {
                /* ignore */
            }
            resumeHubAction();
        }
        watchNotifications(uid, currentHubRole);
    }

    const navIcons = {
        home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
        book: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
        'my-homework': '<path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3M8 12h8M8 16h6"/>',
        quiz: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17h.01"/>',
        family: '<circle cx="8" cy="9" r="2"/><circle cx="16" cy="9" r="2"/><path d="M4 18c.6-2 2.2-3 4-3s3.4 1 4 3M12 18c.6-2 2.2-3 4-3s3.4 1 4 3"/>',
        children: '<circle cx="12" cy="8" r="3"/><path d="M6 19c1-3 3-4.5 6-4.5S17 16 18 19"/>',
        tickets: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>',
        inbox: '<path d="M4 6h16v12H4z"/><path d="m4 8 8 5 8-5"/>',
        'publish-class': '<path d="M5 19V7l7-3 7 3v12"/><path d="M9 19v-6h6v6"/>',
        attendance: '<circle cx="12" cy="8" r="3"/><path d="M6 19c1-3 3-4.5 6-4.5 1.2 0 2.2.3 3.1.8"/><path d="m15 16 2 2 4-4"/>',
        'assign-homework': '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
        'ticket-settings': '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>',
        admin: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    };

    function navSvg(action) {
        return `<svg viewBox="0 0 24 24" aria-hidden="true">${navIcons[action] || navIcons.home}</svg>`;
    }

    function decorateNav() {
        document.querySelectorAll('.gc-nav').forEach((item) => {
            if (item.querySelector('svg')) return;
            const action = item.dataset.hubAction || (item.id === 'hub-home' ? 'home' : 'admin');
            item.insertAdjacentHTML('afterbegin', navSvg(action));
        });
    }

    function paintDashboard() {
        const dash = document.getElementById('hub-dash');
        if (!dash) return;
        const name = document.getElementById('hub-user-name')?.textContent || '';
        renderHome(dash, currentHubRole, name === 'アカウント' ? '' : name).catch((error) => {
            dash.textContent = error.message;
        });
    }

    function showLogin() {
        if (platformHub) platformHub.hidden = true;
        document.body.classList.remove('hub-open');
        document.title = 'Gamecollege - ログイン';
        hideLevelPicker();
        showHubMenu();
        stopNotificationWatch();
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

    const homeworkLab = new URLSearchParams(location.search).get('hwlab') === '1'
        && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

    async function openHomeworkLab() {
        showHub('admin', 'プレビュー', 'lab');
        if (hubMenu) hubMenu.hidden = true;
        if (hubPanel) hubPanel.hidden = false;
        const pageTitle = document.getElementById('hub-page-title');
        if (pageTitle) pageTitle.textContent = '宿題';
        document.querySelectorAll('.gc-nav').forEach((item) => {
            item.classList.toggle('is-current', item.getAttribute('data-hub-action') === 'assign-homework');
        });
        const panel = document.getElementById('hub-panel-platform');
        if (!panel) return;
        panel.hidden = false;
        const packs = new Map();
        const LAB_PACKS_KEY = 'gc-hw-lab-packs';
        try {
            const saved = JSON.parse(sessionStorage.getItem(LAB_PACKS_KEY) || '[]');
            if (Array.isArray(saved)) {
                saved.forEach((entry) => {
                    if (Array.isArray(entry) && entry[0] && entry[1]) packs.set(entry[0], entry[1]);
                });
            }
        } catch {
            /* ignore */
        }
        const persistLabPacks = () => {
            try {
                sessionStorage.setItem(LAB_PACKS_KEY, JSON.stringify([...packs.entries()]));
            } catch {
                /* ignore */
            }
        };
        const { mountHomeworkHub } = await import('./homework-library.js?v=20261031-hw-teachers');
        const labCall = async (name, data) => {
            if (name === 'saveHomeworkPack') {
                const id = data.id || `lab${packs.size + 1}`;
                packs.set(id, {
                    ...data,
                    id,
                    status: data.status,
                    published: data.published !== false,
                    libraryReady: Boolean(data.libraryReady),
                    teacherId: 'lab',
                    creatorName: 'プレビュー',
                    questionCount: (data.questions || []).length,
                    format: 'pack-v1',
                    updatedAt: { toMillis: () => Date.now() },
                });
                persistLabPacks();
                return {
                    id,
                    status: data.status,
                    questionCount: (data.questions || []).length,
                    assigneeCount: data.status === 'assigned' ? 1 : 0,
                };
            }
            if (name === 'getHomeworkEditor') {
                const pack = packs.get(data.id);
                if (!pack) throw new Error('下書きがありません。');
                return pack;
            }
            if (name === 'listHomeworkLibrary') {
                return {
                    items: [...packs.values()]
                        .filter((pack) => pack.status !== 'assigned')
                        .map((pack) => ({
                            id: pack.id,
                            title: pack.title,
                            description: pack.description || '',
                            level: pack.level || 'beginner',
                            status: pack.status || 'draft',
                            published: pack.published !== false,
                            libraryReady: Boolean(pack.libraryReady),
                            official: false,
                            teacherId: 'lab',
                            creatorName: 'プレビュー',
                            questionCount: pack.questionCount || (pack.questions || []).length || 0,
                            types: ['問題パック'],
                            updatedAt: Date.now(),
                        })),
                };
            }
            if (name === 'listOwnerTeacherHomework') {
                const items = [...packs.values()].map((pack) => ({
                    id: pack.id,
                    title: pack.title,
                    description: pack.description || '',
                    level: pack.level || 'beginner',
                    status: pack.status || 'draft',
                    published: pack.published !== false,
                    libraryReady: Boolean(pack.libraryReady),
                    official: false,
                    teacherId: pack.teacherId || 'lab',
                    teacherName: pack.creatorName || 'プレビュー',
                    creatorName: pack.creatorName || 'プレビュー',
                    questionCount: pack.questionCount || (pack.questions || []).length || 0,
                    types: ['問題パック'],
                    classIds: pack.classIds || [],
                    classNames: (pack.classIds || []).map((id) => `クラス ${id}`),
                    assigneeCount: pack.status === 'assigned' ? 1 : 0,
                    completedCount: 0,
                    startedCount: 0,
                    avgPercent: pack.status === 'assigned' ? 0 : null,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }));
                return {
                    items,
                    teachers: [{ id: 'lab', name: 'プレビュー' }],
                    classes: [...new Set(items.flatMap((row) => row.classIds || []))].map((id) => ({ id, title: `クラス ${id}` })),
                };
            }
            if (name === 'listSentHomework') {
                return { items: [], classes: [] };
            }
            if (name === 'assignHomeworkFromTemplate') {
                const pack = packs.get(data.templateId);
                if (!pack) throw new Error('テンプレートがありません。');
                return labCall('saveHomeworkPack', {
                    ...pack,
                    id: '',
                    status: 'assigned',
                    classIds: data.classIds || [],
                    dueOn: data.dueOn || '',
                    published: false,
                    libraryReady: false,
                });
            }
            if (name === 'duplicateHomeworkPack') {
                const pack = packs.get(data.id);
                if (!pack) throw new Error('宿題がありません。');
                return labCall('saveHomeworkPack', {
                    ...pack,
                    id: '',
                    title: `${pack.title || '宿題'}（コピー）`,
                    status: 'draft',
                    published: false,
                });
            }
            if (name === 'deleteHomeworkPack') {
                packs.delete(data.id);
                persistLabPacks();
                return { ok: true };
            }
            if (name === 'setHomeworkPublished') {
                const pack = packs.get(data.id);
                if (!pack) throw new Error('宿題がありません。');
                pack.published = data.published !== false;
                persistLabPacks();
                return { id: pack.id, published: pack.published };
            }
            if (name === 'updateHomeworkPackMeta') {
                const pack = packs.get(data.id);
                if (!pack) throw new Error('宿題がありません。');
                pack.title = String(data.title || '').trim().slice(0, 80) || 'きょうのしゅくだい';
                pack.description = String(data.description || '').trim().slice(0, 160);
                persistLabPacks();
                return { id: pack.id, title: pack.title, description: pack.description };
            }
            throw new Error('プレビューではサーバーに保存しません。');
        };
        const openHub = async () => {
            panel._stopAttendance?.();
            await mountHomeworkHub(panel, {
                lab: true,
                db,
                uid: 'lab',
                role: 'owner',
                callFunction: labCall,
                openReport: async () => {
                    if (panel._confirmLeave && !(await panel._confirmLeave())) return;
                    panel._stopAttendance?.();
                    await renderReport(panel, null, "lab", {
                        lab: true,
                        onCreateHomework: () => openHub(),
                    });
                },
            });
        };
        await openHub();
    }

    if (homeworkLab) openHomeworkLab().catch((error) => {
        const note = document.getElementById('login-error');
        if (note) note.textContent = error && error.message ? error.message : String(error);
    });
    onAuthStateChanged(auth, async (user) => {
        if (homeworkLab) return;
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
            showHub(userData.role, typedName || userData.displayName || '', user.uid);
        } else {
            showLogin();
        }
    });

    document.getElementById('hub-logout')?.addEventListener('click', async () => {
        const panel = document.getElementById('hub-panel-platform');
        if (panel?._confirmLeave && !(await panel._confirmLeave())) return;
        try {
            await signOut(auth);
        } catch {
            showLogin();
        }
    });

    document.getElementById('gc-menu')?.addEventListener('click', () => {
        platformHub?.classList.toggle('is-nav-open');
    });

    const canLeavePanel = async () => {
        const panel = document.getElementById('hub-panel-platform');
        if (!panel || typeof panel._confirmLeave !== 'function') return true;
        return Boolean(await panel._confirmLeave());
    };

    platformHub?.addEventListener('click', async (event) => {
        if (event.target.closest('[data-hub-home]')) {
            if (!(await canLeavePanel())) return;
            try {
                sessionStorage.removeItem('gc-hw-resume');
            } catch {
                /* ignore */
            }
            showHubMenu();
            return;
        }
        const actionBtn = event.target.closest('[data-hub-action]');
        if (!actionBtn || !hubPanel) return;
        if (!(await canLeavePanel())) return;
        const action = actionBtn.getAttribute('data-hub-action');
        try {
            sessionStorage.setItem('gc-hub-action', action);
        } catch {
            /* ignore */
        }
        const pageTitle = document.getElementById('hub-page-title');
        if (pageTitle) {
            const fullLabel = actionBtn.getAttribute('data-hub-label') || 'Gamecollege';
            // Mobile header is tight — keep homework page title short so it never ellipsizes.
            pageTitle.textContent = (action === 'my-homework' || action === 'assign-homework')
                ? '宿題'
                : fullLabel;
        }
        platformHub.classList.remove('is-nav-open');
        platformHub.querySelectorAll('.gc-nav').forEach((item) => {
            item.classList.toggle('is-current', item.getAttribute('data-hub-action') === action);
        });
        if (hubMenu) hubMenu.hidden = true;
        hubPanel.hidden = false;
        if (action === 'family' || action === 'children' || action === 'inbox' || action === 'attendance' || action === 'assign-homework' || action === 'my-homework' || action === 'quiz') {
            if (hubPlaceholder) hubPlaceholder.hidden = true;
            const panel = document.getElementById('hub-panel-platform');
            if (panel) {
                panel.hidden = false;
                renderSchoolPanel(panel, action).catch((error) => {
                    panel.textContent = error.message;
                });
            }
            return;
        }
        if (action === 'book' || action === 'publish-class' || action === 'tickets' || action === 'ticket-settings') {
            if (hubPlaceholder) hubPlaceholder.hidden = true;
            const panel = document.getElementById('hub-panel-platform');
            if (panel) {
                panel.hidden = false;
                renderPlatformPanel(panel, action, currentHubRole);
            }
            return;
        }
        document.getElementById('hub-panel-platform')?.setAttribute('hidden', '');
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
                // Name sync must not block login — rules may reject some profile
                // updates. Hub load uses onAuthStateChanged.
                try {
                    const userRef = doc(db, "users", userCredential.user.uid);
                    const snap = await getDoc(userRef);
                    if (snap.exists()) {
                        await updateDoc(userRef, { displayName });
                    }
                } catch (error) {
                    console.warn("displayName sync skipped", error?.code || error?.message || error);
                }
            })
            .catch((error) => {
                const code = error?.code || "";
                if (code === "auth/too-many-requests") {
                    loginError.textContent = "しばらく待ってから、もう一度ログインしてください。";
                } else if (code === "auth/network-request-failed") {
                    loginError.textContent = "ネット接続を確認して、もう一度ログインしてください。";
                } else if (code === "auth/invalid-email") {
                    loginError.textContent = "メールアドレスの形が正しくありません。";
                } else if (code === "auth/user-disabled") {
                    loginError.textContent = "このアカウントは停止されています。先生に連絡してください。";
                } else {
                    loginError.textContent = "メールアドレスまたはパスワードが正しくありません。";
                }
                setLoginLoading(false);
            });
    });
});
