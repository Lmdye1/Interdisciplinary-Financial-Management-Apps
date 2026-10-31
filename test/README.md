# テストの実行

## 準備

Node.js 18 以降を用意し、リポジトリのルートで依存パッケージをインストールします。

```sh
npm install
```

## 実行

```sh
node test/run-tests.js path/to/strict-validation.html
```

HTMLファイルのパスは実際のテスト対象に置き換えてください。テストは `jsdom` 上で入力検証、計算結果、材料行操作、保存データの耐障害性、400 ケースのランダム照合を確認します。

## 対象HTMLについて

このテストスイートは、`Validators`、`ingredientRows`、`globalErrorBanner` などのIDを持つ厳格入力検証版HTMLを前提にしています。現行の `index.html` は画面構成・計算モデルが異なるため、現行アプリの統合テストとして実行するには、テスト項目を現行のUIと計算仕様に合わせて調整する必要があります。この差異を無視してテスト成功と判定しないでください。
