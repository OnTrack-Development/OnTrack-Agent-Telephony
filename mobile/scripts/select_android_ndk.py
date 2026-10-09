"""Select an installed NDK, including templates whose version is dynamically resolved."""
from pathlib import Path
import re
import sys
p=Path(sys.argv[1]); version=sys.argv[2]
if not re.fullmatch(r'\d+\.\d+\.\d+',version): raise SystemExit('Invalid NDK version')
s=p.read_text()
s,count=re.subn(r'(?m)^([ \t]*ndkVersion[ \t]*=)[^\r\n]+',lambda m:m[1]+' "'+version+'"',s)
if count!=1: raise SystemExit(f'Expected one ndkVersion assignment, found {count}')
p.write_text(s)
print('PASS: selected installed Android NDK '+version)
