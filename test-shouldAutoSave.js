"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MIN_AUTO_SAVE_LINES = 10;
function shouldAutoSaveSync(aiResponse) {
    const closedBlocks = aiResponse.match(/```\w*[^\S\r\n]*\r?\n[\s\S]*?```/g) || [];
    const hasUnclosedBlock = /```\w*[^\S\r\n]*\r?\n[\s\S]{100,}$/.test(aiResponse) && !aiResponse.trim().endsWith('```');
    const totalBlocks = closedBlocks.length + (hasUnclosedBlock ? 1 : 0);
    if (totalBlocks === 0) {
        return false;
    }
    let substantialCount = closedBlocks.filter(b => b.split('\n').length - 2 >= MIN_AUTO_SAVE_LINES).length;
    if (hasUnclosedBlock) {
        const unclosedContent = aiResponse.slice(aiResponse.lastIndexOf('```'));
        if (unclosedContent.split('\n').length >= MIN_AUTO_SAVE_LINES) {
            substantialCount++;
        }
    }
    return substantialCount > 0;
}
const testOutput1 = `
Here is the code:
\`\`\`html <!-- [SCOPE] test.html -->
Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
\`\`\`
`;
console.log("Test 1:", shouldAutoSaveSync(testOutput1));
const testOutput2 = `
Here is the code:
\`\`\`html
Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
\`\`\`
`;
console.log("Test 2:", shouldAutoSaveSync(testOutput2));
//# sourceMappingURL=test-shouldAutoSave.js.map