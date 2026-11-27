# STUST Flipclass Assistant

南臺科技大學 [FlipClass](https://flipclass.stust.edu.tw/) 作業總覽小工具。

FlipClass 首頁的 Recent Event 只列出還沒過期的作業，也看不出自己交了沒。這個工具會自動登入，把所有課程的作業抓下來，分成三類：

- ✅ **已繳交**
- ⏳ **未繳（進行中）**：顯示剩餘時間
- ❌ **未繳（已過期）**

結果會印在終端機，同時產生可篩選的 `homework_report.html`。

## 安裝

需要 Python 3.10+。

```powershell
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env   # 填入 FLIPCLASS_ACCOUNT 和 FLIPCLASS_PASSWORD
```

`.env` 已列在 `.gitignore`，不會被 commit。

## 使用

```powershell
python flipclass_homework.py           # 產生報表並用瀏覽器打開
python flipclass_homework.py --no-open # 只產生報表
```

## 說明

- 資料來源是每門課的 `/course/homeworkList/{課程ID}` 頁面。
- 如果帳號已在其他地方登入，工具會選「保持登入」，不會把其他裝置踢掉。
- 列表上的日期沒有年份，工具依目前學期推算；只有日期沒時間的期限視為當天 23:59。
- 目前只處理「作業」，不含測驗和問卷。

## 授權

[MIT](LICENSE)
