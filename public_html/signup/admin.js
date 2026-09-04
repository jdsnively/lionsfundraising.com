/**
 * signup/admin.js
 *
 * The administrator half of the event signup sheet. Unlocks inline on /signup
 * rather than living at its own URL, so there is one address to remember and
 * one place where the season is loaded.
 *
 * Imported dynamically by signup/index.html, and only when the signed-in
 * account can open the dashboard system. A volunteer never downloads this file.
 * The security rules are the real gate; this is bandwidth and tidiness.
 *
 * MODEL, decided 2026-08-05, reversing Event-Signup-v1-Build-Spec.md revision 2
 *
 * Signing up puts a volunteer on the schedule. A signup lands in `scheduled`
 * when its group has room and in `standby` when the group is already at its
 * target, and this screen is where both are reviewed, moved and placed at a
 * stand. Nothing here races anything: there is no capacity gate, so no
 * transaction and no contention. A target is a target and is never enforced
 * against anybody.
 *
 * `available` is no longer produced by a signup. Rows created before this date
 * still hold it, this screen can still move a row back to it, and it is still
 * rendered, because a state that vanishes from the code while it survives in
 * the data renders as a blank chip.
 *
 * TWO STANDS
 *
 * Lions Sports Club works stand 124, the main stand, and stand 132PB. They are
 * staffed independently and each needs its own lead, so this screen groups by
 * stand and then by licence group inside it. A volunteer never chooses a stand:
 * that decision needs both stands in view at once and is made here.
 *
 * THE COUNTS MAP
 *
 * The volunteer page decides between `scheduled` and `standby` by reading a
 * counts map on the event document. It is written from here, on every load,
 * from the signups this screen has just read. That keeps the only write to it
 * behind the administrator grant: a volunteer maintaining their own capacity
 * counter would be a value every signed-in account could overwrite, deciding
 * what other volunteers are told.
 *
 * WHY THE SIGNUP DOCUMENTS ARE READ PER EVENT
 *
 * A collection group query over `signups` would be one round trip instead of
 * fifty. It is not used. firestore.rules grants the subcollection under
 * `match /Lions-Events/{eventId}/signups/{signupId}`, and a collection group
 * query is only matched by a rule written as `match /{path=**}/signups/...`,
 * which does not exist. The volunteer page already discovered this: its group
 * query fails and it falls through to per-event reads. Reading per event here
 * is the path that actually works, and the cost is the same either way because
 * Firestore bills documents rather than queries.
 *
 * WHAT AN ADMINISTRATOR MAY WRITE
 *
 *   allow create, update, delete: if isEventSupervisor();
 *
 * No key-count guard, unlike the volunteer create rule. The fields added here,
 * assignedAt, assignedBy, isStandLead and the rest, take the document past the
 * 25-key limit that applies to a volunteer, which is why they are added here
 * and not at declaration time.
 *
 * PRIORITY IS SORT ORDER, NOT A RULE
 *
 * Tier orders this list and nothing else. It does not restrict who may declare,
 * it is not enforced anywhere in code, and it is never shown to a volunteer.
 * Within a tier, earliest declaration first.
 */

import {
    collection,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const log = window.LIONS_LOG || { log() {}, warn() {}, error(...a) { console.error(...a); } };
const CFG = window.SIGNUP_CONFIG;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ctx = null;                    // { db, events, season, admin }
let roster = { byId: new Map(), byEmail: new Map() };   // see loadRoster
let signupsByEvent = new Map();    // eventId -> array of { id, ref, data }
let selectedEventId = '';
let busy = false;
let editing = false;

/**
 * Shift hours derived from the time the contract gives.
 *
 * Same offsets the importer uses, and the same reasoning: gates open two hours
 * before kickoff and the crew is there three hours before the gates, so a one
 * o'clock kickoff starts the shift at eight and finishes at half past four.
 * Duplicated rather than shared because signup-config.js is loaded by the
 * volunteer page, which has no business knowing how an administrator seeds a
 * time. If the offsets ever move, they move in both files.
 */
const SHIFT_STARTS_BEFORE_MINUTES = 300;
const SHIFT_ENDS_AFTER_MINUTES = 210;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Reads a stored ISO date into a LOCAL date at midnight.
 *
 * Duplicated from the volunteer page rather than shared, because a bare
 * YYYY-MM-DD handed to the Date constructor is parsed as UTC and reports the
 * previous day anywhere west of Greenwich. Every date comparison on this
 * property goes through a function like this one. Indianapolis is four hours
 * behind in summer, so the shortcut is wrong for a third of every day.
 */
function toLocalDate(value) {
    if (!value) { return null; }
    if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function formatDate(date) {
    return date.toLocaleDateString('en-US',
        { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(hhmm) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { return ''; }
    const h = Number(m[1]);
    const suffix = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return hour + (m[2] === '00' ? '' : ':' + m[2]) + suffix;
}

/** Firestore Timestamp, Date or millis, reduced to a number for sorting. */
function sortableTime(value) {
    if (!value) { return 0; }
    if (typeof value.toMillis === 'function') { return value.toMillis(); }
    if (typeof value.toDate === 'function') { return value.toDate().getTime(); }
    if (value instanceof Date) { return value.getTime(); }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function shiftsOf(event) {
    return Array.isArray(event.shifts) && event.shifts.length
        ? event.shifts
        : CFG.shiftsFor(!!event.splitShifts);
}

function eventById(id) {
    return ctx.events.find(e => e.id === id) || null;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * The roster, keyed by document id.
 *
 * The signup document already carries name, phone, relationship and a snapshot
 * of licence state, so most of this screen could render without the roster.
 * It is loaded anyway for two things the snapshot cannot give: the licence
 * NUMBER, which decides between valid and incomplete, and the current phone,
 * which may have changed since a signup made in August for an event in April.
 *
 * WHY THE DOCUMENT ID AND NOT THE EMAIL
 *
 * `Lions-Fundraising-Users` is keyed by volunteer name and a family shares one
 * email address, so a map keyed by email keeps only the last document read for
 * that household. Every lookup on this screen then returned whichever family
 * member Firestore happened to return last. Both licenceFor and personRow
 * preferred that record over the row's own stored snapshot, so a row for a
 * sixteen year old could display a parent's permit chip and a parent's phone
 * number. Ordering and grouping were never affected, which is why it survived
 * review; multi-person signup, shipped 2026-08-04, is what made it reachable.
 *
 * personId on the signup document IS the roster document id, written by
 * signupPayload on the volunteer page, so the two join exactly.
 *
 * The email index is kept as a fallback and nothing more. Rows written before
 * personId existed carry no join key at all, and for those the household is
 * ambiguous by construction: the best available answer is the first record on
 * that address by document id, which is at least stable between page loads
 * rather than varying with read order.
 *
 * Loaded once. The dashboard on this property reads the roster three times per
 * page load; that is a defect, not a pattern to copy.
 */
async function loadRoster() {
    const snap = await getDocs(collection(ctx.db, CFG.COLLECTIONS.USERS));
    const byId = new Map();
    const byEmail = new Map();

    snap.docs
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .forEach(d => {
            const data = d.data();
            byId.set(d.id, data);
            const email = String(data.email || '').trim().toLowerCase();
            // First document id on the address wins, so the fallback answer is
            // the same on every load rather than whatever came back last.
            if (email && !byEmail.has(email)) { byEmail.set(email, data); }
        });

    return { byId: byId, byEmail: byEmail };
}

/**
 * The roster record for one signup row, or null.
 *
 * personId first, always. The email index is consulted only for a row that
 * carries no personId, and a row that carries one but finds no match returns
 * null rather than falling through to the address: a personId that no longer
 * resolves means the roster document was renamed or removed, and answering
 * with a different member of the same household would be worse than answering
 * with nothing. The caller falls back to the snapshot stored on the row, which
 * is that person's own.
 */
function personFor(entry) {
    const personId = entry && entry.data && entry.data.personId;
    if (personId) {
        return roster.byId.get(personId) || null;
    }
    const email = String((entry && entry.data && entry.data.userEmail) || '')
        .trim().toLowerCase();
    return (email && roster.byEmail.get(email)) || null;
}

/**
 * Every declaration in the season, read one event at a time.
 *
 * Issued in parallel rather than in sequence. Fifty sequential round trips is
 * roughly five seconds of staring at a spinner; in parallel it is one. A single
 * event that fails is recorded as empty and named in the console rather than
 * failing the whole screen, because one unreadable event should not stop the
 * other forty nine from being assigned.
 */
async function loadAllSignups() {
    const entries = await Promise.all(ctx.events.map(async (event) => {
        try {
            const snap = await getDocs(
                collection(ctx.db, CFG.COLLECTIONS.EVENTS, event.id, CFG.COLLECTIONS.SIGNUPS));
            return [event.id, snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }))];
        } catch (error) {
            log.error('Could not read signups for ' + event.id, error);
            return [event.id, []];
        }
    }));
    return new Map(entries);
}

// ---------------------------------------------------------------------------
// Ordering and grouping
// ---------------------------------------------------------------------------

/**
 * Priority tier for a declaration.
 *
 * The tier stored on the document is preferred, because it records the
 * relationship as it stood when the volunteer committed. A record edited in
 * March should not silently reorder a list of declarations made in August.
 * The roster is consulted only when the stored value is missing, which is the
 * shape of any row written before priorityTier existed.
 */
function tierOf(entry) {
    const stored = Number(entry.data.priorityTier);
    if (Number.isFinite(stored) && stored > 0) { return stored; }
    return CFG.priorityTier(personFor(entry) || {});
}

function compareEntries(a, b) {
    const ta = tierOf(a);
    const tb = tierOf(b);
    if (ta !== tb) { return ta - tb; }
    return sortableTime(a.data.createdAt) - sortableTime(b.data.createdAt);
}

/** Signups for one shift, split by group, each ordered for assignment. */
function groupsFor(eventId, shiftKey) {
    const all = (signupsByEvent.get(eventId) || [])
        .filter(entry => entry.data.shiftKey === shiftKey);

    const out = {};
    CFG.GROUPS.forEach(group => { out[group.key] = []; });

    all.forEach(entry => {
        const key = out[entry.data.groupKey] ? entry.data.groupKey : 'unlicensed';
        out[key].push(entry);
    });

    Object.keys(out).forEach(key => { out[key].sort(compareEntries); });
    return out;
}

/**
 * Which stand a row is at.
 *
 * Only a scheduled row is at a stand. Anything else is waiting on a decision
 * and putting it in a stand column would make that stand read as staffed.
 *
 * A scheduled row with no standKey is shown at the main stand rather than in a
 * holding pen. Every row written before 2026-08-05 is in that shape, and the
 * main stand is where all of them actually worked.
 */
function standOf(entry) {
    if ((entry.data.state || 'available') !== 'scheduled') { return null; }
    return entry.data.standKey || CFG.DEFAULT_STAND_KEY;
}

/**
 * The occupancy map for one event, computed from the signups just read.
 *
 * Counted against `scheduled` alone. Standby is by definition the overflow, so
 * counting it would make a full group look fuller and push the next volunteer
 * further down a queue that already has them.
 */
function countsFor(event) {
    const counts = {};
    shiftsOf(event).forEach(shift => {
        CFG.GROUPS.forEach(group => {
            counts[CFG.countsKey(shift.key, group.key)] = 0;
        });
    });

    (signupsByEvent.get(event.id) || []).forEach(entry => {
        if ((entry.data.state || 'available') !== 'scheduled') { return; }
        const key = CFG.countsKey(entry.data.shiftKey, entry.data.groupKey);
        if (key in counts) { counts[key] += 1; }
    });

    return counts;
}

function sameCounts(a, b) {
    const left = a || {};
    const right = b || {};
    const keys = new Set(Object.keys(left).concat(Object.keys(right)));
    return Array.from(keys).every(k => Number(left[k] || 0) === Number(right[k] || 0));
}

/**
 * Writes the occupancy map back to any event whose stored copy disagrees.
 *
 * Best effort and deliberately quiet. This is a convenience for the volunteer
 * page, not a correctness requirement of this screen, and a failed write means
 * the next volunteer is put on the schedule rather than on standby, which is
 * the safe direction. A banner about it would be noise on the one screen that
 * has to stay readable.
 *
 * Only changed events are written. Fifty unconditional writes per page load
 * would cost more than the feature is worth.
 */
async function syncCounts() {
    const stale = ctx.events.filter(event => !sameCounts(event.counts, countsFor(event)));
    if (!stale.length) { return; }

    await Promise.all(stale.map(async (event) => {
        const counts = countsFor(event);
        try {
            await updateDoc(doc(ctx.db, CFG.COLLECTIONS.EVENTS, event.id), { counts: counts });
            event.counts = counts;
        } catch (error) {
            log.warn('Occupancy counts not updated for ' + event.id, error);
        }
    }));

    log.log('Occupancy counts refreshed on ' + stale.length + ' event'
          + (stale.length === 1 ? '' : 's') + '.');
}

// ---------------------------------------------------------------------------
// Licence
// ---------------------------------------------------------------------------

/**
 * Licence state for this volunteer against THIS event's date.
 *
 * Evaluated per event rather than once, because a permit that is valid in
 * August can have lapsed by an event in April, and the whole reason this
 * function exists is that on 2026-07-28 three active volunteers held permits
 * that had expired without any part of the system noticing.
 *
 * The roster record is used when there is one. The snapshot on the signup
 * document is the fallback, and it can only ever produce valid or expired,
 * because it does not carry the permit number.
 */
function licenceFor(entry, event) {
    const eventDate = toLocalDate(event.eventDate) || new Date();
    const person = personFor(entry);

    if (person) {
        return CFG.licenseStatusFor(person, eventDate);
    }

    if (entry.data.hasLicenseAtSignup !== true) {
        return CFG.LICENSE.NONE;
    }
    const expires = toLocalDate(entry.data.licenseExpiresAt);
    if (!expires) { return CFG.LICENSE.INCOMPLETE; }
    return expires < eventDate ? CFG.LICENSE.EXPIRED : CFG.LICENSE.VALID;
}

const LICENCE_LABELS = {
    valid:      ['Permit valid', 'is-valid'],
    expiring:   ['Permit lapses before this date', 'is-expiring'],
    expired:    ['Permit expired', 'is-expired'],
    incomplete: ['Permit incomplete', 'is-expiring'],
    none:       ['', '']
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const STATE_CHIPS = {
    available: ['Available', 'is-available'],
    scheduled: ['Scheduled', 'is-valid'],
    standby:   ['Standby',   'is-expiring'],
    released:  ['Released',  'is-released']
};

function stateChip(state) {
    const entry = STATE_CHIPS[state] || STATE_CHIPS.available;
    return '<span class="chip ' + entry[1] + '">' + entry[0] + '</span>';
}

/**
 * The event picker.
 *
 * Ordered by date with past events dropped, because assignment is always
 * forward looking. The count shown is declarations, not people: one volunteer
 * who ticked both shifts of a split day is two declarations and two decisions.
 */
function renderPicker() {
    const today = new Date();

    const rows = ctx.events
        .filter(event => {
            const d = toLocalDate(event.eventDate);
            return d ? CFG.daysUntil(d, today) >= 0 : true;
        })
        .map(event => {
            const entries = signupsByEvent.get(event.id) || [];
            const scheduled = entries.filter(e => e.data.state === 'scheduled').length;
            const d = toLocalDate(event.eventDate);
            const days = d ? CFG.daysUntil(d, today) : null;

            const urgency = days !== null && days <= CFG.ASSIGNMENT_LEAD_DAYS && entries.length
                ? ' is-due'
                : '';

            return '<button type="button" class="admin-pick' + urgency + '"'
                 + ' data-event="' + esc(event.id) + '"'
                 + (event.id === selectedEventId ? ' aria-current="true"' : '') + '>'
                 + '<span class="admin-pick-when">'
                 + (d ? formatDate(d) : 'Date to be confirmed') + '</span>'
                 + '<span class="admin-pick-name">' + esc(event.name)
                 + (event.seriesOf > 1
                     ? ' <span class="event-day">Day ' + event.seriesDay + ' of '
                       + event.seriesOf + '</span>'
                     : '')
                 + '</span>'
                 + '<span class="admin-pick-count">' + entries.length + ' signed up, '
                 + scheduled + ' scheduled'
                 + (days !== null && days >= 0 ? ', in ' + days + ' days' : '')
                 + '</span></button>';
        });

    document.getElementById('admin-picker').innerHTML =
        (rows.length
            ? rows.join('')
            : '<p class="admin-empty">No upcoming events in this season.</p>')
      + '<div class="btn-row"><button type="button" class="btn btn-secondary"'
      + ' id="admin-export">Download every signup (CSV)</button></div>';
}

/**
 * One signup per row, every event in the season.
 *
 * Reads what loadAllSignups already holds rather than re-querying. That map
 * covers all of ctx.events, while the picker above lists only events still to
 * come, so a past event's respondents are in this file even though there is no
 * way to select that event on screen.
 */
function exportSignups() {
    const rows = [[
        'Event Date', 'Event Name', 'Day', 'Venue', 'Shift', 'Stand',
        'Volunteer', 'Email', 'Phone', 'Relationship', 'Outcome', 'Stand Lead',
        'Priority Tier', 'Group', 'Licensed At Signup', 'License Expires', 'Signed Up'
    ]];

    ctx.events
        .slice()
        .sort((a, b) => String(a.eventDate || '').localeCompare(String(b.eventDate || '')))
        .forEach((event) => {
            (signupsByEvent.get(event.id) || []).slice().sort(compareEntries).forEach((entry) => {
                const data = entry.data;
                const person = personFor(entry) || {};
                rows.push([
                    event.eventDate || '',
                    event.name || '',
                    event.seriesOf > 1 ? 'Day ' + event.seriesDay + ' of ' + event.seriesOf : '',
                    event.venue || CFG.VENUE_DEFAULT,
                    data.shiftKey || '',
                    data.standKey || '',
                    data.name || person.name || '',
                    data.userEmail || person.email || '',
                    person.phone || '',
                    person.relationship || '',
                    data.state || 'available',
                    data.isStandLead === true ? 'Yes' : 'No',
                    data.priorityTier || '',
                    data.groupKey || '',
                    data.hasLicenseAtSignup === true ? 'Yes'
                        : data.hasLicenseAtSignup === false ? 'No' : '',
                    data.licenseExpiresAt || '',
                    stampOf(data.createdAt)
                ]);
            });
        });

    downloadCsv(rows, 'lions_event_signups_' + new Date().toISOString().slice(0, 10) + '.csv');
}

/** A readable local timestamp from a Firestore Timestamp, a Date or a string. */
function stampOf(value) {
    if (!value) { return ''; }
    const d = typeof value.toDate === 'function' ? value.toDate()
            : value instanceof Date ? value
            : new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/**
 * A quoted CSV, downloaded. A double quote inside a field has to be doubled or
 * every column after it shifts, which matters most in a file carrying names.
 */
function downloadCsv(rows, filename) {
    const csv = rows
        .map(row => row
            .map(cell => '"' + String(cell === null || cell === undefined ? '' : cell)
                .replace(/"/g, '""') + '"')
            .join(','))
        .join('\n');

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

/**
 * One person's row.
 *
 * Contact details are shown for everyone including minors. The build spec hides
 * a minor's details from other VOLUNTEERS, not from the administrator, who has
 * to be able to reach a parent. The relationship group is administrator only
 * and is shown here for the same reason the ordering exists.
 */
function personRow(entry, event) {
    const data = entry.data;
    const person = personFor(entry) || {};
    const state = data.state || 'available';
    const lead = data.isStandLead === true;
    const phone = person.phone || data.phone || '';
    const licence = licenceFor(entry, event);
    const label = LICENCE_LABELS[licence] || LICENCE_LABELS.none;

    const relationship = data.relationshipAtSignup || person.relationship || '';

    let actions = '';
    ['scheduled', 'standby', 'released', 'available'].forEach(target => {
        if (target === state) { return; }
        const words = {
            scheduled: 'Schedule',
            standby:   'Standby',
            released:  'Release',
            available: 'Back to available'
        };
        actions += '<button type="button" class="link-action" data-act="state"'
                 + ' data-target="' + target + '"'
                 + ' data-id="' + esc(entry.id) + '">' + words[target] + '</button>';
    });

    if (state === 'scheduled') {
        actions += '<button type="button" class="link-action" data-act="lead"'
                 + ' data-id="' + esc(entry.id) + '">'
                 + (lead ? 'Remove lead' : 'Make lead') + '</button>';

        // A move control per OTHER stand, rather than a select. There are two
        // stands and there is unlikely ever to be a third, and a one-press move
        // beats a select plus a confirm on a screen used standing up.
        const here = standOf(entry);
        standsOfShift(event, entry.data.shiftKey)
            .filter(stand => stand.key !== here)
            .forEach(stand => {
                actions += '<button type="button" class="link-action" data-act="stand"'
                         + ' data-target="' + esc(stand.key) + '"'
                         + ' data-id="' + esc(entry.id) + '">Move to '
                         + esc(stand.key) + '</button>';
            });
    }

    return '<li class="admin-person' + (lead ? ' is-lead' : '') + '">'
         + '<div class="admin-person-head">'
         + '<span class="admin-person-name">' + esc(data.name || data.userEmail) + '</span>'
         + (lead ? '<span class="admin-lead-mark" title="Stand lead">Stand lead</span>' : '')
         + stateChip(state)
         + (label[0] ? '<span class="chip ' + label[1] + '">' + label[0] + '</span>' : '')
         + '</div>'
         + '<div class="admin-person-meta">'
         + '<span class="admin-tier">Tier ' + tierOf(entry) + '</span>'
         + (relationship ? '<span>' + esc(relationship) + '</span>' : '')
         + '<a href="mailto:' + esc(data.userEmail) + '">' + esc(data.userEmail) + '</a>'
         + (phone ? '<a href="tel:' + esc(String(phone).replace(/[^\d+]/g, '')) + '">'
                  + esc(phone) + '</a>' : '')
         + '</div>'
         + '<div class="admin-person-actions">' + actions + '</div>'
         + '</li>';
}

/** The stands configured on one shift of one event. */
function standsOfShift(event, shiftKey) {
    const shift = shiftsOf(event).find(s => s.key === shiftKey);
    return CFG.standsOf(shift || {});
}

function renderGroup(event, stand, group, entries) {
    const raw = stand.targets && stand.targets[group.key];
    const target = Number.isFinite(Number(raw)) ? Number(raw) : null;
    const over = target != null && entries.length > target;

    // A group nobody is wanted in is not drawn empty. Stand 132PB runs no
    // unlicensed people this season, and an empty "0 of 0" panel on every shift
    // of every event is fifty rows of nothing to read past.
    if (target === 0 && !entries.length) { return ''; }

    /*
     * Add someone directly, without waiting for them to sign up.
     *
     * Jason staffs 132PB himself and fills gaps on 124 by hand, and until
     * 2026-08-05 this screen could only move, mark lead, or change the state of
     * a row that already existed. There was no way to put a person on a shift
     * they had not signed up for, so staffing a stand meant telephoning someone
     * and asking them to go and sign up.
     *
     * The Firestore rule already allows this: Lions-Events/{id}/signups grants
     * create to isEventSupervisor(), which resolves through isTreasurer() and
     * isSystemAdmin() to the fundraising address, with no constraint on the
     * document shape. No rule change was needed.
     */
    const addKey = [shiftKeyOf(entries), stand.key, group.key].join('|');

    return '<div class="admin-group">'
         + '<h4 class="admin-group-head">' + esc(group.label)
         + '<span class="admin-count' + (over ? ' is-over' : '') + '">'
         + entries.length + ' of ' + (target == null ? 'any' : target) + ' assigned</span>'
         + '</h4>'
         + (entries.length
             ? '<ul class="admin-people">'
               + entries.map(e => personRow(e, event)).join('') + '</ul>'
             : '<p class="admin-empty">Nobody is at this stand in this group yet.</p>')
         + '<button type="button" class="link-action" data-act="addopen"'
         + ' data-key="' + esc(addKey) + '">Add someone to ' + esc(stand.key) + '</button>'
         + '<div class="admin-add" id="add-' + esc(cssId(addKey)) + '" hidden></div>'
         + '</div>';
}

/**
 * The shift a rendered group belongs to.
 *
 * renderGroup is handed entries rather than a shift key, so on a group with
 * nobody in it there is nothing to read the key from. renderStand sets this
 * before each group is drawn, which keeps the signature of both unchanged.
 */
let currentShiftKey = '';
function shiftKeyOf(entries) {
    return (entries[0] && entries[0].data.shiftKey) || currentShiftKey;
}

/** A composite key reduced to something usable as an element id. */
function cssId(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * The priority tier for a roster record.
 *
 * Read from RELATIONSHIP_CONFIG, which owns PRIORITY_TIERS and LOWEST_TIER and
 * normalizes a stored value before looking it up. SIGNUP_CONFIG carries none of
 * those, so reading them off CFG yields undefined and Firestore refuses the
 * write. Four is the documented lowest tier and is the fallback when the
 * relationship config has not loaded.
 */
function priorityTierFor(record) {
    const rc = window.RELATIONSHIP_CONFIG;
    if (rc && typeof rc.getPriorityTier === 'function') {
        return rc.getPriorityTier(record.relationship);
    }
    return 4;
}

/**
 * Everyone on the roster who is not already on this shift.
 *
 * Filtered by shift and not by stand or group: a person is on a shift once,
 * and offering to add somebody who is already scheduled at the other stand is
 * how a volunteer ends up on the list twice and paid twice.
 */
function addableFor(event, shiftKey) {
    const taken = new Set(
        (signupsByEvent.get(event.id) || [])
            .filter(e => e.data.shiftKey === shiftKey
                      && e.data.state !== CFG.STATES.RELEASED)
            .map(e => e.data.personId));

    const out = [];
    roster.byId.forEach((record, id) => {
        if (taken.has(id)) { return; }

        // Archived records are excluded from staffing by the relationship
        // canon, and offering them here would put them back on a shift.
        // isStaffable lives on RELATIONSHIP_CONFIG and normalizes before it
        // compares, so a record still holding a pre-v3 value resolves too.
        const rc = window.RELATIONSHIP_CONFIG;
        if (rc && typeof rc.isStaffable === 'function'
            && !rc.isStaffable(record.relationship)) { return; }

        out.push({ id: id, name: record.name || '(no name)', record: record });
    });

    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One stand within one shift.
 *
 * Two warnings, and they are separate on purpose.
 *
 * No lead is the failure the original warning exists to prevent: people turn up
 * and nobody is in charge. It is not raised on a stand with nobody on it,
 * because "no lead yet" is the normal state of work not yet done.
 *
 * One person on a stand is the failure Jason asked for on 2026-08-05. Stand
 * 132PB may run a single licensed person this season, which is a deliberate
 * choice, but a stand that has quietly ended up with one person because
 * everybody else was moved is something to see in August rather than on the
 * day.
 */
function renderStand(event, shift, stand, atStand) {
    const byGroup = {};
    CFG.GROUPS.forEach(g => { byGroup[g.key] = []; });
    atStand.forEach(entry => {
        const key = byGroup[entry.data.groupKey] ? entry.data.groupKey : 'unlicensed';
        byGroup[key].push(entry);
    });
    Object.keys(byGroup).forEach(k => byGroup[k].sort(compareEntries));

    const leads = atStand.filter(e => e.data.isStandLead === true);
    const wanted = CFG.GROUPS.reduce((n, g) => {
        const v = Number(stand.targets && stand.targets[g.key]);
        return n + (Number.isFinite(v) ? v : 0);
    }, 0);

    let warn = '';
    if (atStand.length && !leads.length) {
        warn += '<p class="admin-warn">' + esc(stand.key) + ' has '
              + atStand.length + (atStand.length === 1 ? ' person' : ' people')
              + ' scheduled and no stand lead.</p>';
    }
    if (leads.length > 1) {
        warn += '<p class="admin-warn">' + esc(stand.key) + ' has '
              + leads.length + ' stand leads. One is enough.</p>';
    }
    if (atStand.length === 1 && wanted > 1) {
        warn += '<p class="admin-warn">' + esc(stand.key)
              + ' is down to one person and is set up for ' + wanted + '.</p>';
    }

    // Read by renderGroup for the add control, which needs the shift key even
    // when the group it is drawing has nobody in it to read one from.
    currentShiftKey = shift.key;

    const groupsHtml = CFG.GROUPS
        .map(g => renderGroup(event, stand, g, byGroup[g.key]))
        .join('');

    return '<div class="admin-stand">'
         + '<h4 class="admin-stand-head">' + esc(stand.label)
         + '<span class="admin-stand-count">' + atStand.length + ' of ' + wanted
         + ' scheduled' + (leads.length ? ', led by ' + esc(leadName(leads[0])) : '')
         + '</span></h4>'
         + warn
         + (groupsHtml || '<p class="admin-empty">Nobody is at this stand yet.</p>')
         + '</div>';
}

function leadName(entry) {
    return entry.data.name || entry.data.userEmail || 'somebody';
}

/**
 * Everyone on this shift who is not scheduled: standby, released, and the
 * pre-2026-08-05 rows still sitting in available.
 *
 * Kept below the stands rather than inside one. These people are the decision
 * still to be made, and mixing them into a stand column makes that stand read
 * as staffed by people who are not coming.
 */
function renderWaiting(event, entries) {
    if (!entries.length) { return ''; }

    return '<div class="admin-stand">'
         + '<h4 class="admin-stand-head">Not at a stand'
         + '<span class="admin-stand-count">' + entries.length + ' waiting</span></h4>'
         + '<ul class="admin-people">'
         + entries.slice().sort(compareEntries).map(e => personRow(e, event)).join('')
         + '</ul></div>';
}

function renderShift(event, shift) {
    const groups = groupsFor(event.id, shift.key);
    const all = CFG.GROUPS.flatMap(g => groups[g.key] || []);
    const stands = CFG.standsOf(shift);

    const scheduled = all.filter(e => (e.data.state || 'available') === 'scheduled');
    const waiting = all.filter(e => (e.data.state || 'available') !== 'scheduled');

    const times = shift.startTime
        ? formatTime(shift.startTime) + ' to ' + formatTime(shift.endTime)
        : '';

    // A scheduled row whose standKey names a stand this shift no longer has
    // would otherwise disappear from the screen entirely. It is drawn at the
    // main stand instead, where standOf already puts a row carrying no key.
    const known = new Set(stands.map(s => s.key));
    const atStandFor = (key) => scheduled.filter(e => {
        const at = standOf(e);
        return at === key || (!known.has(at) && key === CFG.DEFAULT_STAND_KEY);
    });

    return '<section class="admin-shift">'
         + '<h3 class="admin-shift-head">' + esc(shift.label)
         + (times ? ' <span class="shift-times">' + times + '</span>' : '')
         + '<span class="admin-shift-total">' + all.length + ' signed up, '
         + scheduled.length + ' scheduled</span>'
         + '</h3>'
         + stands.map(stand => renderStand(event, shift, stand, atStandFor(stand.key))).join('')
         + renderWaiting(event, waiting)
         + '</section>';
}

/** Adds or subtracts minutes from an HH:MM string, or returns '' if it cannot. */
function clockShift(hhmm, offsetMinutes) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { return ''; }
    const total = Number(m[1]) * 60 + Number(m[2]) + offsetMinutes;
    if (total < 0 || total >= 24 * 60) { return ''; }
    return String(Math.floor(total / 60)).padStart(2, '0') + ':'
         + String(total % 60).padStart(2, '0');
}

/**
 * The event editor.
 *
 * Dates and times are edited as native date and time inputs, which hand back
 * YYYY-MM-DD and HH:MM, exactly the formats already stored. No Date object is
 * constructed anywhere in this path, so the UTC trap that has bitten this
 * property four times cannot apply.
 *
 * Splitting one shift into two is refused while the event carries
 * declarations. A declaration stores the shift key it was made against; change
 * ALL into AM and PM and every existing row points at a shift that no longer
 * exists, disappears from this screen, and is neither cancelled nor honoured.
 * Refusing is not a limitation to work around later, it is the only honest
 * answer until there is a way to move a person from one shift to another.
 */
function renderEditor(event) {
    if (!editing) { return ''; }

    const shifts = shiftsOf(event);
    const declared = (signupsByEvent.get(event.id) || []).length;
    const split = shifts.length > 1;

    const statusOption = (value, label) =>
        '<option value="' + value + '"'
        + (event.dateStatus === value ? ' selected' : '') + '>' + label + '</option>';

    // Both rows are always rendered and the second is hidden when the day is
    // not split. Re-rendering the editor to add a row would throw away whatever
    // had been typed into the fields above it, which is what the first version
    // did: ticking the box reset the form and silently lost the split as well.
    const template = split ? shifts : CFG.shiftsFor(true);
    const row = (index, labelWhenSplit) => {
        const shift = shifts[index] || {};
        const hidden = index === 1 && !split;
        return '<div class="field-grid" id="ed-row-' + index + '"'
             + (hidden ? ' hidden' : '') + '>'
             + '<div class="field"><label for="ed-start-' + index + '">'
             + '<span class="ed-shift-name">'
             + esc(index === 0 && !split ? 'All day' : labelWhenSplit)
             + '</span> starts</label>'
             + '<input type="time" id="ed-start-' + index + '" value="'
             + esc(shift.startTime || '') + '"></div>'
             + '<div class="field"><label for="ed-end-' + index + '">'
             + '<span class="ed-shift-name">'
             + esc(index === 0 && !split ? 'All day' : labelWhenSplit)
             + '</span> ends</label>'
             + '<input type="time" id="ed-end-' + index + '" value="'
             + esc(shift.endTime || '') + '"></div>'
             + '</div>';
    };
    const shiftRows = row(0, template[0].label) + row(1, template[1].label);

    /**
     * Places wanted at each stand, per shift and per group.
     *
     * Editable rather than hard coded because 132PB ran three people last
     * season, may run one this season, and has to be able to go back to three
     * without a deploy. Zero is a legitimate value and means the stand runs
     * nobody in that group.
     */
    const standRows = shifts.map((shift, si) =>
        CFG.standsOf(shift).map((stand, ti) =>
            '<div class="field-grid">'
          + CFG.GROUPS.map(g =>
                '<div class="field">'
              + '<label for="ed-t-' + si + '-' + ti + '-' + g.key + '">'
              + esc(shifts.length > 1 ? shift.label + ', ' : '')
              + esc(stand.key) + ' ' + esc(g.label.toLowerCase()) + '</label>'
              + '<input type="number" min="0" max="20" step="1"'
              + ' id="ed-t-' + si + '-' + ti + '-' + g.key + '"'
              + ' data-shift-index="' + si + '" data-stand-index="' + ti + '"'
              + ' data-group="' + esc(g.key) + '"'
              + ' value="' + esc(String(
                    Number.isFinite(Number(stand.targets && stand.targets[g.key]))
                        ? Number(stand.targets[g.key]) : 0)) + '"></div>').join('')
          + '</div>').join('')).join('');

    return '<div class="admin-edit">'
         + '<h3>Edit this event</h3>'

         + '<div class="field-grid">'
         + '<div class="field"><label for="ed-date">Date</label>'
         + '<input type="date" id="ed-date" value="' + esc(event.eventDate || '') + '">'
         + '<span class="field-note">Leave empty while the date is unknown.</span></div>'
         + '<div class="field"><label for="ed-status">Date status</label>'
         + '<select id="ed-status">'
         + statusOption('confirmed', 'Confirmed')
         + statusOption('either', 'One of two dates')
         + statusOption('conflict', 'Being confirmed with Sodexo')
         + statusOption('tba', 'Not set yet')
         + '</select></div>'
         + '</div>'

         + '<div class="field"><label for="ed-window">Expected window</label>'
         + '<input type="text" id="ed-window" value="' + esc(event.dateWindow || '') + '"'
         + ' placeholder="Jan or Feb 2027">'
         + '<span class="field-note">Shown to volunteers only while the date is '
         + 'not set.</span></div>'

         + '<hr class="divider">'

         + '<div class="field"><label for="ed-gate">Contract time</label>'
         + '<input type="time" id="ed-gate" value="' + esc(event.gateTime || '') + '">'
         + '<span class="field-note">Kickoff for a Colts game. Use it to fill the '
         + 'shift below, five hours before to three and a half hours after.</span></div>'

         + '<div class="btn-row"><button type="button" class="btn btn-secondary"'
         + ' id="ed-derive">Fill the shift from that time</button></div>'

         + shiftRows

         + '<div class="field"><label class="check-commit" style="min-height:auto">'
         + '<input type="checkbox" id="ed-split"' + (split ? ' checked' : '')
         + (declared ? ' disabled' : '') + '>'
         + '<span>Split into a morning and an evening shift</span></label>'
         + (declared
             ? '<span class="field-note">Locked. ' + declared + ' signup'
               + (declared === 1 ? '' : 's') + ' on this event were made against '
               + 'the shift as it stands, and changing its shape would strand them.'
               + '</span>'
             : '')
         + '</div>'

         + '<hr class="divider">'

         + '<h4>How many people at each stand</h4>'
         + '<p class="field-note">These are targets. Nobody is refused a signup '
         + 'for exceeding one. A volunteer who signs up once a group has reached '
         + 'its target goes on standby instead of straight onto the schedule.</p>'
         + standRows

         + '<div id="ed-error" class="admin-warn" hidden></div>'

         + '<div class="btn-row">'
         + '<button type="button" class="btn" id="ed-save">Save the event</button>'
         + '<button type="button" class="btn btn-secondary" id="ed-cancel">Cancel</button>'
         + '</div></div>';
}

function renderPanel() {
    const panel = document.getElementById('admin-panel');
    const event = eventById(selectedEventId);

    if (!event) {
        panel.innerHTML = '<p class="admin-empty">Choose an event to assign.</p>';
        return;
    }

    const d = toLocalDate(event.eventDate);
    const entries = signupsByEvent.get(event.id) || [];

    panel.innerHTML =
        '<div class="admin-panel-head">'
      + '<h2>' + esc(event.name) + '</h2>'
      + '<p>' + (d ? formatDate(d) : 'Date to be confirmed')
      + (event.gateTime ? ', gates ' + formatTime(event.gateTime) : '')
      + '. ' + esc(event.venue || CFG.VENUE_DEFAULT) + '.</p>'
      + (event.timesStatus === 'tba'
          ? '<p class="admin-warn">Shift times are not final for this event.</p>' : '')
      + '<div class="btn-row"><button type="button" class="btn btn-secondary"'
      + ' id="admin-edit-toggle">' + (editing ? 'Close the editor' : 'Edit this event')
      + '</button></div>'
      + '</div>'
      + renderEditor(event)
      + shiftsOf(event).map(shift => renderShift(event, shift)).join('')
      + '<div class="btn-row">'
      + '<button type="button" class="btn btn-secondary" id="admin-copy">'
      + 'Copy the outcome list</button>'
      + '</div>'
      + '<p class="admin-note">' + entries.length + ' signup'
      + (entries.length === 1 ? '' : 's') + ' on this event. '
      + 'Copying gives you every respondent and their outcome, ready to paste '
      + 'into an email until the batched sender is wired up.</p>';
}

function render() {
    renderPicker();
    renderPanel();
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function findEntry(id) {
    const entries = signupsByEvent.get(selectedEventId) || [];
    return entries.find(e => e.id === id) || null;
}

function announce(message, kind) {
    const b = document.getElementById('admin-banner');
    b.textContent = message;
    b.className = 'banner is-' + kind;
    b.hidden = false;
}

/**
 * Applies one change and re-renders from the object that was written.
 *
 * The local copy is updated from the same patch that went to Firestore rather
 * than from a re-read, so the screen cannot show a state the server does not
 * hold. serverTimestamp resolves on the server and is a sentinel locally, so
 * the timestamps are patched in as a plain Date for display only; nothing
 * sorts on them.
 */
async function applyPatch(entry, patch, verb) {
    if (busy) { return; }
    busy = true;

    try {
        await updateDoc(entry.ref, Object.assign({}, patch, {
            updatedAt: serverTimestamp(),
            updatedBy: ctx.admin.email
        }));

        Object.assign(entry.data, patch, { updatedAt: new Date() });
        render();
        announce(verb, 'success');

    } catch (error) {
        log.error('Assignment write failed for ' + entry.id, error);
        announce('That did not save. Nothing has changed. Reload and try again.', 'error');
    } finally {
        busy = false;
    }
}

/**
 * Draws the person picker under one group.
 *
 * A flat list with a filter rather than a select, because the roster runs to a
 * hundred and fifteen people and a native select on a phone is a scrolling
 * column with no search in it.
 */
function renderAddPicker(event, shiftKey, standKey, groupKey, box, filter) {
    const term = String(filter || '').trim().toLowerCase();
    const all = addableFor(event, shiftKey);
    const shown = term
        ? all.filter(p => p.name.toLowerCase().indexOf(term) !== -1
                       || String(p.record.email || '').toLowerCase().indexOf(term) !== -1)
        : all;

    box.innerHTML =
        '<label class="admin-add-label" for="add-filter">Search the roster</label>'
      + '<input type="search" id="add-filter" class="admin-add-filter" autocomplete="off"'
      + ' placeholder="Name or email" value="' + esc(filter || '') + '">'
      + (shown.length
          ? '<ul class="admin-add-list">'
            + shown.slice(0, 40).map(p =>
                '<li><button type="button" class="link-action" data-act="add"'
              + ' data-person="' + esc(p.id) + '"'
              + ' data-shift="' + esc(shiftKey) + '"'
              + ' data-stand="' + esc(standKey) + '"'
              + ' data-group="' + esc(groupKey) + '">'
              + esc(p.name) + '</button>'
              + '<span class="admin-add-mail">' + esc(p.record.email || '') + '</span></li>').join('')
            + '</ul>'
            + (shown.length > 40
                ? '<p class="admin-empty">' + (shown.length - 40)
                  + ' more. Narrow the search.</p>' : '')
          : '<p class="admin-empty">Nobody on the roster matches, or everybody '
            + 'who does is already on this shift.</p>');

    box.hidden = false;
    const field = box.querySelector('#add-filter');
    if (field) { field.focus(); }
}

/**
 * Puts a roster person on a shift at a named stand.
 *
 * The document matches what the volunteer form writes, with three differences,
 * all of which are true rather than cosmetic:
 *
 *   state      always `scheduled`. An administrator adding somebody by hand has
 *              already decided they are working, so routing them through the
 *              standby rule would be answering a question nobody asked.
 *   standKey   set here rather than left to default, because the whole reason
 *              for adding by hand is to staff a particular stand.
 *   isGuest    true, and addedByEmail records who did it. The row was not
 *              created by the person it is for.
 *
 * commitmentAckAt is deliberately absent. That field records a volunteer
 * accepting the commitment wording, and Jason adding somebody to a stand is
 * not that person making a promise. A row written here carries no
 * acknowledgement because none was given.
 */
async function addPersonToShift(event, personId, shiftKey, standKey, groupKey) {
    if (busy) { return; }

    const record = roster.byId.get(personId);
    if (!record) {
        announce('That roster record could not be read. Reload and try again.', 'error');
        return;
    }

    busy = true;
    try {
        const payload = {
            season:               ctx.season,
            eventId:              event.id,
            shiftKey:             shiftKey,
            groupKey:             groupKey,
            standKey:             standKey,
            userEmail:            ctx.admin.email,
            personId:             personId,
            name:                 record.name || '',
            phone:                record.phone || '',
            relationshipAtSignup: window.RELATIONSHIP_CONFIG
                                    ? window.RELATIONSHIP_CONFIG.normalize(record.relationship)
                                    : (record.relationship || ''),
            // PRIORITY_TIERS and LOWEST_TIER live on RELATIONSHIP_CONFIG, not
            // on SIGNUP_CONFIG. Reading them off CFG returns undefined, and
            // Firestore rejects an undefined value, so the whole add would have
            // failed with a write error rather than a useful message.
            priorityTier:         priorityTierFor(record),
            isGuest:              true,
            addedByEmail:         ctx.admin.email,
            hasLicenseAtSignup:   record.hasLicense === 'yes',
            licenseExpiresAt:     record.licenseExpiration || null,
            state:                CFG.STATES.SCHEDULED,
            isStandLead:          false,
            createdAt:            serverTimestamp(),
            createdBy:            ctx.admin.email,
            updatedAt:            serverTimestamp(),
            updatedBy:            ctx.admin.email
        };

        const ref = await addDoc(
            collection(ctx.db, CFG.COLLECTIONS.EVENTS, event.id, CFG.COLLECTIONS.SIGNUPS),
            payload);

        const list = signupsByEvent.get(event.id) || [];
        list.push({ id: ref.id, ref: ref,
                    data: Object.assign({}, payload,
                        { createdAt: new Date(), updatedAt: new Date() }) });
        signupsByEvent.set(event.id, list);

        render();
        announce((record.name || 'That person') + ' added to stand '
               + standKey + '.', 'success');

    } catch (error) {
        log.error('Could not add a person to ' + event.id + '/' + shiftKey, error);
        announce('That did not save. Nothing has changed. Reload and try again.', 'error');
    } finally {
        busy = false;
    }
}

function stateVerb(name, target) {
    const words = {
        scheduled: ' is scheduled.',
        standby:   ' is on standby.',
        released:  ' has released the date.',
        available: ' is back to available.'
    };
    return name + words[target];
}

/**
 * The outcome list, as text.
 *
 * The build spec requires every respondent to be told the result, and the
 * batched sender is not built yet. Rather than leave the surface unusable
 * until it is, this produces the list Jason would otherwise assemble by hand.
 * It is a stopgap and should be deleted when the sender lands.
 */
function outcomeText(event) {
    const entries = (signupsByEvent.get(event.id) || []).slice().sort(compareEntries);
    const d = toLocalDate(event.eventDate);

    const lines = [event.name + ', ' + (d ? formatDate(d) : 'date to be confirmed'), ''];

    ['scheduled', 'standby', 'available', 'released'].forEach(state => {
        const inState = entries.filter(e => (e.data.state || 'available') === state);
        if (!inState.length) { return; }
        lines.push(STATE_CHIPS[state][0].toUpperCase() + ' (' + inState.length + ')');
        inState.forEach(e => {
            lines.push('  ' + (e.data.name || e.data.userEmail)
                     + '  ' + e.data.userEmail
                     + (e.data.isStandLead === true ? '  STAND LEAD' : ''));
        });
        lines.push('');
    });

    return lines.join('\n');
}

/**
 * Reads the editor, validates it, and writes the event.
 *
 * Validation refuses rather than corrects. A date that says confirmed with no
 * date on it, or a shift that ends before it starts, is somebody halfway
 * through a thought, and quietly repairing it produces an event nobody chose.
 */
async function saveEvent(event) {
    const fail = (message) => {
        const box = document.getElementById('ed-error');
        box.textContent = message;
        box.hidden = false;
        return false;
    };
    document.getElementById('ed-error').hidden = true;

    const date = document.getElementById('ed-date').value.trim();
    const status = document.getElementById('ed-status').value;
    const window_ = document.getElementById('ed-window').value.trim();
    const gate = document.getElementById('ed-gate').value.trim();
    const split = document.getElementById('ed-split').checked;

    if (status !== 'tba' && !date) {
        return fail('A date is needed unless the status is "Not set yet".');
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return fail('The date must read YYYY-MM-DD.');
    }

    const existing = shiftsOf(event);
    const wanted = split
        ? (existing.length > 1 ? existing : CFG.shiftsFor(true))
        : [existing.length === 1 ? existing[0] : CFG.shiftsFor(false)[0]];

    const shifts = [];
    for (let i = 0; i < wanted.length; i++) {
        const startField = document.getElementById('ed-start-' + i);
        const endField = document.getElementById('ed-end-' + i);
        const start = startField ? startField.value.trim() : '';
        const end = endField ? endField.value.trim() : '';

        if ((start && !end) || (end && !start)) {
            return fail('Give both a start and an end for ' + wanted[i].label
                      + ', or leave both empty.');
        }
        if (start && end && end <= start) {
            return fail(wanted[i].label + ' ends before it starts.');
        }

        // Stand targets, read out of the editor by the same index the rows were
        // rendered with. A shift the editor did not draw, which is the second
        // row on a day being split for the first time, keeps the seed values.
        const stands = CFG.standsOf(existing[i] || {}).map((stand, ti) => {
            const targets = {};
            CFG.GROUPS.forEach(g => {
                const field = document.getElementById('ed-t-' + i + '-' + ti + '-' + g.key);
                const value = field ? Number(field.value) : Number(stand.targets && stand.targets[g.key]);
                // A blank or nonsense box means zero rather than refusing the
                // save. Every other field on this form refuses, but a target is
                // advisory and losing a whole event edit over one is worse.
                targets[g.key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
            });
            return { key: stand.key, label: stand.label, targets: targets };
        });

        shifts.push(Object.assign({}, wanted[i], {
            startTime: start || null,
            endTime: end || null,
            stands: stands,
            // Kept in step with the stands so that anything reading the flat
            // map agrees with what the stands add up to. The volunteer page
            // reads the stands; this is for the older shape.
            targets: {
                licensed: stands.reduce((n, s) => n + (Number(s.targets.licensed) || 0), 0),
                unlicensed: stands.reduce((n, s) => n + (Number(s.targets.unlicensed) || 0), 0)
            }
        }));
    }

    const patch = {
        eventDate:   date || null,
        dateStatus:  status,
        gateTime:    gate || null,
        splitShifts: shifts.length > 1,
        shifts:      shifts,
        // Derived rather than asked for. An event either has hours or it does
        // not, and a status that disagrees with the times is how the signup
        // page came to print a window nobody had promised.
        timesStatus: shifts[0].startTime ? 'confirmed' : 'tba'
    };

    if (window_) {
        patch.dateWindow = window_;
    } else if (event.dateWindow) {
        patch.dateWindow = null;
    }

    // The season is written, never derived at read time, so a date that moves
    // across the boundary has to be rewritten with it or the event vanishes
    // from a sheet that queries on season.
    if (date) {
        patch.season = CFG.seasonFor(toLocalDate(date));
    }

    if (busy) { return false; }
    busy = true;

    try {
        await updateDoc(doc(ctx.db, CFG.COLLECTIONS.EVENTS, event.id),
            Object.assign({}, patch, {
                updatedAt: serverTimestamp(),
                updatedBy: ctx.admin.email
            }));

        Object.assign(event, patch);
        editing = false;
        render();
        announce(event.name + ' updated.'
               + (patch.season !== undefined && patch.season !== ctx.season
                   ? ' The new date puts it in season ' + patch.season
                     + ', so it no longer appears on the ' + ctx.season + ' sheet.'
                   : ''), 'success');
        return true;

    } catch (error) {
        log.error('Event update failed for ' + event.id, error);
        fail('That did not save. Nothing has changed.');
        return false;
    } finally {
        busy = false;
    }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wire() {
    document.getElementById('admin-picker').addEventListener('click', (event) => {
        if (event.target.closest('#admin-export')) { exportSignups(); return; }

        const button = event.target.closest('[data-event]');
        if (!button) { return; }
        selectedEventId = button.dataset.event;
        editing = false;
        render();
        document.getElementById('admin-panel').scrollIntoView({ block: 'start' });
    });

    document.getElementById('admin-panel').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-act]');

        if (button && button.dataset.act === 'state') {
            const entry = findEntry(button.dataset.id);
            if (!entry) { return; }
            const target = button.dataset.target;

            // assignedAt and assignedBy record who scheduled somebody and when.
            // They are cleared on any move away from scheduled so that a stale
            // pair cannot outlive the assignment it described.
            const patch = { state: target };
            if (target === 'scheduled') {
                patch.assignedAt = serverTimestamp();
                patch.assignedBy = ctx.admin.email;
            } else {
                patch.assignedAt = null;
                patch.assignedBy = null;
                patch.isStandLead = false;
            }

            await applyPatch(entry, patch,
                stateVerb(entry.data.name || entry.data.userEmail, target));
            return;
        }

        if (button && button.dataset.act === 'lead') {
            const entry = findEntry(button.dataset.id);
            if (!entry) { return; }
            const next = entry.data.isStandLead !== true;
            await applyPatch(entry, { isStandLead: next },
                (entry.data.name || entry.data.userEmail)
                + (next ? ' is stand lead of ' + (standOf(entry) || CFG.DEFAULT_STAND_KEY) + '.'
                        : ' is no longer stand lead.'));
            return;
        }

        if (button && button.dataset.act === 'stand') {
            const entry = findEntry(button.dataset.id);
            if (!entry) { return; }
            // The lead mark is cleared on a move. A lead is a lead OF a stand,
            // and carrying the mark across would silently hand the other stand
            // a second lead while leaving the first with none.
            await applyPatch(entry,
                { standKey: button.dataset.target, isStandLead: false },
                (entry.data.name || entry.data.userEmail)
                + ' moved to stand ' + button.dataset.target + '.');
            return;
        }

        if (button && button.dataset.act === 'addopen') {
            const current = eventById(selectedEventId);
            if (!current) { return; }
            const parts = String(button.dataset.key).split('|');
            const box = document.getElementById('add-' + cssId(button.dataset.key));
            if (!box) { return; }

            if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
            renderAddPicker(current, parts[0], parts[1], parts[2], box, '');
            return;
        }

        if (button && button.dataset.act === 'add') {
            const current = eventById(selectedEventId);
            if (!current) { return; }
            await addPersonToShift(current, button.dataset.person,
                button.dataset.shift, button.dataset.stand, button.dataset.group);
            return;
        }

        if (event.target.id === 'admin-edit-toggle') {
            editing = !editing;
            renderPanel();
            return;
        }

        if (event.target.id === 'ed-cancel') {
            editing = false;
            renderPanel();
            return;
        }

        if (event.target.id === 'ed-derive') {
            const gate = document.getElementById('ed-gate').value.trim();
            const start = clockShift(gate, -SHIFT_STARTS_BEFORE_MINUTES);
            const end = clockShift(gate, SHIFT_ENDS_AFTER_MINUTES);
            const box = document.getElementById('ed-error');
            if (!start || !end) {
                box.textContent = 'Set a contract time first.';
                box.hidden = false;
                return;
            }
            box.hidden = true;
            // Only the first shift is filled. On a split day the evening shift
            // is not five hours before anything, and guessing it would be worse
            // than leaving it to the person who knows.
            const startField = document.getElementById('ed-start-0');
            const endField = document.getElementById('ed-end-0');
            if (startField) { startField.value = start; }
            if (endField) { endField.value = end; }
            return;
        }

        if (event.target.id === 'ed-save') {
            const current = eventById(selectedEventId);
            if (current) { await saveEvent(current); }
            return;
        }

        if (event.target.id === 'ed-split') {
            const on = document.getElementById('ed-split').checked;
            const second = document.getElementById('ed-row-1');
            if (second) { second.hidden = !on; }
            // Row zero is the whole day or the morning, depending. Renaming it
            // in place keeps every value the administrator has already typed.
            document.querySelectorAll('#ed-row-0 .ed-shift-name')
                .forEach(el => { el.textContent = on ? 'Morning' : 'All day'; });
            return;
        }

        if (event.target.id === 'admin-copy') {
            const current = eventById(selectedEventId);
            if (!current) { return; }
            const text = outcomeText(current);
            try {
                await navigator.clipboard.writeText(text);
                announce('Outcome list copied.', 'success');
            } catch (error) {
                // Clipboard access is refused outside a secure context and in
                // some embedded browsers. Falling back to a selectable block is
                // better than telling somebody their browser said no.
                log.warn('Clipboard unavailable, showing the text instead.', error);
                document.getElementById('admin-panel').insertAdjacentHTML('beforeend',
                    '<pre class="admin-outcome" tabindex="0">' + esc(text) + '</pre>');
                announce('Your browser blocked the clipboard. The list is below, '
                       + 'select and copy it.', 'warning');
            }
        }
    });

    /*
     * The roster filter, delegated because the picker is created and destroyed
     * by render() and a listener bound to the field itself would not survive
     * the first redraw.
     *
     * The list is redrawn in place rather than through render(), which would
     * rebuild the whole panel and close the picker on every keystroke.
     */
    document.getElementById('admin-panel').addEventListener('input', (event) => {
        if (event.target.id !== 'add-filter') { return; }

        const box = event.target.closest('.admin-add');
        const opener = box && box.parentNode
            && box.parentNode.querySelector('[data-act="addopen"]');
        const current = eventById(selectedEventId);
        if (!box || !opener || !current) { return; }

        const parts = String(opener.dataset.key).split('|');
        const caret = event.target.selectionStart;
        renderAddPicker(current, parts[0], parts[1], parts[2], box, event.target.value);

        const field = box.querySelector('#add-filter');
        if (field && caret != null) { field.setSelectionRange(caret, caret); }
    });

    document.getElementById('admin-toggle').addEventListener('click', () => {
        const admin = document.getElementById('view-admin');
        const season = document.getElementById('view-season');
        const showing = !admin.classList.contains('is-active');

        admin.classList.toggle('is-active', showing);
        season.classList.toggle('is-active', !showing);
        document.getElementById('admin-toggle').textContent =
            showing ? 'Volunteer view' : 'Assignment view';
    });
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Builds the administrator surface and attaches it to the page.
 *
 * The events and the season are handed in rather than re-read. The volunteer
 * page has already loaded both by the time this runs, and reading them twice
 * would double the cost of every page load for the one account that opens this.
 */
export async function mountAdmin(context) {
    ctx = context;

    const main = document.querySelector('main.page');
    if (!main) {
        log.error('Administrator surface has nowhere to mount.');
        return;
    }

    main.insertAdjacentHTML('beforeend',
        '<section id="view-admin" class="view">'
      + '<div class="page-head">'
      + '<h1>Assignment</h1>'
      + '<hr class="hr-accent">'
      + '<p>Season ' + esc(ctx.season) + '. Signing up puts a volunteer on the '
      + 'schedule, or on standby once a group has reached its target. Rows are '
      + 'ordered by priority tier, then by who signed up first. Targets are '
      + 'targets, not limits.</p>'
      + '</div>'
      + '<div id="admin-banner" class="banner" hidden role="status"></div>'
      + '<section class="card"><h2>Events</h2>'
      + '<div id="admin-picker" class="admin-picker"><p class="admin-empty">'
      + 'Loading signups.</p></div></section>'
      + '<section class="card" id="admin-panel"></section>'
      + '</section>');

    /*
     * The toggle sits OUTSIDE both views, as the first thing in main.
     *
     * It used to be appended to '#view-season .page-head', which put the only
     * control that switches the two views inside one of them. Pressing it hid
     * the volunteer view, and the button went with it: the assignment screen
     * had no way back short of reloading the page. Reported by Jason and
     * corrected 2026-08-05.
     *
     * Anything that switches between two views cannot live inside either one.
     */
    main.insertAdjacentHTML('afterbegin',
        '<div class="btn-row admin-viewbar">'
      + '<button type="button" class="btn btn-secondary" id="admin-toggle">'
      + 'Assignment view</button></div>');

    wire();

    try {
        const [loadedRoster, loadedSignups] = await Promise.all([
            loadRoster(),
            loadAllSignups()
        ]);
        roster = loadedRoster;
        signupsByEvent = loadedSignups;
    } catch (error) {
        log.error('Administrator surface could not load its data.', error);
        document.getElementById('admin-picker').innerHTML =
            '<p class="admin-empty">The signups could not be loaded. '
          + 'Reload the page.</p>';
        return;
    }

    // Opens on the soonest event that has anybody on it, which is the one that
    // needs a decision. Falling back to the soonest event at all keeps the
    // panel from being empty before signups have come in.
    const today = new Date();
    const upcoming = ctx.events.filter(e => {
        const d = toLocalDate(e.eventDate);
        return d && CFG.daysUntil(d, today) >= 0;
    });
    const withPeople = upcoming.find(e => (signupsByEvent.get(e.id) || []).length);
    selectedEventId = (withPeople || upcoming[0] || ctx.events[0] || {}).id || '';

    render();

    // Refreshes the occupancy map the volunteer page reads. Deliberately after
    // render, and deliberately not awaited before the screen is usable: this is
    // a courtesy to the other page and must never be the reason this one is
    // slow to appear.
    syncCounts().catch(error => log.warn('Occupancy sync failed.', error));

    const total = Array.from(signupsByEvent.values()).reduce((n, a) => n + a.length, 0);
    log.log('Assignment surface ready, ' + total + ' signups across '
          + ctx.events.length + ' events.');
}
