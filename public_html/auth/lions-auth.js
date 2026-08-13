/**
 * lions-auth.js
 *
 * Email-link sign-in for the Lions Sports Club fundraising application.
 * File: /auth/lions-auth.js
 *
 * A volunteer requests a link, receives it by email, and opens it. This module
 * completes the sign-in, resolves the volunteer against the roster, and hands
 * the result back to the calling page. It does not render anything itself.
 *
 * Roles resolved here are presentation only. Every read and write is enforced
 * by the Firestore security rules against request.auth.token.email, which the
 * client cannot modify. The address lists below mirror those rules so that the
 * interface a volunteer sees matches the access they actually have. If one is
 * changed, change the other in the same deploy.
 *
 * Load order on any page that uses this module:
 *   <script src="/js/lions-log.js"></script>
 *   <script type="module"> import { ... } from '/auth/lions-auth.js'; </script>
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    onAuthStateChanged,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ---------------------------------------------------------------------------
// Diagnostics
//
// Informational output is routed through the console gate so that a production
// page load does not print email addresses, Firebase user ids, or role names.
// The fallback keeps this module working if the gate has not been loaded.
// ---------------------------------------------------------------------------

const log = window.LIONS_LOG || {
    log() {},
    warn() {},
    error(...args) { console.error(...args); }
};

// ---------------------------------------------------------------------------
// Firebase
//
// The web API key is a public client identifier, not a secret. Access control
// is the security rules, not this value.
// ---------------------------------------------------------------------------

const firebaseConfig = {
    apiKey: 'AIzaSyAexNeRq7viHV5ATcaQu6yA3ZC-veo7UjY',
    authDomain: 'lionsfundraising-1f854.firebaseapp.com',
    projectId: 'lionsfundraising-1f854',
    storageBucket: 'lionsfundraising-1f854.firebasestorage.app',
    messagingSenderId: '220154119704',
    appId: '1:220154119704:web:c570853fabb7e6d59b656d',
    measurementId: 'G-GGK1VHTH0D'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const VERIFY_URL = 'https://lionsfundraising.com/auth/verify.html';

const COLLECTIONS = {
    USERS: 'Lions-Fundraising-Users',
    ROLES: 'Lions-User-Roles',
    AUDIT: 'Lions-Audit-Log'
};

/**
 * Role addresses. These mirror isSystemAdmin, isTreasurer, and
 * isEventSupervisor in firestore.rules.
 *
 * The lionsfootballclub.com addresses are a migration remnant. They stay until
 * every Firebase Auth account has been moved to lionssports.club and verified.
 * Removing them before that locks out all administrative access.
 */
const ROLE_ADDRESSES = {
    'System Administrator': [
        'fundraising@lionssports.club',
        'fundraising@lionsfootballclub.com'
    ],
    'Treasurer': [
        'treasurer@lionssports.club',
        'treasurer@lionsfootballclub.com'
    ],
    'Event Supervisor': [
        'president@lionssports.club',
        'president@lionsfootballclub.com'
    ]
};

const DEFAULT_ROLE = 'Volunteer';

/**
 * Where each role lands after signing in.
 *
 * Every path here must exist and must not be blocked by the root .htaccess.
 * The previous map sent volunteers and event supervisors to /events, which
 * returns 403, so every volunteer who completed a sign-in landed on an error.
 *
 * Volunteers and event supervisors go to /signup as of 2026-08-01, now that
 * signup/index.html is deployed. This is the default only: destinationFor
 * honours a next parameter and then a stored return path before reading this
 * map, so a link that already names a destination is unaffected.
 */
const POST_SIGN_IN_ROUTES = {
    'System Administrator': '/dashboard',
    'Treasurer': '/treasurer',
    'Event Supervisor': '/signup',
    'Volunteer': '/signup'
};

const DEFAULT_ROUTE = '/';

/**
 * Systems a role may open. Presentation only. A page that shows or hides a
 * control from this map still has to be backed by a security rule.
 */
const SYSTEM_ACCESS = {
    register:     ['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    account:      ['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    signup:       ['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    reimbursement:['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    earnings:     ['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    los:          ['System Administrator', 'Treasurer', 'Event Supervisor', 'Volunteer'],
    payouts:      ['System Administrator', 'Treasurer'],
    treasurer:    ['System Administrator', 'Treasurer'],
    dashboard:    ['System Administrator']
};

/**
 * handleCodeInApp must be true. The verification page completes the sign-in
 * itself by calling signInWithEmailLink, which requires the emailed link to
 * carry the action code to this page. With the flag false, Firebase either
 * rejects the call outright or routes through its own handler, and
 * isSignInWithEmailLink then reports the arriving URL as not a sign-in link.
 *
 * The reference to Dynamic Links in the original comment did not apply: that
 * mechanism only ever covered mobile application deep links.
 */
const actionCodeSettings = {
    url: VERIFY_URL,
    handleCodeInApp: true
};

const EMAIL_STORAGE_KEY = 'emailForSignIn';
const REDIRECT_STORAGE_KEY = 'lionsAuthRedirect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

/**
 * Accepts only a same-origin path. A value that starts with two slashes or
 * carries a scheme is rejected, so a crafted link cannot use the sign-in
 * redirect to send a volunteer to another site.
 */
function safeInternalPath(value) {
    const path = String(value || '').trim();
    if (!path.startsWith('/') || path.startsWith('//')) {
        return null;
    }
    if (path.includes('\\') || /^\/+\w+:/.test(path)) {
        return null;
    }
    return path;
}

/**
 * When a roster record was registered, in milliseconds, or Infinity when there
 * is no usable date.
 *
 * /register writes registrationTimestamp. Older imports carry createdAt or
 * timestamp. All three are read rather than assuming one, and a record with no
 * usable date sorts LAST rather than sorting first as a zero would. Duplicated
 * from signup/index.html rather than shared: this module is imported by pages
 * that load nothing else, and the two copies exist to agree, so if one changes
 * the other changes with it.
 */
function registeredAtMs(data) {
    const raw = (data && (data.registrationTimestamp || data.createdAt || data.timestamp)) || null;
    if (!raw) { return Number.POSITIVE_INFINITY; }
    if (typeof raw.toDate === 'function') { return raw.toDate().getTime(); }
    const d = raw instanceof Date ? raw : new Date(raw);
    const t = d.getTime();
    return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function readStored(storage, key) {
    try {
        return window[storage].getItem(key);
    } catch (error) {
        return null;
    }
}

function writeStored(storage, key, value) {
    try {
        window[storage].setItem(key, value);
    } catch (error) {
        log.warn('Storage unavailable, continuing without it.');
    }
}

function clearStored(storage, key) {
    try {
        window[storage].removeItem(key);
    } catch (error) {
        // Nothing to do. The value was never written.
    }
}

// ---------------------------------------------------------------------------
// Auth manager
// ---------------------------------------------------------------------------

class LionsAuthManager {

    constructor() {
        this.currentUser = null;
        this.userRole = null;
        this.userData = null;
        this.authStateListeners = [];
        this.isInitialized = false;

        // The most recent state handed to listeners, and whether the auth
        // observer has reported at all yet. A listener attached after the
        // observer has already fired is replayed this value rather than being
        // left waiting for a state change that is not coming. Without it,
        // initializeProtectedPage never settles on its second call, which is
        // the shape of any page that resolves auth once for the volunteer view
        // and again for an administrator view on the same URL.
        this.lastAuthState = null;
        this.hasResolvedAuthState = false;
    }

    /**
     * Attaches the auth state observer. Safe to call repeatedly; the observer
     * is attached once. Multiple observers on the same page are the reason the
     * dashboard reloads the roster several times per page load.
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        this.isInitialized = true;

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                this.currentUser = null;
                this.userRole = null;
                this.userData = null;
                log.log('No active session.');
                this.notifyAuthStateListeners();
                return;
            }

            this.currentUser = user;

            try {
                this.userData = await this.getUserData(user.email);
                this.userRole = await this.resolveRole(user, this.userData);
                log.log('Session established, role ' + this.userRole);
            } catch (error) {
                this.userRole = null;
                this.userData = null;
                log.error('Unable to resolve role for the current session.', error);
            }

            this.notifyAuthStateListeners();
        });
    }

    /**
     * Sends a sign-in link.
     *
     * Firebase does not reveal whether an address has an account, and this
     * method does not check the roster first. Doing so would turn the form
     * into a membership oracle for anyone who can load the page. Roster
     * membership is enforced after the link is used, in completeSignIn.
     *
     * @param {string} email
     * @param {string} systemName label recorded in the audit trail
     * @param {string} [returnTo] same-origin path to open after sign-in
     */
    async requestAccess(email, systemName = 'web', returnTo = null) {
        const address = normalizeEmail(email);

        if (!address) {
            return { success: false, error: 'Please enter your email address.' };
        }

        const settings = Object.assign({}, actionCodeSettings);
        const destination = safeInternalPath(returnTo);
        if (destination) {
            settings.url = VERIFY_URL + '?next=' + encodeURIComponent(destination);
        }

        try {
            await sendSignInLinkToEmail(auth, address, settings);
            writeStored('localStorage', EMAIL_STORAGE_KEY, address);

            log.log('Sign-in link sent.');
            return {
                success: true,
                message: 'Check ' + address + ' for your sign-in link. It may take a '
                       + 'minute to arrive, and it can land in a junk or spam folder.'
            };

        } catch (error) {
            log.error('Sign-in link could not be sent.', error);
            return { success: false, error: this.getFriendlyErrorMessage(error) };
        }
    }

    /**
     * Completes sign-in from the link in the current URL.
     *
     * @param {function(): Promise<string>} askForEmail invoked only when the
     *        address that requested the link is not available in this browser,
     *        which happens whenever the link is opened on a different device.
     */
    async completeSignIn(askForEmail) {
        if (!isSignInWithEmailLink(auth, window.location.href)) {
            throw new Error(
                'This page was opened without a sign-in link. Request a link and '
              + 'open it from your email.'
            );
        }

        let email = readStored('localStorage', EMAIL_STORAGE_KEY);

        if (!email && typeof askForEmail === 'function') {
            email = await askForEmail();
        }

        if (!email) {
            throw new Error('Your email address is needed to finish signing in.');
        }

        let credential;
        try {
            credential = await signInWithEmailLink(auth, normalizeEmail(email), window.location.href);
        } catch (error) {
            log.error('Sign-in link rejected.', error);
            throw new Error(this.getFriendlyErrorMessage(error));
        }

        clearStored('localStorage', EMAIL_STORAGE_KEY);

        // Roster membership is the access rule for this application: a person
        // is admitted only if they are already registered. Firebase has now
        // created an account for this address regardless, so an unregistered
        // visitor is signed straight back out rather than left holding a
        // session with no record behind it.
        //
        // Every record on the address is read rather than one, because whether
        // there is exactly one decides whether a display name can honestly be
        // written. The first is the record this session represents, under the
        // ordering getUserRecords documents.
        const records = await this.getUserRecords(credential.user.email);
        const record = records.length ? records[0].data : null;

        if (!record) {
            log.warn('Authenticated address has no roster record.');
            await signOut(auth);
            throw new Error(
                'That address is not registered with Lions Sports Club. Register '
              + 'first, or email fundraising@lionssports.club and we will add you.'
            );
        }

        await this.syncDisplayName(credential.user, records);

        this.currentUser = credential.user;
        this.userData = record;
        this.userRole = await this.resolveRole(credential.user, record);

        await this.logAuditEvent('sign_in_completed', { role: this.userRole });

        return {
            success: true,
            user: credential.user,
            role: this.userRole,
            userData: record,
            destination: this.destinationFor(this.userRole)
        };
    }

    /**
     * Copies the volunteer's roster name onto their Firebase Auth record.
     *
     * WHY THIS EXISTS
     *
     * The sign-in email template resolves %DISPLAY_NAME% from the Firebase Auth
     * user record and from nowhere else. This module never wrote one, so
     * displayName is null on every account in production and a template reading
     * "Hello %DISPLAY_NAME%," renders "Hello,". This has to land before the
     * template is changed in the console, or the greeting ships empty.
     *
     * WHY AT SIGN-IN AND NOT AT REGISTRATION
     *
     * Registration happens before there is a Firebase Auth account: the form is
     * submitted by someone with no session, which is why the create rule on
     * Lions-Fundraising-Users is the one unauthenticated grant on the project.
     * There is no user object to write to at that point. The first completed
     * sign-in is the earliest moment both halves exist.
     *
     * Existing accounts therefore pick a name up the next time they sign in,
     * and the greeting fills in gradually rather than all at once. That is
     * acceptable: the alternative is a one-off administrative script against
     * every account, for a greeting.
     *
     * WHY A SHARED ADDRESS GETS NO NAME AT ALL
     *
     * Firebase Auth holds one account per address, so a family sharing one
     * address has one displayName between them. Whatever is written, somebody
     * in that household is greeted by another member's name. "Hello, Deborah"
     * arriving for her husband is worse than "Hello,": the first is wrong and
     * the second is merely plain. So the name is written only when the address
     * resolves to exactly one roster record, which is most of the roster.
     *
     * Written only when it would change. A volunteer signing in for the tenth
     * time should not cost a profile write, and an unchanged write would still
     * count against the account's rate limits.
     *
     * Failure is swallowed on purpose. A greeting in an email is not worth
     * refusing somebody entry to the application over.
     */
    async syncDisplayName(firebaseUser, records) {
        if (!Array.isArray(records) || records.length !== 1) {
            log.log('Display name left unset: the address carries '
                  + ((records && records.length) || 0) + ' roster records.');
            return;
        }

        const name = String((records[0].data && records[0].data.name) || '').trim();
        if (!name || name === firebaseUser.displayName) {
            return;
        }

        try {
            await updateProfile(firebaseUser, { displayName: name });
            log.log('Display name set from the roster record.');
        } catch (error) {
            log.warn('Display name could not be set. Sign-in continues.', error);
        }
    }

    /**
     * Every roster record on an address, ordered, or an empty array.
     *
     * The roster is keyed by volunteer name and a family shares one email
     * address, so an address can carry several records. Records store the
     * address in lower case following the July 2026 deduplication; a record
     * saved with different casing will not match.
     *
     * ORDERING. Earliest registration first, document id ascending to break a
     * tie. Both keys come from the documents themselves, so the answer is the
     * same on every load and on every device. This is the same total order
     * signup/index.html uses, deliberately: two pages that disagree about which
     * family member is at the keyboard is worse than either answer.
     */
    async getUserRecords(email) {
        const address = normalizeEmail(email);
        if (!address) {
            return [];
        }

        try {
            const snapshot = await getDocs(query(
                collection(db, COLLECTIONS.USERS),
                where('email', '==', address)
            ));

            return snapshot.docs
                .map(d => ({ id: d.id, data: d.data() }))
                .sort((a, b) => {
                    const ta = registeredAtMs(a.data);
                    const tb = registeredAtMs(b.data);
                    if (ta !== tb) { return ta < tb ? -1 : 1; }
                    if (a.id === b.id) { return 0; }
                    return a.id < b.id ? -1 : 1;
                });

        } catch (error) {
            log.error('Roster lookup failed.', error);
            return [];
        }
    }

    /**
     * Returns one roster record for an address, or null.
     *
     * This previously issued `where('email','==') + limit(1)`. Firestore
     * promises no ordering on a query without orderBy, so on any address
     * carrying more than one record it returned an arbitrary family member,
     * and a different one between page loads was permitted. Callers use this
     * for the volunteer's name and their profile, so the answer has to be
     * stable even when it cannot be certain.
     */
    async getUserData(email) {
        const records = await this.getUserRecords(email);
        return records.length ? records[0].data : null;
    }

    /**
     * Resolves the role for a signed-in user.
     *
     * Order of precedence:
     *   1. An explicit assignment in Lions-User-Roles, which only a system
     *      administrator can write.
     *   2. The role address lists, which mirror the security rules.
     *   3. The roster record.
     *   4. Volunteer.
     *
     * Nothing is written back. The previous implementation wrote the derived
     * role to Lions-User-Roles on every first sign-in, which the security
     * rules reject for everyone except an administrator, and which would have
     * let a volunteer assign their own role if they did not.
     */
    async resolveRole(firebaseUser, record) {
        const assigned = await this.getAssignedRole(firebaseUser.uid);
        if (assigned) {
            return assigned;
        }

        const address = normalizeEmail(firebaseUser.email);

        for (const [role, addresses] of Object.entries(ROLE_ADDRESSES)) {
            if (addresses.includes(address)) {
                return role;
            }
        }

        return this.roleFromRecord(record);
    }

    /** Reads an explicit assignment. Returns null when none exists. */
    async getAssignedRole(userId) {
        try {
            const snapshot = await getDoc(doc(db, COLLECTIONS.ROLES, userId));
            return snapshot.exists() ? (snapshot.data().role || null) : null;
        } catch (error) {
            // A missing document and a denied read are indistinguishable here,
            // and neither is a failure. Fall through to the address lists.
            return null;
        }
    }

    /**
     * Derives a role from the roster record.
     *
     * The previous implementation matched any address containing the substring
     * "admin" or "treasurer", so an address such as sadminsky@example.com
     * resolved to System Administrator. The security rules never honoured that,
     * but the interface did, and it presented administrative navigation to
     * people who could not use it. Substring matching on addresses is not used
     * anywhere in this file.
     */
    roleFromRecord(record) {
        if (!record) {
            return DEFAULT_ROLE;
        }

        const declared = String(record.role || record.position || '').trim().toLowerCase();

        if (declared === 'treasurer') {
            return 'Treasurer';
        }
        if (declared === 'event supervisor' || declared === 'supervisor') {
            return 'Event Supervisor';
        }

        return DEFAULT_ROLE;
    }

    /** Path to open after sign-in, honoring a stored return path first. */
    destinationFor(role) {
        const params = new URLSearchParams(window.location.search);
        const requested = safeInternalPath(params.get('next'));
        if (requested) {
            return requested;
        }

        const stored = readStored('sessionStorage', REDIRECT_STORAGE_KEY);
        clearStored('sessionStorage', REDIRECT_STORAGE_KEY);

        const fromSession = safeInternalPath(stored);
        if (fromSession) {
            return fromSession;
        }

        return POST_SIGN_IN_ROUTES[role] || DEFAULT_ROUTE;
    }

    canAccess(systemName) {
        if (!this.userRole) {
            return false;
        }
        const allowed = SYSTEM_ACCESS[String(systemName).toLowerCase()];
        return Array.isArray(allowed) ? allowed.includes(this.userRole) : false;
    }

    /**
     * Appends an entry to the audit trail.
     *
     * The security rules accept a create only from a signed-in caller and pin
     * actorEmail to the authenticated address. Calls made before sign-in are
     * skipped rather than attempted, because they are certain to be denied and
     * the denial prints a console error on an otherwise healthy page.
     */
    async logAuditEvent(action, details = {}) {
        if (!this.currentUser) {
            log.log('Audit entry skipped, no session: ' + action);
            return;
        }

        try {
            await addDoc(collection(db, COLLECTIONS.AUDIT), {
                action: action,
                actorEmail: normalizeEmail(this.currentUser.email),
                actorUid: this.currentUser.uid,
                actorRole: this.userRole || DEFAULT_ROLE,
                details: details,
                timestamp: serverTimestamp(),
                url: window.location.pathname
            });
        } catch (error) {
            log.error('Audit entry could not be written.', error);
        }
    }

    async signOut() {
        try {
            await this.logAuditEvent('sign_out');
            await signOut(auth);
            clearStored('localStorage', EMAIL_STORAGE_KEY);
            return { success: true };
        } catch (error) {
            log.error('Sign out failed.', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Registers a listener and, when the auth state is already known, replays
     * the current state to it.
     *
     * The replay is deferred to a microtask rather than delivered inline. A
     * caller that registers from inside a Promise executor, which is what
     * initializeProtectedPage does, would otherwise see its own callback run
     * before the executor had finished. Deferring makes the two paths, replay
     * and live notification, behave identically from the caller's side.
     */
    addAuthStateListener(callback) {
        this.authStateListeners.push(callback);

        if (this.hasResolvedAuthState) {
            const state = this.lastAuthState;
            Promise.resolve().then(() => {
                // Re-check membership: the caller may have removed itself in
                // the same turn, which a page does when it only wanted the
                // first answer.
                if (this.authStateListeners.includes(callback)) {
                    this.deliver(callback, state);
                }
            });
        }
    }

    removeAuthStateListener(callback) {
        // Rebuilt rather than spliced so that a notification already iterating
        // the previous array is unaffected by a listener removing itself.
        this.authStateListeners = this.authStateListeners.filter(entry => entry !== callback);
    }

    /** Invokes one listener. A listener that throws must not stop the rest. */
    deliver(callback, state) {
        try {
            callback(state);
        } catch (error) {
            log.error('Auth state listener failed.', error);
        }
    }

    notifyAuthStateListeners() {
        this.lastAuthState = {
            user: this.currentUser,
            role: this.userRole,
            userData: this.userData,
            isAuthenticated: !!this.currentUser
        };
        this.hasResolvedAuthState = true;

        this.authStateListeners
            .slice()
            .forEach(callback => this.deliver(callback, this.lastAuthState));
    }

    getFriendlyErrorMessage(error) {
        const messages = {
            'auth/invalid-email': 'That does not look like a valid email address.',
            'auth/invalid-action-code': 'This sign-in link has already been used or is no longer valid.',
            'auth/expired-action-code': 'This sign-in link has expired. Request a new one.',
            'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
            'auth/network-request-failed': 'Network error. Check your connection and try again.',
            'auth/unauthorized-continue-uri': 'This site is not authorized for sign-in links. Contact fundraising@lionssports.club.'
        };

        return messages[error && error.code]
            || (error && error.message)
            || 'Something went wrong. Please try again.';
    }
}

const lionsAuth = new LionsAuthManager();

// ---------------------------------------------------------------------------
// Page entry points
// ---------------------------------------------------------------------------

/**
 * Runs the verification page.
 *
 * Presentation is supplied by the page through window.LIONS_VERIFY_VIEW, which
 * exposes working(), requestEmail(), success(result), and failure(message).
 * This function never writes markup. The previous implementation replaced
 * document.body on every state change, which discarded the page styling and
 * made the emailed link land on an unbranded page.
 */
async function handleVerificationPage() {
    const view = window.LIONS_VERIFY_VIEW || fallbackVerifyView();

    view.working();

    try {
        await lionsAuth.initialize();
        const result = await lionsAuth.completeSignIn(() => view.requestEmail());

        view.success({
            email: result.user.email,
            role: result.role,
            name: result.userData && result.userData.name,
            destination: result.destination
        });

        window.setTimeout(() => {
            window.location.replace(result.destination);
        }, 2000);

    } catch (error) {
        log.error('Verification did not complete.', error);
        view.failure(error && error.message);
    }
}

/**
 * Minimal presentation used only when a page calls handleVerificationPage
 * without registering a view. Kept deliberately plain: any page that matters
 * supplies its own.
 */
function fallbackVerifyView() {
    return {
        working() {},
        requestEmail() {
            return Promise.resolve(window.prompt('Confirm the email address you requested the link with:'));
        },
        success(result) {
            log.log('Signed in, continuing to ' + result.destination);
        },
        failure(message) {
            window.alert(message || 'Sign in could not be completed.');
        }
    };
}

/**
 * Renders a sign-in request form into a container.
 *
 * Styling comes from /css/lions-tokens.css. The caller is responsible for
 * loading it.
 */
function createMagicLinkRequestForm(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        log.error('Sign-in form container not found: ' + containerId);
        return;
    }

    container.innerHTML = [
        '<form id="lions-signin-form" novalidate>',
        '  <div class="field">',
        '    <label for="lions-signin-email">Email address</label>',
        '    <input type="email" id="lions-signin-email" name="email" required',
        '           autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false">',
        '  </div>',
        '  <button type="submit" class="btn" id="lions-signin-submit">Send sign-in link</button>',
        '</form>',
        '<div id="lions-signin-message" class="banner" hidden></div>'
    ].join('\n');

    const form = document.getElementById('lions-signin-form');
    const input = document.getElementById('lions-signin-email');
    const button = document.getElementById('lions-signin-submit');
    const message = document.getElementById('lions-signin-message');

    function announce(text, kind) {
        message.textContent = text;
        message.className = 'banner ' + (kind === 'success' ? 'is-success' : 'is-error');
        message.hidden = false;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        button.disabled = true;
        button.textContent = 'Sending';
        message.hidden = true;

        const result = await lionsAuth.requestAccess(
            input.value,
            options.system || 'web',
            options.returnTo || null
        );

        if (result.success) {
            announce(result.message, 'success');
            form.hidden = true;
        } else {
            announce(result.error, 'error');
            button.disabled = false;
            button.textContent = 'Send sign-in link';
        }
    });
}

/**
 * Resolves once the auth state for a protected page is known.
 *
 * Returns { authorized, needsAuth, user, role, userData }. It does not modify
 * the page: the caller decides what an unauthorized visitor sees. The previous
 * implementation replaced document.body, which destroyed the page it was
 * meant to protect and left no way to recover.
 *
 * Safe to call more than once on the same page and for more than one system.
 * The second call is answered from the state the manager already holds rather
 * than waiting for another auth event.
 */
async function initializeProtectedPage(requiredSystem = 'account') {
    await lionsAuth.initialize();

    return new Promise(resolve => {
        let settled = false;

        const listener = (state) => {
            if (settled) {
                return;
            }
            settled = true;
            lionsAuth.removeAuthStateListener(listener);

            if (!state.isAuthenticated) {
                resolve({ authorized: false, needsAuth: true });
                return;
            }

            resolve({
                authorized: lionsAuth.canAccess(requiredSystem),
                needsAuth: false,
                user: state.user,
                role: state.role,
                userData: state.userData
            });
        };

        lionsAuth.addAuthStateListener(listener);
    });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

window.lionsAuth = lionsAuth;
window.createMagicLinkRequestForm = createMagicLinkRequestForm;
window.handleVerificationPage = handleVerificationPage;
window.initializeProtectedPage = initializeProtectedPage;

export {
    lionsAuth,
    createMagicLinkRequestForm,
    handleVerificationPage,
    initializeProtectedPage,
    POST_SIGN_IN_ROUTES,
    ROLE_ADDRESSES
};

log.log('Lions authentication module loaded.');
