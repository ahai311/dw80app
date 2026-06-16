import re
import sys
import zipfile
import logging

logging.disable(logging.CRITICAL)
from androguard.core.axml import AXMLPrinter

apk = sys.argv[1]
with zipfile.ZipFile(apk) as z:
    xml = AXMLPrinter(z.read('AndroidManifest.xml')).get_xml()
    if isinstance(xml, bytes):
        xml = xml.decode('utf-8', errors='replace')
for tag in ('minSdkVersion', 'targetSdkVersion', 'compileSdkVersion'):
    m = re.search(tag + r'="(\d+)"', xml)
    print(tag, m.group(1) if m else 'N/A')
m = re.search(r'package="([^"]+)"', xml)
print('package', m.group(1) if m else 'N/A')
