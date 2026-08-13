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

    // ------------------------------------------------------------------
    // Stands
    //
    // Lions Sports Club works two stands at Lucas Oil Stadium. They are
    // staffed independently and each needs its own lead, so a target is a
    // property of a stand and not of a shift.
    //
    // 124 is the main stand, the Indy Doghouse, and runs four licensed and
    // four unlicensed.
    //
    // 132PB runs three people, one licensed and two unlicensed. It was seeded
    // at a single licensed person on the earlier understanding that Jason
    // staffed it alone as the need appeared. That is superseded: it is a
    // three-person stand with a lead, and the seed reflects that.
    //
    // Every one of these is still editable per event on the assignment screen,
    // so an event that genuinely needs different numbers is a change on that
    // screen and not in this file.
    //
    // The volunteer side knows nothing about stands. A volunteer signs up for
    // a shift in a licensed or unlicensed role and the administrator decides
    // which stand they work, because that decision needs both stands in view
    // at once and a volunteer only ever sees their own row.
    //
    // Each stand has a lead. The lead is one of the people counted in the
    // targets, not an extra body, so naming a lead does not change how many
    // the stand needs.
    // ------------------------------------------------------------------

    STAND_TEMPLATES: [
        { key: '124',   label: 'Stand 124, Indy Doghouse', targets: { licensed: 4, unlicensed: 4 } },
        { key: '132PB', label: 'Stand 132PB',              targets: { licensed: 1, unlicensed: 2 } }
    ],

    // The stand a declaration belongs to until an administrator moves it, and
    // the stand a shift carrying no stand list is assumed to be.
    DEFAULT_STAND_KEY: '124',

    // Assignment targets, not limits enforced against volunteers. Anyone may
    // sign up for any shift. Retained as the shape of a shift that predates
    // the stand list, and as the fallback when a stored shift carries neither.
    DEFAULT_TARGETS: {
        licensed: 4,
        unlicensed: 4
    },

    GROUPS: [
        { key: 'licensed',   label: 'Alcohol License Required', requiresLicense: true },
        { key: 'unlicensed', label: 'No License Needed',        requiresLicense: false }
    ],

    /** A fresh copy of the seed stand list, safe for a caller to mutate. */
    standsTemplate() {
        return this.STAND_TEMPLATES.map(s => ({
            key: s.key,
            label: s.label,
            targets: Object.assign({}, s.targets)
        }));
    },

    /**
     * The stands on a stored shift.
     *
     * Every event seeded before 2026-08-05 carries a shift with a flat targets
     * map and no stands array. This used to answer that case with stand 124
     * alone, on the reasoning that such an event would gain the second stand
     * the first time an administrator saved it.
     *
     * That reasoning was wrong in practice and the cost was invisible. All
     * fifty seeded events reached the assignment screen showing one stand, so
     * 132PB was not there to move anybody to, and the per-row move control is
     * built by filtering this list for stands other than the current one,
     * which returned nothing. The screen offered no second stand and no way to
     * add or move, and it looked like a missing feature rather than a shift
     * that had never been saved. Corrected 2026-08-05.
     *
     * Both stands are returned now. Stand 124 keeps the stored flat targets,
     * which on every seeded event is exactly 124's own figures, so nothing an
     * administrator had customised is lost. 132PB takes its seed and starts
     * empty.
     */
    standsOf(shift) {
        if (shift && Array.isArray(shift.stands) && shift.stands.length) {
            return shift.stands;
        }

        const stands = this.standsTemplate();
        stands[0].targets = Object.assign({}, this.DEFAULT_TARGETS,
            (shift && shift.targets) || {});
        return stands;
    },

    /**
     * Places wanted for one group on one shift, counted at the main stand only.
     *
     * This is what the volunteer side compares an occupancy count against, and
     * it decides whether the next person to sign up lands on the schedule or on
     * standby.
     *
     * Counted at stand 124 alone, not summed across both. Everyone is assigned
     * to 124 by default and standby begins once 124 is full.
     *
     * 132PB is staffed by three named people rather than from the signup pool,
     * so its three places are deliberately not counted here. Counting them
     * would hold three places open on every shift for a stand nobody is going
     * to be routed into, and the twelfth volunteer would be told there is room
     * when there is not.
     *
     * With 124 seeded at four licensed and four unlicensed, the ninth volunteer
     * on a shift goes to standby. 132PB is filled on the assignment screen, not
     * by the signup form.
     *
     * A shift whose stored stand list has no 124 falls back to the first stand
     * on it, so an event configured differently still yields a number.
     */
    targetFor(shift, groupKey) {
        const stands = this.standsOf(shift);
        const main = stands.filter(s => s.key === this.DEFAULT_STAND_KEY)[0] || stands[0];
        if (!main) { return 0; }

        const value = main.targets && main.targets[groupKey];
        return Number.isFinite(Number(value)) ? Number(value) : 0;
    },

    /** Shift structure for a new event. */
    shiftsFor(splitShifts) {
        const template = splitShifts ? this.SHIFT_TEMPLATES.split : this.SHIFT_TEMPLATES.allDay;
        return template.map(s => ({
            key: s.key,
            label: s.label,
            startTime: s.startTime,
            endTime: s.endTime,
            // Kept in step with the stand list so that anything still reading
            // the flat map, including the assignment screen's over-target
            // marker, agrees with what the stands add up to.
            targets: {
                licensed: this.STAND_TEMPLATES.reduce((n, x) => n + x.targets.licensed, 0),
                unlicensed: this.STAND_TEMPLATES.reduce((n, x) => n + x.targets.unlicensed, 0)
            },
            stands: this.standsTemplate()
        }));
    },

    // ------------------------------------------------------------------
    // Signup states
    //
    // Signing up puts a volunteer on the schedule. Decided 2026-08-05, and it
    // reverses Event-Signup-v1-Build-Spec.md revision 2, which had moved from
    // first come to request and assign on 2026-07-27.
    //
    // `available` is no longer produced by a signup. It is kept because rows
    // written before this date hold it, the assignment screen can still move a
    // row back to it, and a state that disappears from the code while it still
    // exists in the data renders as a blank chip.
    // ------------------------------------------------------------------

    STATES: {
        AVAILABLE: 'available',   // declared before 2026-08-05, awaiting assignment
        SCHEDULED: 'scheduled',   // on the schedule to work
        STANDBY:   'standby',     // signed up after the group filled, holding the date
        RELEASED:  'released'     // not working, date given up
    },

    /**
     * The state a new signup is created in.
     *
     * A group with room puts the volunteer straight on the schedule. A group
     * already at its target puts them on standby, which is an invitation and
     * never a refusal: the form still accepts them and the copy says so.
     *
     * Capacity is not enforced. `occupied` is a count the administrator wrote
     * the last time the assignment screen was open, so it lags real signups.
     * It lags LOW, which puts a volunteer on the schedule when the group may
     * have just filled, and that is the safe direction: an extra name on the
     * schedule is a decision Jason makes, an unnecessary standby is a
     * volunteer told not to come who could have.
     *
     * A missing or unreadable count means room. A season that has never had
     * the assignment screen opened must not put its first volunteer on
     * standby.
     */
    entryStateFor(occupied, target) {
        const taken = Number(occupied);
        const wanted = Number(target);
        if (!Number.isFinite(wanted) || wanted <= 0) {
            return this.STATES.SCHEDULED;
        }
        if (!Number.isFinite(taken) || taken < 0) {
            return this.STATES.SCHEDULED;
        }
        return taken >= wanted ? this.STATES.STANDBY : this.STATES.SCHEDULED;
    },

    /**
     * Key into the occupancy map stored on an event document.
     *
     * One flat map rather than a nested object, because the security rule
     * grants `changedKeys().hasOnly(['counts'])` on the whole field and a flat
     * map is the shape that survives a merge-free overwrite unambiguously.
     */
    countsKey(shiftKey, groupKey) {
        return String(shiftKey) + ':' + String(groupKey);
    },

    /** Places taken in one group on one shift, from an event's counts map. */
    occupancyOf(event, shiftKey, groupKey) {
        const counts = (event && event.counts) || {};
        const value = counts[this.countsKey(shiftKey, groupKey)];
        return Number.isFinite(Number(value)) ? Number(value) : 0;
    },

    // ------------------------------------------------------------------
    // Timing
    //
    // None of these is shown to a volunteer. Every reference to how long
    // before an event something happens was removed from volunteer-facing
    // copy on 2026-08-05: a published lead time is a promise, and the
    // schedule is reviewed as signups arrive rather than on a clock.
    // ASSIGNMENT_LEAD_DAYS survives as the administrator's own urgency
    // marker on the assignment screen and must not reach a volunteer.
    // ------------------------------------------------------------------

    ASSIGNMENT_LEAD_DAYS: 7,      // administrator urgency marker, never published
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
    // Presented at signup, because that is where the obligation begins. The
    // version is stored alongside the timestamp so there is a record of the
    // exact wording each volunteer agreed to.
    //
    // v1 promised a schedule about a week ahead and an email either way. v2
    // drops both. Signing up now puts a volunteer on the schedule, so there is
    // no result to wait for, and no time reference before an event appears in
    // anything a volunteer reads. The version is bumped rather than edited in
    // place: rows written under v1 agreed to different words and the record
    // has to stay honest about which.
    // ------------------------------------------------------------------

    COMMITMENT_VERSION: 'v2',

    COMMITMENT_TEXT:
        'Signing up puts you on the schedule for the shifts you tick, in the ' +
        'role your alcohol permit allows. Please treat these as dates you are ' +
        'working. If a role is already full you can still sign up and you will ' +
        'go on standby, which we would rather you did than not sign up at all.',

    COMMITMENT_CHECKBOX: 'I understand these are dates I am working.',

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
