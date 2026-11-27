# STUST Flipclass Assistant

南臺科技大學 [FlipClass](https://flipclass.stust.edu.tw/) 作業總覽小工具。

FlipClass 首頁的 Recent Event 只列出還沒過期的作業，也看不出自己交了沒。這個工具會把所有課程的作業抓下來，分成三類：

- ✅ **已繳交**
- ⏳ **未繳（進行中）**：顯示剩餘時間
- ❌ **未繳（已過期）**

有兩種用法：

| | 瀏覽器插件（推薦） | Python 腳本 |
|---|---|---|
| 適用 | 電腦、Android 手機 | 電腦 |
| 登入 | 用瀏覽器裡已登入的狀態，**不需要帳號密碼** | 自動登入，帳號密碼放在 `.env` |
| 顯示 | FlipClass 網頁右下角的「作業」按鈕 | 終端機＋ `homework_report.html` |

---

## 瀏覽器插件

安裝後，登入 FlipClass，右下角會出現藍色的 **「作業」** 按鈕，數字是還沒繳交、也還沒過期的作業數量。點開就能依狀態篩選，點作業會直接進入作業頁。資料會快取 10 分鐘，按「重新整理」可立即更新。

### Android 手機

1. 安裝 **Firefox**（或 **Microsoft Edge**）。
2. 在 Firefox 選單 →「擴充套件」中安裝 **Tampermonkey**（Edge：選單 →「擴充功能」）。
3. 用同一個瀏覽器打開這個網址，Tampermonkey 會跳出安裝畫面，按「安裝」：
   <https://raw.githubusercontent.com/Creeperlol/STUST-Flipclass-Assistant/main/extension/flipclass-assistant.user.js>
4. 打開 FlipClass 並登入，右下角就會出現「作業」按鈕。

腳本更新後 Tampermonkey 會自動更新。

### 電腦（Chrome / Edge）

**方法 A：Tampermonkey**（和手機一樣，會自動更新）
安裝 Tampermonkey 擴充功能後，打開上面的網址並按「安裝」。

**方法 B：直接載入擴充功能**
1. 下載或 clone 這個 repo。
2. 打開 `chrome://extensions`（Edge 是 `edge://extensions`），開啟「開發人員模式」。
3. 按「載入未封裝項目」，選擇 `extension` 資料夾。

---

## Python 腳本

需要 Python 3.10+。

```powershell
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env   # 填入 FLIPCLASS_ACCOUNT 和 FLIPCLASS_PASSWORD
```

`.env` 已列在 `.gitignore`，不會被 commit。

```powershell
python flipclass_homework.py           # 產生報表並用瀏覽器打開
python flipclass_homework.py --no-open # 只產生報表
```

如果帳號已在其他地方登入，腳本會選「保持登入」，不會把其他裝置踢掉。

---

## 說明

- 資料來源是每門課的 `/course/homeworkList/{課程ID}` 頁面。
- 列表上的日期沒有年份，工具依目前學期推算；只有日期沒時間的期限視為當天 23:59。
- 目前只處理「作業」，不含測驗和問卷。

## 授權

[MIT](LICENSE)
