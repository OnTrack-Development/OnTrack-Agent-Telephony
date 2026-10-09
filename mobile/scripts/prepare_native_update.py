#!/usr/bin/env python3
"""Apply native APK installer after Expo prebuild. Fail closed when template changes."""
from pathlib import Path
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[1] / "android" / "app" / "src" / "main"
source = Path(__file__).resolve().parents[1] / "native" / "android"
java_dir = root / "java" / "com" / "ontrackdevelopment" / "command" / "update"
java_dir.mkdir(parents=True, exist_ok=True)
for name in ("CommandUpdateModule.java", "CommandUpdatePackage.java", "CommandAdminSessionModule.java"):
    (java_dir / name).write_bytes((source / name).read_bytes())
xml_dir = root / "res" / "xml"
xml_dir.mkdir(parents=True, exist_ok=True)
(xml_dir / "command_update_paths.xml").write_bytes((source / "command_update_paths.xml").read_bytes())
main_app = root / "java" / "com" / "ontrackdevelopment" / "command" / "MainApplication.kt"
contents = main_app.read_text()
needle = "PackageList(this).packages.apply {"
if needle not in contents:
    raise SystemExit("Expo MainApplication.kt shape changed: aborting native patch")
contents = contents.replace(needle, needle + "\n              add(com.ontrackdevelopment.command.update.CommandUpdatePackage())", 1)
main_app.write_text(contents)
manifest = root / "AndroidManifest.xml"
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
a = "{http://schemas.android.com/apk/res/android}"
doc = ET.parse(manifest)
m = doc.getroot()
perm = "android.permission.REQUEST_INSTALL_PACKAGES"
if not any(el.attrib.get(a + "name") == perm for el in m.findall("uses-permission")):
    e = ET.Element("uses-permission")
    e.set(a + "name", perm)
    m.insert(0, e)
app = m.find("application")
if app is None:
    raise SystemExit("AndroidManifest missing application")
provider = ET.SubElement(app, "provider")
for name, value in {
    "name": "androidx.core.content.FileProvider",
    "authorities": "${applicationId}.commandupdateprovider",
    "exported": "false",
    "grantUriPermissions": "true"
}.items():
    provider.set(a + name, value)
md = ET.SubElement(provider, "meta-data")
md.set(a + "name", "android.support.FILE_PROVIDER_PATHS")
md.set(a + "resource", "@xml/command_update_paths")
doc.write(manifest, encoding="utf-8", xml_declaration=True)
print("PASS: native Command updater linked, FileProvider private and installer permission configured")
