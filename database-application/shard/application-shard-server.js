//node database-application/shard/application-shard-server.js
const http = require('http');

const SHARDS = [
    { id: 0, port: 8901 },
    { id: 1, port: 8902 },
    { id: 2, port: 8903 },
];

const APP_PORT = 8904;
const shardsMeta = [];

function sendJSONResponse(res, status, response) {
    const message = JSON.stringify(response);

    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(message),
    });

    res.end(message);
}

function makeDatabaseRequest(port, pathname, callback) {
    http.get(`http://localhost:${port}${pathname}`, (dbResponse) => {
        dbResponse.setEncoding('utf8');
        let rawUTF8 = '';

        dbResponse.on('data', (chunk) => rawUTF8 += chunk);
        dbResponse.on('end', () => callback(JSON.parse(rawUTF8)));
    }).on('error', (err) => {
        console.error(`Error querying shard on port ${port}:`, err.message);
        callback(null);
    });
}

function findShardByTimestamp(timestamp) {
    return shardsMeta.find(({ start, end }) => timestamp >= start && timestamp <= end);
}

function binarySearchInShard(port, length, timestamp, callback) {
    let low = 0;
    let high = length - 1;

    function search() {
        if (low > high) {
            return callback(null);
        }

        const mid = Math.floor((low + high) / 2);
        makeDatabaseRequest(port, `/query?index=${mid}`, (data) => {
            if (!data || !data.result) return callback(null);

            const { start, end } = data.result;
            if (timestamp >= start && timestamp <= end) {
                return callback(data);
            }
            if (timestamp < start) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }

            search();
        });
    }

    search();
}

function getAllShardRanges(callback) {
    let pending = SHARDS.length;

    SHARDS.forEach(({ port, id }) => {
        makeDatabaseRequest(port, '/range', (data) => {
            if (data && data.result) {
                shardsMeta.push({
                    shardId: id,
                    port,
                    ...data.result,
                });
            }
            if (--pending === 0) callback();
        });
    });
}

const server = http.createServer((req, res) => {
    const base = `http://localhost:${APP_PORT}`;
    const url = new URL(req.url, base);

    if (url.pathname === '/range') {
        return sendJSONResponse(res, 200, { result: shardsMeta });
    }

    if (url.pathname === '/media-segment') {
        const position = parseInt(url.searchParams.get('position'), 10);

        if (!Number.isNaN(position)) {
            const shard = findShardByTimestamp(position);

            if (!shard) {
                return sendJSONResponse(res, 404, { error: 'No shard contains this timestamp' });
            }

            return binarySearchInShard(shard.port, shard.length, position, (result) => {
                if (result) {
                    return sendJSONResponse(res, 200, result);
                } else {
                    return sendJSONResponse(res, 404, { error: 'Segment not found' });
                }
            });
        }
    }

    sendJSONResponse(res, 404, { error: 'Invalid request' });
});

server.listen(APP_PORT, async () => {
    console.log(`Application server listening on port ${APP_PORT}`);
    getAllShardRanges(() => {
        console.log('Loaded shard metadata:', shardsMeta);
    });
});