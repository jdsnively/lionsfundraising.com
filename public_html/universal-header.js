// LIONS UNIVERSAL HEADER SYSTEM v1.9
// COMPLETE RESTORATION - All icons, user info, styling, and functionality
// FIXES: User alignment, beer icon, image protection system

window.LIONS_HEADER = {
    // Configuration
    CONFIG: {
        LOGO_PROTECTION_ENABLED: true,
        ENHANCED_PROTECTION_ENABLED: true,
        PROXY_ENDPOINT: '/image-proxy.php',
        RESPONSIVE_BREAKPOINTS: {
            MOBILE: 480,
            TABLET: 768,
            DESKTOP: 1024
        },
        CONTAINER_SPACING: 'var(--space-4)',
        MAX_WIDTH: '1600px'
    },

    // Current page and user state
    currentUser: null,
    currentPage: null,
    isInitialized: false,
    renderingInProgress: false,

    // Image protection state
    protectionInitialized: false,
    proxyAccessToken: null,

    // Initialize header system
    async initialize() {
        if (this.isInitialized) return;

        console.log('Lions Universal Header System v1.9 initializing...');

        try {
            // Detect current page immediately
            this.detectCurrentPage();

            // Pre-insert CSS to prevent layout shifts
            this.insertCSS();

            // Initialize image protection
            await this.initializeImageProtection();

            // Get auth state immediately if available
            if (window.LIONS_AUTH?.isInitialized) {
                this.currentUser = window.LIONS_AUTH.getCurrentUser();
            } else {
                // Check localStorage for immediate auth state
                const storedUser = localStorage.getItem('lionsAuthUser');
                const storedState = localStorage.getItem('lionsAuthState');
                if (storedUser && storedState === 'authenticated') {
                    try {
                        this.currentUser = JSON.parse(storedUser);
                    } catch (error) {
                        // Silent fail
                    }
                }
            }

            // Set up auth listener only once
            if (window.LIONS_AUTH?.onAuthStateChanged && !this.authListenerSet) {
                window.LIONS_AUTH.onAuthStateChanged((action, userData) => {
                    if (userData !== this.currentUser) {
                        this.currentUser = userData;
                        this.updateUserInterfaceSmooth();
                    }
                });
                this.authListenerSet = true;
            }

            this.isInitialized = true;
            console.log('Lions Universal Header v1.9 initialized');

        } catch (error) {
            console.error('Lions Header initialization failed:', error);
            this.isInitialized = false;
        }
    },

    // Initialize image protection system
    async initializeImageProtection() {
        if (this.protectionInitialized) return;

        try {
            // Generate access token for this session
            this.proxyAccessToken = this.generateAccessToken();

            // Setup enhanced protection
            this.setupImageProtection();

            // Set up protected logo URL
            this.setupProtectedLogoURL();

            this.protectionInitialized = true;
            console.log('Lions image protection system initialized');

        } catch (error) {
            console.warn('Image protection initialization failed:', error);
        }
    },

    // Generate access token for image proxy
    generateAccessToken() {
        const timestamp = Date.now();
        const userAgent = navigator.userAgent.substring(0, 50);
        const domain = window.location.hostname;

        const tokenData = {
            timestamp: timestamp,
            userAgent: userAgent,
            domain: domain
        };

        return btoa(JSON.stringify(tokenData));
    },

    // Setup enhanced image protection
    setupImageProtection() {
        // Disable right-click on protected images
        document.addEventListener('contextmenu', (e) => {
            if (e.target.tagName === 'IMG' && e.target.getAttribute('data-protected')) {
                e.preventDefault();
                return false;
            }
        });

        // Disable drag on protected images
        document.addEventListener('dragstart', (e) => {
            if (e.target.tagName === 'IMG' && e.target.getAttribute('data-protected')) {
                e.preventDefault();
                return false;
            }
        });

        // Disable print screen detection
        document.addEventListener('keydown', (e) => {
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                return false;
            }
        });
    },

    // Setup protected logo URL
    setupProtectedLogoURL() {
        if (this.protectionInitialized && this.proxyAccessToken) {
            const protectedLogoUrl = `${this.CONFIG.PROXY_ENDPOINT}?image=lsc_head&token=${encodeURIComponent(this.proxyAccessToken)}&t=${Date.now()}`;
            document.documentElement.style.setProperty('--protected-logo-url', `url("${protectedLogoUrl}")`);
            console.log('Protected logo URL configured');
        }
    },

    // Detect current page from URL
    detectCurrentPage() {
        const path = window.location.pathname;

        if (path === '/' || path === '/index.html') {
            this.currentPage = 'home';
        } else if (path.includes('/register')) {
            this.currentPage = 'register';
        } else if (path.includes('/events')) {
            this.currentPage = 'events';
        } else if (path.includes('/earnings')) {
            this.currentPage = 'earnings';
        } else if (path.includes('/reimbursement')) {
            this.currentPage = 'reimbursement';
        } else if (path.includes('/dashboard')) {
            this.currentPage = 'dashboard';
        } else if (path.includes('/LOS')) {
            this.currentPage = 'LOS';
        } else if (path.includes('/sodexo-atc')) {
            this.currentPage = 'sodexo-atc';
        } else if (path.includes('/account')) {
            this.currentPage = 'account';
        } else if (path.includes('/payouts')) {
            this.currentPage = 'payouts';
        } else if (path.includes('/claims')) {
            this.currentPage = 'claims';
        } else {
            this.currentPage = 'unknown';
        }
    },

    // Check if user has elevated admin role
    isElevatedUser() {
        if (!this.currentUser || !this.currentUser.email) return false;

        const email = this.currentUser.email.toLowerCase();
        const elevatedRoles = [
            'fundraising@lionsfootballclub.com',
            'treasurer@lionsfootballclub.com',
            'president@lionsfootballclub.com'
        ];

        return elevatedRoles.includes(email) || this.currentUser.permissions?.isAdmin;
    },

    // Generate complete header HTML with zero flash
    generateHeaderHTML() {
        // Pre-calculate all content to avoid multiple renders
        const userInfoSection = this.generateUserInfoSection();
        const mainHeader = this.generateMainHeader();

        return userInfoSection + mainHeader;
    },

    // Generate user info section - FIXED RIGHT ALIGNMENT
    generateUserInfoSection() {
        // On home page when not logged in, show nothing
        if (this.currentPage === 'home' && !this.currentUser) {
            return '';
        }

        if (!this.currentUser) {
            return `
                <div class="user-info-section user-info-logged-out">
                    <div class="login-register-buttons">
                        <a href="/login" class="login-link" onclick="LIONS_HEADER.storeCurrentPageAndLogin(event)">🔐 Sign In</a>
                        <a href="/register" class="register-link">📋 Register</a>
                    </div>
                </div>
            `;
        }

        return `
            <div class="user-info-section user-info-logged-in">
                <div class="user-details">
                    <div class="user-avatar">${this.currentUser.email.charAt(0).toUpperCase()}</div>
                    <div class="user-name">Welcome, ${this.currentUser.email}</div>
                </div>
                <div class="user-actions">
                    <button class="my-account-btn" onclick="LIONS_HEADER.goToMyAccount()">
                        My Account
                    </button>
                    <button class="logout-btn" onclick="LIONS_HEADER.handleLogout()">
                        Sign Out
                    </button>
                </div>
                <div class="mobile-user-dropdown">
                    <button class="user-dropdown-btn" onclick="LIONS_HEADER.toggleMobileDropdown()">
                        ${this.currentUser.email.charAt(0).toUpperCase()} ▼
                    </button>
                    <div class="mobile-dropdown-menu hidden" id="mobileDropdownMenu">
                        <button onclick="LIONS_HEADER.goToMyAccount()">My Account</button>
                        <button onclick="LIONS_HEADER.handleLogout()">Sign Out</button>
                    </div>
                </div>
            </div>
        `;
    },

    // Generate main header with ALL icons and navigation
    generateMainHeader() {
        const navigationPills = this.generateNavigationPills();

        // Use proxy URL for logo with proper token
        const logoProtected = this.protectionInitialized ? 'data-protected="true"' : '';

        return `
            <div class="header">
                <div class="header-logo">
                    <div class="logo" ${logoProtected}></div>
                    <div class="header-brand-section">
                        <a href="/" class="header-brand">Lions Fundraising</a>
                        <div class="header-tagline">Supporting Our Community Champions</div>
                    </div>
                </div>
                <nav class="nav-pills">
                    ${navigationPills}
                </nav>
            </div>
        `;
    },

    // Generate navigation pills with ALL icons - BEER ICON FIXED
    generateNavigationPills() {
        const navigationConfig = [
            { key: 'home', name: 'Home', icon: '🏠', url: '/', alwaysShow: false },
            { key: 'events', name: 'Events', icon: '📅', url: '/events', requiresAuth: true },
            { key: 'earnings', name: 'Earnings', icon: '💵', url: '/earnings', requiresAuth: true },
            { key: 'reimbursement', name: 'Reimbursement', icon: '💰', url: '/reimbursement', requiresAuth: true },
            { key: 'LOS', name: 'LOS', icon: '📋', url: '/LOS', permission: 'losAccess' },
            { key: 'sodexo-atc', name: 'License', icon: '🍺', url: '/sodexo-atc', alwaysShow: true }
        ];

        const pills = navigationConfig
            .filter(page => this.shouldShowNavigation(page))
            .map(page => {
                const activeClass = page.key === this.currentPage ? ' active' : '';
                return `<a href="${page.url}" class="nav-pill${activeClass}">
                    <span>${page.icon}</span>
                    <span class="nav-text">${page.name}</span>
                </a>`;
            });

        // Add Admin dropdown for elevated users
        if (this.isElevatedUser()) {
            const adminActiveClass = ['dashboard', 'payouts', 'claims'].includes(this.currentPage) ? ' active' : '';
            pills.push(`
                <div class="admin-dropdown">
                    <button class="nav-pill admin-pill${adminActiveClass}" onclick="LIONS_HEADER.toggleAdminDropdown()">
                        <span>⚙️</span>
                        <span class="nav-text">Admin</span>
                        <span class="dropdown-arrow">▼</span>
                    </button>
                    <div class="admin-dropdown-menu hidden" id="adminDropdownMenu">
                        <a href="/dashboard" class="admin-dropdown-item">
                            <span>📊</span>
                            <span>Dashboard</span>
                        </a>
                        <a href="/payouts" class="admin-dropdown-item">
                            <span>💳</span>
                            <span>Payouts</span>
                        </a>
                        <a href="/treasurer" class="admin-dropdown-item">
                            <span>💼</span>
                            <span>Treasurer</span>
                        </a>
                        <a href="/claims" class="admin-dropdown-item">
                            <span>📄</span>
                            <span>Claims</span>
                        </a>
                    </div>
                </div>
            `);
        }

        return pills.join('');
    },

    // Determine if navigation item should be shown
    shouldShowNavigation(page) {
        // Special case: On home page when not logged in, only show LOS and License
        if (this.currentPage === 'home' && !this.currentUser) {
            return page.key === 'LOS' || page.key === 'sodexo-atc';
        }

        if (page.alwaysShow) return true;
        if (page.key === this.currentPage) return false;

        if (page.key === 'LOS') {
            if (!this.currentUser) return true;
            return this.currentUser.permissions && this.currentUser.permissions.losAccess;
        }

        if (page.requiresAuth && !this.currentUser) return false;

        if (page.permission && this.currentUser) {
            return this.currentUser.permissions && this.currentUser.permissions[page.permission];
        }

        return true;
    },

    // Generate CSS with complete styling
    generateHeaderCSS() {
        return `
            /* CSS VARIABLES */
            :root {
                --navy-blue: #1a365d;
                --navy-blue-dark: #153e75;
                --white: #ffffff;
                --gray-100: #f4f4f5;
                --gray-500: #6b7280;
                --gray-700: #374151;
                --space-1: 4px;
                --space-2: 8px;
                --space-3: 12px;
                --space-4: 16px;
                --space-6: 24px;
                --space-8: 32px;
                --radius-md: 8px;
                --radius-lg: 12px;
                --radius-xl: 16px;
                --border-medium: 2px solid var(--navy-blue);
                --border-light: 1px solid #e5e7eb;
                --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                --font-display: 'Inter', sans-serif;
            }

            /* SMOOTH LOADING OPTIMIZATIONS */
            .user-info-section, .header {
                opacity: 1;
                transition: opacity 0.1s ease;
            }

            .user-info-section.loading, .header.loading {
                opacity: 0;
            }

            /* USER INFO SECTION - RESTORED */
            .user-info-section {
                min-height: 44px;
                display: flex;
                justify-content: flex-end;
                align-items: center;
                padding: var(--space-2);
                margin-bottom: var(--space-4);
                gap: var(--space-2);
                font-size: 0.75rem;
                max-width: 1600px;
                margin-left: auto;
                margin-right: auto;
                background: #f8fafc;
                border-radius: var(--radius-md);
                border: 1px solid #f1f5f9;
            }

            /* MAIN HEADER */
            .header {
                min-height: 120px;
                background: var(--white);
                border-radius: var(--radius-xl);
                padding: var(--space-8);
                margin: 0 auto var(--space-4);
                border: 2px solid var(--navy-blue);
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: var(--space-4);
                max-width: 1600px;
            }

            /* USER INFO LOGGED OUT */
            .user-info-logged-out .login-register-buttons {
                display: flex;
                align-items: center;
                gap: var(--space-2);
            }

            .login-link,
            .register-link {
                padding: var(--space-2) var(--space-4);
                text-decoration: none;
                border-radius: var(--radius-md);
                font-weight: 600;
                font-size: 0.75rem;
                transition: all 0.2s ease;
                border: var(--border-medium);
                min-height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .login-link {
                background: var(--white);
                color: var(--navy-blue);
            }

            .register-link {
                background: var(--navy-blue);
                color: var(--white);
            }

            .login-link:hover {
                background: var(--navy-blue);
                color: var(--white);
                transform: translateY(-2px);
            }

            .register-link:hover {
                background: var(--navy-blue-dark);
                transform: translateY(-2px);
            }

            /* USER INFO LOGGED IN - FIXED RIGHT ALIGNMENT */
            .user-info-logged-in {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                width: 100%;
                background: #f8fafc;
                padding: var(--space-3);
                border-radius: var(--radius-md);
                gap: var(--space-4);
            }

            .user-details {
                display: flex;
                align-items: center;
                gap: var(--space-2);
            }

            .user-avatar {
                width: 32px;
                height: 32px;
                background: var(--navy-blue);
                color: var(--white);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 0.9rem;
            }

            .user-name {
                font-weight: 600;
                color: var(--navy-blue);
                font-size: 0.85rem;
            }

            .user-actions {
                display: flex;
                gap: var(--space-2);
            }

            .my-account-btn,
            .logout-btn {
                padding: var(--space-2) var(--space-3);
                border: 1px solid var(--navy-blue);
                border-radius: var(--radius-md);
                background: var(--white);
                color: var(--navy-blue);
                font-weight: 600;
                font-size: 0.75rem;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: var(--font-primary);
                min-height: 32px;
            }

            .my-account-btn:hover,
            .logout-btn:hover {
                background: var(--navy-blue);
                color: var(--white);
            }

            .mobile-user-dropdown {
                display: none;
                position: relative;
            }

            .user-dropdown-btn {
                background: var(--navy-blue);
                color: var(--white);
                border: none;
                border-radius: var(--radius-md);
                padding: var(--space-2) var(--space-3);
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                min-height: 36px;
                display: flex;
                align-items: center;
                gap: var(--space-1);
            }

            .mobile-dropdown-menu {
                position: absolute;
                top: 100%;
                right: 0;
                background: var(--white);
                border: var(--border-light);
                border-radius: var(--radius-lg);
                padding: var(--space-3);
                min-width: 150px;
                z-index: 1000;
                margin-top: var(--space-2);
            }

            .mobile-dropdown-menu button {
                display: block;
                width: 100%;
                padding: var(--space-3);
                background: none;
                border: none;
                text-align: left;
                cursor: pointer;
                font-size: 0.85rem;
                font-family: var(--font-primary);
                font-weight: 500;
                color: var(--navy-blue-dark);
                border-radius: var(--radius-md);
                margin-bottom: var(--space-1);
            }

            .mobile-dropdown-menu button:hover {
                background: var(--gray-100);
                color: var(--navy-blue);
            }

            /* HEADER LOGO */
            .header-logo {
                display: flex;
                align-items: center;
                gap: var(--space-4);
            }

            .logo {
                width: 70px;
                height: 70px;
                background: var(--white);
                border-radius: var(--radius-lg);
                border: 2px solid var(--navy-blue);
                background-image: url('/media/lsc_head.png');
                background-size: 85%;
                background-repeat: no-repeat;
                background-position: center;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                user-select: none;
                -webkit-user-drag: none;
                -khtml-user-drag: none;
                -moz-user-drag: none;
                -o-user-drag: none;
                user-drag: none;
                pointer-events: none;
                -webkit-touch-callout: none;
                position: relative;
                overflow: hidden;
                filter: contrast(1.1) saturate(1.1);
            }

            /* Enhanced Protection Styles */
            .logo[data-protected="true"] {
                background-image: var(--protected-logo-url, url('/media/lsc_head.png'));
            }

            [data-protected="true"] {
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -webkit-user-drag: none;
                -moz-user-drag: none;
                pointer-events: auto;
            }

            /* Print protection */
            @media print {
                [data-protected="true"] {
                    visibility: hidden;
                }
            }

            .header-brand-section {
                display: flex;
                flex-direction: column;
            }

            .header-brand {
                font-family: var(--font-display);
                font-size: 1.75rem;
                color: var(--navy-blue-dark);
                font-weight: 700;
                text-decoration: none;
                text-shadow: 0 1px 2px rgba(26, 54, 93, 0.1);
                transition: color 0.2s ease;
            }

            .header-brand:hover {
                color: var(--navy-blue);
            }

            .header-tagline {
                font-size: 0.95rem;
                color: var(--gray-500);
                font-weight: 500;
                font-style: italic;
                margin-top: var(--space-1);
            }

            /* NAVIGATION PILLS */
            .nav-pills {
                display: flex;
                gap: var(--space-3);
                flex-wrap: wrap;
                align-items: center;
            }

            .nav-pill {
                display: flex;
                align-items: center;
                gap: var(--space-2);
                padding: var(--space-3) var(--space-6);
                background: var(--white);
                color: var(--navy-blue);
                text-decoration: none;
                border-radius: var(--radius-lg);
                border: 2px solid var(--navy-blue);
                font-weight: 600;
                font-size: 1rem;
                min-height: 48px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: var(--font-primary);
            }

            .nav-pill:hover {
                background: var(--navy-blue);
                color: var(--white);
                transform: translateY(-2px);
            }

            .nav-pill.active {
                background: var(--navy-blue);
                color: var(--white);
            }

            /* ADMIN DROPDOWN */
            .admin-dropdown {
                position: relative;
            }

            .admin-pill {
                position: relative;
            }

            .dropdown-arrow {
                transition: transform 0.2s ease;
            }

            .admin-pill:hover .dropdown-arrow {
                transform: rotate(180deg);
            }

            .admin-dropdown-menu {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: var(--white);
                border: var(--border-light);
                border-radius: var(--radius-lg);
                padding: var(--space-3);
                min-width: 200px;
                z-index: 1000;
                margin-top: var(--space-2);
            }

            .admin-dropdown-item {
                display: flex;
                align-items: center;
                gap: var(--space-2);
                padding: var(--space-3);
                text-decoration: none;
                color: var(--navy-blue-dark);
                border-radius: var(--radius-md);
                transition: all 0.2s ease;
                font-weight: 500;
                font-size: 0.9rem;
                margin-bottom: var(--space-1);
            }

            .admin-dropdown-item:hover {
                background: var(--gray-100);
                color: var(--navy-blue);
            }

            .admin-dropdown-item:last-child {
                margin-bottom: 0;
            }

            /* UTILITY CLASSES */
            .hidden {
                display: none !important;
            }

            /* RESPONSIVE DESIGN */
            @media (max-width: 480px) {
                .user-info-section {
                    justify-content: space-between;
                    padding: var(--space-3);
                    margin-bottom: var(--space-4);
                    gap: var(--space-2);
                    font-size: 0.8rem;
                }

                .user-actions {
                    display: none;
                }

                .mobile-user-dropdown {
                    display: block;
                }

                .header {
                    flex-direction: column;
                    text-align: center;
                    gap: var(--space-4);
                    padding: var(--space-6);
                    margin: 0 var(--space-2) var(--space-4);
                    max-width: none;
                }

                .nav-pills {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--space-3);
                    justify-content: center;
                    width: 100%;
                }

                .nav-pill {
                    padding: var(--space-3);
                    font-size: 0.8rem;
                    min-height: 44px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-1);
                    line-height: 1.2;
                }

                .admin-dropdown {
                    grid-column: span 2;
                }

                .admin-dropdown-menu {
                    right: 50%;
                    transform: translateX(50%);
                    min-width: 200px;
                }
            }

            @media (min-width: 481px) and (max-width: 768px) {
                .header {
                    padding: var(--space-6);
                    gap: var(--space-6);
                }

                .nav-pills {
                    gap: var(--space-2);
                }

                .nav-pill {
                    padding: var(--space-2) var(--space-4);
                    font-size: 0.9rem;
                    min-height: 44px;
                }
            }
        `;
    },

    // Navigation functions
    goToMyAccount() {
        window.location.href = '/account';
    },

    async handleLogout() {
        if (window.LIONS_AUTH && typeof window.LIONS_AUTH.forceLogout === 'function') {
            await window.LIONS_AUTH.forceLogout();
        } else {
            // Fallback logout
            localStorage.removeItem('lionsAuthUser');
            localStorage.removeItem('lionsAuthState');
            sessionStorage.clear();
            this.currentUser = null;
            window.location.href = '/';
        }
    },

    toggleMobileDropdown() {
        const menu = document.getElementById('mobileDropdownMenu');
        if (menu) {
            menu.classList.toggle('hidden');

            if (!menu.classList.contains('hidden')) {
                const closeOnOutsideClick = (event) => {
                    if (!event.target.closest('.mobile-user-dropdown')) {
                        menu.classList.add('hidden');
                        document.removeEventListener('click', closeOnOutsideClick);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 10);
            }
        }
    },

    toggleAdminDropdown() {
        const menu = document.getElementById('adminDropdownMenu');
        if (menu) {
            menu.classList.toggle('hidden');

            if (!menu.classList.contains('hidden')) {
                const closeOnOutsideClick = (event) => {
                    if (!event.target.closest('.admin-dropdown')) {
                        menu.classList.add('hidden');
                        document.removeEventListener('click', closeOnOutsideClick);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 10);
            }
        }
    },

    storeCurrentPageAndLogin(event) {
        event.preventDefault();
        if (window.LIONS_AUTH) {
            window.LIONS_AUTH.storeRedirectUrl(window.location.href);
        } else {
            sessionStorage.setItem('lionsAuthRedirect', window.location.href);
        }
        window.location.href = '/login';
    },

    // OPTIMIZED insertion - prevents flash
    insertHeader(containerId = 'headerContainer') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Header container '${containerId}' not found`);
            return false;
        }

        // Insert HTML immediately to prevent flash
        container.innerHTML = this.generateHeaderHTML();
        return true;
    },

    // Insert CSS early to prevent layout shifts
    insertCSS() {
        const existingStyle = document.getElementById('lions-header-styles');
        if (existingStyle) return;

        const style = document.createElement('style');
        style.id = 'lions-header-styles';
        style.textContent = this.generateHeaderCSS();
        document.head.appendChild(style);
    },

    // SMOOTH update interface - prevents visual artifacts
    updateUserInterfaceSmooth() {
        if (this.renderingInProgress) return;
        this.renderingInProgress = true;

        const headerContainer = document.getElementById('headerContainer');
        if (headerContainer) {
            // Use document fragment to prevent layout thrashing
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.generateHeaderHTML();

            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }

            // Quick swap
            requestAnimationFrame(() => {
                headerContainer.innerHTML = '';
                headerContainer.appendChild(fragment);
                this.renderingInProgress = false;
            });
        } else {
            this.renderingInProgress = false;
        }
    },

    // Main setup function for pages
    async setupPage(containerId = 'headerContainer') {
        await this.initialize();
        return this.insertHeader(containerId);
    }
};

// IMMEDIATE initialization to prevent flash
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.LIONS_HEADER.initialize();
    });
} else {
    window.LIONS_HEADER.initialize();
}

console.log('Lions Universal Header v1.9 loaded - ALL FIXES APPLIED');