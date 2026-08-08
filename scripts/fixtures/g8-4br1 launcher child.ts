const arguments_ = process.argv.slice(2);
const exitCodeIndex = arguments_.indexOf('--exit-code');
const exitCode = exitCodeIndex === -1 ? 0 : Number(arguments_[exitCodeIndex + 1]);

if (arguments_.includes('--malformed-json')) {
  process.stdout.write('g8-4br1-malformed-json');
} else {
  console.log(JSON.stringify({ phase: 'g8-4br1-harmless-local-child', arguments: arguments_, exitCode }));
}
if (arguments_.includes('--stderr-marker')) process.stderr.write('g8-4br1-stderr-marker');
process.exit(Number.isInteger(exitCode) ? exitCode : 64);
