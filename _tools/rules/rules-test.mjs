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

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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
function body(name) {
    const at = page.indexOf(name);
    if (at === -1 || page.indexOf(name, at + 1) !== -1) throw new Error(name + ' not found exactly once');
    const indent = page.slice(page.lastIndexOf('\n', at) + 1, at).match(/^\s*/)[0];
    const end = page.indexOf('\n' + indent + '}', at);
    return page.slice(at, end);
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

await env.cleanup();
console.log('');
console.log(failures === 0
    ? 'OK   ' + assertions + ' assertions, signed in as the treasurer'
    : failures + ' of ' + assertions + ' assertions failed');
process.exit(failures === 0 ? 0 : 1);
