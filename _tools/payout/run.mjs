// Golden-file suite for the payout formula.
//
//   node _tools/payout/run.mjs report    print every case, change nothing
//   node _tools/payout/run.mjs pin       write golden/<page>.json from current behavior
//   node _tools/payout/run.mjs check     compare current behavior to the goldens, exit 1 on drift
//   node _tools/payout/run.mjs pages     compare the payouts copy to the treasurer copy
//   node _tools/payout/run.mjs adr       check current behavior against ADR-005, exit 1 on divergence
//
// "check" is the regression gate: it says the formula still does what it did.
// "adr" is the specification gate: it says the formula does what ADR-005 says.
// They are separate on purpose. Today check passes and adr fails, and that is
// the honest description of the code.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadFormula } from './extract.mjs';
import { CASES, ADR005_EXPECTATIONS } from './cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const GOLDEN_DIR = join(HERE, 'golden');

const PAGES = [
    { page: 'payouts', file: join(REPO, 'public_html', 'payouts', 'index.html') },
    { page: 'treasurer', file: join(REPO, 'public_html', 'treasurer', 'index.html') }
];

// Floating point noise must not read as a behavior change. Numbers are rounded
// to four decimals before they are recorded, which is finer than a cent and
// coarser than the last bit of a double.
function normalize(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return String(value);
        return Math.round(value * 1e4) / 1e4;
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
        return out;
    }
    return value;
}

function readPath(result, path) {
    if (path.startsWith('sum:')) {
        const [collection, field] = path.slice(4).split('.');
        return (result[collection] || []).reduce((total, row) => total + row[field], 0);
    }
    return path.split('.').reduce((node, key) => (node == null ? node : node[key]), result);
}

async function runPage({ page, file }) {
    if (!existsSync(file)) throw new Error('missing page: ' + file);
    const formula = await loadFormula(file);
    const results = {};
    for (const testCase of CASES) {
        results[testCase.id] = normalize(
            formula.calculate(testCase.sodexoAmount, testCase.workers, testCase.roster)
        );
    }
    return { page, file, threshold: formula.threshold, results };
}

function serialize(payload) {
    return JSON.stringify(payload, null, 2) + '\n';
}

function diffKeys(expected, actual, prefix, out) {
    const keys = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})]);
    for (const key of keys) {
        const path = prefix ? prefix + '.' + key : key;
        const a = expected ? expected[key] : undefined;
        const b = actual ? actual[key] : undefined;
        const objA = a && typeof a === 'object';
        const objB = b && typeof b === 'object';
        if (objA && objB) diffKeys(a, b, path, out);
        else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, expected: a, actual: b });
    }
    return out;
}

const money = (n) => (typeof n === 'number' ? '$' + n.toFixed(2) : String(n));

// ADR-005 requires one implementation consumed by both interfaces. Until that
// exists, the two copies agreeing is the only standing evidence they have not
// drifted, and finding M-10 says they already have.
function reportPages(runs, label) {
    const [a, b] = runs;
    const diffs = diffKeys(a.results, b.results, '', []);
    if (diffs.length === 0) {
        console.log('OK   payouts and treasurer agree on all ' + CASES.length + ' cases');
        return 0;
    }
    console.log(label + ' payouts vs treasurer: ' + diffs.length + ' differences');
    for (const d of diffs.slice(0, 40)) {
        console.log('   ' + d.path + '\n      payouts   ' + JSON.stringify(d.expected) +
            '\n      treasurer ' + JSON.stringify(d.actual));
    }
    if (diffs.length > 40) console.log('   ... ' + (diffs.length - 40) + ' more');
    return diffs.length;
}

async function main() {
    const mode = process.argv[2] || 'report';
    if (!['report', 'pin', 'check', 'pages', 'adr'].includes(mode)) {
        console.error('usage: run.mjs report|pin|check|pages|adr');
        process.exit(2);
    }

    const runs = [];
    for (const target of PAGES) runs.push(await runPage(target));

    if (mode === 'pin') {
        await mkdir(GOLDEN_DIR, { recursive: true });
        for (const run of runs) {
            const path = join(GOLDEN_DIR, run.page + '.json');
            await writeFile(path, serialize({ threshold: run.threshold, results: run.results }), 'utf8');
            console.log('pinned ' + run.page + ' -> golden/' + run.page + '.json (' +
                Object.keys(run.results).length + ' cases)');
        }
        return;
    }

    if (mode === 'report') {
        for (const run of runs) {
            console.log('\n=== ' + run.page + ' ===');
            console.log(run.threshold);
            for (const testCase of CASES) {
                const r = run.results[testCase.id];
                const netTotal = (r.workerPayouts || []).reduce((t, w) => t + w.netAmount, 0);
                console.log(
                    '  ' + testCase.id.padEnd(34) +
                    ' branch=' + (r.lowRateRuleApplied ? 'low ' : 'std ') +
                    ' hours=' + r.totalHours.toFixed(2).padStart(6) +
                    ' pool=' + money(r.availableForWorkers).padStart(9) +
                    ' rate=' + money(r.hourlyRate).padStart(8) +
                    ' netTotal=' + money(Math.round(netTotal * 1e4) / 1e4).padStart(9) +
                    ' lions=' + money(r.lionsFinalTotal).padStart(8)
                );
            }
        }
        return;
    }

    if (mode === 'check') {
        let drift = 0;
        for (const run of runs) {
            const path = join(GOLDEN_DIR, run.page + '.json');
            if (!existsSync(path)) {
                console.error('no golden for ' + run.page + '. Run: node run.mjs pin');
                process.exit(2);
            }
            const golden = JSON.parse(await readFile(path, 'utf8'));
            const diffs = [];
            if (golden.threshold !== run.threshold) {
                diffs.push({ path: 'threshold', expected: golden.threshold, actual: run.threshold });
            }
            diffKeys(golden.results, run.results, '', diffs);
            if (diffs.length === 0) {
                console.log('OK   ' + run.page + ': ' + Object.keys(run.results).length + ' cases match the golden');
            } else {
                drift += diffs.length;
                console.log('DRIFT ' + run.page + ': ' + diffs.length + ' differences');
                for (const d of diffs.slice(0, 40)) {
                    console.log('   ' + d.path + '\n      golden ' + JSON.stringify(d.expected) +
                        '\n      now    ' + JSON.stringify(d.actual));
                }
                if (diffs.length > 40) console.log('   ... ' + (diffs.length - 40) + ' more');
            }
        }
        // Reported here but deliberately not blocking. A divergence between the
        // two copies is finding M-10, which is open and known, not a regression
        // introduced by the change under test. Run 'pages' to gate on it.
        reportPages(runs, 'NOTICE');
        process.exit(drift === 0 ? 0 : 1);
    }

    if (mode === 'pages') {
        process.exit(reportPages(runs, 'DIVERGED') === 0 ? 0 : 1);
    }

    // adr
    let failures = 0;
    for (const run of runs) {
        console.log('\n=== ' + run.page + ' against ADR-005 ===');
        for (const spec of ADR005_EXPECTATIONS) {
            const result = run.results[spec.caseId];
            console.log('  case ' + spec.caseId + '  (' + spec.finding + ')');
            for (const a of spec.assertions) {
                const actual = Math.round(readPath(result, a.path) * 1e4) / 1e4;
                const ok = actual === a.expected;
                if (!ok) failures++;
                console.log('    ' + (ok ? 'pass' : 'FAIL') + '  ' + a.label.padEnd(18) +
                    ' ADR ' + money(a.expected).padStart(9) +
                    '   code ' + money(actual).padStart(9) +
                    (ok ? '' : '   short by ' + money(Math.round((a.expected - actual) * 1e4) / 1e4)));
            }
        }
    }
    console.log('\n' + failures + ' assertion(s) diverge from ADR-005.');
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(2);
});
