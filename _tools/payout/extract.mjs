// Pulls the payout formula out of a live page and makes it callable from node.
//
// The point of extracting rather than copying is that the suite always tests
// the code that ships. A copy would pass forever while the page drifted.
//
// Every lookup here refuses unless it matches exactly once, and every extracted
// body is compiled before it is used. Nothing downstream sees a partial match.

import { readFile } from 'node:fs/promises';

// Declarations the formula needs, in the order they must appear in the built
// module. Order matters only for the const; function declarations hoist.
const NEEDED = [
    'parseTime',
    'calculateHours',
    'lookupWorker',
    'formatCurrency',
    'formatHours',
    'calculateCombinedPayouts'
];

const THRESHOLD_PATTERN = /^[ \t]*const LOW_RATE_THRESHOLD = [0-9.]+;[ \t]*(\/\/.*)?$/gm;

function refuse(what, count, file) {
    throw new Error(
        'extract refused: ' + what + ' matched ' + count + ' times in ' + file +
        ', expected exactly 1. Nothing was built.'
    );
}

// Locates "function NAME(" and returns the text through the closing brace that
// sits at the same indentation as the "function" keyword. The page indents
// consistently, so this is reliable, and compileOrRefuse proves it per call.
function sliceFunction(source, name, file) {
    const needle = 'function ' + name + '(';
    const hits = [];
    let at = source.indexOf(needle);
    while (at !== -1) {
        hits.push(at);
        at = source.indexOf(needle, at + 1);
    }
    if (hits.length !== 1) refuse('function ' + name, hits.length, file);

    const start = hits[0];
    const lineStart = source.lastIndexOf('\n', start) + 1;
    const indent = source.slice(lineStart, start);
    if (/\S/.test(indent)) {
        throw new Error('extract refused: function ' + name + ' in ' + file +
            ' is not at the start of its line. Nothing was built.');
    }

    // A one line function closes on its own line.
    const firstLineEnd = source.indexOf('\n', start);
    const firstLine = source.slice(start, firstLineEnd === -1 ? source.length : firstLineEnd);
    if (firstLine.trimEnd().endsWith('}')) {
        return compileOrRefuse(firstLine.trimEnd(), name, file);
    }

    const closer = '\n' + indent + '}';
    const end = source.indexOf(closer, start);
    if (end === -1) {
        throw new Error('extract refused: no closing brace at the indentation of ' +
            name + ' in ' + file + '. Nothing was built.');
    }
    return compileOrRefuse(source.slice(start, end + closer.length), name, file);
}

// A body that does not compile is a bad slice, not a bad page. Refuse loudly
// rather than handing a truncated function to the harness.
function compileOrRefuse(text, name, file) {
    try {
        new Function('"use strict";' + text + ';return ' + name + ';');
    } catch (err) {
        throw new Error('extract refused: ' + name + ' from ' + file +
            ' did not compile (' + err.message + '). Nothing was built.');
    }
    return text;
}

function sliceThreshold(source, file) {
    const hits = source.match(THRESHOLD_PATTERN);
    if (!hits || hits.length !== 1) refuse('LOW_RATE_THRESHOLD', hits ? hits.length : 0, file);
    return hits[0].trim();
}

// Returns { calculate, threshold, sources } for one page.
// `calculate(sodexoAmount, workers, roster)` runs the page's own formula with
// `roster` standing in for the page's dashboardUsers global.
export async function loadFormula(file) {
    const source = await readFile(file, 'utf8');
    const parts = {};
    for (const name of NEEDED) parts[name] = sliceFunction(source, name, file);
    const threshold = sliceThreshold(source, file);

    const built =
        '"use strict";\n' +
        threshold + '\n' +
        NEEDED.map((n) => parts[n]).join('\n\n') + '\n\n' +
        'return calculateCombinedPayouts;\n';

    let factory;
    try {
        factory = new Function('dashboardUsers', built);
    } catch (err) {
        throw new Error('extract refused: the assembled module from ' + file +
            ' did not compile (' + err.message + '). Nothing was built.');
    }

    return {
        file,
        threshold,
        sources: parts,
        calculate(sodexoAmount, workers, roster = []) {
            return factory(roster)(sodexoAmount, workers);
        }
    };
}

export { NEEDED };
