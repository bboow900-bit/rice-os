# 水彩素材の棚卸しと見本

2026-11-21。参照元は現在の作業ツリー。公開中のPWAと同一ではない。水彩見本は組み込み前の方向確認用で、生成ツールへの指示は「承認原画の筆のにじみと紙目を保ち、作業・機械・生育の違いを描き分ける」。

| 用途 | 現行素材（assets/images 配下） | 参照先 |
| --- | --- | --- |
| ホームの季節画 | ui-pop/rice-sowing、rice-transplanter、rice-growing-watercolor、rice-combine、rice-processing、rice-winter | season-art.js。暦月で選択 |
| 共通の稲穂・背景 | ui-pop/harvest-rice、rice-hero-karte2.jpg、CSS内の稲SVG | 画面見出し・既存CSS |
| 年間履歴と収穫 | annual-story/schedule-planting、schedule-herbicide、schedule-harvest、watercolor-panicle-check、watercolor-heading-paddy、watercolor-mowing、watercolor-fertilizer、watercolor-spraying、watercolor-drying | annual.js。収穫画は年比較と見通しにも共用 |
| ホームの生育 | rice-stages/rice-stage-01〜08 | home.js |
| 圃場カードの株 | rice-stages/rice-card-clump-01〜08 | fields.js |
| 水管理・圃場履歴の田面 | rice-stages/rice-paddy-tile-01〜08 | irrigation.js、annual.js |
| 振り返り・見通しの生育 | rice-stages/review-seedling、review-tillering、review-booting、review-heading、review-ripening、review-mature | annual.js、outlook.js |
| 資材・除草 | material-review/materials-rice、rice-weeds | 使用資材、資材・除草画面 |
| ナビ・作業・機械 | light-icons/farm-calendar、farm-masters、karte-notebook、paddy-field、rice-clump、rice-panicle、rice-sack、fertilizer-bag、seedling-tray、transplanter-light、tractor-puddling、mowing-worker、spraying-worker、dry-paddy、water-channel | ナビと各作業画面で共用 |
| 管理メニュー | menu-icons/dry-period、field-master、harvest、herbicide-program、irrigation、maintenance、materials、photos、recipe、transplanter | 管理・圃場の関連メニュー |
| PWAアイコン | assets/icons/rice-sun-v1-32、180、192、512 | favicon、Apple、インストール、通知 |

現行参照と区別するもの：旧生育画、旧年間履歴画、水門・足跡・ひび割れの一部はキャッシュ登録のみ。paddy-day、旧出穂候補、元スプライト、旧アプリアイコンは現行参照なし。記録写真・操作記号は描き直さない。

## サンプル

- [季節・生育・作業](watercolor-scenes-samples.png)：上から季節6景、生育6場面、主要作業・水管理、管理用途。
- [ナビ・水管理・機械・管理](watercolor-icons-samples.png)：上からナビ、小さな資材・水管理、機械・写真、その他・PWA。

見本は画風と構図の確認用で、現行ファイルごとの完成素材ではない。生育の8段階セットは個別起こしが必要。折りたたんだコンバインのオーガ、田植機の苗載台、圃場全体の出穂割合、乾燥機と籾摺り機、入水と落水は組み込み前に個別確認する。
