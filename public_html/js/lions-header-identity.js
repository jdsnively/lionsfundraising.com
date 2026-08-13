// lions-header-identity.js
//
// Wires the shared header's identity controls and the Admin group on any page
// that carries the header but runs no auth flow of its own.
//
// Until 2026-08-05 five pages on this property carried the shared header and
// called LIONS_NAV.setAuth zero times between them: the landing page, /login,
// /register, /LOS and /sodexo-atc. The header on all five rendered signed out
// for everybody, always. No Admin group, no My Account, no Sign out, even for
// an administrator who had signed in a moment earlier on another page.
//
// Neither lions-nav.js nor canAccess was ever at fault. Nothing asked them.
//
// Pages with their own auth flow do not load this file. /account, /signup,
// /dashboard, /payouts and /treasurer each resolve a live session and call
// setAuth themselves, and a second caller would fight the first.
//
// Requires js/lions-access.js. Load that first.

(function () {
    'use strict';

    /*
     * The session is read from localStorage rather than by resolving a live
     * one. On the landing page that is a deliberate trade: it is the public
     * front door, its job is converting an anonymous visitor to Register, and
     * pulling an auth SDK onto it for every one of those visitors to decide
     * whether to draw a menu three people can use is the wrong cost.
     *
     * That makes this display only, which is the correct posture regardless:
     * the menu is an affordance, and /dashboard, /payouts and /treasurer each
     * run a real auth check on arrival. A tampered localStorage entry buys a
     * link to a page that will refuse you.
     */
    function wireHeader() {
        if (!window.LIONS_NAV || typeof window.LIONS_NAV.setAuth !== 'function') { return; }
        if (!window.LIONS_ACCESS) { return; }

        var session = window.LIONS_ACCESS.storedSession();
        if (!session) { return; }

        // Set by the page as <body data-nav-active="los"> when it wants its own
        // row marked current. Absent is fine and means nothing is marked.
        var active = (document.body && document.body.getAttribute('data-nav-active')) || '';

        window.LIONS_NAV.setAuth({
            signedIn: true,
            active: active,
            canAccess: function (system) {
                return window.LIONS_ACCESS.canAccess(session.role, system);
            },
            onSignOut: signOut
        });
    }

    /*
     * The Firebase session belongs to universal-auth.js. On a page that has
     * already loaded it this is immediate; on the landing page, which has not,
     * it is fetched on demand. Clearing localStorage alone would drop the
     * display state on this page while leaving the account signed in on every
     * other one, which is the worst of both.
     */
    function signOut() {
        if (window.LIONS_AUTH && typeof window.LIONS_AUTH.forceLogout === 'function') {
            window.LIONS_AUTH.forceLogout();
            return;
        }

        var script = document.createElement('script');
        script.src = '/universal-auth.js';
        script.onload = function () {
            if (window.LIONS_AUTH && window.LIONS_AUTH.forceLogout) {
                window.LIONS_AUTH.forceLogout();
            } else {
                window.location.reload();
            }
        };
        script.onerror = function () { window.location.reload(); };
        document.head.appendChild(script);
    }

    // lions-nav.js is deferred and builds the header on DOMContentLoaded. A
    // deferred script is guaranteed to run before that event fires, so the
    // header exists by the time this does.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireHeader);
    } else {
        wireHeader();
    }
}());
