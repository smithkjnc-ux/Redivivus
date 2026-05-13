const { buildProjectMap } = require('./out/services/mapBuilderService.js');
try {
  const map = buildProjectMap('/home/papajoe/projects/chassis');
  console.log('Nodes:', map.nodes.length, 'Edges:', map.edges.length);
} catch (e) {
  console.error(e);
}
