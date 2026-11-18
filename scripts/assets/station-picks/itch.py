# Free itch.io download: python3 -I itch.py <page url> <out dir> [name regex]
import sys, re, json, os, urllib.request, urllib.parse, http.cookiejar
page, out = sys.argv[1].rstrip('/'), sys.argv[2]
os.makedirs(out, exist_ok=True)
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders = [('User-Agent', 'Mozilla/5.0')]
def post(u, c): return op.open(urllib.request.Request(u, data=urllib.parse.urlencode({'csrf_token': c}).encode(), headers={'X-Requested-With': 'XMLHttpRequest'}), timeout=60).read()
h = op.open(page, timeout=60).read().decode()
csrf = re.search(r'csrf_token" value="([^"]*)"', h).group(1)
src = h
if 'data-upload_id' not in h:
    src = op.open(json.loads(post(page + '/download_url', csrf))['url'], timeout=60).read().decode()
ups = list(dict.fromkeys(re.findall(r'data-upload_id="(\d+)"', src)))
names = re.findall(r'class="upload_name"[^>]*>\s*<strong title="([^"]*)"', src)
print(page, list(zip(ups, names)))
for i, u in enumerate(ups):
    name = names[i] if i < len(names) else f'{u}.zip'
    if len(sys.argv) > 3 and not re.search(sys.argv[3], name, re.I): print(' skip', name); continue
    j = json.loads(post(page + f'/file/{u}?source=view_game&as_props=1&after_download_lightbox=true', csrf))
    if 'url' not in j: print(' fail', name, j); continue
    data = op.open(j['url'], timeout=900).read()
    open(os.path.join(out, name.replace('/', '_')), 'wb').write(data)
    print(' got', name, len(data))
