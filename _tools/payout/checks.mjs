// The check-received chain, tested against what actually happened in April 2026.
//
//   node _tools/payout/checks.mjs
//
// Every case runs against BOTH pages, with the functions sliced out of the
// shipped HTML. The headline case is the real remittance: check 4109045, face
// value $3,571.46, paying two events worth $4,988.59 because Sodexo deducted
// $1,417.13 for a check the club never deposited. If this suite ever stops
// reporting minus $1,417.13, the page has stopped being able to see it.

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
    'billedFor', 'checkOf', 'awaitsCheck', 'settlementsOn', 'checksIn',
    'unsettledChecks', 'shortCheckDate', 'escapeText', 'signedMoney',
    'checkBadgeHtml', 'staleReceivableHtml', 'awaitingTotal', 'shortfallTotal'
];

// staleReceivableHtml is the only one that reaches out of the block, and the
// season constant is already proved identical across the pages by the "pages"
// gate, so it is stubbed rather than extracted.
const STUBS = {
    currentSeasonKey: () => '2026-2027',
    seasonOf: (date) => (String(date || '') >= '2026-08-06' ? '2026-2027' : '2025-2026'),
    formatDate: (date) => String(date || '')
};

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
// The events. Amounts and dates are the real ones off the remittance stubs.
// ---------------------------------------------------------------------------
const CHECK_4109045 = { checkNumber: '4109045', checkDate: '2026-05-22', checkAmount: 3571.46,
                        checkNote: 'Sodexo deducted $1,417.13 for check 4107543, never deposited' };

function april() {
    return [
        // 05/08, stand pair CN23 + CN34
        Object.assign({ id: 'may08', eventName: 'Bruno Mars', eventDate: '2026-05-08',
                        primarySodexoPayout: 1574.62, secondarySodexoPayout: 779.79 }, CHECK_4109045),
        // 05/09, stand pair CN23 + CN33
        Object.assign({ id: 'may09', eventName: 'Colts Preseason', eventDate: '2026-05-09',
                        primarySodexoPayout: 1882.64, secondarySodexoPayout: 751.54 }, CHECK_4109045),
        // 04/03, paid in full on its own check
        { id: 'apr03', eventName: 'DCI Prelims', eventDate: '2026-04-03',
          primarySodexoPayout: 967.13, secondarySodexoPayout: 0,
          checkNumber: '4107824', checkDate: '2026-04-24', checkAmount: 967.13, checkNote: '' },
        // still owed, and from a season that has closed
        { id: 'apr04', eventName: 'DCI Finals', eventDate: '2026-04-04',
          primarySodexoPayout: 2776.84, secondarySodexoPayout: 974.63 },
        // this season, awaiting its check, which is ordinary
        { id: 'sep18', eventName: 'Christel House', eventDate: '2026-09-18',
          primarySodexoPayout: 1200.00, secondarySodexoPayout: 0 },
        // finalized with no Sodexo amount yet: awaiting Sodexo, not awaiting a check
        { id: 'sep26', eventName: 'Columbus', eventDate: '2026-09-26',
          primarySodexoPayout: 0, secondarySodexoPayout: 0 }
    ];
}

for (const { page, file } of PAGES) {
    const loaded = await loadNamed(file, NAMES, Object.keys(STUBS));
    const fn = loaded.load(STUBS);
    const shifts = april();
    const checks = fn.checksIn(shifts);

    console.log('=== ' + page + ' ===');

    // --- the real shortfall ------------------------------------------------
    const short = checks.get('4109045');
    eq(page, 'check 4109045 face value', short.amount, 3571.46);
    eq(page, 'check 4109045 billed across its events', short.billed, 4988.59);
    eq(page, 'check 4109045 gap', Math.round(short.gap * 100) / 100, -1417.13);
    eq(page, 'check 4109045 event count', short.events, 2);

    const paid = checks.get('4107824');
    eq(page, 'check 4107824 reconciles', Math.round(paid.gap * 100) / 100, 0);
    eq(page, 'check 4107824 event count', paid.events, 1);
    eq(page, 'two distinct checks recorded', checks.size, 2);

    // --- THE TRAP. One event of the short check hidden by a filter. --------
    // Naive code would subtract the visible billed total from the face value
    // and report plus $1,217.05, turning a shortfall into an overpayment.
    const onlyMay08 = shifts.filter(s => s.id === 'may08');
    eq(page, 'shortfall survives a filter hiding a sibling event',
        Math.round(fn.shortfallTotal(onlyMay08, checks) * 100) / 100, -1417.13);
    eq(page, 'shortfall counted once when both siblings are visible',
        Math.round(fn.shortfallTotal(shifts, checks) * 100) / 100, -1417.13);
    eq(page, 'a reconciled check contributes nothing to the shortfall',
        Math.round(fn.shortfallTotal([shifts[2]], checks) * 100) / 100, 0);

    // --- what is still owed ------------------------------------------------
    eq(page, 'billedFor sums both stands', fn.billedFor(shifts[0]), 2354.41);
    eq(page, 'awaiting total is the unpaid events only',
        Math.round(fn.awaitingTotal(shifts) * 100) / 100, 4951.47);
    ok(page, 'an event with a check does not await one', !fn.awaitsCheck(shifts[0]));
    ok(page, 'an unpaid event awaits one', fn.awaitsCheck(shifts[3]));
    ok(page, 'an event with no Sodexo amount awaits Sodexo, not a check',
        !fn.awaitsCheck(shifts[5]));

    // --- the closed season banner -----------------------------------------
    const banner = fn.staleReceivableHtml(shifts);
    ok(page, 'banner fires for a closed season debt', banner.indexOf('3751.47') !== -1, banner);
    ok(page, 'banner names the season', banner.indexOf('2025-2026') !== -1, banner);
    ok(page, 'banner ignores this season\'s ordinary wait',
        banner.indexOf('4951.47') === -1, banner);
    eq(page, 'no banner when nothing old is owed', fn.staleReceivableHtml([shifts[4]]), '');

    // --- the badges --------------------------------------------------------
    const shortBadge = fn.checkBadgeHtml(shifts[0], checks);
    ok(page, 'short check badge is red', shortBadge.indexOf('check-short') !== -1, shortBadge);
    ok(page, 'short check badge carries the gap',
        shortBadge.indexOf('1417.13') !== -1, shortBadge);
    ok(page, 'short check badge uses a real minus sign',
        shortBadge.indexOf('−$1417.13') !== -1, shortBadge);
    ok(page, 'short check badge names the check', shortBadge.indexOf('4109045') !== -1, shortBadge);
    ok(page, 'short check badge dates it 5/22', shortBadge.indexOf('5/22') !== -1, shortBadge);

    const inBadge = fn.checkBadgeHtml(shifts[2], checks);
    ok(page, 'reconciled check badge is green', inBadge.indexOf('check-in') !== -1, inBadge);
    ok(page, 'reconciled check badge shows no difference',
        inBadge.indexOf('−') === -1, inBadge);

    ok(page, 'unpaid event badge says awaiting check',
        fn.checkBadgeHtml(shifts[3], checks).indexOf('check-awaiting') !== -1);
    eq(page, 'no badge at all before Sodexo has billed',
        fn.checkBadgeHtml(shifts[5], checks), '');

    // --- the small things that bite ---------------------------------------
    eq(page, 'check date does not slide a day west', fn.shortCheckDate('2026-05-22'), '5/22');
    eq(page, 'check date on the first of a month', fn.shortCheckDate('2026-01-01'), '1/1');
    eq(page, 'a missing check date prints nothing', fn.shortCheckDate(''), '');
    eq(page, 'a typed check number cannot carry markup',
        fn.escapeText('4109045"><script>x</script>'),
        '4109045&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
    eq(page, 'a shortfall reads as negative', fn.signedMoney(-1417.13), '−$1417.13');
    eq(page, 'an overpayment reads as positive', fn.signedMoney(450), '+$450.00');

    // --- RECOVERING A SHORTFALL -------------------------------------------
    // When Sodexo eventually makes good, the make-up check pays no event of its
    // own. Without somewhere to put it the red badge could only ever be cleared
    // by deleting the record of the shortfall, which is the worst outcome
    // available. A settlement is recorded against the short check instead.
    const RECOVERY = { check: '4112001', date: '2026-06-15', amount: 1417.13, note: 'reissued' };

    const settledShifts = april().map(s => (s.checkNumber === '4109045'
        ? Object.assign({}, s, { gapSettlements: [RECOVERY] }) : s));
    const settledChecks = fn.checksIn(settledShifts);
    const settled = settledChecks.get('4109045');
    eq(page, 'the gap itself is history and does not move',
        Math.round(settled.gap * 100) / 100, -1417.13);
    eq(page, 'a full recovery is recorded', Math.round(settled.settled * 100) / 100, 1417.13);
    eq(page, 'nothing is outstanding once it is recovered',
        Math.round(settled.outstanding * 100) / 100, 0);
    eq(page, 'a recovered check leaves the shortfall total',
        Math.round(fn.shortfallTotal(settledShifts, settledChecks) * 100) / 100, 0);
    const settledBadge = fn.checkBadgeHtml(settledShifts[0], settledChecks);
    ok(page, 'a recovered check goes green', settledBadge.indexOf('check-in') !== -1, settledBadge);
    ok(page, 'a recovered check still says it was short',
        settledBadge.indexOf('settled') !== -1, settledBadge);
    ok(page, 'a recovered check names the check that made it good',
        settledBadge.indexOf('4112001') !== -1, settledBadge);
    eq(page, 'nothing is left unsettled', fn.unsettledChecks(settledChecks).length, 0);

    // A PARTIAL recovery must leave the rest flagged. This is the case a single
    // settlement field would have got wrong by overwriting.
    const partShifts = april().map(s => (s.checkNumber === '4109045'
        ? Object.assign({}, s, { gapSettlements: [{ check: '4112001', date: '2026-06-15', amount: 1000 }] })
        : s));
    const partChecks = fn.checksIn(partShifts);
    eq(page, 'a partial recovery leaves the rest outstanding',
        Math.round(partChecks.get('4109045').outstanding * 100) / 100, -417.13);
    eq(page, 'a partial recovery still shows in the shortfall total',
        Math.round(fn.shortfallTotal(partShifts, partChecks) * 100) / 100, -417.13);
    ok(page, 'a partially recovered check stays red',
        fn.checkBadgeHtml(partShifts[0], partChecks).indexOf('check-short') !== -1);
    ok(page, 'a partially recovered check shows what is left',
        fn.checkBadgeHtml(partShifts[0], partChecks).indexOf('417.13') !== -1);
    eq(page, 'a partially recovered check is still offered for settling',
        fn.unsettledChecks(partChecks).length, 1);

    // Two instalments, which is how the April money would actually come back.
    const twoShifts = april().map(s => (s.checkNumber === '4109045'
        ? Object.assign({}, s, { gapSettlements: [
            { check: '4112001', date: '2026-06-15', amount: 1000 },
            { check: '4113550', date: '2026-07-02', amount: 417.13 }] })
        : s));
    eq(page, 'two instalments add up to a settled check',
        Math.round(fn.checksIn(twoShifts).get('4109045').outstanding * 100) / 100, 0);

    // --- settlement data that is not what we expect ------------------------
    eq(page, 'no settlements is an empty list', fn.settlementsOn({}).length, 0);
    eq(page, 'a settlement that names no check is discarded',
        fn.settlementsOn({ gapSettlements: [{ amount: 50 }] }).length, 0);
    eq(page, 'a settlement field that is not a list is ignored',
        fn.settlementsOn({ gapSettlements: 'nope' }).length, 0);
    eq(page, 'a settlement with no amount counts as zero',
        fn.settlementsOn({ gapSettlements: [{ check: 'x' }] })[0].amount, 0);

    // --- an empty page -----------------------------------------------------
    eq(page, 'no shifts, nothing awaited', fn.awaitingTotal([]), 0);
    eq(page, 'no shifts, no shortfall', fn.shortfallTotal([], fn.checksIn([])), 0);
    eq(page, 'no shifts, no checks', fn.checksIn([]).size, 0);
    eq(page, 'a blank check number is no check', fn.checkOf({ checkNumber: '   ' }), null);
    eq(page, 'no checks, nothing unsettled', fn.unsettledChecks(fn.checksIn([])).length, 0);
}

// The two copies must not merely both work. They must be the same code.
const sources = [];
for (const { file } of PAGES) {
    const loaded = await loadNamed(file, NAMES, Object.keys(STUBS));
    sources.push(NAMES.map((n) => loaded.sources[n]).join('\n'));
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
