// Inputs for the payout golden-file suite.
//
// These are constructed inputs, not club records. Nothing here is real roster
// data. Names are placeholders chosen so that lookupWorker's substring matching
// cannot cross-match one worker onto another.
//
// parseTime rounds to the nearest quarter hour, so every time below is on a
// quarter hour and the stated duration is exact.

const NO_SHIRT = (name) => ({ name, email: name.toLowerCase().replace(' ', '.') + '@example.invalid', hasLOSShirt: false });
const HAS_SHIRT = (name) => ({ name, email: name.toLowerCase().replace(' ', '.') + '@example.invalid', hasLOSShirt: true });

const FIVE = ['Ada Vance', 'Ben Ortiz', 'Cara Liu', 'Dev Patel', 'Eve Nakamura'];
const THREE = ['Ada Vance', 'Ben Ortiz', 'Cara Liu'];

const shift = (names, startTime, endTime, stand = 'Main') =>
    names.map((name) => ({ name, startTime, endTime, stand }));

export const CASES = [
    {
        id: 'adr005-worked-example',
        why: 'ADR-005 delta section, the low rate branch charging the LOS shirt twice. ' +
             'S = $400.00, five workers at four hours, none holding a shirt.',
        sodexoAmount: 400,
        workers: shift(FIVE, '17:00', '21:00'),
        roster: FIVE.map(NO_SHIRT)
    },
    {
        id: 'adr005-m6-recorded',
        why: 'ADR-005 finding M-6 exactly as recorded: S = $600.00, three workers, ' +
             '9.75 hours each. All hold shirts so truncation is isolated from the shirt fee.',
        sodexoAmount: 600,
        workers: shift(THREE, '10:00', '19:45'),
        roster: THREE.map(HAS_SHIRT)
    },
    {
        id: 'm6-cent-lost-to-float-noise',
        why: 'M-6 reproduced against the shipped gating. Three workers at 9.75 hours, ' +
             'S = $570.00, all holding shirts. The pool is $570.00 and the exact gross ' +
             'is $190.00, but 570 / 29.25 * 9.75 evaluates to 189.99999999999997 in ' +
             'binary floating point, so Math.floor drops a full cent. ADR-005 records ' +
             'this at S = $600.00, which does not reproduce: that input takes the low ' +
             'rate branch, where the pool is the full payment and the gross is exact.',
        sodexoAmount: 570,
        workers: shift(THREE, '10:00', '19:45'),
        roster: THREE.map(HAS_SHIRT)
    },
    {
        id: 'standard-branch-mixed-shirts',
        why: 'The branch ADR-005 calls correct. Rate well above threshold, two of five ' +
             'workers holding shirts.',
        sodexoAmount: 1200,
        workers: shift(FIVE, '17:00', '21:00'),
        roster: [HAS_SHIRT(FIVE[0]), HAS_SHIRT(FIVE[1]), NO_SHIRT(FIVE[2]), NO_SHIRT(FIVE[3]), NO_SHIRT(FIVE[4])]
    },
    {
        id: 'standard-branch-shirt-deficit',
        why: 'Standard branch where the shirt aggregate exceeds the Lions 2 percent, ' +
             'driving the coordinatorAdjustment path.',
        sodexoAmount: 1000,
        workers: shift(FIVE, '17:00', '21:00'),
        roster: FIVE.map(NO_SHIRT)
    },
    {
        id: 'threshold-at-twenty',
        why: 'standardRate exactly $20.00, which takes the standard branch. ' +
             'H = 19.0, S = $400.00, so (S * 0.95) / H is 20.0000 exactly.',
        sodexoAmount: 400,
        workers: [
            { name: FIVE[0], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[1], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[2], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[3], startTime: '17:00', endTime: '21:00', stand: 'Main' }
        ],
        roster: FIVE.map(HAS_SHIRT)
    },
    {
        id: 'threshold-just-below-twenty',
        why: 'The same shape one quarter hour longer, so standardRate falls under ' +
             '$20.00 and the low rate branch takes over. This is the M-3 band ADR-005 ' +
             'reclassified as intended behavior.',
        sodexoAmount: 400,
        workers: [
            { name: FIVE[0], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[1], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[2], startTime: '17:00', endTime: '22:00', stand: 'Main' },
            { name: FIVE[3], startTime: '17:00', endTime: '21:15', stand: 'Main' }
        ],
        roster: FIVE.map(HAS_SHIRT)
    },
    {
        id: 'finalized-snapshot-overrides-roster',
        why: 'finalizedShirtDeduction is the frozen record. The roster says these two ' +
             'workers now hold shirts; the snapshot says they did not at finalization. ' +
             'The snapshot must win. This is the path M-10 says treasurer ignores.',
        sodexoAmount: 1200,
        workers: [
            { name: FIVE[0], startTime: '17:00', endTime: '21:00', stand: 'Main', finalizedShirtDeduction: 5 },
            { name: FIVE[1], startTime: '17:00', endTime: '21:00', stand: 'Main', finalizedShirtDeduction: 5 },
            { name: FIVE[2], startTime: '17:00', endTime: '21:00', stand: 'Main', finalizedShirtDeduction: 0 },
            { name: FIVE[3], startTime: '17:00', endTime: '21:00', stand: 'Main', finalizedShirtDeduction: 0 },
            { name: FIVE[4], startTime: '17:00', endTime: '21:00', stand: 'Main', finalizedShirtDeduction: 0 }
        ],
        roster: FIVE.map(HAS_SHIRT)
    },
    {
        id: 'single-worker',
        why: 'One worker carries the whole shift. No pooling to hide an error behind.',
        sodexoAmount: 150,
        workers: shift([FIVE[0]], '18:00', '22:30'),
        roster: [NO_SHIRT(FIVE[0])]
    },
    {
        id: 'guard-no-payment',
        why: 'Guard clause. A shift with hours and no Sodexo payment is now savable, ' +
             'so this input reaches the formula in normal use.',
        sodexoAmount: 0,
        workers: shift(THREE, '17:00', '21:00'),
        roster: THREE.map(NO_SHIRT)
    },
    {
        id: 'guard-no-workers',
        why: 'Guard clause. Payment recorded, nobody assigned.',
        sodexoAmount: 400,
        workers: [],
        roster: []
    },
    {
        id: 'guard-zero-hours',
        why: 'Guard clause. Workers assigned, every start equal to its end.',
        sodexoAmount: 400,
        workers: shift(THREE, '17:00', '17:00'),
        roster: THREE.map(NO_SHIRT)
    },
    {
        id: 'stands-mixed-and-missing-paid',
        why: 'The stand travels from the worker into every payout row. Every other ' +
             'case puts all its workers on Main, so nothing exercised the stand until ' +
             'this. Two named stands and one worker with none, paid, so the standard ' +
             'branch carries them.',
        sodexoAmount: 1200,
        workers: [
            { name: FIVE[0], startTime: '17:00', endTime: '21:00', stand: 'Main' },
            { name: FIVE[1], startTime: '17:00', endTime: '21:00', stand: 'North 118' },
            { name: FIVE[2], startTime: '17:00', endTime: '21:00' }
        ],
        roster: THREE.map(NO_SHIRT)
    },
    {
        id: 'stands-mixed-and-missing-awaiting-payment',
        why: 'The same three workers before Sodexo pays, where the awaiting-payment ' +
             'branch builds its own rows and has to carry the stand and the N/A ' +
             'fallback itself.',
        sodexoAmount: 0,
        workers: [
            { name: FIVE[0], startTime: '17:00', endTime: '21:00', stand: 'Main' },
            { name: FIVE[1], startTime: '17:00', endTime: '21:00', stand: 'North 118' },
            { name: FIVE[2], startTime: '17:00', endTime: '21:00' }
        ],
        roster: THREE.map(NO_SHIRT)
    }
];

// What the authority requires for a case, as opposed to what the code currently
// does. A golden pins behavior; this states the specification. The two disagree
// today, and that disagreement is the point of the suite.
//
// Reference: ADR-005 "Confirmed defect: the low-rate branch reduces the worker
// pool", worked example table.
//
// CORRECTION, Jason 2026-09-02. An LOS shirt costs the club $10.00 and the club
// splits that cost with the volunteer, charged at the event where the new or
// replacement shirt is issued. The worker's half is the $5.00 gross deduction;
// the club's half is what the code calls lionsShirtCosts. ADR-005's notation
// treats k(i) as the whole cost of the shirt and its lionsTotal line therefore
// ADDS the recovery:
//
//     lionsTotal = lions + remainder + sum(k(i))
//
// That is only correct if a shirt costs $5.00 and is recovered in full. With a
// $10.00 shirt split evenly, the club's purchase of 2 * sum(k(i)) has to appear,
// and the line reduces to
//
//     lionsTotal = lions + remainder + sum(k(i)) - 2 * sum(k(i))
//                = lions + remainder - sum(k(i))
//
// which is what the implementation computes. The Lions total expected below is
// therefore -$25.00, not the +$25.00 ADR-005 prints. ADR-005 needs amending on
// this point; the implementation does not.
export const ADR005_EXPECTATIONS = [
    {
        caseId: 'adr005-worked-example',
        finding: 'M-2, low rate branch charges the LOS shirt twice',
        assertions: [
            { path: 'availableForWorkers', label: 'pool', expected: 400.0 },
            { path: 'hourlyRate', label: 'rate', expected: 20.0 },
            { path: 'workerPayouts.0.grossAmount', label: 'gross per worker', expected: 80.0 },
            { path: 'workerPayouts.0.shirtDeduction', label: 'shirt fee', expected: 5.0 },
            { path: 'workerPayouts.0.netAmount', label: 'net per worker', expected: 75.0 },
            { path: 'sum:workerPayouts.netAmount', label: 'workers, total', expected: 375.0 },
            { path: 'lionsFinalTotal', label: 'Lions total', expected: -25.0 }
        ]
    }
];
