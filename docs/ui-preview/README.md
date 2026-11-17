# 資材・除草の振り返り：途中確認

状態：このフォルダーは承認済みの途中確認画面を保存したものです。承認後の本体実装・確認結果は `docs/MATERIAL_REVIEW.md` を参照してください。以下の未統合・未完成の記載は途中確認時点の記録です。

- 本番の年間履歴・下部ナビ・保存処理には未統合。
- 体系と実績・使用資材の詳細、観察入力・保存・削除の導線は未完成。
- プレビューはブラウザーのlocalStorageを文書内のメモリー実装へ差し替える。仮データを実際の保存領域へ混ぜない。
- 仮の観察内容は入力された文字列として表示し、資材使用や残草の記録から効果を自動判断しない。
- 観察表は既存項目に合わせ「観察日」「確認した雑草」。参考画像の「残った場所」という保存項目は追加していない。
- 基準画像との残差：ヘッダーの絵と工程の矩形表示。これを含む追加調整は承認後。

## ファイル

- 基準：`docs/ui-preview/material-review-approved.png`
- 横並びの実画面：`docs/ui-preview/material-review-midpoint-comparison.png`
- 入口・結果の実画面：`docs/ui-preview/material-review-entry-360.png` / `material-review-entry-390.png` / `material-review-result-360.png` / `material-review-result-390.png`
- 操作確認：`docs/ui-preview/material-review-midpoint.html`
- 実装用部品：`assets/js/ui/material-review.js` / `assets/css/material-review.css`
- 画像：`assets/images/material-review/materials-rice.png` / `assets/images/material-review/rice-weeds.png`

## 確認

`tools/check_material_review_midpoint_primary.cjs` は360 / 390pxの入口→結果→戻る、画像ロード、横溢れ、未完成機能の無効化、実Storageの保護を確認。
`tools/verify_material_review.js` は圃場・年度・実績リンク・旧体系・保存名・観察の出所・表示時の非更新を確認。
独立した表示確認は `tools/check_material_review_mobile.cjs`。

## 画像生成

標準の `image_gen` ツールを使用。承認されたUI画像をスタイル参照とし、透過PNGを生成した。画面自体のスクリーンショットは生成画像ではなくHTML/CSSのブラウザー描画。

materials-rice.png のプロンプト：

> Create ONE standalone transparent-background botanical UI illustration, NOT a UI screen. Reference image is a STYLE AND SUBJECT reference only: match the charming hand-painted rice seedlings with a paper fertilizer sack in the left lower entry card of this approved rice farming app mockup. Reproduce that illustration subject closely: a cluster of fresh green rice seedlings growing from a small subtle patch of soil, a tan kraft-paper fertilizer sack in front on the right with a simple green leaf motif and a few pale granules at its base. Warm refined watercolor/gouache, natural detailed narrow rice leaves with yellow-green highlights, crisp readable silhouette, no black outlines, no cartoon faces, no brand text, no letters, no labels, no border or card, no entire screen. Medium-density fine details still visible at 120px. The illustration should fill almost the entire canvas with only a small transparent margin, fully visible uncropped leaves and sack. Fresh green with restrained rice gold and warm sack tones. Genuine alpha transparency, no white painted background and no shadows extending far from subject. This is a reusable UI asset intended to match the supplied approved design closely.

rice-weeds.png の最終修正プロンプト：

> Edit this botanical illustration. KEEP the rice plant, golden rice panicles, green leaves, few smaller weeds and narrow soil patch unchanged. REMOVE every colored background wash, luminous halo, blurry yellow-green glow, gradient, vignette and atmosphere around and between the plants. Output ONLY crisp naturally hand-painted plants and the small soil base on a completely transparent alpha background, including transparent holes between the leaves and stems. This is a clean reusable cutout for a WHITE app screen. No shadow behind plants, no glow anywhere, no bokeh, no colored fill behind leaves. Preserve natural watercolor texture only inside actual leaf, stem, grain and soil shapes. Every non-subject pixel must be transparent. Do not add text or any other elements.
