//node database-application/shard/perf-test-client-shard.js

const http = require('http');

const APP_PORT = 8904;
const NUM_QUERIES = 10;

function createURL(pathname) {
    return `http://localhost:${APP_PORT}${pathname}`;
}

function chooseNumberFromRange(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

function makeAPIRequest(pathname, callback) {
    http.get(createURL(pathname), (dbResponse) => {
        dbResponse.setEncoding('utf8');

        let rawUTF8 = '';

        dbResponse.on('data', (chunk) => {
            rawUTF8 += chunk;
        });

        dbResponse.on('end', () => {
            const { result } = JSON.parse(rawUTF8);
            callback(result);
        });
    });
}

function getDatabaseOrderedListRange(callback) {
    makeAPIRequest('/range', callback);
}

// New function for getting shard metadata
function getShardsMeta(callback) {
    makeAPIRequest('/range', (range) => {
        const { start, end } = range;
        console.log("Retrieved range:", start, end); // Added logging here
        callback(start, end);
    });
}

function makeQueriesRecursively(results, start, end, count, callback) {
    if (count) {
        const position = chooseNumberFromRange(start, end);
        const timeStart = Date.now();

        console.log("Generated position:", position);  // Log the generated position

        makeAPIRequest(`/media-segment?position=${position}`, (res) => {
            console.log('got segment for media timeline position', position, Boolean(res));

            const sampleTime = Date.now() - timeStart;

            results.samples.push(sampleTime);

            makeQueriesRecursively(results, start, end, count - 1, callback);
        });
    } else {
        callback(results);
    }
}

// Retrieve shard metadata before running the test
getShardsMeta((start, end) => {
    if (isNaN(start) || isNaN(end)) {
        console.error("Invalid range: start or end is NaN.");
        return;
    }

    const results = { samples: [] };

    makeQueriesRecursively(results, start, end, NUM_QUERIES, (results) => {
        const samples = results.samples.sort((a, b) => {
            return a - b;
        });
        const min = samples[0];
        const max = samples[samples.length - 1];

        const sum = samples.reduce((sum, sample) => {
            return sum + sample;
        }, 0);

        const data = {
            totalTime: results.totalTime,
            min,
            max,
            average: Math.round(sum / samples.length)
        };

        console.log(JSON.stringify(data, null, 4));
    });
});
