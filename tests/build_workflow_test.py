"""Exercise NDK selection on both literal and dynamic Expo templates."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
script=root/'mobile/scripts/select_android_ndk.py'
with tempfile.TemporaryDirectory() as folder:
 p=Path(folder)/'build.gradle'
 for value in ['"27.1.12297006"','rootProject.ext.ndkVersion','findProperty("android.ndkVersion") ?: "29.0.0"']:
  p.write_text('android {\n    ndkVersion = '+value+'\n}\n')
  subprocess.run(['python3',str(script),str(p),'27.3.13750724'],check=True,stdout=subprocess.DEVNULL)
  assert 'ndkVersion = "27.3.13750724"' in p.read_text()
 p.write_text('android {}\n')
 assert subprocess.run(['python3',str(script),str(p),'27.3.13750724'],capture_output=True).returncode!=0
workflow=(root/'.github/workflows/debug-apk.yml').read_text()
assert workflow.count('      - name: Select installed Android NDK')==1
assert workflow.count('      - name: Build production-signed APK')==1
assert workflow.count('      - name: Publish GitHub Release with APK and ZIP')==1
print('PASS: NDK selection for literal/dynamic templates; duplicate build steps removed')
