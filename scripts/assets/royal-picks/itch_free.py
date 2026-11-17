# itch.io free download: for $0 pages the file endpoint returns the URL directly.
import re, sys, json, os, http.cookiejar, urllib.request, urllib.parse
page, out = sys.argv[1], sys.argv[2]; want = sys.argv[3] if len(sys.argv) > 3 else ''
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)); op.addheaders = [('User-Agent', 'Mozilla/5.0')]
h = op.open(page).read().decode('utf8', 'ignore')
csrf = (re.search(r'name="csrf_token" value="([^"]+)"', h) or re.search(r'csrf_token":"([^"]+)"', h)).group(1)
dl = json.loads(op.open(page + '/download_url', urllib.parse.urlencode({'csrf_token': csrf}).encode()).read())['url']
dh = op.open(dl).read().decode('utf8', 'ignore')
for u, n, sz in re.findall(r'data-upload_id="(\d+)".*?<strong title="([^"]+)" class="name".*?class="file_size"><span>([^<]+)', dh, re.S):
    print(u, n, sz)
    if not want or want.lower() not in n.lower(): continue
    j = json.loads(op.open(page + f'/file/{u}?source=view_game&as_props=1&after_download_lightbox=true', urllib.parse.urlencode({'csrf_token': csrf}).encode()).read())
    url = j.get('url')
    if not url: print('  no url', list(j)); continue
    os.makedirs(out, exist_ok=True); p = os.path.join(out, n)
    urllib.request.urlretrieve(url, p); print('  saved', os.path.getsize(p))
