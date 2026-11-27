# STUST Flipclass Assistant

南臺科技大學 [FlipClass](https://flipclass.stust.edu.tw/) 優化輔助插件

<br>

## 安裝方法（電腦 Chrome / Edge）

### 方法 A：Tampermonkey

A-1. 安裝 Tampermonkey 擴充功能：

- Chrome：<https://chromewebstore.google.com/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo>
- Edge：<https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd>

A-2. 打開下面的網址，Tampermonkey 會跳出安裝畫面，按「安裝」：

<https://raw.githubusercontent.com/Creeperlol/STUST-Flipclass-Assistant/main/extension/flipclass-assistant.user.js>

A-3. 打開 [FlipClass](https://flipclass.stust.edu.tw/) 並登入。

腳本更新後，Tampermonkey 會自動更新。

<br>

### 方法 B：直接載入擴充功能

B-1. 到 [Releases](https://github.com/Creeperlol/STUST-Flipclass-Assistant/releases/latest) 下載最新版本 `(Latest)`，下載後解壓縮。

B-2. 打開 `chrome://extensions`（Edge 是 `edge://extensions`），開啟右上角的「開發人員模式」。

B-3. 按「載入未封裝項目」，選擇解壓縮出來的 `stust-flipclass-assistant` 資料夾。

B-4. 打開 [FlipClass](https://flipclass.stust.edu.tw/) 並登入。

> 方法 B 不會自動更新，有新版時到 Releases 重新下載，覆蓋原本的資料夾，再到擴充功能頁點擊「重新載入」。
>
> 想用還沒發布 Release 的最新版，可以改成下載這個 repo（**Code** → **Download ZIP**），選裡面的 `extension` 資料夾。

<br>

## 說明

本插件為南臺科技大學 FlipClass 數位學習平台的輔助插件，旨在提供更便捷的功能與優化等。
本插件為個人製作的非官方工具，與南臺科技大學及 FlipClass 平台沒有任何關係，也未經其授權或背書。
FlipClass、南臺科技大學名稱、標誌及網站內容，版權與商標均屬於其各自的權利人。
插件只會讀取已登入的 FlipClass 頁面，不需要也不會儲存帳號密碼。
所有資料（作業快取、頭像、設定）等都只存在使用者自身的瀏覽器，不會傳送到其他伺服器。

<br>

## 授權

[MIT](LICENSE)
