# ProductInformation/analyze_cli.py
import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs, urljoin, unquote_plus
import re
import html
import unicodedata
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------- 文字工具 ----------
def clean_text(s):
    if not s:
        return None
    return re.sub(r"\s+", " ", s).strip()

DIM_PATTERNS = [
    (re.compile(r'(\d)\s*"\b'), r'\1″'),  # 1" -> 1″
    (re.compile(r'(\d)\s*\'\b'), r'\1′'), # 1' -> 1′
    (re.compile(r'\\"'), '″'),
]

def normalize_for_output(text):
    """避免 JSON 轉義問題並做簡單排版正規化"""
    if text is None:
        return None
    t = html.unescape(text)
    t = unicodedata.normalize("NFC", t)
    for pat, repl in DIM_PATTERNS:
        t = pat.sub(repl, t)
    t = t.replace("\\", "")      # 移除多餘反斜線
    t = t.replace('"', '”')      # 排版引號
    t = re.sub(r"\s+", " ", t).strip()
    return t

def to_float_maybe(x):
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        try:
            return float(re.sub(r"[^\d.]", "", str(x)))
        except Exception:
            return None

def make_session():
    s = requests.Session()
    retries = Retry(
        total=3, backoff_factor=0.3,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"])
    )
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; ProductMCP/1.2)",
        "Accept-Language": "en-US,en;q=0.8,zh-TW;q=0.7"
    })
    return s

# ---------- 抓價格（通用） ----------
def find_price_generic(soup: BeautifulSoup):
    # JSON-LD offers.price
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict):
                offers = item.get("offers")
                if isinstance(offers, dict):
                    price = offers.get("price") or (offers.get("priceSpecification") or {}).get("price")
                    f = to_float_maybe(price)
                    if f is not None:
                        return f
                if isinstance(offers, list):
                    for o in offers:
                        if isinstance(o, dict):
                            price = o.get("price") or (o.get("priceSpecification") or {}).get("price")
                            f = to_float_maybe(price)
                            if f is not None:
                                return f
    # Meta
    meta_price = soup.find("meta", {"property": "product:price:amount"}) or soup.find("meta", {"name": "price"})
    if meta_price and meta_price.get("content"):
        f = to_float_maybe(meta_price["content"])
        if f is not None:
            return f
    # 純文字備援
    text = soup.get_text(" ", strip=True)
    for pat in [
        r"\bUSD\s*\$?\s*([\d,]+(?:\.\d{1,2})?)",
        r"\$\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bNT\$?\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bTWD\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bEUR\s*\€?\s*([\d\.]+)",
    ]:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except Exception:
                continue
    return None

# ---------- 抓主圖（通用） ----------
def _looks_like_logo(u: str) -> bool:
    if not u:
        return False
    low = u.lower()
    return any(k in low for k in ("logo", "sprite", "favicon", "icon", "social"))

def find_image_generic(soup: BeautifulSoup, base_url: str):
    """盡量找出產品主圖的絕對網址。避免回傳 logo。"""
    # 1) OpenGraph / Twitter，但過濾 logo
    for key in (("property", "og:image"), ("name", "og:image"),
                ("property", "twitter:image"), ("name", "twitter:image")):
        tag = soup.find("meta", {key[0]: key[1]})
        if tag and tag.get("content"):
            u = urljoin(base_url, tag["content"].strip())
            if not _looks_like_logo(u):
                return u

    # 2) JSON-LD Product.image
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            t = item.get("@type") or item.get("type")
            t = [t] if isinstance(t, str) else (t or [])
            t = [str(x).lower() for x in t]
            if "product" in t:
                img = item.get("image")
                candidates = []
                if isinstance(img, str):
                    candidates = [img]
                elif isinstance(img, list):
                    candidates = [x for x in img if isinstance(x, str)]
                elif isinstance(img, dict):
                    u = img.get("url") or img.get("@id")
                    if isinstance(u, str) and u.strip():
                        candidates = [u]
                for c in candidates:
                    absu = urljoin(base_url, c.strip())
                    if not _looks_like_logo(absu):
                        return absu

    # 3) Heuristic: product-like <img>
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-original")
        if not src:
            continue
        src = src.strip()
        if not src or src.startswith("data:"):
            continue
        cls = " ".join(img.get("class", [])).lower()
        iid = (img.get("id") or "").lower()
        if any(k in (cls + " " + iid) for k in ["product", "main", "detail", "primary", "gallery"]):
            absu = urljoin(base_url, src)
            if not _looks_like_logo(absu):
                return absu

    return None

# ---------- Thorlabs 圖片 ----------
LOGO_BLOCKLIST = {
    "https://www.thorlabs.com/images/thorlabs-logo.png"
}

def _is_good_img_url(u: str) -> bool:
    if not u:
        return False
    s = u.lower().strip()
    if s in (x.lower() for x in LOGO_BLOCKLIST):
        return False
    bad = ("logo", "sprite", "icon", "banner", "social", "favicon")
    return (not any(b in s for b in bad)) and s.endswith((".jpg", ".jpeg", ".png", ".webp"))

def _to_large_from_small(u: str) -> str:
    # small/tabimages -> large，且 -sml/-small -> -lrg
    v = u
    v = re.sub(r"/images/small/", "/images/large/", v, flags=re.IGNORECASE)
    v = re.sub(r"/images/tabimages/", "/images/large/", v, flags=re.IGNORECASE)
    v = re.sub(r"[-_](?:sml|small)(\.(?:jpe?g|png|webp))$", r"-lrg\1", v, flags=re.IGNORECASE)
    return v

def _host_is_thorlabs(host: str) -> bool:
    # 支援 thorlabs.com / .us / .de / .cn / .jp / .uk / .fr / .it / .es 等
    parts = host.lower().split(".")
    return len(parts) >= 2 and parts[-2] == "thorlabs"

def find_image_thorlabs(soup: BeautifulSoup, base_url: str, model: str | None = None) -> str | None:
    html_text = str(soup)

    # A) 直接 regex 掃大圖（先偏好 -lrg，其次任何 /images/(large|highres)/*.{jpg,png,webp}）
    pat_lrg_abs = re.compile(r"https?://[^\"'\s>]+/images/(?:large|highres)/[^\"'\s>]*?[-_]lrg\.(?:jpe?g|png|webp)", re.I)
    pat_lrg_rel = re.compile(r"/images/(?:large|highres)/[^\"'\s>]*?[-_]lrg\.(?:jpe?g|png|webp)", re.I)
    m = pat_lrg_abs.search(html_text)
    if m and _is_good_img_url(m.group(0)):
        return m.group(0)
    m = pat_lrg_rel.search(html_text)
    if m and _is_good_img_url(m.group(0)):
        return urljoin(base_url, m.group(0))

    # 沒有 -lrg 就抓 large/highres 任意圖
    pat_any_abs = re.compile(r"https?://[^\"'\s>]+/images/(?:large|highres)/[^\"'\s>]+\.(?:jpe?g|png|webp)", re.I)
    pat_any_rel = re.compile(r"/images/(?:large|highres)/[^\"'\s>]+\.(?:jpe?g|png|webp)", re.I)

    candidates = []
    for pat in (pat_any_abs, pat_any_rel):
        for m in pat.finditer(html_text):
            u = m.group(0)
            u = urljoin(base_url, u)
            if _is_good_img_url(u):
                candidates.append(u)

    # B) 從屬性收集候選（含 data-*），並將 small/tabimages 轉 large
    attrs = ("href","src","data-src","data-original","data-large","data-zoom-image","data-image","data-full")
    for tag in soup.find_all(["a","img","source","link"]):
        for a in attrs:
            val = tag.get(a)
            if not val:
                continue
            val = val.strip()
            if not val or val.startswith("data:"):
                continue
            low = val.lower()
            if "/images/large/" in low or "/images/highres/" in low:
                absu = urljoin(base_url, val)
                if _is_good_img_url(absu):
                    candidates.append(absu)
            if "/images/small/" in low or "/images/tabimages/" in low:
                absu = urljoin(base_url, _to_large_from_small(val))
                if _is_good_img_url(absu):
                    candidates.append(absu)

    # C) 「Zoom / Click to Enlarge」連結
    zoom = soup.find(lambda t: t.name == "a" and t.get_text(strip=True) and re.search(r"\b(zoom|click to enlarge)\b", t.get_text(strip=True), re.I))
    if zoom and zoom.get("href"):
        u = urljoin(base_url, zoom["href"].strip())
        if _is_good_img_url(u):
            candidates.append(u)

    # 排序
    def rank(u: str):
        ul = u.lower()
        is_lrg = 0 if re.search(r"[-_]lrg\.(?:jpe?g|png|webp)$", ul) else 1
        in_large = 0 if "/images/large/" in ul else (1 if "/images/highres/" in ul else 2)
        has_model = 0
        if model:
            fn = ul.rsplit("/", 1)[-1]
            if re.search(re.escape(model.lower()), fn):
                has_model = -1
        return (is_lrg, in_large, has_model, len(ul))

    uniq = []
    seen = set()
    for c in candidates:
        if c not in seen:
            uniq.append(c)
            seen.add(c)

    if uniq:
        uniq.sort(key=rank)
        return uniq[0]

    # D) 備援 meta
    for key in (("property","og:image"),("name","og:image"),
                ("property","twitter:image"),("name","twitter:image")):
        tag = soup.find("meta", {key[0]: key[1]})
        if tag and tag.get("content"):
            u = urljoin(base_url, tag["content"].strip())
            if _is_good_img_url(u):
                return u

    return None

# ---------- Thorlabs 解析 ----------
def parse_thorlabs(url, soup: BeautifulSoup):
    host = urlparse(url).netloc
    if not _host_is_thorlabs(host):
        return None

    path = urlparse(url).path.lower()
    if not (("thorproduct.cfm" in path) or ("newgrouppage" in path)):
        # 只針對產品/群組頁
        return None

    brand = "Thorlabs"
    qs = parse_qs(urlparse(url).query)

    # part number: partnumber= 或 pn=
    model = (qs.get("partnumber", [None])[0] or qs.get("pn", [None])[0] or "")
    model = (model or "").strip() or None

    # Title → name/spec
    title_tag = soup.find("title")
    title_text = clean_text(title_tag.get_text()) if title_tag else None
    if not title_text:
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            title_text = clean_text(og["content"])

    name = None
    spec = None
    if title_text:
        title_text = re.sub(r"^\s*Thorlabs\s*-\s*", "", title_text, flags=re.IGNORECASE).strip()
        tail = title_text
        if model and title_text.upper().startswith(model.upper()):
            tail = title_text[len(model):].strip()
            tail = re.sub(r'^[\s\-–—:,]+', '', tail)
        if not model:
            m = re.search(r"\b([A-Z0-9]{1,10}(?:-[A-Z0-9]+)*)\b", title_text)
            if m:
                model = m.group(1)
                tail = re.sub(rf"\b{re.escape(model)}\b", "", title_text).strip()
                tail = re.sub(r'^[\s\-–—:,]+', '', tail)
        parts = [p.strip() for p in tail.split(",")]
        if parts:
            name = parts[0] or None
            spec = ", ".join(parts[1:]) if len(parts) > 1 else None

    price = find_price_generic(soup)

    # 主圖（先 Thorlabs 專用，再通用）
    imagelink = find_image_thorlabs(soup, url, model=model)
    if not imagelink:
        imagelink = find_image_generic(soup, url)

    # URL 正規化（強制 https 絕對位址）
    def norm_url(u):
        if not u:
            return None
        absu = urljoin(url, str(u).strip())
        if absu.startswith("//"):
            absu = "https:" + absu
        if absu.startswith("http://"):
            absu = "https://" + absu[len("http://"):]
        return absu

    return {
        "name": normalize_for_output(name),
        "brand": normalize_for_output(brand),
        "model": normalize_for_output(model),
        "price": price,
        "spec": normalize_for_output(spec),
        "imagelink": norm_url(imagelink),
    }

# ---------- Mini-Circuits 解析 ----------
# ---------- Mini-Circuits 解析（修正版） ----------
def _host_is_minicircuits(host: str) -> bool:
    parts = host.lower().split(".")
    return len(parts) >= 2 and parts[-2] == "minicircuits"

def _grab_table_value_by_label(soup: BeautifulSoup, label_regex: str):
    """
    在「label 在左、值在右」的表格或區塊抓取值。僅抓同一列/兄弟節點，避免越界誤抓（例如 VSWR）。
    """
    node = soup.find(lambda t: t.get_text(strip=True) and re.search(label_regex, t.get_text(strip=True), re.I))
    if not node:
        return None

    # 1) <th>Label</th><td>Value</td>
    if node.name in ("th", "td"):
        tr = node.find_parent("tr")
        if tr:
            cells = tr.find_all(["td", "th"])
            # 找到 label cell，取其右側第一個 td/th
            for i, c in enumerate(cells):
                if c is node:
                    # 右側下一格
                    for j in range(i + 1, len(cells)):
                        vtxt = clean_text(cells[j].get_text(" ", strip=True))
                        if vtxt:
                            return vtxt
                    break

    # 2) <div>Label</div><div>Value</div>
    sib = node.find_next_sibling()
    if sib and sib.get_text(strip=True):
        return clean_text(sib.get_text(" ", strip=True))

    # 3) 退而求其次：同層下一個 td
    td = node.find_next("td")
    if td and td.get_text(strip=True):
        return clean_text(td.get_text(" ", strip=True))

    return None

def _minicircuits_pick_image(soup: BeautifulSoup, base_url: str) -> str | None:
    # 1) 優先 /images/case_style/*.png
    for tag in soup.find_all(["img", "source", "a", "link", "meta"]):
        for attr in ("src", "data-src", "href", "data-original", "content"):
            v = tag.get(attr)
            if not v:
                continue
            v = v.strip()
            if "/images/case_style/" in v and v.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                return urljoin(base_url, v)

    # 2) OpenGraph / Twitter
    for key in (("property", "og:image"), ("name", "og:image"),
                ("property", "twitter:image"), ("name", "twitter:image")):
        tag = soup.find("meta", {key[0]: key[1]})
        if tag and tag.get("content"):
            return urljoin(base_url, tag["content"].strip())

    # 3) Heuristic
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-original")
        if not src:
            continue
        cls = " ".join(img.get("class", [])).lower()
        iid = (img.get("id") or "").lower()
        if any(k in (cls + " " + iid) for k in ["product", "main", "detail", "primary"]):
            return urljoin(base_url, src.strip())

    return None

def parse_minicircuits(url: str, soup: BeautifulSoup):
    from urllib.parse import unquote_plus

    host = urlparse(url).netloc
    if not _host_is_minicircuits(host):
        return None

    brand = "Mini-Circuits"

    # ---- 模型（型號）優先用 URL query 的 model（保留 +）----
    qs = parse_qs(urlparse(url).query)
    model = (qs.get("model", [None])[0] or "").strip() or None
    if model:
        model = unquote_plus(model)  # FW-15A%2B -> FW-15A+
    # 從 <title> 右側的「| 型號」作為備援/修正（保留 +）
    if True:
        _title = clean_text((soup.find("title") or {}).get_text() if soup.find("title") else None) or ""
        # 例：「15 dB Fixed Attenuator, DC - 12000 MHz, 50Ω | FW-15A+」
        m = re.search(r"\|\s*([A-Z0-9][A-Z0-9+\-]+)\s*$", _title, re.I)
        if m:
            title_model = m.group(1).strip()
            # 若 URL 沒帶 + 或不一致，偏好 title 的版本（常含 +）
            if not model or (len(title_model) >= len(model) and "+" in title_model and "+" not in (model or "")):
                model = title_model

    # ---- 名稱與規格：先把「| 型號」切掉，再用逗號拆 name/spec ----
    title_tag = soup.find("title")
    title_text = clean_text(title_tag.get_text()) if title_tag else None
    if not title_text:
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            title_text = clean_text(og["content"])

    name = None
    spec = None
    if title_text:
        # 切掉站名與型號尾巴
        t = re.sub(r"\s*\|\s*Mini[-\s]?Circuits\s*$", "", title_text, flags=re.I)
        t = re.sub(r"\s*\|\s*[A-Z0-9][A-Z0-9+\-]+\s*$", "", t, flags=re.I)  # 去掉「| FW-15A+」
        # 現在 t 應該像「15 dB Fixed Attenuator, DC - 12000 MHz, 50Ω」
        parts = [p.strip(" -–—,:") for p in t.split(",") if p.strip()]
        if parts:
            name = parts[0] or None
            if len(parts) > 1:
                # 其餘合併為 spec（通常包含頻寬與阻抗）
                spec = ", ".join(parts[1:])

    # 若還沒拿到頻寬/阻抗，補抓一遍（避免把 VSWR 當阻抗）
    # 頻寬
    if not spec or "MHz" not in spec:
        freq = _grab_table_value_by_label(soup, r"\b(Frequency\s*Range|Frequency\s*Band)\b")
        if not freq:
            m = re.search(r"\bDC\s*-\s*[\d,]+(?:\.\d+)?\s*MHz\b", soup.get_text(" ", strip=True), re.I)
            if m:
                freq = m.group(0).replace(",", "")
    else:
        # 從 spec 裡切出第一段 MHz 片段
        m = re.search(r"\b(?:DC|[\d\.]+)\s*-\s*[\d,]+(?:\.\d+)?\s*MHz\b", spec, re.I)
        freq = m.group(0).replace(",", "") if m else None

    # 阻抗（只接受含 ohm/Ω 字樣的數字，避免抓到 VSWR 1.4）
    imp = None
    # 先試表格的「Impedance」
    imp_raw = _grab_table_value_by_label(soup, r"\bImpedance\b")
    txt_pool = [imp_raw or "", spec or "", soup.get_text(" ", strip=True)]
    for blob in txt_pool:
        m = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:ohms?|Ω|Ω)\b", blob, re.I)
        if m:
            imp = f"{m.group(1)}Ω"
            break
    if not imp:
        # 常見 50 ohm
        if re.search(r"\b50\s*(?:ohms?|Ω|Ω)\b", soup.get_text(" ", strip=True), re.I):
            imp = "50Ω"

    # 重建 spec：freq 與 imp 有就用這兩個，否則保留前面拆到的 spec
    if freq or imp:
        spec = ", ".join([x for x in [freq, imp] if x])
    spec = normalize_for_output(spec)

    # 主圖
    imagelink = _minicircuits_pick_image(soup, url)
    if not imagelink:
        imagelink = find_image_generic(soup, url)

    # 價格（先通用）
    price = find_price_generic(soup)
    if price is None:
        # 再掃「Price $…」
        txt = soup.get_text(" ", strip=True)
        m = re.search(r"\bPrice\b[^$]*\$\s*([\d,]+(?:\.\d{1,2})?)", txt, re.I)
        if m:
            try:
                price = float(m.group(1).replace(",", ""))
            except Exception:
                price = None

    # URL 正規化
    def norm_url(u):
        if not u:
            return None
        absu = urljoin(url, str(u).strip())
        if absu.startswith("//"):
            absu = "https:" + absu
        if absu.startswith("http://"):
            absu = "https://" + absu[len("http://"):]
        return absu

    return {
        "name": normalize_for_output(name),
        "brand": normalize_for_output(brand),
        "model": normalize_for_output(model),   # 會保留 '+'
        "price": price,
        "spec": spec,
        "imagelink": norm_url(imagelink),
    }

# ---------- Main ----------
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python analyze_cli.py <url>"}, ensure_ascii=False))
        sys.exit(1)

    url = sys.argv[1]
    try:
        sess = make_session()
        resp = sess.get(url, timeout=25)
        resp.raise_for_status()
    except Exception as e:
        print(json.dumps({"error": f"Failed to fetch page: {e}"}, ensure_ascii=False))
        sys.exit(0)

    soup = BeautifulSoup(resp.text, "html.parser")

    # Mini-Circuits 優先
    hit = parse_minicircuits(url, soup)
    if hit:
        print(json.dumps(hit, ensure_ascii=False))
        return

    # Thorlabs
    hit = parse_thorlabs(url, soup)
    if hit:
        print(json.dumps(hit, ensure_ascii=False))
        return

    # 之後可擴充其他站台解析器；目前先通用/或告知未匹配
    generic_img = find_image_generic(soup, url)
    if generic_img:
        print(json.dumps({
            "name": None, "brand": None, "model": None, "price": None,
            "spec": None, "imagelink": generic_img
        }, ensure_ascii=False))
        return

    print(json.dumps({"error": "No parser matched"}, ensure_ascii=False))

if __name__ == "__main__":
    main()
