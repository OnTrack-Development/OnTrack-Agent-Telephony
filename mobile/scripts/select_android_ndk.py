"""Select the installed NDK before Expo's root plugin initializes project extras."""
from pathlib import Path
import re
import sys
p=Path(sys.argv[1]);version=sys.argv[2]
if not re.fullmatch(r'\d+\.\d+\.\d+',version):raise SystemExit('Invalid NDK version')
s=p.read_text()
s,count=re.subn(r'(?m)^([ \t]*(?:ext\.)?ndkVersion[ \t]*(?:=|(?=\S)))[^\r\n]+',lambda m:re.match(r'^\s*',m[1])[0]+('ext.' if 'ext.' in m[1] else '')+'ndkVersion = "'+version+'"',s)
if count==0:
 marker='apply plugin: "expo-root-project"'
 if s.count(marker)!=1:raise SystemExit('Unknown Android root Gradle template')
 s=s.replace(marker,'// Set before expo-root-project resolves its version catalog.\next.ndkVersion = "'+version+'"\n'+marker,1)
elif count!=1:raise SystemExit(f'Expected one ndkVersion assignment, found {count}')
p.write_text(s)
print('PASS: selected installed Android NDK '+version)
