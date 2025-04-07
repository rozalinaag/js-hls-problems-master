const http = require('http');

const DB_PORT = 8901;
const PORT = 8902;

// When we discover the length of the ordered list from the DB, we stash it here.
let knownListLength;

function sendJSONResponse(res, status, response) {
    const message = JSON.stringify(response);

    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(message),
    });

    res.end(message);
}

function makeDatabaseRequest(pathname, callback) {
    http.get(`http://localhost:${DB_PORT}${pathname}`, (dbResponse) => {
        dbResponse.setEncoding('utf8');

        let rawUTF8 = '';

        dbResponse.on('data', (chunk) => {
            rawUTF8 += chunk;
        });

        dbResponse.on('end', () => {
            callback(JSON.parse(rawUTF8));
        });
    });
}

// function findSegment(res, knownLength, position) {
//
//     function tryNext(index) {
//         makeDatabaseRequest(`/query?index=${index}`, (data) => {
//             const { result } = data;
//
//             if (result.start <= position && position <= result.end) {
//                 return sendJSONResponse(res, 200, data);
//             }
//
//             tryNext(index + 1);
//         });
//     }
//
//     tryNext(0);
// }

function findSegment(res, knownLength, position) {
    let low = 0;
    let high = knownLength - 1;

    function binarySearch() {
        if (low > high) {
            // didn't find segment
            return sendJSONResponse(res, 404, { result: null });
        }

        const middleIndex = Math.floor((low + high) / 2);

        makeDatabaseRequest(`/query?index=${middleIndex}`, (data) => {
            const { result } = data;

            if (!result) {
                return sendJSONResponse(res, 500, { error: 'Invalid data from DB' });
            }

            if (position < result.start) {
                high = middleIndex - 1;
                binarySearch();
            } else if (position > result.end) {
                low = middleIndex + 1;
                binarySearch();
            } else {
                return sendJSONResponse(res, 200, data);
            }
        });
    }

    binarySearch();
}

// Linear Search:
// {
//     "min": 5835,
//     "max": 22841,
//     "average": 15551
// }

//BinarySearch:
// {
//     "min": 98,
//     "max": 137,
//     "average": 126
// }

function getRange(res) {
    console.log('get range from database ordered list');

    makeDatabaseRequest('/range', (data) => {
        const { length } = data.result;

        knownListLength = length;

        sendJSONResponse(res, 200, data);
    });
}

const server = http.createServer((req, res) => {
    const base = `http://localhost:${server.address().port}`;
    const url = new URL(req.url, base);

    const response = { result: null };
    let status = 404;

    if (url.pathname === '/range') {
        return getRange(res);
    }

    if (url.pathname === '/media-segment') {
        const position = parseInt(url.searchParams.get('position'), 10);
        console.log('get media segment for position', position);

        if (!Number.isNaN(position)) {
            return findSegment(res, knownListLength, position);
        }
    }

    sendJSONResponse(res, status, response);
});

server.on('listening', () => {
    const { port } = server.address();
    console.log('Application server listening on port', port);
});

server.listen(PORT);
