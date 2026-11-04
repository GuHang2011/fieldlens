"""Run the existing test/build commands serially and record timings and dist sizes."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--label', default='current')
parser.add_argument('--runs', type=int, default=7)
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+', args.label) or args.runs < 1:
    parser.error('Use an alphanumeric label and at least one run.')

root = Path(__file__).resolve().parent.parent
out = root / 'output' / 'build-performance'
out.mkdir(parents=True, exist_ok=True)
npm = shutil.which('npm.cmd' if sys.platform == 'win32' else 'npm')
if not npm:
    parser.error('npm is required on PATH.')


def command(argv):
    start = time.perf_counter()
    result = subprocess.run(argv, cwd=root, capture_output=True, encoding='utf-8', errors='replace')
    elapsed = round((time.perf_counter() - start) * 1000, 2)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return elapsed, result.stdout + result.stderr


test_ms, log = command([npm, 'test'])
(out / f'{args.label}-test.txt').write_text(log, encoding='utf-8')
timings = []
for index in range(args.runs):
    elapsed, log = command([npm, 'run', 'build'])
    (out / f'{args.label}-build-{index + 1}.txt').write_text(log, encoding='utf-8')
    match = re.search(r'built in ([\d.]+)(ms|s)', log)
    timings.append({'wall_ms': elapsed, 'vite_ms': float(match[1]) * (1000 if match[2] == 's' else 1) if match else None})

files = []
for file in sorted((root / 'dist').rglob('*')):
    if file.is_file():
        data = file.read_bytes()
        files.append({'file': file.relative_to(root / 'dist').as_posix(), 'bytes': len(data), 'gzip_bytes': len(gzip.compress(data, compresslevel=9, mtime=0)), 'sha256': hashlib.sha256(data).hexdigest()})
vite_times = [run['vite_ms'] for run in timings if run['vite_ms'] is not None]
report = {
    'label': args.label, 'commands': ['npm test', 'npm run build'],
    'node': command(['node', '--version'])[1].strip(), 'npm': command([npm, '--version'])[1].strip(),
    'platform': sys.platform, 'test_wall_ms': test_ms, 'runs': timings,
    'median_wall_ms': statistics.median(run['wall_ms'] for run in timings),
    'median_vite_ms': statistics.median(vite_times) if vite_times else None,
    'files': files, 'total_bytes': sum(file['bytes'] for file in files),
    'total_gzip_bytes': sum(file['gzip_bytes'] for file in files),
}
(out / f'{args.label}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
