// lions-access.js
//
// Which roles may open which of the three administrator systems. One map, read
// by every caller that needs the answer, because the alternative is what this
// property already lived through: six files each carrying their own copy of an
// allow list, disagreeing quietly, and an administrator locked out of a page by
// a list nobody remembered was there.
//
// No dependencies and no Firebase. This file is safe to load on the public
// landing page, which is the whole reason it exists separately from
// universal-auth.js: the landing page needs to know whether to draw the Admin
// menu, and it must not pull an auth SDK onto the front door to find out.
//
// Roles are universal-auth.js vocabulary, which is what gets persisted to
// localStorage under lionsAuthUser.permissions.role. auth/lions-auth.js names
// the same three addresses differently, so the equivalence is recorded here
// rather than left for the next reader to rediscover:
//
//     address         lions-auth.js           universal-auth.js
//     fundraising@    System Administrator    Administrator
//     treasurer@      Treasurer               Treasurer
//     president@      Event Supervisor        President
//     anything else   Volunteer               User
//
// SYSTEM_ACCESS in auth/lions-auth.js remains authoritative for the systems
// this file does not list. Every one of those admits Volunteer, so a signed-in
// visitor already passes and the navigation does not gate them.

(function () {
    'use strict';

    var SYSTEM_ROLES = {
        dashboard: ['Administrator'],
        payouts:   ['Administrator', 'Treasurer'],
        treasurer: ['Administrator', 'Treasurer']
    };

    window.LIONS_ACCESS = {

        SYSTEM_ROLES: SYSTEM_ROLES,

        /**
         * True when a role may open a system.
         *
         * An unlisted system returns true: this map governs the three elevated
         * routes only, and refusing everything else would silently gate routes
         * that are open to every signed-in volunteer.
         *
         * @param {string} role    a universal-auth.js role name
         * @param {string} system  a key of SYSTEM_ROLES
         */
        canAccess: function (role, system) {
            var allowed = SYSTEM_ROLES[String(system || '').toLowerCase()];
            if (!allowed) { return true; }
            return allowed.indexOf(String(role || '').trim()) !== -1;
        },

        /**
         * Reads the session universal-auth.js persists, without loading it.
         *
         * Returns null when signed out or when the stored value is unreadable.
         * A corrupt entry is treated as signed out rather than repaired here,
         * because universal-auth.js owns that record and clears it itself on
         * the next page that runs a real auth check.
         */
        storedSession: function () {
            try {
                if (localStorage.getItem('lionsAuthState') !== 'authenticated') {
                    return null;
                }
                var raw = localStorage.getItem('lionsAuthUser');
                if (!raw) { return null; }

                var user = JSON.parse(raw);
                if (!user || !user.email) { return null; }

                return {
                    email: user.email,
                    displayName: user.displayName || '',
                    role: (user.permissions && user.permissions.role) || 'User',
                    isAdmin: !!(user.permissions && user.permissions.isAdmin)
                };
            } catch (error) {
                return null;
            }
        }
    };
}());
