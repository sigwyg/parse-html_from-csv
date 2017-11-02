## TL;DR

1. Nodeで実装したHTML&CSV parser
1. CSVを読込・書込する
2. HTML中の特定の位置にあるコメントを入れ替える。

現状の用途は限定的。  
主にWordPressの記事データをCSV出力したファイルから、不要なタグを削除したり、非推奨タグを置換したり、といった清掃作業に使われている。

CSV parserとHTML parser実装の参考程度に。

## Install

```
git pull https://github.com/sigwyg/parse-html_from-csv.git
npm install
```

## Usage

```
node index.js input.csv
```

解析したいCSVファイルを引数として渡すと、編集結果が `output.csv` として出力されます。
