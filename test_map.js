const { JSDOM } = require('jsdom');
const fs = require('fs');
const htmlContent = require('./out/ui/map/mapPanelHtml.js').buildMapHtml('test', {nodes: [{id:'test', lines:10, health:'good'}], edges:[]}, {asWebviewUri: (uri)=>uri.toString()}, {});
const dom = new JSDOM(htmlContent, { runScripts: "dangerously" });
if (dom.window.document.getElementById('canvas')) {
  console.log("Canvas found!");
}
