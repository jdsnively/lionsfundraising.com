// Firestore rules, tested as the LEAST PRIVILEGED ROLE that has to do the job.
//
//   cd _tools/rules
//   npm install --no-save firebase-tools@15.31.0 @firebase/rules-unit-testing@5.0.2 firebase@12.19.0
//   npx firebase emulators:exec --only firestore --project demo-lions \
//       "node rules-test.mjs ../../firebase/firestore.rules ../../public_html/treasurer/index.html"
//
// Needs Java 21 for the emulator. CI runs exactly this ahead of every deploy.
// The emulator warns at startup that it defaults to allowing every read and
// write. That is about its own default; this script loads the rules itself,
// and the deny cases below are what prove they are enforced.
//
// M-30 is why this exists. Four gates and 115 assertions were green while the
// treasurer could not save, because every one of them tested arithmetic and
// every manual test ran as an administrator, and isTreasurer() is true for an
// administrator. This signs in as the treasurer's address and nobody else.
//
// The keys written are READ OUT OF THE SHIPPED PAGE, not restated here, so a
// key added to the page without the rule fails this test before it fails her.
//
// The last section is the other half of the same record: the payouts form's
// save, run as the administrator through a real transaction. The payouts page
// is found beside the treasurer page given on the command line.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, deleteField } from 'firebase/firestore';

const [rulesPath, pagePath] = process.argv.slice(2);
const rules = readFileSync(rulesPath, 'utf8');
const page = readFileSync(pagePath, 'utf8');

let failures = 0;
let assertions = 0;
async function expect(label, promise, want) {
    assertions++;
    try {
        await (want === 'allow' ? assertSucceeds(promise) : assertFails(promise));
    } catch (err) {
        failures++;
        console.log('  FAIL ' + label + '  (expected ' + want + ')');
    }
}
function check(label, condition, detail) {
    assertions++;
    if (!condition) { failures++; console.log('  FAIL ' + label + (detail ? '  ' + detail : '')); }
}

// --- the keys the treasurer's own code writes -------------------------------
function body(name, text = page) {
    const at = text.indexOf(name);
    if (at === -1 || text.indexOf(name, at + 1) !== -1) throw new Error(name + ' not found exactly once');
    const indent = text.slice(text.lastIndexOf('\n', at) + 1, at).match(/^\s*/)[0];
    const end = text.indexOf('\n' + indent + '}', at);
    return text.slice(at, end);
}
// A key in an object literal, or a key assigned onto the fields object.
const KEY = /\b(check[A-Z]\w*|isLocked|lockedBy|lockedDate|lockReason)\s*(?::|=(?!=))/g;
const keysIn = (text) => new Set(Array.from(text.matchAll(KEY), m => m[1]));
const recordKeys = keysIn(body('window.recordCheck = async function('));
const lockKeys = keysIn(body('async function confirmLockShift('));
const whitelist = new Set(Array.from(
    rules.match(/match \/Work-Shifts\/\{document\}[\s\S]*?allow update: if isTreasurer\(\)[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/)[1]
        .matchAll(/'([^']+)'/g), m => m[1]));

console.log('record a check writes : ' + Array.from(recordKeys).sort().join(', '));
console.log('process and lock writes: ' + Array.from(lockKeys).sort().join(', '));
console.log('rules whitelist        : ' + Array.from(whitelist).sort().join(', '));

const everything = new Set([...recordKeys, ...lockKeys]);
check('every key the treasurer writes is whitelisted',
    [...everything].every(k => whitelist.has(k)), [...everything].filter(k => !whitelist.has(k)).join(', '));
check('nothing is whitelisted that the treasurer never writes',
    [...whitelist].every(k => everything.has(k)), [...whitelist].filter(k => !everything.has(k)).join(', '));
check('record a check writes ten keys', recordKeys.size === 10, String(recordKeys.size));
check('process and lock writes exactly four keys', lockKeys.size === 4, String(lockKeys.size));

// --- the emulator -----------------------------------------------------------
const env = await initializeTestEnvironment({ projectId: 'demo-lions', firestore: { rules } });

const SHIFT = {
    eventName: 'DCI - Day 1', eventDate: '2026-08-06', primaryStand: '132PB',
    primarySodexoPayout: 1574.62, secondarySodexoPayout: 779.79,
    workers: [{ name: 'A Worker', startTime: '10:00', endTime: '20:30' }],
    isLocked: false
};
async function seed() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'Work-Shifts', 'dci1'), SHIFT);
        await setDoc(doc(ctx.firestore(), 'Work-Shifts', 'dci2'), Object.assign({}, SHIFT, { eventName: 'DCI - Day 2' }));
    });
}

const crystal = env.authenticatedContext('crystal', { email: 'treasurer@lionssports.club' }).firestore();
const jason = env.authenticatedContext('jason', { email: 'fundraising@lionssports.club' }).firestore();
const volunteer = env.authenticatedContext('vol', { email: 'volunteer@example.com' }).firestore();
const now = '2026-09-27T12:00:00.000Z';

// Exactly what recordCheck sends for the replayed 4109045 stub.
const CHECK = { checkNumber: '4109045', checkDate: '2026-08-28', checkTotal: 3571.46, checkPaid: 2354.41, checkNote: '',
                checkReceivedAt: now, checkReceivedBy: 'treasurer@lionssports.club' };
const LINES = { checkAdjustments: [
                    { check: '4109045', date: '2026-08-28', amount: -450, note: 'BR-1', own: false }],
                checkAdjustedAt: now, checkAdjustedBy: 'treasurer@lionssports.club' };
const LOCK = { isLocked: true, lockedBy: 'treasurer@lionssports.club', lockedDate: now,
               lockReason: 'Processed and locked by the treasurer' };

await seed();
await expect('treasurer can read a shift', getDoc(doc(crystal, 'Work-Shifts', 'dci1')), 'allow');
await expect('treasurer can Process & Lock', updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), LOCK), 'allow');
await expect('treasurer can record a check on a locked shift',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), CHECK), 'allow');
await expect('treasurer can add an extra line',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), LINES), 'allow');
await expect('treasurer can correct a recorded amount',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { checkPaid: 2354.4, checkNote: 'typo fixed' }), 'allow');
await expect('treasurer can correct the amount of the check',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { checkTotal: 3571.4 }), 'allow');
{
    // One check, two events, one batch, the way the dialog commits it.
    await seed();
    const batch = writeBatch(crystal);
    batch.update(doc(crystal, 'Work-Shifts', 'dci1'), Object.assign({}, CHECK, LINES));
    batch.update(doc(crystal, 'Work-Shifts', 'dci2'), Object.assign({}, CHECK, { checkPaid: 2634.18 }));
    await expect('treasurer can record one check across two events in one batch', batch.commit(), 'allow');
}

await seed();
await expect('treasurer cannot write paymentStatus (M-30)',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { paymentStatus: 'processed' }), 'deny');
await expect('treasurer cannot sneak paymentStatus in with the lock',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), Object.assign({ paymentStatus: 'processed' }, LOCK)), 'deny');
await expect('treasurer cannot change a Sodexo amount',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { primarySodexoPayout: 1 }), 'deny');
await expect('treasurer cannot change a worker row',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { workers: [] }), 'deny');
await expect('treasurer cannot slip a Sodexo amount in with a check',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), Object.assign({ secondarySodexoPayout: 0 }, CHECK)), 'deny');
await expect('treasurer cannot write the retired pooled checkAmount',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { checkAmount: 3571.46 }), 'deny');
await expect('treasurer cannot write the retired gapSettlements',
    updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { gapSettlements: [] }), 'deny');
await expect('treasurer cannot create a shift',
    setDoc(doc(crystal, 'Work-Shifts', 'new'), SHIFT), 'deny');
await expect('treasurer cannot delete a shift',
    deleteDoc(doc(crystal, 'Work-Shifts', 'dci1')), 'deny');

await expect('a volunteer cannot read a shift', getDoc(doc(volunteer, 'Work-Shifts', 'dci1')), 'deny');
await expect('a volunteer cannot record a check',
    updateDoc(doc(volunteer, 'Work-Shifts', 'dci1'), CHECK), 'deny');

await expect('an administrator can take a check off',
    updateDoc(doc(jason, 'Work-Shifts', 'dci1'), { anything: true }), 'allow');

// --- the shift form's save, as the administrator ----------------------------
// Until 2026-10-05 the payouts form replaced the whole record, which erased the
// check the treasurer had recorded on it. shiftWritePlan is cut out of the
// shipped payouts page and run through a real transaction here, the same five
// calls saveShiftOnce makes, so what is proved is what Firestore does with the
// plan: an update leaves her fields alone, a removed field is gone and not
// null, and a new settlement replaces the old one whole.
{
    const payouts = readFileSync(join(dirname(dirname(pagePath)), 'payouts', 'index.html'), 'utf8');
    const shiftWritePlan = new Function(
        body('function shiftWritePlan(', payouts) + '\n}\nreturn shiftWritePlan;')();

    const same = (a, b) => {
        const flat = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
            ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x);
        return flat(a) === flat(b);
    };
    const HERS = Object.assign({}, CHECK, LINES);
    const stored = (more) => Object.assign({}, SHIFT, HERS, {
        status: 'finalized', primaryCrNumber: 4411, secondaryStand: '133PB', secondaryCrNumber: 4412,
        createdAt: '2026-08-07T14:00:00.000Z', createdBy: 'fundraising@lionssports.club',
        finalizedAt: '2026-08-20T15:00:00.000Z', finalizedBy: 'fundraising@lionssports.club',
        finalizedCalc: { formulaVersion: 'old', availableForWorkers: 2000, leftOver: 'from the old settlement' },
        lockedBy: 'treasurer@lionssports.club', lockedDate: now, isLocked: false,
        reopenedAt: now, reopenedBy: 'fundraising@lionssports.club',
        sodexoPayout: 900
    }, more || {});
    const form = (more) => Object.assign({
        eventDate: '2026-08-06', eventName: 'DCI - Day 1', primaryStand: '132PB', primaryCrNumber: 4411,
        primarySodexoPayout: 1574.62, secondaryStand: '133PB', secondaryCrNumber: null,
        secondarySodexoPayout: 779.79, workers: [{ name: 'A Worker', stand: '132PB', startTime: '10:00', endTime: '19:30' }],
        notes: 'Hours corrected', status: 'draft', separateStandsMode: false, lowRateRuleApplied: false,
        updatedAt: now, updatedBy: 'fundraising@lionssports.club'
    }, more || {});
    const put = (id, data) => env.withSecurityRulesDisabled(
        (ctx) => setDoc(doc(ctx.firestore(), 'Work-Shifts', id), data));
    const read = async (id) => {
        let data;
        await env.withSecurityRulesDisabled(async (ctx) => {
            const snap = await getDoc(doc(ctx.firestore(), 'Work-Shifts', id));
            data = snap.exists() ? snap.data() : null;
        });
        return data;
    };
    const save = (id, data, isEdit, andFinalize) => {
        const ref = doc(jason, 'Work-Shifts', id);
        return runTransaction(jason, async (tx) => {
            const snap = await tx.get(ref);
            const plan = shiftWritePlan(snap.exists() ? snap.data() : null, data, isEdit, andFinalize, deleteField());
            if (plan.refuse) return plan.refuse;
            if (plan.op === 'set') tx.set(ref, plan.fields);
            else tx.update(ref, plan.fields);
            return '';
        });
    };
    const hers = (record) => Object.keys(HERS).reduce((o, k) => { o[k] = record[k]; return o; }, {});

    // Reopened after its check was recorded, then edited and saved as a draft.
    await env.clearFirestore();
    await put('dci1', stored());
    let refused = await save('dci1', form(), true, false);
    let after = await read('dci1');
    check('the administrator\'s save of a reopened event is written', refused === '' && after.notes === 'Hours corrected'
        && after.status === 'draft' && after.workers[0].endTime === '19:30', String(refused));
    check('SAVED AS A DRAFT, THE CHECK THE TREASURER RECORDED IS UNTOUCHED', same(hers(after), HERS),
        JSON.stringify(hers(after)));
    check('who created the event, and the record of its lock and reopen, are untouched',
        after.createdAt === '2026-08-07T14:00:00.000Z' && after.createdBy === 'fundraising@lionssports.club'
        && after.lockedBy === 'treasurer@lionssports.club' && after.reopenedBy === 'fundraising@lionssports.club'
        && after.isLocked === false);
    check('the settlement is removed from a draft, not left as null',
        !('finalizedCalc' in after) && !('finalizedAt' in after) && !('finalizedBy' in after));
    check('the superseded field name is removed', !('sodexoPayout' in after));

    // Finalized again.
    const fresh = { formulaVersion: 'new', availableForWorkers: 2118.97 };
    refused = await save('dci1', form({ status: 'finalized', finalizedAt: now,
        finalizedBy: 'fundraising@lionssports.club', finalizedCalc: fresh }), true, true);
    after = await read('dci1');
    check('FINALIZED AGAIN, THE CHECK THE TREASURER RECORDED IS UNTOUCHED',
        refused === '' && after.status === 'finalized' && same(hers(after), HERS), JSON.stringify(hers(after)));
    await put('dci2', stored());
    await save('dci2', form({ status: 'finalized', finalizedAt: now,
        finalizedBy: 'fundraising@lionssports.club', finalizedCalc: fresh }), true, true);
    after = await read('dci2');
    check('a new settlement replaces the old one whole, nothing of the old one is left inside it',
        same(after.finalizedCalc, fresh), JSON.stringify(after.finalizedCalc));

    // The treasurer can go on working on the record the administrator saved.
    await expect('the treasurer can still correct her check after the administrator\'s save',
        updateDoc(doc(crystal, 'Work-Shifts', 'dci1'), { checkNote: 'still hers' }), 'allow');

    // Locked while the form was open.
    await put('dci1', stored({ isLocked: true }));
    const before = await read('dci1');
    refused = await save('dci1', form({ primarySodexoPayout: 1 }), true, false);
    check('an event the treasurer locked meanwhile is refused and left exactly as it was',
        String(refused).indexOf('The treasurer processed and locked this event') === 0
        && same(await read('dci1'), before), String(refused));

    // Deleted while the form was open.
    refused = await save('gone', form(), true, false);
    check('an event deleted meanwhile is refused and not brought back',
        String(refused).indexOf('This event no longer exists.') === 0 && (await read('gone')) === null, String(refused));

    // A new event.
    refused = await save('new1', form({ createdAt: now, createdBy: 'fundraising@lionssports.club' }), false, false);
    after = await read('new1');
    check('a new event is created whole', refused === '' && after !== null && after.createdAt === now
        && after.eventName === 'DCI - Day 1' && !('isLocked' in after), String(refused));
}

await env.cleanup();
console.log('');
console.log(failures === 0
    ? 'OK   ' + assertions + ' assertions, signed in as the treasurer, and the shift form\'s save as the administrator'
    : failures + ' of ' + assertions + ' assertions failed');
process.exit(failures === 0 ? 0 : 1);
