// The check-received chain, one event at a time.
//
//   node _tools/payout/checks.mjs
//
// Every case runs against BOTH pages, with the functions sliced out of the
// shipped HTML, and the dialog's save guard runs against the treasurer page.
//
// M-31, ruled by Jason 2026-09-27: each event stands alone. The treasurer
// records, per event, the check number, the check date and the amount the stub
// shows for that event's date. Tracking starts at DCI Day 1, 2026-08-06.
//
// The headline case replays the real remittance of 2026-05-22 as if it had
// arrived this season. Check 4109045, face value $3,571.46, paid two events in
// full ($2,354.41 and $2,634.18) and took back $967.13 (a duplicate of an
// earlier event) and $450.00 (a line that was never ours). As first built, both
// paid events read minus $1,417.13. Now they read paid, the event the $967.13
// is about reads short, the $450 is counted as not ours, and the club is still
// shown $1,417.13 short in total. If this suite stops reporting both halves of
// that, the page has lost one of them.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadNamed } from './extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const PAGES = [
    { page: 'payouts', file: join(REPO, 'public_html', 'payouts', 'index.html') },
    { page: 'treasurer', file: join(REPO, 'public_html', 'treasurer', 'index.html') }
];

const NAMES = [
    'billedFor', 'tracksCheck', 'checkOf', 'awaitsCheck', 'adjustmentsOn',
    'eventCheck', 'checksIn', 'shortCheckDate', 'escapeText', 'signedMoney',
    'tileLabel', 'checkBadgeHtml', 'staleReceivableHtml', 'awaitingSummary',
    'shortfallSummary'
];

// The dialog's arithmetic and save guard. Treasurer only: payouts is read only.
const DRAFT_NAMES = ['billedFor', 'signedMoney', 'typedMoney', 'localToday', 'checkDraftSummary'];

// staleReceivableHtml reaches out of the block for the season. The season
// constant is proved identical across the pages by the "pages" gate, so it is
// stubbed, and the current season is a variable so a rollover can be tested.
let CURRENT = '2026-2027';
const STUBS = {
    currentSeasonKey: () => CURRENT,
    seasonOf: (date) => {
        const d = String(date || '');
        if (d >= '2027-08-05') return '2027-2028';
        if (d >= '2026-08-06') return '2026-2027';
        return '2025-2026';
    },
    formatDate: (date) => String(date || '')
};

const MINUS = String.fromCharCode(0x2212);
const cents = (n) => Math.round(n * 100) / 100;

let failures = 0;
let assertions = 0;

function eq(page, label, got, want) {
    assertions++;
    const same = typeof want === 'number'
        ? Math.abs(got - want) < 1e-9
        : got === want;
    if (!same) {
        failures++;
        console.log('  FAIL ' + page + '  ' + label);
        console.log('         got  ' + JSON.stringify(got));
        console.log('         want ' + JSON.stringify(want));
    }
}

function ok(page, label, condition, detail) {
    assertions++;
    if (!condition) {
        failures++;
        console.log('  FAIL ' + page + '  ' + label + (detail ? '  (' + detail + ')' : ''));
    }
}

// ---------------------------------------------------------------------------
// The events. Amounts are the real ones off the remittance stubs. The first
// three are the real May and April events, before tracking; the rest replay
// the same money on this season's dates.
// ---------------------------------------------------------------------------
const NOT_OURS = { check: '4109045', date: '2026-08-28', amount: -450,
                   note: 'BR-1 on check 4107543, never ours', own: false };
const DUPLICATE = { check: '4109045', date: '2026-08-28', amount: -967.13,
                    note: 'reverses a duplicate on check 4107543, never deposited', own: true };

function season() {
    return [
        // --- before DCI Day 1: history, never tracked ----------------------
        { id: 'may08', eventName: 'May 8', eventDate: '2026-05-08',
          primarySodexoPayout: 1574.62, secondarySodexoPayout: 779.79 },
        { id: 'apr04', eventName: 'April 4', eventDate: '2026-04-04',
          primarySodexoPayout: 2776.84, secondarySodexoPayout: 974.63 },
        { id: 'aug05', eventName: 'The day before DCI', eventDate: '2026-08-05',
          primarySodexoPayout: 500, secondarySodexoPayout: 0 },

        // --- DCI Day 1 on: tracked ------------------------------------------
        // Paid in full by 4109045, the first of its two events. It also holds
        // the not-ours line, because that is where the page keeps one.
        { id: 'dci1', eventName: 'DCI - Day 1', eventDate: '2026-08-06',
          primarySodexoPayout: 1574.62, secondarySodexoPayout: 779.79,
          checkNumber: '4109045', checkDate: '2026-08-28', checkPaid: 2354.41,
          checkNote: '', checkAdjustments: [NOT_OURS] },
        // Paid in full by the same check.
        { id: 'dci2', eventName: 'DCI - Day 2', eventDate: '2026-08-07',
          primarySodexoPayout: 1882.64, secondarySodexoPayout: 751.54,
          checkNumber: '4109045', checkDate: '2026-08-28', checkPaid: 2634.18, checkNote: '' },
        // Paid in full on its own check, then 4109045 took $967.13 back.
        { id: 'dci3', eventName: 'DCI - Day 3', eventDate: '2026-08-08',
          primarySodexoPayout: 967.13, secondarySodexoPayout: 0,
          checkNumber: '4107824', checkDate: '2026-08-21', checkPaid: 967.13, checkNote: '',
          checkAdjustments: [DUPLICATE] },
        // Awaiting its check, which is ordinary.
        { id: 'aug22', eventName: 'Colts vs. Falcons', eventDate: '2026-08-22',
          primarySodexoPayout: 1200.00, secondarySodexoPayout: 0 },
        { id: 'aug29', eventName: 'Colts vs. Lions', eventDate: '2026-08-29',
          primarySodexoPayout: 800.00, secondarySodexoPayout: 300.00 },
        // Finalized with no Sodexo amount yet: awaiting Sodexo, not a check.
        { id: 'sep26', eventName: 'Columbus', eventDate: '2026-09-26',
          primarySodexoPayout: 0, secondarySodexoPayout: 0 }
    ];
}

const byId = (list, id) => list.find(s => s.id === id);

for (const { page, file } of PAGES) {
    const loaded = await loadNamed(file, NAMES, Object.keys(STUBS));
    const fn = loaded.load(STUBS);
    CURRENT = '2026-2027';
    const shifts = season();
    const checks = fn.checksIn(shifts);

    console.log('=== ' + page + ' ===');

    eq(page, 'tracking starts at DCI Day 1', loaded.from, "const CHECKS_FROM = '2026-08-06';");

    // --- history stays in the past ------------------------------------------
    for (const id of ['may08', 'apr04', 'aug05']) {
        const s = byId(shifts, id);
        ok(page, id + ' is not tracked', !fn.tracksCheck(s));
        ok(page, id + ' does not await a check', !fn.awaitsCheck(s));
        eq(page, id + ' has no check state', fn.eventCheck(s), null);
        eq(page, id + ' carries no badge', fn.checkBadgeHtml(s, checks), '');
    }
    ok(page, 'DCI Day 1 itself is tracked', fn.tracksCheck(byId(shifts, 'dci1')));

    // --- THE M-31 POINT: each event stands alone ----------------------------
    const d1 = fn.eventCheck(byId(shifts, 'dci1'));
    const d2 = fn.eventCheck(byId(shifts, 'dci2'));
    const d3 = fn.eventCheck(byId(shifts, 'dci3'));
    eq(page, 'DCI Day 1 is paid, not painted by its check', d1.status, 'paid');
    eq(page, 'DCI Day 2 is paid, not painted by its check', d2.status, 'paid');
    eq(page, 'DCI Day 1 difference is zero', cents(d1.gap), 0);
    eq(page, 'the not-ours line does not touch DCI Day 1', cents(d1.adjusted), 0);
    eq(page, 'DCI Day 3 reads short by the line about it', d3.status, 'short');
    eq(page, 'DCI Day 3 is short $967.13', cents(d3.gap), -967.13);
    eq(page, 'DCI Day 3 paid its own check in full', d3.paid, 967.13);

    // --- the check connects its events, and ties to the face value ----------
    const row = checks.get('4109045');
    eq(page, 'check 4109045 paid two events', row.shiftIds.length, 2);
    eq(page, 'check 4109045 event amounts', cents(row.paid), 4988.59);
    eq(page, 'check 4109045 carried two extra lines', row.adjustments.length, 2);
    eq(page, 'check 4109045 total is the real face value', cents(row.total), 3571.46);
    eq(page, 'check 4107824 total', cents(checks.get('4107824').total), 967.13);
    eq(page, 'two checks recorded', checks.size, 2);
    ok(page, 'a filtered list cannot tie out a check, which is why every shift is passed',
        cents(fn.checksIn([byId(shifts, 'dci1')]).get('4109045').total) !== 3571.46);

    // --- still $1,417.13 short in total, from the right places --------------
    const short = fn.shortfallSummary(shifts);
    eq(page, 'the club is still short $1,417.13', cents(short.amount), -1417.13);
    eq(page, 'one EVENT short: DCI Day 3. The not-ours line is money, not an event', short.count, 1);
    eq(page, 'the not-ours line alone is money taken, and no event',
        JSON.stringify(fn.shortfallSummary([byId(shifts, 'dci1')])), JSON.stringify({ count: 0, amount: -450 }));
    eq(page, 'a paid event alone contributes nothing',
        cents(fn.shortfallSummary([byId(shifts, 'dci2')]).amount), 0);
    eq(page, 'the short event alone carries its own shortfall',
        cents(fn.shortfallSummary([byId(shifts, 'dci3')]).amount), -967.13);
    eq(page, 'history contributes nothing',
        cents(fn.shortfallSummary(shifts.filter(s => s.eventDate < '2026-08-06')).amount), 0);

    // --- what is still owed -------------------------------------------------
    const waiting = fn.awaitingSummary(shifts);
    eq(page, 'two events await a check', waiting.count, 2);
    eq(page, 'awaiting is this season\'s unpaid events only', cents(waiting.amount), 2300);
    ok(page, 'an event with no Sodexo amount awaits Sodexo, not a check',
        !fn.awaitsCheck(byId(shifts, 'sep26')));
    eq(page, 'no badge before Sodexo has billed', fn.checkBadgeHtml(byId(shifts, 'sep26'), checks), '');
    eq(page, 'billedFor sums both stands', fn.billedFor(byId(shifts, 'dci1')), 2354.41);

    // --- the tile labels ----------------------------------------------------
    eq(page, 'no events, no count', fn.tileLabel('Awaiting Sodexo', 0), 'Awaiting Sodexo');
    eq(page, 'one event', fn.tileLabel('Short Paid', 1), 'Short Paid, 1 event');
    eq(page, 'several events', fn.tileLabel('Awaiting Sodexo', 3), 'Awaiting Sodexo, 3 events');

    // --- the badges ---------------------------------------------------------
    const b1 = fn.checkBadgeHtml(byId(shifts, 'dci1'), checks);
    ok(page, 'paid badge is green', b1.indexOf('check-in') !== -1, b1);
    ok(page, 'paid badge carries no difference', b1.indexOf(MINUS) === -1, b1);
    ok(page, 'paid badge names its check', b1.indexOf('check 4109045') !== -1, b1);
    ok(page, 'paid badge dates it 8/28', b1.indexOf('8/28') !== -1, b1);
    ok(page, 'paid badge names the other event on the check', b1.indexOf('1 other event') !== -1, b1);
    ok(page, 'paid badge gives the check total', b1.indexOf('3571.46') !== -1, b1);
    ok(page, 'paid badge mentions the not-ours line', b1.indexOf('not one of our events') !== -1, b1);

    const b3 = fn.checkBadgeHtml(byId(shifts, 'dci3'), checks);
    ok(page, 'short badge is red', b3.indexOf('check-short') !== -1, b3);
    ok(page, 'short badge carries its own gap with a real minus',
        b3.indexOf(MINUS + '$967.13') !== -1, b3);
    ok(page, 'short badge names its own check, not the one that took it back',
        b3.indexOf('check 4107824') !== -1, b3);
    ok(page, 'short badge says which check took it back', b3.indexOf('4109045 took back $967.13') !== -1, b3);

    ok(page, 'awaiting badge', fn.checkBadgeHtml(byId(shifts, 'aug22'), checks)
        .indexOf('check-awaiting') !== -1);

    // --- overpaid: amber, not green, not counted as owed --------------------
    const over = { id: 'over', eventName: 'Over', eventDate: '2026-09-05',
                   primarySodexoPayout: 1000, checkNumber: '5000', checkDate: '2026-09-20', checkPaid: 1010 };
    eq(page, 'an overpaid event reads over', fn.eventCheck(over).status, 'over');
    ok(page, 'an overpaid badge is amber', fn.checkBadgeHtml(over, fn.checksIn([over]))
        .indexOf('check-over') !== -1);
    ok(page, 'an overpaid badge shows +$10.00', fn.checkBadgeHtml(over, fn.checksIn([over]))
        .indexOf('+$10.00') !== -1);
    eq(page, 'an overpayment does not offset another event\'s shortfall',
        cents(fn.shortfallSummary([over, byId(shifts, 'dci3')]).amount), -967.13);
    eq(page, 'half a cent is noise, not money', fn.eventCheck(Object.assign({}, over,
        { checkPaid: 1000.004 })).status, 'paid');

    // --- MAKING IT GOOD -----------------------------------------------------
    const RETURNED = { check: '4112001', date: '2026-10-15', amount: 967.13, note: 'reissued', own: true };
    const RETURNED_450 = { check: '4112001', date: '2026-10-15', amount: 450, note: 'BR-1 returned', own: false };
    const good = season().map(s => {
        if (s.id === 'dci3') return Object.assign({}, s, { checkAdjustments: [DUPLICATE, RETURNED] });
        if (s.id === 'aug22') return Object.assign({}, s, { checkNumber: '4112001', checkDate: '2026-10-15',
            checkPaid: 1200, checkAdjustments: [RETURNED_450] });
        return s;
    });
    const goodChecks = fn.checksIn(good);
    eq(page, 'a made-good event reads paid', fn.eventCheck(byId(good, 'dci3')).status, 'paid');
    const settledBadge = fn.checkBadgeHtml(byId(good, 'dci3'), goodChecks);
    ok(page, 'a made-good event is green', settledBadge.indexOf('check-in') !== -1, settledBadge);
    ok(page, 'a made-good event still says it was put right', settledBadge.indexOf('settled') !== -1,
        settledBadge);
    ok(page, 'a made-good event names the check that put it right',
        settledBadge.indexOf('4112001 added $967.13') !== -1, settledBadge);
    eq(page, 'nothing short once both are returned', cents(fn.shortfallSummary(good).amount), 0);
    eq(page, 'no items short once both are returned', fn.shortfallSummary(good).count, 0);
    eq(page, 'the make-good check ties out', cents(goodChecks.get('4112001').total), 2617.13);

    // A PARTIAL make-good leaves the rest flagged.
    const part = season().map(s => (s.id === 'dci3' ? Object.assign({}, s, { checkAdjustments: [DUPLICATE,
        { check: '4112001', date: '2026-10-15', amount: 500, note: 'part', own: true }] }) : s));
    eq(page, 'a partial make-good leaves the rest short',
        cents(fn.eventCheck(byId(part, 'dci3')).gap), -467.13);
    ok(page, 'a partially made-good event stays red',
        fn.checkBadgeHtml(byId(part, 'dci3'), fn.checksIn(part)).indexOf('check-short') !== -1);

    // --- a season rollover does not hide what is still owed -----------------
    eq(page, 'no banner while the season is open', fn.staleReceivableHtml(shifts), '');
    CURRENT = '2027-2028';
    const banner = fn.staleReceivableHtml(shifts);
    ok(page, 'banner fires for last season\'s unpaid events', banner.indexOf('2300.00') !== -1, banner);
    ok(page, 'banner names the season', banner.indexOf('2026-2027') !== -1, banner);
    ok(page, 'banner never reaches before DCI Day 1', banner.indexOf('2025-2026') === -1, banner);
    ok(page, 'the owed events still await after the rollover', fn.awaitsCheck(byId(shifts, 'aug22')));
    CURRENT = '2026-2027';

    // --- data that is not what we expect ------------------------------------
    eq(page, 'no adjustments is an empty list', fn.adjustmentsOn({}).length, 0);
    eq(page, 'a line that names no check is discarded',
        fn.adjustmentsOn({ checkAdjustments: [{ amount: 50 }] }).length, 0);
    eq(page, 'an adjustments field that is not a list is ignored',
        fn.adjustmentsOn({ checkAdjustments: 'nope' }).length, 0);
    eq(page, 'a line with no amount counts as zero',
        fn.adjustmentsOn({ checkAdjustments: [{ check: 'x' }] })[0].amount, 0);
    eq(page, 'a line is ours unless it says otherwise',
        fn.adjustmentsOn({ checkAdjustments: [{ check: 'x', amount: 1 }] })[0].own, true);
    eq(page, 'a not-ours line stays not ours',
        fn.adjustmentsOn({ checkAdjustments: [{ check: 'x', amount: 1, own: false }] })[0].own, false);
    eq(page, 'a blank check number is no check', fn.checkOf({ checkNumber: '   ' }), null);
    eq(page, 'the old pooled field is not read', fn.checkOf({ checkNumber: '1', checkAmount: 3571.46 }).paid, 0);
    eq(page, 'an event with no date is not tracked', fn.tracksCheck({ primarySodexoPayout: 5 }), false);

    // --- the small things that bite -----------------------------------------
    eq(page, 'check date does not slide a day west', fn.shortCheckDate('2026-05-22'), '5/22');
    eq(page, 'check date on the first of a month', fn.shortCheckDate('2026-01-01'), '1/1');
    eq(page, 'a missing check date prints nothing', fn.shortCheckDate(''), '');
    eq(page, 'a typed check number cannot carry markup',
        fn.escapeText('4109045"><script>x</script>'),
        '4109045&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
    eq(page, 'a shortfall reads as negative', fn.signedMoney(-1417.13), MINUS + '$1417.13');
    eq(page, 'an overpayment reads as positive', fn.signedMoney(450), '+$450.00');

    // --- an empty page -------------------------------------------------------
    eq(page, 'no shifts, nothing awaited', fn.awaitingSummary([]).count, 0);
    eq(page, 'no shifts, no shortfall', fn.shortfallSummary([]).amount, 0);
    eq(page, 'no shifts, no checks', fn.checksIn([]).size, 0);
}

// ---------------------------------------------------------------------------
// The dialog's save guard, treasurer page only.
// ---------------------------------------------------------------------------
{
    const page = 'treasurer';
    const file = PAGES[1].file;
    const d = (await loadNamed(file, DRAFT_NAMES)).load();
    const shifts = season();
    const e1 = byId(shifts, 'dci1');
    const e2 = byId(shifts, 'dci2');
    const e3 = byId(shifts, 'dci3');

    console.log('=== treasurer dialog ===');

    eq(page, 'a blank amount is not a number', Number.isNaN(d.typedMoney('')), true);
    eq(page, 'text is not a number', Number.isNaN(d.typedMoney('abc')), true);
    eq(page, 'a stub amount reads as typed', d.typedMoney('2354.41'), 2354.41);
    eq(page, 'what Sodexo owes for DCI Day 1, as the box fills in', d.billedFor(e1).toFixed(2), '2354.41');
    eq(page, 'a deduction keeps its sign', d.typedMoney('-450'), -450);

    // Jason, 2026-10-01: she types the amount printed on the check, every
    // ticked event fills in with what Sodexo owes, and the check records only
    // when what is entered comes to the amount of the check exactly.
    const replay = d.checkDraftSummary('4109045', '2026-08-28', '',
        [{ shift: e1, typed: '2354.41' }, { shift: e2, typed: '2634.18' }],
        [{ amount: '-967.13', about: 'dci3', note: 'duplicate' },
         { amount: '-450', about: 'none', note: 'BR-1' }], '3571.46', 0);
    eq(page, 'the replayed stub saves', replay.problem, '');
    eq(page, 'the replayed stub totals the face of the check', cents(replay.total), 3571.46);
    eq(page, 'the replayed stub leaves nothing remaining', replay.remaining, 0);
    eq(page, 'the amount of the check comes back as a number', replay.checkTotal, 3571.46);
    eq(page, 'neither paid event differs', replay.differs.length, 0);

    eq(page, 'a check number is required',
        d.checkDraftSummary('', '2026-08-28', '', [{ shift: e1, typed: '1' }], [], '1', 0).problem,
        'Enter the check number printed on the check.');
    eq(page, 'a check date is required',
        d.checkDraftSummary('1', '8/28', '', [{ shift: e1, typed: '1' }], [], '1', 0).problem,
        'Enter the date printed on the check.');
    eq(page, 'THE AMOUNT OF THE CHECK IS REQUIRED',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '2354.41' }], [], '', 0).problem,
        'Enter the amount printed on the check.');
    ok(page, 'a zero check is refused',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '2354.41' }], [], '0', 0).problem
            === 'Enter the amount printed on the check.');
    ok(page, 'something has to be on the check',
        d.checkDraftSummary('1', '2026-08-28', '', [], [], '5', 0).problem.indexOf('Tick the events') === 0);
    eq(page, 'an emptied amount box is still refused',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '' }], [], '2354.41', 0).problem,
        'Type the amount the stub shows for DCI - Day 1.');
    ok(page, 'a zero amount is refused',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '0' }], [], '2354.41', 0).problem !== '');

    // The prefilled amounts accepted as they are, on a check that is short:
    // the money left over is what stops it, before anyone has to spot it.
    const accepted = d.checkDraftSummary('4109045', '2026-08-28', '',
        [{ shift: e1, typed: d.billedFor(e1).toFixed(2) }, { shift: e2, typed: d.billedFor(e2).toFixed(2) }],
        [], '3571.46', 0);
    ok(page, 'A SHORT CHECK WITH THE AMOUNTS LEFT AS FILLED IN DOES NOT SAVE',
        accepted.problem.indexOf('more than the check') !== -1, accepted.problem);
    eq(page, 'and it says by how much', cents(accepted.remaining), -1417.13);
    const leftOver = d.checkDraftSummary('1', '2026-08-28', '',
        [{ shift: e1, typed: '2354.41' }], [], '4988.59', 0);
    ok(page, 'a check with money not accounted for does not save',
        leftOver.problem.indexOf('$2634.18 of the check is not accounted for') === 0, leftOver.problem);
    eq(page, 'a cent of float noise is not a difference',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '1574.62' }, { shift: e2, typed: '779.79' }],
            [], '2354.41', 0).remaining, 0);

    const shortNoNote = d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '1574.62' }], [], '1574.62', 0);
    ok(page, 'a short event needs a note, once the check reconciles',
        shortNoNote.problem.indexOf(MINUS + '$779.79') !== -1, shortNoNote.problem);
    eq(page, 'the short event is listed as differing', shortNoNote.differs.length, 1);
    eq(page, 'a short event with a note saves',
        d.checkDraftSummary('1', '2026-08-28', 'one stand only', [{ shift: e1, typed: '1574.62' }], [],
            '1574.62', 0).problem, '');

    // Correcting a check that already carries lines: they stay, and count.
    const corrected = d.checkDraftSummary('4109045', '2026-08-28', '',
        [{ shift: e1, typed: '2354.41' }, { shift: e2, typed: '2634.18' }], [], '3571.46', -1417.13);
    eq(page, 'lines already recorded on the check count toward it', corrected.problem, '');
    eq(page, 'and leave nothing remaining', corrected.remaining, 0);

    ok(page, 'an extra line needs an amount',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '2354.41' }],
            [{ amount: '', about: 'dci3', note: 'x' }], '2354.41', 0).problem.indexOf('amount of each extra line') !== -1);
    ok(page, 'an extra line needs to say what it is about',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '2354.41' }],
            [{ amount: '-5', about: '', note: 'x' }], '2349.41', 0).problem.indexOf('which event') !== -1);
    ok(page, 'an extra line needs a note',
        d.checkDraftSummary('1', '2026-08-28', '', [{ shift: e1, typed: '2354.41' }],
            [{ amount: '-5', about: 'dci3', note: ' ' }], '2349.41', 0).problem.indexOf('Write what each extra line is') === 0);
    ok(page, 'a not-ours line needs an event on the same check',
        d.checkDraftSummary('1', '2026-08-28', '', [],
            [{ amount: '-450', about: 'none', note: 'x' }], '450', 0).problem.indexOf('not one of our events') !== -1);
    eq(page, 'a make-good alone, about one of our events, saves',
        d.checkDraftSummary('4112001', '2026-10-15', '', [],
            [{ amount: '967.13', about: e3.id, note: 'reissued' }], '967.13', 0, '2026-10-15').problem, '');

    // Jason, 2026-10-04: a check cannot be recorded with a date that has not
    // happened. Check 4113855 went in dated 2026-11-18 on 2026-10-04. Every
    // call here passes its own "today", so none of this depends on the day
    // the suite runs, except the last, which proves the real clock is used
    // when nobody passes one.
    const dated = (date, today) => d.checkDraftSummary('4113855', date, '',
        [{ shift: e1, typed: '2354.41' }], [], '2354.41', 0, today).problem;
    eq(page, 'a check dated six weeks ahead is refused', dated('2026-11-18', '2026-10-04'),
        '11/18/2026 has not happened yet. Enter the date printed on the check.');
    eq(page, 'a check dated tomorrow is refused', dated('2026-10-05', '2026-10-04'),
        '10/5/2026 has not happened yet. Enter the date printed on the check.');
    eq(page, 'a check dated today records', dated('2026-10-04', '2026-10-04'), '');
    eq(page, 'a check dated yesterday records', dated('2026-10-03', '2026-10-04'), '');
    eq(page, 'the first of next year is later than New Year\'s Eve',
        dated('2027-01-01', '2026-12-31').indexOf('1/1/2027 has not happened yet') === 0, true);
    eq(page, 'the date passed in decides, not the clock',
        dated('2020-01-02', '2020-01-01'), '1/2/2020 has not happened yet. Enter the date printed on the check.');
    eq(page, 'a date that is not a date still asks for the date',
        dated('11/18', '2026-10-04'), 'Enter the date printed on the check.');
    // 8:30 in the evening Eastern on the 4th is already the 5th in UTC. The
    // clock is swapped for one where the two disagree, because on a build
    // server they never do and a UTC date would pass unnoticed.
    {
        const RealDate = globalThis.Date;
        let read = '';
        let tomorrow = '';
        try {
            globalThis.Date = class {
                getFullYear() { return 2026; }
                getMonth() { return 9; }
                getDate() { return 4; }
                toISOString() { return '2026-10-05T00:30:00.000Z'; }
            };
            read = d.localToday();
            tomorrow = d.checkDraftSummary('4113855', '2026-10-05', '',
                [{ shift: e1, typed: '2354.41' }], [], '2354.41', 0).problem;
        } finally {
            globalThis.Date = RealDate;
        }
        eq(page, 'today is this computer\'s date, not the UTC one', read, '2026-10-04');
        eq(page, 'in the evening, tomorrow is still tomorrow', tomorrow,
            '10/5/2026 has not happened yet. Enter the date printed on the check.');
    }
    // Jason, 2026-10-05: a check cannot be dated before an event it pays.
    // DCI Day 1 took place on 2026-08-06 and DCI Day 2 on 2026-08-07.
    const paying = (date, events) => d.checkDraftSummary('4112718', date, '',
        events.map(shift => ({ shift, typed: d.billedFor(shift).toFixed(2) })), [],
        events.reduce((sum, shift) => sum + d.billedFor(shift), 0).toFixed(2), 0, '2026-10-05').problem;
    eq(page, 'a check dated before the event it pays is refused', paying('2026-08-05', [e1]),
        '8/5/2026 is before DCI - Day 1 took place on 8/6/2026. Correct the check date, or untick '
        + 'the event if this check does not pay for it.');
    eq(page, 'a check dated on the day of the event records', paying('2026-08-06', [e1]), '');
    eq(page, 'a check dated the day after the event records', paying('2026-08-07', [e1]), '');
    // Dated before both, so both offend and the choice between them is real.
    ok(page, 'of two events it is dated before, the later one is the one named',
        paying('2026-08-05', [e1, e2]).indexOf('8/5/2026 is before DCI - Day 2 took place on 8/7/2026.') === 0);
    ok(page, 'and it is named whichever order they were ticked in',
        paying('2026-08-05', [e2, e1]).indexOf('8/5/2026 is before DCI - Day 2 took place on 8/7/2026.') === 0);
    ok(page, 'dated between two events, only the later one offends',
        paying('2026-08-06', [e1, e2]).indexOf('8/6/2026 is before DCI - Day 2 took place on 8/7/2026.') === 0);
    eq(page, 'a check dated after both events records', paying('2026-08-21', [e1, e2]), '');
    eq(page, 'an event with no date does not block its check',
        paying('2026-08-21', [Object.assign({}, e1, { eventDate: '' })]), '');
    eq(page, 'a month slip into last year is caught by the event, not the clock',
        paying('2025-08-21', [e1]).indexOf('8/21/2025 is before DCI - Day 1 took place on 8/6/2026.') === 0, true);
    ok(page, 'a date in the future is still reported as the future',
        d.checkDraftSummary('4112718', '2026-10-06', '', [{ shift: e1, typed: '2354.41' }], [], '2354.41', 0,
            '2026-10-05').problem.indexOf('10/6/2026 has not happened yet') === 0);

    ok(page, 'with no date passed, the real clock still refuses the future',
        d.checkDraftSummary('4113855', '2999-01-01', '', [{ shift: e1, typed: '2354.41' }], [],
            '2354.41', 0).problem.indexOf('1/1/2999 has not happened yet') === 0);
}

// The two copies must not merely both work. They must be the same code.
const sources = [];
for (const { file } of PAGES) {
    const loaded = await loadNamed(file, NAMES, Object.keys(STUBS));
    sources.push(loaded.from + '\n' + NAMES.map((n) => loaded.sources[n]).join('\n'));
}
assertions++;
if (sources[0] !== sources[1]) {
    failures++;
    console.log('  FAIL  the payouts and treasurer copies of the check chain have diverged');
}

console.log('');
console.log(failures === 0
    ? 'OK   ' + assertions + ' assertions, both pages, check chain identical'
    : failures + ' of ' + assertions + ' assertions failed');
process.exit(failures === 0 ? 0 : 1);
