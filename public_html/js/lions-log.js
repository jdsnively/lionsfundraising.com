/**
 * lions-log.js
 *
 * Console output gate for Lions Sports Club web properties.
 *
 * Informational logging is silent by default. Production pages previously
 * printed authenticated email addresses, Firebase UIDs, and the full
 * permissions object on every load, which is visible in any screenshot or
 * screen share and enumerates the exact fields an attacker would target.
 *
 * Diagnostic output is enabled per session by either:
 *   - appending ?debug=1 to the page URL, or
 *   - setting localStorage.lionsDebug = '1'
 *
 * Errors are never suppressed. A failure the operator cannot see is worse
 * than a disclosure risk.
 *
 * Load before any other Lions script:
 *   <script src="/js/lions-log.js"></script>
 */

(function () {
    'use strict';

    var enabled = false;

    try {
        enabled = new URLSearchParams(window.location.search).has('debug')
               || window.localStorage.getItem('lionsDebug') === '1';
    } catch (e) {
        // Private browsing modes can throw on localStorage access. Default to
        // silent rather than failing the page load.
        enabled = false;
    }

    window.LIONS_LOG = {

        enabled: enabled,

        /** Diagnostic detail. Suppressed unless debug is enabled. */
        log: function () {
            if (this.enabled) console.log.apply(console, arguments);
        },

        /** Recoverable problems. Suppressed unless debug is enabled. */
        warn: function () {
            if (this.enabled) console.warn.apply(console, arguments);
        },

        /** Always printed. */
        error: function () {
            console.error.apply(console, arguments);
        },

        /** Grouped diagnostic output. Collapses to nothing when disabled. */
        group: function (label) {
            if (this.enabled) console.groupCollapsed(label);
        },

        groupEnd: function () {
            if (this.enabled) console.groupEnd();
        },

        /**
         * Enables output for this browser until explicitly disabled. Intended
         * for support scenarios where a volunteer is asked to reproduce a
         * problem.
         */
        enable: function () {
            try { window.localStorage.setItem('lionsDebug', '1'); } catch (e) {}
            this.enabled = true;
            console.log('Lions diagnostic logging enabled for this browser.');
        },

        disable: function () {
            try { window.localStorage.removeItem('lionsDebug'); } catch (e) {}
            this.enabled = false;
            console.log('Lions diagnostic logging disabled.');
        }
    };

}());
