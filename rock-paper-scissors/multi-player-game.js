//node rock-paper-scissors/multi-player-game.js 9001 random 9002 random 9003 custom 9004 random 9005 constant

const dgram = require('dgram');
const NAMES = require('./names');

// Get command-line arguments, skipping the first two default ones
const args = process.argv.slice(2);

// Ensure arguments are in pairs: port and strategy
if (args.length % 2 !== 0) {
    console.error("Error: Each player needs a port and a strategy");
    process.exit(1);
}

// Parse player configuration from arguments
const playersConfig = [];
for (let i = 0; i < args.length; i += 2) {
    const port = parseInt(args[i], 10);
    const strategy = args[i + 1];

    if (Number.isNaN(port)) {
        console.error(`Invalid port number: ${args[i]}`);
        process.exit(1);
    }

    playersConfig.push({ port, strategy });
}

// Simple logging utility class
class Logger {
    constructor(name) {
        this.name = name;
    }

    log(...args) {
        console.log(new Date().toISOString(), this.name, ...args);
    }

    warn(...args) {
        console.warn(new Date().toISOString(), this.name, ...args);
    }

    error(...args) {
        console.error(new Date().toISOString(), this.name, ...args);
    }
}

// Represents a player in the game
class Player {
    constructor(port, strategyName) {
        this.port = port;
        this.strategyName = strategyName;
        this.id = Player.generateNamePort(port);
        this.logger = new Logger(this.id);
        this.inGame = false;

        // Get all known players except self
        this.knownAddresses = playersConfig.filter((p) => p.port !== port).map((p) => p.port);

        // Track stats
        this.wins = 0;
        this.losses = 0;
        this.ties = 0;
    }

    // Generate a human-readable player ID
    static generateNamePort(port) {
        const namePlayer = NAMES[Math.floor(Math.random() * NAMES.length)];
        return `${namePlayer}-${port}`;
    }

    // Initialize the UDP socket and set up message handling
    initialize() {
        this.socket = dgram.createSocket('udp4');

        this.socket.on('message', this.onMessage.bind(this));

        this.socket.on('listening', () => {
            const address = this.socket.address();
            this.logger.log(`socket listening ${address.address}:${address.port}`);
        });

        this.socket.on('error', (err) => {
            this.logger.error('socket error:');
            this.logger.error(err.stack);
        });

        this.socket.bind(this.port);

        // Start trying to play after initial delay
        this.timeout = setTimeout(this.tryToPlay.bind(this), 10000);
    }

    // Handle incoming messages
    onMessage(messageBuffer) {
        const json = messageBuffer.toString();
        const { playerID, port, method, params } = JSON.parse(json);
        this.logger.log(`Received message from ${playerID}: ${method}(${params.join()})`);

        switch (method) {
            case 'readyToPlay':
                this.isReadyToPlay(port, playerID);
                break;
            case 'canPlay':
                this.acceptShot(port, playerID, params[0]);
                break;
            case 'cannotPlay':
                this.logger.log(playerID, 'cannot play; trying someone else');
                this.tryToPlayRandomDelay();
                break;
            case 'gameResult':
                this.gotGameResult(port, playerID, params[1], params[0]);
                break;
        }
    }

    // Attempt to play with a random other player
    tryToPlay() {
        this.timeout = null;
        this.sendMessage(this.sampleKnownAddresses(), 'readyToPlay', []);
    }

    // Retry playing after a random delay (if opponent is busy)
    tryToPlayRandomDelay() {
        const maxDelay = 5000;
        const minDelay = 1000;
        const delay = Math.random() * (maxDelay - minDelay) + minDelay;
        this.timeout = setTimeout(this.tryToPlay.bind(this), delay);
    }

    // Respond to another player's request to play
    isReadyToPlay(port, playerID) {
        if (this.inGame) {
            this.logger.log(`${playerID} wants to play; already in game`);
            this.sendMessage(port, 'cannotPlay', []);
        } else {
            this.logger.log(`${playerID} wants to play; will send shot`);
            this.inGame = true;
            this.cancelTimeout();

            const shot = require(`./${this.strategyName}-strategy`).makeShot(playerID);
            this.sendMessage(port, 'canPlay', [shot]);
        }
    }

    // Accept a shot from another player and generate a counter shot
    acceptShot(port, playerID, shot) {
        this.logger.log(`Player ${playerID} sent:`, shot, '; creating counter shot');

        const strategy = require(`./${this.strategyName}-strategy`);
        strategy.recordShot(playerID, shot);
        const counterShot = strategy.makeShot(playerID);

        let result;

        // Determine outcome of the match
        if (shot === 'rock') {
            result = counterShot === 'paper' ? 'loss' : counterShot === 'rock' ? 'tie' : 'win';
        } else if (shot === 'paper') {
            result = counterShot === 'scissors' ? 'loss' : counterShot === 'paper' ? 'tie' : 'win';
        } else if (shot === 'scissors') {
            result = counterShot === 'rock' ? 'loss' : counterShot === 'scissors' ? 'tie' : 'win';
        }

        // Log and update stats
        if (result === 'loss') {
            this.logger.log(`Beat player ${playerID} with counter shot:`, counterShot);
            this.wins++;
        } else if (result === 'tie') {
            this.logger.log(`Tied player ${playerID} with counter shot:`, counterShot);
            this.ties++;
        } else {
            this.logger.log(`Lost to player ${playerID} with counter shot:`, counterShot);
            this.losses++;
        }

        this.logger.log(`{ strategy:${this.strategyName}, wins:${this.wins}, losses:${this.losses} ties:${this.ties} }`);

        this.sendMessage(port, 'gameResult', [result, counterShot]);

        this.inGame = false;
        this.tryToPlayRandomDelay();
    }

    // Process the result received from the opponent
    gotGameResult(port, playerID, shot, result) {
        if (result === 'win') {
            this.wins++;
            this.logger.log(`Beat player ${playerID} (counter shot ${shot})`);
        } else if (result === 'tie') {
            this.ties++;
            this.logger.log(`Tied player ${playerID} (counter shot ${shot})`);
        } else {
            this.logger.log(`Lost to player ${playerID} (counter shot ${shot})`);
            this.losses++;
        }

        const strategy = require(`./${this.strategyName}-strategy`);
        strategy.recordShot(playerID, shot);

        this.logger.log(`{ strategy:${this.strategyName}, wins:${this.wins}, losses:${this.losses} ties:${this.ties} }`);

        this.inGame = false;
        this.tryToPlayRandomDelay();
    }

    // Send a message to another player's port
    sendMessage(otherPort, method, params) {
        const message = {
            port: this.port,
            playerID: this.id,
            method,
            params,
        };

        const utf8 = JSON.stringify(message);
        const buff = Buffer.from(utf8);
        this.logger.log('send message', method, 'to port', otherPort);
        this.socket.send(buff, otherPort, 'localhost');
    }

    // Pick a random other player to play with
    sampleKnownAddresses() {
        return this.knownAddresses[Math.floor(Math.random() * this.knownAddresses.length)];
    }

    // Cancel the current timeout if set
    cancelTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }
}

// Initialize all players defined in the config
playersConfig.forEach(({ port, strategy }) => {
    const player = new Player(port, strategy);
    player.initialize();
});
