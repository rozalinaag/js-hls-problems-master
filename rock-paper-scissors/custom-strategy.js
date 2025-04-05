exports.name = 'custom';
const shots = ['rock', 'paper', 'scissors'];

const histories = {};

// Saves the enemy hit in the history.
exports.recordShot = (playerId, shot) => {
    if (!histories[playerId]) {
        // default values
        histories[playerId] = { rock: 0, paper: 0, scissors: 0 };
    }

    if (shots.includes(shot)) {
        histories[playerId][shot]++;
    }
};

// Function to choose the best move against a given opponent
exports.makeShot = (playerId) => {
    const history = histories[playerId];

    // If we don't have any data on this opponent
    if (!history) {
        return 'rock'; //any value
    }

    // the opponent's most frequently used move
    let mostUsed = null;
    let maxCount = -1

    for (const [shot, count] of Object.entries(history)) {
        if (count > maxCount) {
            maxCount = count;
            mostUsed = shot;
        }
    }

    // Return the move that beats the opponent's most frequent one
    return counterMove(mostUsed);
};

// Returns the winning move against the given shot
function counterMove(shot) {
    switch (shot) {
        case 'rock':
            return 'paper';     // paper beats rock
        case 'paper':
            return 'scissors';  // scissors beat paper
        case 'scissors':
            return 'rock';      // rock beats scissors
        default:
            return 'rock'; // any value
    }
}