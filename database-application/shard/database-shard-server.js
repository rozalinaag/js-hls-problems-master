// node database-application/shard/database-shard-server.js 8901 0 100000
// node database-application/shard/database-shard-server.js 8902 1 100000
// node database-application/shard/database-shard-server.js 8903 2 100000
const http = require('http');

const args = process.argv.slice(2);
const PORT = parseInt(args[0], 10) || 8901;
const SHARD_ID = parseInt(args[1], 10) || 0;
const SHARD_SIZE = parseInt(args[2], 10) || 100000;

const orderedList = [];

function createShardData() {
    let timelineCursor = Date.now() + SHARD_ID * 100000000;

    const maxDuration = 10000;
    const minDuration = 5000;

    for (let i = 0; i < SHARD_SIZE; i++) {
        const duration = Math.round(Math.random() * (maxDuration - minDuration) + minDuration);

        orderedList.push({
            duration,
            start: timelineCursor,
            end: timelineCursor + duration,
            index: i + SHARD_ID * SHARD_SIZE,
        });

        timelineCursor += duration;
    }
}

createShardData();

const server = http.createServer((req, res) => {
    const base = `http://localhost:${server.address().port}`;
    const url = new URL(req.url, base);

    const response = { result: null };
    let status = 404;

    if (url.pathname === '/range') {
        status = 200;
        response.result = {
            start: orderedList[0].start,
            end: orderedList[orderedList.length - 1].end,
            length: orderedList.length,
            shardId: SHARD_ID,
        };
    } else if (url.pathname === '/query') {
        const index = parseInt(url.searchParams.get('index'), 10);
        const localIndex = index - SHARD_ID * SHARD_SIZE;

        const result = orderedList[localIndex] || null;

        if (result) {
            status = 200;
        }

        response.result = result;
    }

    const message = JSON.stringify(response);

    setTimeout(() => {
        res.writeHead(status, {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(message),
        });

        res.end(message);
    }, 10);
});

server.listen(PORT, () => {
    console.log(`Shard ${SHARD_ID} listening on port ${PORT}, holding ${SHARD_SIZE} items`);
});
