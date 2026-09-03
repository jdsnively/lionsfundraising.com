/**
 * Local-date helpers for lionsfundraising.com.
 *
 * WHY THIS FILE EXISTS
 *
 * `new Date('2026-07-24')` is parsed as midnight UTC. In Indiana that is 8pm on
 * the 23rd, so `.toLocaleDateString()` prints July 23 for a date the volunteer
 * typed as July 24. Every date on this property that a person entered through an
 * `<input type="date">` arrives as a bare YYYY-MM-DD string, so every one of
 * them was a day early wherever it was rendered this way.
 *
 * It is not a formatting preference. A license expiration, an event date and a
 * date of birth on a signed hold harmless were each printing the wrong day.
 *
 * THE RULE
 *
 * A bare YYYY-MM-DD string is a calendar date, not an instant. It must be built
 * from its parts in local time, never handed to the Date constructor whole.
 *
 * Correct copies of this logic already existed in account/index.html,
 * signup/admin.js and signup/signup-config.js before this file did. Those three
 * are still carrying their own; collapsing them onto this file is the same
 * finding as M-4 and is deliberately left for that work rather than done here,
 * because they are correct today and changing correct code fixes nothing.
 */
(function (window) {
    'use strict';

    /**
     * A Date at local midnight on the calendar day the value names, or null.
     * Accepts a YYYY-MM-DD string, a Firestore Timestamp, or a Date.
     */
    function toLocalDate(value) {
        if (!value) { return null; }
        if (typeof value.toDate === 'function') {
            var t = value.toDate();
            return new Date(t.getFullYear(), t.getMonth(), t.getDate());
        }
        if (value instanceof Date) {
            return new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        var m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }

    /**
     * The same string `.toLocaleDateString()` would have produced, for the day
     * the value actually names. Empty string for anything unparseable, which is
     * what the call sites already wanted: they all guarded with a ternary and
     * printed nothing, or printed the words "Invalid Date" when they forgot to.
     */
    function formatLocalDate(value, options) {
        var d = toLocalDate(value);
        if (!d) { return ''; }
        return options ? d.toLocaleDateString('en-US', options) : d.toLocaleDateString();
    }

    window.toLocalDate = toLocalDate;
    window.formatLocalDate = formatLocalDate;
}(window));
