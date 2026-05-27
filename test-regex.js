const text = "```html <!-- [SCOPE] toe.html -->\n<!DOCTYPE html>\n```";
const m1 = text.match(/```\w*\s*\n[\s\S]*?```/g);
console.log("Auto-save regex match:", !!m1);

const m2 = text.match(/```(\w*)[^\S\r\n]*\r?\n([\s\S]*?)```/g);
console.log("Renderer regex match:", !!m2);
