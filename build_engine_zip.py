import zipfile
import os
import time

version = '2.9'
zip_name_ver = f'ui/SenseTalk_Engine_v{version}.zip'
zip_name_compat = 'ui/SenseTalk_Engine.zip'
exe_source = 'ui/SenseTalk_Engine.exe'

def add_file_to_zip(z, arcname, data):
    zinfo = zipfile.ZipInfo(arcname, date_time=time.localtime()[:6])
    zinfo.flag_bits |= 0x800  # Set UTF-8 bit for zip filename encoding
    zinfo.compress_type = zipfile.ZIP_DEFLATED
    zinfo.external_attr = 0o644 << 16
    z.writestr(zinfo, data)

def build_zip(zip_path):
    with open(exe_source, 'rb') as f:
        exe_data = f.read()
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        add_file_to_zip(z, 'SenseTalk_Engine.exe', exe_data)

if os.path.exists(exe_source):
    build_zip(zip_name_ver)
    build_zip(zip_name_compat)
    print('Zips created successfully for v' + version + ':', os.path.getsize(zip_name_ver), os.path.getsize(zip_name_compat))
else:
    print('Error: exe source not found at', exe_source)
