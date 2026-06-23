# GitHub Pages公開手順

GitHub Pagesに置くと、PCのローカルサーバーを止めてもスマホから開けます。

## 1. GitHubにリポジトリを作る

GitHubで新しいリポジトリを作ります。

おすすめ名:

```text
rice-os
```

公開してよいのはアプリ本体だけです。アプリから保存したJSONバックアップは、圃場情報を含むのでアップロードしないでください。

## 2. ファイルをアップロードする

最低限アップロードするもの:

```text
index.html
mobile.html
manifest.webmanifest
service-worker.js
.nojekyll
assets/
tools/
README.md
GITHUB_PAGES.md
```

古い参考HTMLを残しても動作には影響しませんが、公開用には上のファイルだけで十分です。

## 3. Pagesを有効にする

GitHubのリポジトリ画面で次を選びます。

```text
Settings -> Pages -> Build and deployment
Source: Deploy from a branch
Branch: main
Folder: /root
Save
```

数分後に次のようなURLが発行されます。

```text
https://<GitHubユーザー名>.github.io/rice-os/
```

## 4. 公開URL用のQRを作る

公開URLが出たら、このフォルダで次を実行します。

```powershell
python tools\make_mobile_qr.py https://<GitHubユーザー名>.github.io/rice-os/
```

`rice_os_mobile_qr.png` が公開URL用に上書きされます。

## 5. スマホに入れ直す

新しいQRをスマホで開き、Chromeのメニューから「ホーム画面に追加」を選びます。

HTTPS公開後は、現在地取得とPWA機能がローカルHTTPより安定します。

## あとから直すとき

画面ごとの処理は `assets/js/screens/` に分かれています。

よく触る場所:

```text
assets/css/app.css              画面レイアウト、スマホ表示
assets/js/screens/home.js       ホーム、小梅アシスタント
assets/js/screens/field-work.js 圃場作業入力
assets/js/core/weather.js       天気取得
assets/js/core/storage.js       JSON保存・復元、localStorage
```

小さな不便は、該当画面のファイルだけを直して反映できます。
