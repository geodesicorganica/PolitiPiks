import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { openSync, closeSync, unlinkSync } from 'node:fs';
import { CaptureQueue, sha256, sourceUrl } from './lib/ea2026Capture.js';
const args = process.argv.slice(2);
const option = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const directory = option('--captures'), url = option('--url'), python = option('--python');
if (!directory || !url || !python) throw new Error('--captures, --url and --python required');
const execution = resolve('.artifacts/private/canonical-migration/ea-2026-execution');
const lockPath = join(execution, 'capture-operator.lock'), lock = openSync(lockPath, 'wx');
try {
  const queue = new CaptureQueue(resolve(directory), join(execution, 'requests.jsonl'));
  const entry = queue.state.entries[sha256(sourceUrl(url))];
  if (!entry?.receipt || entry.status !== 'succeeded') throw new Error('successful source required');
  const sourceBody = queue.body(entry.receipt);
  const pdf = entry.receipt.contentType.includes('pdf');
  if (/\/(weball26|cn26)\.zip$/.test(entry.url)) {
    const member = entry.url.endsWith('/cn26.zip') ? 'cn.txt' : 'weball26.txt';
    const result = spawnSync(python, ['-c', "import sys,json,zipfile\nz=zipfile.ZipFile(sys.argv[1]);i=z.getinfo(sys.argv[2])\nif i.file_size>40*1024*1024:raise ValueError('uncompressed size limit')\nprint(json.dumps({'text':z.read(i).decode('utf-8-sig')}))", join(queue.directory, 'bodies', entry.receipt.bodyFile), member], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    if (result.status !== 0) throw new Error('FEC bulk extraction failed');
    console.log(JSON.stringify(queue.extract(url, JSON.parse(result.stdout).text, `python-zipfile/${member}/utf8-v1`)));
  } else if (/javascript|text\/plain|application\/json/.test(entry.receipt.contentType)) {
    console.log(JSON.stringify(queue.extract(url, sourceBody.toString('utf8'), 'node-utf8/v1')));
  } else {
  const script = pdf ? `import sys,json,pypdf\nr=pypdf.PdfReader(sys.argv[1])\nprint(json.dumps({'extractor':'pypdf/'+pypdf.__version__,'text':'\\n'.join('\\n[PAGE '+str(i+1)+']\\n'+(p.extract_text(extraction_mode='layout') or '') for i,p in enumerate(r.pages))}))` : `import sys,json\nfrom html.parser import HTMLParser\nclass Parser(HTMLParser):\n def __init__(self): super().__init__(convert_charrefs=True); self.parts=[]; self.skip=0\n def handle_starttag(self,t,a):\n  if t in ['script','style']: self.skip+=1\n  if t in ['p','div','br','li','h1','h2','h3','tr']: self.parts.append('\\n')\n def handle_endtag(self,t):\n  if t in ['script','style']: self.skip=max(0,self.skip-1)\n def handle_data(self,d):\n  if not self.skip:self.parts.append(d)\np=Parser();p.feed(open(sys.argv[1],encoding='utf-8',errors='replace').read());print(json.dumps({'extractor':'python-html.parser/'+sys.version.split()[0], 'text':''.join(p.parts)}))`;
  const result = spawnSync(python, ['-c', script, join(queue.directory, 'bodies', entry.receipt.bodyFile)], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 60000 });
  if (result.status !== 0) throw new Error(`extraction failed: ${result.stderr.slice(0, 500)}`);
  const extracted = JSON.parse(result.stdout);
  console.log(JSON.stringify(queue.extract(url, extracted.text, extracted.extractor)));
  }
} finally { closeSync(lock); unlinkSync(lockPath); }
