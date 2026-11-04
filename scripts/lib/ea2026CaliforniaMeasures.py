"""Offline extraction only. Requires lxml; never fetches or imports data."""
import hashlib
import json
import pathlib
import re
import sys
from lxml import html

root = pathlib.Path(sys.argv[1])
queue = json.loads((root / 'captures/queue.json').read_text())
records = []
for entry in queue['entries'].values():
    if not any(use['purpose'] == 'measure_details' for use in entry['uses']):
        continue
    receipt = entry['receipt']
    body = (root / 'captures/bodies' / receipt['bodyFile']).read_bytes()
    if hashlib.sha256(body).hexdigest() != receipt['sha256']:
        raise ValueError('source digest mismatch')
    tree = html.fromstring(body)
    main = tree.xpath('//*[@id="mainCont"]')[0]
    text = ' '.join(' '.join(main.itertext()).split())
    number = re.search(r'/propositions/(\d+)/', entry['url']).group(1)
    title_node = main.xpath('.//*[contains(concat(" ",normalize-space(@class)," ")," propTitle ")]')[0]
    title = ' '.join(' '.join(title_node.itertext()).split())
    summary = re.search(r'SUMMARY\s+(.*?)\s+WHAT YOUR VOTE MEANS', text).group(1)
    fiscal = re.search(r'Fiscal Impact\s*:\s*(.*?)(?:Supporters\s*:|Opponents\s*:|$)', summary).group(1).strip()
    description = re.split(r'Fiscal Impact\s*:', summary)[0].strip()
    laws = tree.xpath('//a[contains(text(),"Text of Proposed Law")]/@href')
    if len(laws) != 1:
        raise ValueError('ambiguous full law link')
    records.append(dict(number=number, title=title, description=description, fiscal=fiscal,
                        fullTextUrl=laws[0], url=entry['url'], sourceDigest=receipt['sha256'],
                        retrievedAt=receipt['retrievedAt'], text=text))
with open(sys.argv[2], 'x', encoding='utf-8') as output:
    json.dump(records, output, indent=2)
print(json.dumps({'extracted': len(records)}))
