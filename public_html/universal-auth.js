// LIONS UNIVERSAL AUTHENTICATION SYSTEM v4.2
// Instant transitions, zero loading states, seamless header updates

/**
 * Role addresses for the pages that run on this module rather than on
 * auth/lions-auth.js. Mirrors ROLE_ADDRESSES in auth/lions-auth.js, which is
 * canonical, and the isSystemAdmin, isTreasurer and isEventSupervisor helpers
 * in firestore.rules.
 *
 * Both domains are listed. Until 2026-08-05 the three predicates below matched
 * the lionsfootballclub.com address alone, so signing in on the address the
 * migration is moving to resolved to no role at all. On /dashboard that reached
 * handleAuthStateChange with a null role, which calls logout, which calls
 * forceLogout, which signs the session out and sends the browser to the site
 * root. The administrator could not stay signed in on his own address.
 *
 * Drop the lionsfootballclub.com entries only when every role account has moved
 * and been verified, and drop them from auth/lions-auth.js, firestore.rules,
 * universal-header.js, dashboard, payouts and treasurer in the same pass, or
 * the seven will disagree.
 */
const LIONS_ROLE_ADDRESSES = {
    administrator: [
        'fundraising@lionssports.club',
        'fundraising@lionsfootballclub.com'
    ],
    treasurer: [
        'treasurer@lionssports.club',
        'treasurer@lionsfootballclub.com'
    ],
    president: [
        'president@lionssports.club',
        'president@lionsfootballclub.com'
    ]
};

const LIONS_ELEVATED_ADDRESSES = [].concat(
    LIONS_ROLE_ADDRESSES.administrator,
    LIONS_ROLE_ADDRESSES.treasurer,
    LIONS_ROLE_ADDRESSES.president
);

// Published so universal-header.js and the three unported pages read one list
// rather than each carrying its own copy. Each of those still keeps a literal
// fallback, because deployment here is a manual upload and a page must not lose
// its role check just because this file has not been uploaded yet.
window.LIONS_ROLE_ADDRESSES = LIONS_ROLE_ADDRESSES;
window.LIONS_ELEVATED_ADDRESSES = LIONS_ELEVATED_ADDRESSES;

window.LIONS_AUTH = {
    currentUser: null,
    isInitialized: false,
    initializationPromise: null,
    firebaseApp: null,
    auth: null,
    firestore: null,
    listeners: [],

    // Fast initialization - minimal setup
    async initialize() {
        if (this.isInitialized) return true;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this._performFastInitialization();
        return this.initializationPromise;
    },

    async _performFastInitialization() {
        try {
            // Check localStorage FIRST - instant authentication
            const storedUser = localStorage.getItem('lionsAuthUser');
            const storedState = localStorage.getItem('lionsAuthState');

            if (storedUser && storedState === 'authenticated') {
                try {
                    this.currentUser = JSON.parse(storedUser);
                    this.isInitialized = true;
                    // Immediate auth state notification
                    setTimeout(() => this.notifyAuthStateChange(), 0);
                    (window.LIONS_LOG || console).log('Session restored from storage.');
                } catch (error) {
                    localStorage.removeItem('lionsAuthUser');
                    localStorage.removeItem('lionsAuthState');
                }
            }

            // Initialize Firebase in background (non-blocking)
            this._initializeFirebaseBackground();

            this.isInitialized = true;
            return true;

        } catch (error) {
            console.error('Fast auth initialization failed:', error);
            this.isInitialized = false;
            return false;
        }
    },

    // Initialize Firebase in background without blocking
    async _initializeFirebaseBackground() {
        try {
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
            const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, setPersistence, browserLocalPersistence } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
            const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');

            this.firebaseApp = initializeApp({
                apiKey: "AIzaSyAexNeRq7viHV5ATcaQu6yA3ZC-veo7UjY",
                authDomain: "lionsfundraising-1f854.firebaseapp.com",
                projectId: "lionsfundraising-1f854"
            });

            this.auth = getAuth(this.firebaseApp);
            this.firestore = getFirestore(this.firebaseApp);

            await setPersistence(this.auth, browserLocalPersistence);

            // Set up auth state listener (background)
            onAuthStateChanged(this.auth, (user) => {
                if (user) {
                    const userData = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        permissions: {
                            role: this.determineUserRole(user.email),
                            dashboardAccess: true,
                            eventsAccess: true,
                            reimbursementAccess: true,
                            losAccess: this.determineLOSAccess(user.email),
                            isAdmin: this.isAdminUser(user.email)
                        }
                    };

                    // Store in localStorage for instant access
                    localStorage.setItem('lionsAuthUser', JSON.stringify(userData));
                    localStorage.setItem('lionsAuthState', 'authenticated');

                    this.currentUser = userData;
                } else {
                    // User signed out
                    localStorage.removeItem('lionsAuthUser');
                    localStorage.removeItem('lionsAuthState');
                    this.currentUser = null;
                }

                // Notify all listeners including header
                this.notifyAuthStateChange();
            });

        } catch (error) {
            console.error('Firebase initialization failed:', error);
        }
    },

    // Determine user role. Both domains resolve, see LIONS_ROLE_ADDRESSES.
    determineUserRole(email) {
        if (!email) return 'User';
        const emailLower = String(email).toLowerCase().trim();
        if (LIONS_ROLE_ADDRESSES.administrator.includes(emailLower)) return 'Administrator';
        if (LIONS_ROLE_ADDRESSES.treasurer.includes(emailLower)) return 'Treasurer';
        if (LIONS_ROLE_ADDRESSES.president.includes(emailLower)) return 'President';
        return 'User';
    },

    // Determine LOS access
    determineLOSAccess(email) {
        if (!email) return false;
        return LIONS_ELEVATED_ADDRESSES.includes(String(email).toLowerCase().trim());
    },

    // Check if user is admin
    isAdminUser(email) {
        if (!email) return false;
        return LIONS_ELEVATED_ADDRESSES.includes(String(email).toLowerCase().trim());
    },

    /*
     * Answers "may this person open this system", for the three administrator
     * routes lions-nav.js offers in the Fundraising menu.
     *
     * Resolved against LIONS_ROLE_ADDRESSES rather than against a role label,
     * on purpose. universal-auth.js calls the fundraising address
     * "Administrator" and auth/lions-auth.js calls the same address "System
     * Administrator"; the labels differ, the addresses do not. Keying on the
     * address means this cannot drift from SYSTEM_ACCESS in lions-auth.js
     * without one of the two address lists changing first, and those are
     * already published from one place.
     *
     * The equivalence, verified 2026-08-05:
     *
     *   dashboard   System Administrator            -> administrator
     *   payouts     System Administrator, Treasurer -> administrator, treasurer
     *   treasurer   System Administrator, Treasurer -> administrator, treasurer
     *
     * Only the three elevated routes are listed. Every other system in
     * SYSTEM_ACCESS admits Volunteer, so a signed-in visitor already passes
     * and the nav does not gate them.
     */
    canAccess(systemName) {
        const email = this.currentUser && this.currentUser.email;
        if (!email) { return false; }

        const role = this.determineUserRole(email);

        // js/lions-access.js is the one map. It is preferred whenever it has
        // loaded, so this file and the landing page cannot answer the same
        // question differently.
        if (window.LIONS_ACCESS && typeof window.LIONS_ACCESS.canAccess === 'function') {
            return window.LIONS_ACCESS.canAccess(role, systemName);
        }

        // Fallback for a page that has not loaded lions-access.js. Deployment
        // here is a manual upload, so a page must keep working when a file it
        // expects has not gone up yet. Keep in step with SYSTEM_ROLES there.
        const FALLBACK_SYSTEM_ROLES = {
            dashboard: ['Administrator'],
            payouts:   ['Administrator', 'Treasurer'],
            treasurer: ['Administrator', 'Treasurer']
        };

        const allowed = FALLBACK_SYSTEM_ROLES[String(systemName || '').toLowerCase()];
        if (!allowed) { return true; }
        return allowed.includes(role);
    },

    // INSTANT authentication check
    isAuthenticated() {
        // Check current state first
        if (this.currentUser) return true;

        // Check localStorage immediately
        const storedState = localStorage.getItem('lionsAuthState');
        const storedUser = localStorage.getItem('lionsAuthUser');

        if (storedState === 'authenticated' && storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
                return true;
            } catch (error) {
                localStorage.removeItem('lionsAuthUser');
                localStorage.removeItem('lionsAuthState');
            }
        }

        return false;
    },

    // Get current user instantly
    getCurrentUser() {
        if (this.currentUser) return this.currentUser;

        // Try localStorage immediately
        const storedUser = localStorage.getItem('lionsAuthUser');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
                return this.currentUser;
            } catch (error) {
                return null;
            }
        }

        return null;
    },

    // Store redirect URL
    storeRedirectUrl(url) {
        sessionStorage.setItem('lionsAuthRedirect', url);
    },

    // INSTANT login - no delays
    async signInWithEmailAndPassword(email, password) {
        try {
            // Suppress any visible messages immediately
            this.suppressAuthMessages();

            if (!this.auth) {
                // If Firebase not ready, wait briefly
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!this.auth) {
                    throw new Error('Authentication system not ready');
                }
            }

            const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
            await signInWithEmailAndPassword(this.auth, email, password);

            // Get redirect URL
            const redirectUrl = sessionStorage.getItem('lionsAuthRedirect') || '/dashboard';
            sessionStorage.removeItem('lionsAuthRedirect');

            // INSTANT redirect - no delays
            this.suppressAuthMessages();
            window.location.replace(redirectUrl);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: this._getFriendlyErrorMessage(error.code) || 'Invalid email or password'
            };
        }
    },

    _getFriendlyErrorMessage(errorCode) {
        const errorMessages = {
            'auth/user-not-found': 'No account found with this email address.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-email': 'Invalid email address format.',
            'auth/too-many-requests': 'Too many failed attempts. Please wait and try again.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/network-request-failed': 'Network error. Please check your connection.'
        };
        return errorMessages[errorCode];
    },

    // Instant logout
    async forceLogout() {
        try {
            if (this.auth) {
                const { signOut } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
                await signOut(this.auth);
            }
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear all data immediately
        localStorage.removeItem('lionsAuthUser');
        localStorage.removeItem('lionsAuthState');
        sessionStorage.clear();

        this.currentUser = null;
        this.notifyAuthStateChange();

        window.location.href = '/';
    },

    // CRITICAL: Instant auth state notification with header integration
    notifyAuthStateChange() {
        const detail = {
            user: this.currentUser,
            isAuthenticated: !!this.currentUser
        };

        // Update header immediately if available
        if (window.LIONS_HEADER && typeof window.LIONS_HEADER === 'object') {
            window.LIONS_HEADER.currentUser = this.currentUser;
            
            // Call header update method if it exists
            if (typeof window.LIONS_HEADER.updateUserInterfaceSmooth === 'function') {
                window.LIONS_HEADER.updateUserInterfaceSmooth();
            } else if (typeof window.LIONS_HEADER.updateUserInterface === 'function') {
                window.LIONS_HEADER.updateUserInterface();
            }
        }

        // Trigger event immediately
        window.dispatchEvent(new CustomEvent('lionsAuthStateChanged', { detail }));

        // Call listeners immediately
        this.listeners.forEach(listener => {
            try {
                listener(this.currentUser ? 'login' : 'logout', this.currentUser);
            } catch (error) {
                console.error('Auth listener error:', error);
            }
        });
    },

    // Register auth state change listener
    onAuthStateChanged(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
            // Call immediately with current state
            if (this.isInitialized) {
                callback(this.currentUser ? 'login' : 'logout', this.currentUser);
            }
        }
    },

    // Minimal message suppression - only auth feedback
    suppressAuthMessages() {
        const authSelectors = [
            '#loginStatus', '.login-status', '.auth-message', '.signin-message'
        ];

        authSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    const text = el.textContent?.toLowerCase() || '';
                    if (text.includes('signing in') || text.includes('authenticating') ||
                        text.includes('logging in') || text.includes('processing')) {
                        el.style.display = 'none';
                    }
                });
            } catch (error) {
                // Ignore selector errors
            }
        });
    },

    // COMPATIBILITY FUNCTIONS - Required for header integration
    isLoggedIn() { 
        return this.isAuthenticated(); 
    },

    async handleEmailLogin(email, password) { 
        return this.signInWithEmailAndPassword(email, password); 
    },

    async waitForAuth() { 
        await this.initialize();
        return { 
            isInitialized: this.isInitialized, 
            currentUser: this.currentUser 
        }; 
    },

    handlePostLoginRedirect() { 
        // Handle any post-login redirect logic
        const redirectUrl = sessionStorage.getItem('lionsAuthRedirect');
        if (redirectUrl) {
            sessionStorage.removeItem('lionsAuthRedirect');
            window.location.href = redirectUrl;
        }
    },

    createLoginPageInterface() { 
        return this; 
    },

    // Fast initialization check
    async waitForInitialization(maxAttempts = 20) {
        let attempts = 0;
        while (!this.isInitialized && attempts < maxAttempts) {
            if (this.initializationPromise) {
                await this.initializationPromise;
                return this.isInitialized;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
            attempts++;
        }
        return this.isInitialized;
    }
};

// INSTANT initialization with header communication
(async function initializeAuthSystem() {
    try {
        // Initialize immediately
        await window.LIONS_AUTH.initialize();

        // Minimal message suppression
        const lightSuppression = () => {
            window.LIONS_AUTH.suppressAuthMessages();
        };

        // Very light suppression during page load
        const suppressInterval = setInterval(lightSuppression, 200);

        // Clear quickly
        setTimeout(() => {
            clearInterval(suppressInterval);
        }, 1000);

        // For dashboard - IMMEDIATE auth success trigger
        if (window.location.pathname.includes('/dashboard')) {
            if (window.LIONS_AUTH.isAuthenticated()) {
                // Trigger immediately without any delay
                window.dispatchEvent(new CustomEvent('dashboardAuthSuccess', {
                    detail: { user: window.LIONS_AUTH.getCurrentUser() }
                }));
            }
        }

        // CRITICAL: Ensure header gets initial auth state
        if (window.LIONS_HEADER && window.LIONS_AUTH.isAuthenticated()) {
            window.LIONS_HEADER.currentUser = window.LIONS_AUTH.getCurrentUser();
            if (typeof window.LIONS_HEADER.updateUserInterfaceSmooth === 'function') {
                window.LIONS_HEADER.updateUserInterfaceSmooth();
            }
        }

    } catch (error) {
        console.error('Auth system initialization error:', error);
    }
})();

// DOM ready - immediate execution with header sync
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.LIONS_AUTH.suppressAuthMessages();
        if (window.LIONS_AUTH.isInitialized) {
            window.LIONS_AUTH.notifyAuthStateChange();
        }
    });
} else {
    window.LIONS_AUTH.suppressAuthMessages();
    if (window.LIONS_AUTH.isInitialized) {
        window.LIONS_AUTH.notifyAuthStateChange();
    }
}


// Routed through the console gate, which is silent unless ?debug=1. This was an
// unconditional banner, and while it printed no page on this property could be
// console-silent on a normal load. The fallback keeps the line working on a
// page that loads this file without /js/lions-log.js.
(window.LIONS_LOG || console).log('Lions Auth v4.2 loaded.');