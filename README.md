# 稲作OS Stable

稲作管理Webアプリ「稲作OS」の安定版です。

## 起動

ローカル確認:

```powershell
python -m http.server 8001
```

スマホや別端末から確認する場合は、同じWi-Fi内でPCのIPアドレスを使って `mobile.html` を開きます。

## GitHub Pages

PCを起動していなくてもスマホから使うには、GitHub PagesなどのHTTPS公開先へ置きます。手順は [GITHUB_PAGES.md](GITHUB_PAGES.md) を参照してください。

## データ

入力データはブラウザ内の `localStorage` に保存されます。GitHubに公開しても、作業記録や圃場データが自動でGitHubへ送られることはありません。

大事な作業後は、アプリの「データ管理」からJSON保存を行ってください。
