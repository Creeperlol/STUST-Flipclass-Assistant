"""FlipClass 作業總覽：自動登入，列出所有課程的作業、是否繳交、是否過期。

用法:
    1. 複製 .env.example 成 .env，填入自己的帳號密碼
    2. python flipclass_homework.py
       會在終端機印出清單，並產生 homework_report.html（自動用瀏覽器打開）
       加 --no-open 則不自動打開
"""
import os
import re
import sys
import html
import webbrowser
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

BASE = "https://flipclass.stust.edu.tw"
HERE = Path(__file__).resolve().parent
REPORT = HERE / "homework_report.html"


class LoginError(Exception):
    pass


def login(session: requests.Session, account: str, password: str) -> None:
    r = session.get(f"{BASE}/index/login", timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    form = soup.find("form", id="login_form")
    if not form:
        raise LoginError("找不到登入表單，網站可能改版了")
    data = {i.get("name"): i.get("value", "") for i in form.find_all("input") if i.get("name")}
    data.update({
        "account": account,
        "password": password,
        "rememberMe": "",
        "_fmSubmit": "yes",
        "formVer": "3.0",
        "formId": "login_form",
        "next": "/dashboard",
    })
    headers = {"Referer": f"{BASE}/index/login", "X-Requested-With": "XMLHttpRequest"}
    p = session.post(f"{BASE}/index/login", data=data, timeout=20, headers=headers)
    if "checkMultiLogin" in p.text:
        # 帳號已在別處登入（例如瀏覽器）時，網站會問要不要踢掉其他裝置；
        # 選「保持登入」(act=keep)，不影響你瀏覽器裡的登入。
        data["act"] = "keep"
        session.post(f"{BASE}/index/login", data=data, timeout=20, headers=headers)
    # 用 dashboard 是否被導回登入頁判斷成功與否
    r = session.get(f"{BASE}/dashboard", timeout=20)
    if "/index/login" in r.url or 'id="login_form"' in r.text or "id='login_form'" in r.text:
        raise LoginError("登入失敗，請檢查 .env 裡的帳號密碼")


def get_courses(session: requests.Session) -> list[tuple[str, str]]:
    r = session.get(f"{BASE}/dashboard", timeout=20)
    soup = BeautifulSoup(r.text, "html.parser")
    courses: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        m = re.fullmatch(r"/course/(\d+)", a["href"])
        name = a.get_text(strip=True)
        if m and name and m.group(1) not in courses:
            courses[m.group(1)] = name
    return list(courses.items())


def infer_datetime(mmdd_hhmm: str, now: datetime) -> datetime | None:
    """列表只給 'MM-DD HH:MM'（沒有年份），依目前學期推回年份。"""
    m = re.match(r"(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", mmdd_hhmm.strip())
    if not m:
        return None
    year, mon, day, hh, mi = m.groups()
    # 只有日期沒時間（跨年的作業會這樣顯示）就當作當天 23:59
    mon, day = int(mon), int(day)
    hh, mi = (int(hh), int(mi)) if hh else (23, 59)
    if year:
        y = int(year)
    elif now.month >= 8 or now.month == 1:  # 上學期：8 月 ~ 隔年 1 月
        start = now.year if now.month >= 8 else now.year - 1
        y = start if mon >= 7 else start + 1
    else:  # 下學期：2 ~ 7 月
        y = now.year
    try:
        return datetime(y, mon, day, hh, mi)
    except ValueError:
        return None


def get_homework(session: requests.Session, course_id: str, course_name: str, now: datetime) -> list[dict]:
    r = session.get(f"{BASE}/course/homeworkList/{course_id}", timeout=20)
    soup = BeautifulSoup(r.text, "html.parser")
    table = soup.find("table")
    if not table:
        return []
    headers = [th.get_text(strip=True) for th in table.find_all("th")]

    def col(*names):
        for n in names:
            if n in headers:
                return headers.index(n)
        return None

    i_title = col("Title", "標題")
    i_start = col("Start Time", "開始時間")
    i_term = col("Term", "期限", "截止時間")
    i_submit = col("Submit", "繳交")
    i_score = col("Score", "成績")

    items = []
    for tr in table.select("tbody tr"):
        tds = tr.find_all("td")
        if len(tds) < len(headers):
            continue
        a = tds[i_title].find("a", href=True) if i_title is not None else None
        if not a:
            continue
        deadline_text = tds[i_term].get_text(strip=True) if i_term is not None else ""
        deadline = infer_datetime(deadline_text, now)
        submitted = bool(i_submit is not None and tds[i_submit].select_one(".fa-check"))
        items.append({
            "course": course_name,
            "title": a.get("title") or a.get_text(strip=True),
            "url": BASE + a["href"],
            "start": tds[i_start].get_text(strip=True) if i_start is not None else "",
            "deadline": deadline,
            "deadline_text": deadline_text,
            "submitted": submitted,
            "expired": bool(deadline and deadline < now),
            "score": tds[i_score].get_text(strip=True) if i_score is not None else "",
        })
    return items


def status_of(h: dict) -> tuple[str, str]:
    if h["submitted"]:
        return ("已繳交", "done")
    if h["expired"]:
        return ("未繳(已過期)", "missed")
    return ("未繳(進行中)", "todo")


ORDER = {"todo": 0, "missed": 1, "done": 2}


def sort_key(h):
    s = status_of(h)[1]
    d = h["deadline"] or datetime.max
    # 進行中的依期限近→遠；其他依期限新→舊
    return (ORDER[s], d if s == "todo" else datetime.max - (d - datetime.min))


def print_report(items: list[dict]) -> None:
    for h in sorted(items, key=sort_key):
        label, _ = status_of(h)
        d = h["deadline"].strftime("%Y-%m-%d %H:%M") if h["deadline"] else h["deadline_text"]
        print(f"[{label}] {d}  {h['course']}  |  {h['title']}")
    todo = sum(status_of(h)[1] == "todo" for h in items)
    missed = sum(status_of(h)[1] == "missed" for h in items)
    done = sum(status_of(h)[1] == "done" for h in items)
    print(f"\n共 {len(items)} 份：已繳交 {done}、未繳進行中 {todo}、未繳已過期 {missed}")


def write_html(items: list[dict], now: datetime) -> None:
    rows = []
    for h in sorted(items, key=sort_key):
        label, cls = status_of(h)
        d = h["deadline"].strftime("%Y-%m-%d %H:%M") if h["deadline"] else h["deadline_text"]
        left = ""
        if cls == "todo" and h["deadline"]:
            delta = h["deadline"] - now
            days = delta.days
            hours = delta.seconds // 3600
            left = f"剩 {days} 天 {hours} 小時" if days else f"剩 {hours} 小時"
        rows.append(
            f'<tr class="{cls}" data-status="{cls}">'
            f'<td><span class="tag {cls}">{label}</span></td>'
            f'<td>{html.escape(d)}<div class="sub">{left}</div></td>'
            f'<td>{html.escape(h["course"])}</td>'
            f'<td><a href="{html.escape(h["url"])}" target="_blank">{html.escape(h["title"])}</a></td>'
            f'<td>{html.escape(h["score"])}</td></tr>'
        )
    counts = {k: sum(status_of(h)[1] == k for h in items) for k in ORDER}
    page = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlipClass 作業總覽</title><style>
body{{font-family:system-ui,"Microsoft JhengHei",sans-serif;margin:0;padding:16px;background:#f6f7f9;color:#222}}
h1{{font-size:20px;margin:0 0 4px}} .meta{{color:#666;font-size:13px;margin-bottom:12px}}
.filters button{{border:1px solid #ccc;background:#fff;border-radius:16px;padding:6px 12px;margin:0 6px 8px 0;cursor:pointer}}
.filters button.on{{background:#222;color:#fff;border-color:#222}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}}
th,td{{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:14px;vertical-align:top}}
th{{background:#fafafa;font-weight:600}} a{{color:#1a5fb4;text-decoration:none}} a:hover{{text-decoration:underline}}
.sub{{font-size:12px;color:#c25700}} .tag{{padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap}}
.tag.done{{background:#e3f5e6;color:#1b7a2f}} .tag.todo{{background:#fff1d6;color:#9a5b00}} .tag.missed{{background:#fde2e2;color:#b3261e}}
tr.done td{{color:#777}}
</style></head><body>
<h1>FlipClass 作業總覽</h1>
<div class="meta">更新時間 {now:%Y-%m-%d %H:%M} | 共 {len(items)} 份</div>
<div class="filters">
<button class="on" data-f="all">全部 {len(items)}</button>
<button data-f="todo">未繳(進行中) {counts['todo']}</button>
<button data-f="missed">未繳(已過期) {counts['missed']}</button>
<button data-f="done">已繳交 {counts['done']}</button>
</div>
<table><thead><tr><th>狀態</th><th>期限</th><th>課程</th><th>作業</th><th>成績</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<script>
document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{{
  document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('tbody tr').forEach(tr=>tr.style.display=(b.dataset.f==='all'||tr.dataset.status===b.dataset.f)?'':'none');
}});
</script></body></html>"""
    REPORT.write_text(page, encoding="utf-8")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    load_dotenv(HERE / ".env")
    account = os.getenv("FLIPCLASS_ACCOUNT")
    password = os.getenv("FLIPCLASS_PASSWORD")
    if not account or not password:
        print("請先建立 .env（參考 .env.example），填入 FLIPCLASS_ACCOUNT 與 FLIPCLASS_PASSWORD")
        return 1

    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 (FlipClass homework helper)"
    try:
        login(s, account, password)
    except LoginError as e:
        print(e)
        return 1

    now = datetime.now()
    items = []
    for cid, name in get_courses(s):
        items.extend(get_homework(s, cid, name, now))

    print_report(items)
    write_html(items, now)
    print(f"\n報表：{REPORT}")
    if "--no-open" not in sys.argv:
        webbrowser.open(REPORT.as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
