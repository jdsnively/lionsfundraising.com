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
 * MODEL, from Event-Signup-v1-Build-Spec.md revision 2
 *
 * Request and assign. Volunteers declare availability and it rests in
 * `available` until an administrator moves it. Nothing here races anything:
 * there is no capacity gate, so no transaction and no contention. Capacity
 * survives only as a target shown on this screen, "3 of 4 assigned", and it is
 * never enforced against anybody.
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
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const log = window.LIONS_LOG || { log() {}, warn() {}, error(...a) { console.error(...a); } };
const CFG = window.SIGNUP_CONFIG;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ctx = null;                    // { db, events, season, admin }
let roster = new Map();            // lowercased email -> roster record
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
 * The roster, keyed by email.
 *
 * The signup document already carries name, phone, relationship and a snapshot
 * of licence state, so most of this screen could render without the roster.
 * It is loaded anyway for two things the snapshot cannot give: the licence
 * NUMBER, which decides between valid and incomplete, and the current phone,
 * which may have changed since a declaration made in August for an event in
 * April.
 *
 * Loaded once. The dashboard on this property reads the roster three times per
 * page load; that is a defect, not a pattern to copy.
 */
async function loadRoster() {
    const snap = await getDocs(collection(ctx.db, CFG.COLLECTIONS.USERS));
    const map = new Map();
    snap.docs.forEach(d => {
        const data = d.data();
        const email = String(data.email || '').trim().toLowerCase();
        if (email) { map.set(email, data); }
    });
    return map;
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
            log.error('Could not read declarations for ' + event.id, error);
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
    const person = roster.get(String(entry.data.userEmail || '').toLowerCase());
    return CFG.priorityTier(person || {});
}

function compareEntries(a, b) {
    const ta = tierOf(a);
    const tb = tierOf(b);
    if (ta !== tb) { return ta - tb; }
    return sortableTime(a.data.createdAt) - sortableTime(b.data.createdAt);
}

/** Declarations for one shift, split by group, each ordered for assignment. */
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
    const person = roster.get(String(entry.data.userEmail || '').toLowerCase());

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
                 + '<span class="admin-pick-count">' + entries.length + ' declared, '
                 + scheduled + ' scheduled'
                 + (days !== null && days >= 0 ? ', in ' + days + ' days' : '')
                 + '</span></button>';
        });

    document.getElementById('admin-picker').innerHTML = rows.length
        ? rows.join('')
        : '<p class="admin-empty">No upcoming events in this season.</p>';
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
    const person = roster.get(String(data.userEmail || '').toLowerCase()) || {};
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

function renderGroup(event, shift, group, entries) {
    const target = (shift.targets && shift.targets[group.key]) != null
        ? shift.targets[group.key]
        : CFG.DEFAULT_TARGETS[group.key];

    const scheduled = entries.filter(e => e.data.state === 'scheduled').length;
    const over = target != null && scheduled > target;

    return '<div class="admin-group">'
         + '<h4 class="admin-group-head">' + esc(group.label)
         + '<span class="admin-count' + (over ? ' is-over' : '') + '">'
         + scheduled + ' of ' + (target == null ? 'any' : target) + ' assigned</span>'
         + '</h4>'
         + (entries.length
             ? '<ul class="admin-people">'
               + entries.map(e => personRow(e, event)).join('') + '</ul>'
             : '<p class="admin-empty">Nobody has declared for this group.</p>')
         + '</div>';
}

function renderShift(event, shift) {
    const groups = groupsFor(event.id, shift.key);
    const all = CFG.GROUPS.flatMap(g => groups[g.key] || []);
    const scheduled = all.filter(e => e.data.state === 'scheduled');
    const leads = scheduled.filter(e => e.data.isStandLead === true);

    // A shift with people on it and nobody leading is the failure this warning
    // exists to prevent. It is not raised on an unassigned shift, because
    // "no lead yet" is the normal state of work that has not been done.
    const warn = scheduled.length && !leads.length
        ? '<p class="admin-warn">' + scheduled.length
          + (scheduled.length === 1 ? ' person is' : ' people are')
          + ' scheduled and no stand lead is set.</p>'
        : '';

    const times = shift.startTime
        ? formatTime(shift.startTime) + ' to ' + formatTime(shift.endTime)
        : '';

    return '<section class="admin-shift">'
         + '<h3 class="admin-shift-head">' + esc(shift.label)
         + (times ? ' <span class="shift-times">' + times + '</span>' : '')
         + '<span class="admin-shift-total">' + all.length + ' declared</span>'
         + '</h3>'
         + warn
         + CFG.GROUPS.map(g => renderGroup(event, shift, g, groups[g.key] || [])).join('')
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
             ? '<span class="field-note">Locked. ' + declared + ' declaration'
               + (declared === 1 ? '' : 's') + ' on this event were made against '
               + 'the shift as it stands, and changing its shape would strand them.'
               + '</span>'
             : '')
         + '</div>'

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
      + '<p class="admin-note">' + entries.length + ' declaration'
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

        shifts.push(Object.assign({}, wanted[i], {
            startTime: start || null,
            endTime: end || null
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
                + (next ? ' is stand lead.' : ' is no longer stand lead.'));
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
      + '<p>Season ' + esc(ctx.season) + '. Declarations are ordered by priority '
      + 'tier, then by who committed first. Targets are targets, not limits.</p>'
      + '</div>'
      + '<div id="admin-banner" class="banner" hidden role="status"></div>'
      + '<section class="card"><h2>Events</h2>'
      + '<div id="admin-picker" class="admin-picker"><p class="admin-empty">'
      + 'Loading declarations.</p></div></section>'
      + '<section class="card" id="admin-panel"></section>'
      + '</section>');

    // The toggle sits in the volunteer page head so that the two views are
    // plainly one page with two modes, rather than a hidden URL.
    const head = document.querySelector('#view-season .page-head');
    if (head) {
        head.insertAdjacentHTML('beforeend',
            '<div class="btn-row"><button type="button" class="btn btn-secondary"'
          + ' id="admin-toggle">Assignment view</button></div>');
    }

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
            '<p class="admin-empty">The declarations could not be loaded. '
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

    const total = Array.from(signupsByEvent.values()).reduce((n, a) => n + a.length, 0);
    log.log('Assignment surface ready, ' + total + ' declarations across '
          + ctx.events.length + ' events.');
}
