const fs = require('fs');
const text = "Here is the game:\n```html\n<!-- [SCOPE] toe.html -->\n<!DOCTYPE html>\n<html>\n<body>\n</body>\n</html>\n```\nEnjoy!";
const closedBlocks = text.match(/```\w*\s*\n[\s\S]*?```/g) || [];
console.log("closedBlocks count:", closedBlocks.length);
let substantialCount = closedBlocks.filter(b => b.split('\n').length - 2 >= 3).length; // adjusted MIN_AUTO_SAVE_LINES for test
console.log("substantialCount:", substantialCount);

let match = text.match(/```(\w*)\s*\n([\s\S]*?)```/);
console.log("match:", !!match);
