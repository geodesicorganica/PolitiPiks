import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

export const G8_BR7B_INNER_TSX_HEAP_MB = 4096;

const quoteEmulatorsExecArgument = (value: string) => {
  if (/[\0\r\n"]/.test(value)) throw new Error('BR7B_INNER_TSX_ARGUMENT_UNSAFE');
  return `"${value}"`;
};

export function buildG8Br7bInnerTsxInvocation(testPath: string) {
  const executable = process.execPath;
  const boundedNodeArguments = [
    '--expose-gc',
    `--max-old-space-size=${G8_BR7B_INNER_TSX_HEAP_MB}`,
  ];
  const arguments_ = [
    ...boundedNodeArguments,
    tsxCli,
    // tsx/cli starts the process that executes the TypeScript file; forward the
    // same bounded Node policy as discrete CLI arguments without NODE_OPTIONS.
    ...boundedNodeArguments,
    testPath,
  ];
  return {
    executable,
    arguments: arguments_,
    emulatorsExecCommand: [executable, ...arguments_].map(quoteEmulatorsExecArgument).join(' '),
  };
}
