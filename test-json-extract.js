const text1 = "Here is your JSON:\n```json\n{\"title\": \"Test\"}\n```";
const text2 = "```JSON\n{\"title\": \"Test\"}\n```";
const text3 = "{\"title\": \"Test\"}";

function clean(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

console.log("text1:", JSON.parse(clean(text1)).title);
console.log("text2:", JSON.parse(clean(text2)).title);
console.log("text3:", JSON.parse(clean(text3)).title);
