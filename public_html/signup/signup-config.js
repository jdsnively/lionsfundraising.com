/**
 * signup-config.js
 *
 * Configuration and pure functions for the Lions Sports Club event signup
 * system. Contains no DOM access and no Firestore calls so that every rule
 * below can be evaluated and tested in isolation.
 *
 * Depends on relationship-config.js for priority tiers.
 *
 * Load order:
 *   /js/lions-log.js
 *   /relationship-config.js
 *   /signup/signup-config.js
 */

const SIGNUP_CONFIG = {

    // ------------------------------------------------------------------
    // Season
    //
    // Runs August 1 through July 31 and is independent of the fiscal year.
    // The value is written onto every event and signup at creation and is
    // never derived at read time: a derived season silently reclassifies
    // historical records whenever this boundary changes.
    //
    // The 2026-2027 Sodexo contract opens with Gen Con on July 30 and 31,
    // which falls outside this boundary. Those dates are not worked and are
    // treated as an outlier rather than a reason to move the boundary.
    // ------------------------------------------------------------------

    SEASON_START_MONTH: 8,
    SEASON_START_DAY: 1,

    /** Returns the season identifier containing the supplied date. */
    seasonFor(date) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const startedThisYear =
            (d.getMonth() + 1) > this.SEASON_START_MONTH ||
            ((d.getMonth() + 1) === this.SEASON_START_MONTH && d.getDate() >= this.SEASON_START_DAY);
        const startYear = startedThisYear ? y : y - 1;
        return startYear + '-' + (startYear + 1);
    },

    /** Inclusive start and exclusive end dates for a season identifier. */
    seasonBounds(season) {
        const startYear = parseInt(String(season).split('-')[0], 10);
        return {
            start: new Date(startYear, this.SEASON_START_MONTH - 1, this.SEASON_START_DAY),
            end:   new Date(startYear + 1, this.SEASON_START_MONTH - 1, this.SEASON_START_DAY)
        };
    },

    // ------------------------------------------------------------------
    // Shifts
    //
    // An event carries one all-day shift unless an administrator splits it.
    // Times are stored per event and are unrelated to gate time: the 2025
    // schedule ran an 08:00 shift for a 13:00 kickoff.
    // ------------------------------------------------------------------

    SHIFT_TEMPLATES: {
        allDay: [
            { key: 'ALL', label: 'All Day', startTime: '08:00', endTime: '23:30' }
        ],
        split: [
            { key: 'AM', label: 'Morning', startTime: '08:00', endTime: '16:30' },
            { key: 'PM', label: 'Evening', startTime: '15:30', endTime: '23:30' }
        ]
    },

    // Assignment targets, not limits enforced against volunteers. Anyone may
    // declare availability for any shift; capacity governs how many the
    // administrator schedules.
    DEFAULT_TARGETS: {
        licensed: 4,
        unlicensed: 4
    },

    GROUPS: [
        { key: 'licensed',   label: 'Alcohol License Required', requiresLicense: true },
        { key: 'unlicensed', label: 'No License Needed',        requiresLicense: false }
    ],

    /** Shift structure for a new event. */
    shiftsFor(splitShifts) {
        const template = splitShifts ? this.SHIFT_TEMPLATES.split : this.SHIFT_TEMPLATES.allDay;
        return template.map(s => ({
            key: s.key,
            label: s.label,
            startTime: s.startTime,
            endTime: s.endTime,
            targets: Object.assign({}, this.DEFAULT_TARGETS)
        }));
    },

    // ------------------------------------------------------------------
    // Signup states
    // ------------------------------------------------------------------

    STATES: {
        AVAILABLE: 'available',   // declared, committed to hold the date
        SCHEDULED: 'scheduled',   // assigned to work
        STANDBY:   'standby',     // not scheduled, holding the date
        RELEASED:  'released'     // not scheduled, date given up
    },

    // ------------------------------------------------------------------
    // Timing
    // ------------------------------------------------------------------

    ASSIGNMENT_LEAD_DAYS: 7,      // target for publishing the schedule
    CANCELLATION_CUTOFF_DAYS: 4,  // self-service cancellation closes here
    LICENSE_WARNING_DAYS: 60,     // permit renewal takes several weeks

    /** Whole days from now until the event, negative once it has passed. */
    daysUntil(eventDate, now) {
        const event = eventDate instanceof Date ? eventDate : new Date(eventDate);
        const from = now instanceof Date ? now : (now ? new Date(now) : new Date());
        const a = Date.UTC(event.getFullYear(), event.getMonth(), event.getDate());
        const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
        return Math.round((a - b) / 86400000);
    },

    /**
     * Self-service cancellation is permitted outside the cutoff. Inside it,
     * the request routes to an administrator with a reason.
     */
    canSelfCancel(eventDate, now) {
        return this.daysUntil(eventDate, now) >= this.CANCELLATION_CUTOFF_DAYS;
    },

    // ------------------------------------------------------------------
    // Alcohol permit validity
    //
    // Evaluated against the EVENT date rather than today. A permit expiring
    // between declaration and the event does not qualify. As of 2026-07-28
    // three active volunteers held permits that had lapsed without any part
    // of the system detecting it.
    // ------------------------------------------------------------------

    LICENSE: {
        VALID:      'valid',
        EXPIRING:   'expiring',    // valid now, lapses before the event
        EXPIRED:    'expired',
        INCOMPLETE: 'incomplete',  // claimed, but number or date unusable
        NONE:       'none'
    },

    /**
     * Reads a stored date into a LOCAL date at midnight.
     *
     * Passing a bare YYYY-MM-DD to the Date constructor parses it as UTC. The
     * result was then compared against a local now, so in Indianapolis, four
     * hours behind in summer, a permit expiring today read as expired from
     * 20:00 the previous evening. That disqualifies a volunteer whose permit
     * is genuinely valid on event day, which is the exact failure this
     * function exists to prevent. Firestore Timestamps are accepted too, since
     * older records hold them.
     */
    toLocalDate(value) {
        if (!value) {
            return null;
        }
        if (typeof value.toDate === 'function') {
            const d = value.toDate();
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        if (value instanceof Date) {
            return isNaN(value.getTime())
                ? null
                : new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    },

    /**
     * Resolves a roster record to a permit state for a given event date.
     * A permit number shorter than four characters is treated as incomplete:
     * at least one record holds the literal string "VB".
     */
    licenseStatusFor(person, eventDate) {
        if (!person || person.hasLicense !== 'yes') {
            return this.LICENSE.NONE;
        }

        const number = String(person.licenseNumber || '').trim();
        const raw = String(person.licenseExpiration || '').trim();

        if (number.length < 4) {
            return this.LICENSE.INCOMPLETE;
        }
        if (!raw) {
            return this.LICENSE.INCOMPLETE;
        }

        const expires = this.toLocalDate(raw);
        if (!expires) {
            return this.LICENSE.INCOMPLETE;
        }

        const event = this.toLocalDate(eventDate) || new Date();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (expires < today) return this.LICENSE.EXPIRED;
        if (expires < event) return this.LICENSE.EXPIRING;
        return this.LICENSE.VALID;
    },

    /** True only when the permit is valid through the event date. */
    canWorkLicensedSlot(person, eventDate) {
        return this.licenseStatusFor(person, eventDate) === this.LICENSE.VALID;
    },

    // ------------------------------------------------------------------
    // Eligibility
    // ------------------------------------------------------------------

    MINOR_AGE_RANGES: ['16 to 17'],

    /**
     * Contact details for minors are withheld from other volunteers.
     * Comparison is case-insensitive: at least one record stored
     * "21 and Over" against "21 and over" everywhere else.
     */
    isMinor(person) {
        const age = String((person && person.ageRange) || '').trim().toLowerCase();
        return this.MINOR_AGE_RANGES.some(r => r.toLowerCase() === age);
    },

    /** Priority tier, delegated to the relationship configuration. */
    priorityTier(person) {
        if (window.RELATIONSHIP_CONFIG) {
            return window.RELATIONSHIP_CONFIG.getPriorityTier(person && person.relationship);
        }
        return 99;
    },

    /** Archived records are never invited, listed, or assigned. */
    isStaffable(person) {
        if (window.RELATIONSHIP_CONFIG) {
            return window.RELATIONSHIP_CONFIG.isStaffable(person && person.relationship);
        }
        return true;
    },

    /**
     * Orders declarations for the assignment screen: priority tier first,
     * then declaration time. Guests inherit the tier of the person who added
     * them so a family is not split across the list.
     */
    compareForAssignment(a, b) {
        const ta = a.priorityTier || 99;
        const tb = b.priorityTier || 99;
        if (ta !== tb) return ta - tb;
        return (a.createdAt || 0) - (b.createdAt || 0);
    },

    // ------------------------------------------------------------------
    // Commitment acknowledgment
    //
    // Presented at declaration rather than at standby, because that is where
    // the obligation begins. The version is stored alongside the timestamp so
    // there is a record of the exact wording each volunteer agreed to.
    // ------------------------------------------------------------------

    COMMITMENT_VERSION: 'v1',

    COMMITMENT_TEXT:
        'Marking yourself available is a commitment to keep the date open. ' +
        'We schedule about a week ahead and will email you either way. ' +
        'If you are not scheduled you can choose to stay on standby or release the date.',

    COMMITMENT_CHECKBOX: 'I understand and will hold these dates until I hear back.',

    // ------------------------------------------------------------------
    // Outbound email
    //
    // Sent in batches. Microsoft 365 throttles at approximately 30 recipients
    // per minute, and a single send to the full roster is the shape most
    // likely to trip both throttling and spam heuristics. Every recipient is
    // recorded individually so an interrupted run resumes without sending
    // twice.
    // ------------------------------------------------------------------

    EMAIL: {
        BATCH_SIZE: 20,
        BATCH_DELAY_MS: 60000,
        FROM_NAME: 'Lions Sports Club',
        REPLY_TO: 'fundraising@lionssports.club'
    },

    // ------------------------------------------------------------------
    // Firestore
    // ------------------------------------------------------------------

    COLLECTIONS: {
        EVENTS:    'Lions-Events',
        SIGNUPS:   'signups',              // subcollection of an event
        USERS:     'Lions-Fundraising-Users',
        AUDIT:     'Lions-Audit-Log',
        CAMPAIGNS: 'Lions-Invite-Campaigns'
    },

    VENUE_DEFAULT: 'Lucas Oil Stadium',
    TIMEZONE: 'America/Indianapolis'
};

window.SIGNUP_CONFIG = SIGNUP_CONFIG;

if (window.LIONS_LOG) {
    window.LIONS_LOG.log('Signup config loaded, season ' + SIGNUP_CONFIG.seasonFor(new Date()));
}
