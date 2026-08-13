// Lions universal authentication.
// Enterprise-grade shared login across ALL Lions Sports Club pages
// Usage: Include this script on every Lions page before any other auth code

(function () {
    'use strict';

    // Prevent multiple initialization
    if (window.LIONS_AUTH && window.LIONS_AUTH.isInitialized) {
        console.log('🦁 Lions Auth already initialized, skipping...');
        return;
    }

    window.LIONS_AUTH = {
        // Configuration
        CONFIG: {
            FIREBASE_CONFIG: {
                apiKey: "AIzaSyAexNeRq7viHV5ATcaQu6yA3ZC-veo7UjY",
                authDomain: "lionsfundraising-1f854.firebaseapp.com",
                projectId: "lionsfundraising-1f854",
                storageBucket: "lionsfundraising-1f854.firebasestorage.app",
                messagingSenderId: "220154119704",
                appId: "1:220154119704:web:c570853fabb7e6d59b656d",
                measurementId: "G-GGK1VHTH0D"
            },
            STORAGE_KEY: 'lionsAuthUser',
            SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
            AUTHORIZED_DOMAINS: [
                'lionsfootballclub.com',
                'lionsfundraising.com',
                'localhost',
                '127.0.0.1'
            ]
        },

        // Current user state
        currentUser: null,
        isInitialized: false,
        callbacks: [],
        firebaseApp: null,
        auth: null,
        firebaseModules: null,
        initializationPromise: null,

        // Initialize authentication system
        async initialize() {
            // Prevent multiple simultaneous initializations
            if (this.initializationPromise) {
                return this.initializationPromise;
            }

            this.initializationPromise = this._doInitialize();
            return this.initializationPromise;
        },

        async _doInitialize() {
            if (this.isInitialized) {
                console.log('✅ Lions Auth already initialized');
                return;
            }

            console.log('🔐 Initializing Lions Universal Auth v2.1...');

            try {
                // Load Firebase modules with retry logic
                await this.loadFirebaseWithRetry();

                // Initialize Firebase
                await this.initializeFirebase();

                // Set up session management
                this.setupCrossTabSync();
                this.checkExistingSession();

                // Set up Firebase auth state listener
                this.setupAuthStateListener();

                this.isInitialized = true;
                console.log('✅ Lions Universal Auth v2.1 initialized successfully');

                // Notify any waiting callbacks
                this.notifyInitializationComplete();

            } catch (error) {
                console.error('❌ Lions Auth initialization failed:', error);
                this.isInitialized = false;
                throw error;
            }
        },

        // Load Firebase modules with retry logic
        async loadFirebaseWithRetry(maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`📦 Loading Firebase v9 modules (attempt ${attempt}/${maxRetries})...`);

                    const [
                        { initializeApp },
                        { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
                    ] = await Promise.all([
                        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
                        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')
                    ]);

                    // Store Firebase modules
                    this.firebaseModules = {
                        initializeApp,
                        getAuth,
                        signInWithEmailAndPassword,
                        signOut,
                        onAuthStateChanged
                    };

                    console.log('✅ Firebase v9 modules loaded successfully');
                    return;

                } catch (error) {
                    console.warn(`⚠️ Firebase load attempt ${attempt} failed:`, error);

                    if (attempt === maxRetries) {
                        throw new Error(`Failed to load Firebase after ${maxRetries} attempts: ${error.message}`);
                    }

                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        },

        // Initialize Firebase
        async initializeFirebase() {
            if (this.firebaseApp) return; // Already initialized

            try {
                console.log('🔥 Initializing Firebase...');

                if (!this.firebaseModules) {
                    throw new Error('Firebase modules not loaded');
                }

                this.firebaseApp = this.firebaseModules.initializeApp(this.CONFIG.FIREBASE_CONFIG);
                this.auth = this.firebaseModules.getAuth(this.firebaseApp);

                console.log('✅ Firebase initialized successfully');
            } catch (error) {
                console.error('❌ Firebase initialization failed:', error);
                throw error;
            }
        },

        // Check for existing valid session
        checkExistingSession() {
            try {
                const stored = localStorage.getItem(this.CONFIG.STORAGE_KEY);
                if (stored) {
                    const userData = JSON.parse(stored);

                    // Check if session is still valid
                    if (userData.timestamp &&
                        (Date.now() - userData.timestamp) < this.CONFIG.SESSION_TIMEOUT) {

                        this.currentUser = userData;
                        this.notifyCallbacks('login', userData);
                        console.log('✅ Restored valid session for:', userData.email);
                        return true;
                    } else {
                        // Session expired
                        this.clearSession();
                        console.log('⏰ Session expired, cleared');
                    }
                }
            } catch (error) {
                console.warn('⚠️ Session check failed:', error);
                this.clearSession();
            }
            return false;
        },

        // Set up Firebase auth state listener
        setupAuthStateListener() {
            if (!this.auth || !this.firebaseModules) {
                console.warn('⚠️ Cannot setup auth listener - Firebase not ready');
                return;
            }

            try {
                this.firebaseModules.onAuthStateChanged(this.auth, (firebaseUser) => {
                    console.log('🔄 Firebase auth state changed:', firebaseUser ? firebaseUser.email : 'logged out');

                    if (firebaseUser && !this.currentUser) {
                        // Firebase user signed in but no local session
                        this.handleFirebaseLogin(firebaseUser);
                    } else if (!firebaseUser && this.currentUser) {
                        // Firebase user signed out
                        this.handleLogout();
                    }
                });

                console.log('✅ Firebase auth state listener setup complete');
            } catch (error) {
                console.error('❌ Failed to setup auth state listener:', error);
            }
        },

        // Handle Firebase login
        async handleFirebaseLogin(firebaseUser) {
            try {
                console.log('🔑 Processing Firebase login for:', firebaseUser.email);

                // Determine user role and permissions
                const userRole = this.determineUserRole(firebaseUser.email);

                if (!userRole) {
                    console.warn('❌ Unauthorized user:', firebaseUser.email);
                    await this.signOut();
                    return;
                }

                const userData = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.displayName || firebaseUser.email,
                    role: userRole.role,
                    permissions: userRole,
                    timestamp: Date.now(),
                    sessionId: this.generateSessionId()
                };

                this.setSession(userData);
                console.log('✅ Firebase login processed successfully for:', userData.email);

            } catch (error) {
                console.error('❌ Firebase login processing failed:', error);
            }
        },

        // Determine user role and permissions
        determineUserRole(email) {
            const normalizedEmail = email.toLowerCase().trim();

            // Administrator - Full access
            if (normalizedEmail === 'fundraising@lionsfootballclub.com') {
                return {
                    role: 'Administrator',
                    accessLevel: 'full',
                    canEdit: true,
                    canDelete: true,
                    canCreate: true,
                    canViewAll: true,
                    canManageUsers: true,
                    dashboardAccess: true,
                    reimbursementAccess: true,
                    eventsAccess: true,
                    losAccess: true,
                    sodexoAccess: true
                };
            }

            // Treasurer - View all, limited actions
            if (normalizedEmail === 'treasurer@lionsfootballclub.com') {
                return {
                    role: 'Treasurer',
                    accessLevel: 'treasurer',
                    canEdit: true, // Can approve/deny reimbursements
                    canDelete: false,
                    canCreate: false,
                    canViewAll: true,
                    canManageUsers: false,
                    dashboardAccess: true,
                    reimbursementAccess: true,
                    eventsAccess: true,
                    losAccess: false,
                    sodexoAccess: true
                };
            }

            // President - View all, no editing
            if (normalizedEmail === 'president@lionsfootballclub.com') {
                return {
                    role: 'President',
                    accessLevel: 'view-only',
                    canEdit: false,
                    canDelete: false,
                    canCreate: false,
                    canViewAll: true,
                    canManageUsers: false,
                    dashboardAccess: true,
                    reimbursementAccess: true,
                    eventsAccess: true,
                    losAccess: true,
                    sodexoAccess: true
                };
            }

            // Lions members - Limited access
            const lionsPatterns = [
                /@lionsfootballclub\.com$/,
                /@lionsfundraising\.com$/
            ];

            if (lionsPatterns.some(pattern => pattern.test(normalizedEmail))) {
                return {
                    role: 'Member',
                    accessLevel: 'limited',
                    canEdit: false,
                    canDelete: false,
                    canCreate: false,
                    canViewAll: false,
                    canManageUsers: false,
                    dashboardAccess: false,
                    reimbursementAccess: true,
                    eventsAccess: true,
                    losAccess: false,
                    sodexoAccess: false
                };
            }

            return null; // Unauthorized
        },

        // Set user session
        setSession(userData) {
            this.currentUser = userData;

            try {
                localStorage.setItem(this.CONFIG.STORAGE_KEY, JSON.stringify(userData));

                // Broadcast to other tabs
                this.broadcastAuthChange('login', userData);

                // Notify callbacks
                this.notifyCallbacks('login', userData);

                console.log('✅ Session set for:', userData.email);
            } catch (error) {
                console.error('❌ Failed to set session:', error);
            }
        },

        // Clear user session
        clearSession() {
            this.currentUser = null;

            try {
                localStorage.removeItem(this.CONFIG.STORAGE_KEY);

                // Broadcast to other tabs
                this.broadcastAuthChange('logout', null);

                // Notify callbacks
                this.notifyCallbacks('logout', null);

                console.log('✅ Session cleared');
            } catch (error) {
                console.error('❌ Failed to clear session:', error);
            }
        },

        // Handle logout
        async handleLogout() {
            console.log('🚪 Processing logout...');

            // Sign out from Firebase if signed in
            await this.signOut();

            // Clear local session
            this.clearSession();

            console.log('✅ Logout complete');
        },

        // Sign out from Firebase
        async signOut() {
            if (!this.auth || !this.firebaseModules) {
                console.warn('⚠️ Firebase not available for signout');
                return;
            }

            try {
                await this.firebaseModules.signOut(this.auth);
                console.log('✅ Firebase signout successful');
            } catch (error) {
                console.warn('⚠️ Firebase signout failed:', error);
            }
        },

        // Sign in with email and password
        async signInWithEmailAndPassword(email, password) {
            if (!this.auth || !this.firebaseModules) {
                throw new Error('Firebase not initialized');
            }

            console.log('🔑 Attempting login for:', email);
            return await this.firebaseModules.signInWithEmailAndPassword(this.auth, email, password);
        },

        // Set up cross-tab synchronization
        setupCrossTabSync() {
            // Listen for storage changes (other tabs)
            window.addEventListener('storage', (event) => {
                if (event.key === this.CONFIG.STORAGE_KEY) {
                    if (event.newValue) {
                        // Another tab logged in
                        const userData = JSON.parse(event.newValue);
                        if (!this.currentUser || this.currentUser.sessionId !== userData.sessionId) {
                            this.currentUser = userData;
                            this.notifyCallbacks('login', userData);
                            console.log('🔄 Session synced from another tab');
                        }
                    } else {
                        // Another tab logged out
                        if (this.currentUser) {
                            this.currentUser = null;
                            this.notifyCallbacks('logout', null);
                            console.log('🔄 Logout synced from another tab');
                        }
                    }
                }
            });

            // Listen for custom auth events (same tab)
            window.addEventListener('lionsAuthChanged', (event) => {
                const { user, action } = event.detail;
                if (action === 'logout' && this.currentUser) {
                    // Force reload on logout for clean state
                    setTimeout(() => window.location.reload(), 100);
                }
            });
        },

        // Broadcast auth changes to other tabs
        broadcastAuthChange(action, userData) {
            try {
                const event = new CustomEvent('lionsAuthChanged', {
                    detail: { user: userData, action: action }
                });
                window.dispatchEvent(event);
            } catch (error) {
                console.warn('⚠️ Failed to broadcast auth change:', error);
            }
        },

        // Generate unique session ID
        generateSessionId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        },

        // Register callback for auth state changes
        onAuthStateChanged(callback) {
            this.callbacks.push(callback);

            // If already initialized, immediately call with current state
            if (this.isInitialized && this.currentUser) {
                try {
                    callback('login', this.currentUser);
                } catch (error) {
                    console.error('❌ Callback error:', error);
                }
            }
        },

        // Notify all callbacks of auth state change
        notifyCallbacks(action, userData) {
            this.callbacks.forEach(callback => {
                try {
                    callback(action, userData);
                } catch (error) {
                    console.error('❌ Callback error:', error);
                }
            });
        },

        // Notify when initialization is complete
        notifyInitializationComplete() {
            const event = new CustomEvent('lionsAuthInitialized', {
                detail: {
                    isInitialized: this.isInitialized,
                    currentUser: this.currentUser
                }
            });
            window.dispatchEvent(event);
        },

        // Utility methods
        hasPermission(permission) {
            return this.currentUser && this.currentUser.permissions &&
                this.currentUser.permissions[permission] === true;
        },

        canAccessPage(pageName) {
            if (!this.currentUser) return false;
            const accessKey = pageName.toLowerCase() + 'Access';
            return this.hasPermission(accessKey);
        },

        getCurrentUser() {
            return this.currentUser;
        },

        isLoggedIn() {
            return !!this.currentUser;
        },

        async forceLogout() {
            await this.handleLogout();
        },

        requireAuth(redirectUrl = '/') {
            if (!this.isLoggedIn()) {
                sessionStorage.setItem('lions_auth_redirect', window.location.href);
                window.location.href = redirectUrl;
                return false;
            }
            return true;
        },

        // Wait for initialization to complete
        async waitForInitialization(timeoutMs = 10000) {
            const startTime = Date.now();

            while (!this.isInitialized && (Date.now() - startTime) < timeoutMs) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!this.isInitialized) {
                throw new Error('Lions Auth initialization timeout');
            }

            return this.isInitialized;
        }
    };

    // Legacy compatibility
    window.UNIVERSAL_AUTH = {
        checkAuthStatus: () => window.LIONS_AUTH.getCurrentUser(),
        setAuthUser: (user) => window.LIONS_AUTH.setSession(user),
        clearAuthUser: () => window.LIONS_AUTH.clearSession(),
        setupCrossTabSync: () => { } // Already handled by LIONS_AUTH
    };

    // Auto-initialize
    function autoInitialize() {
        try {
            window.LIONS_AUTH.initialize().catch(error => {
                console.error('❌ Auto-initialization failed:', error);
            });
        } catch (error) {
            console.error('❌ Auto-initialization error:', error);
        }
    }

    // Initialize based on document ready state
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitialize);
    } else {
        // DOM already loaded
        setTimeout(autoInitialize, 0);
    }

    console.log('🦁 Lions Universal Authentication System v2.1 loaded');

})();