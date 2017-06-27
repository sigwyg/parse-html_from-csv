## TL;DR

1. Nodeで実装したHTML・CSV parser
1. CSVの読込・書込する
2. HTML中の特定の位置にあるコメントを入れ替える。

現状の用途は限定的。CSV parserとHTML parser実装の参考程度に。  
そもそもはWordPressプラグインから吐き出した記事データのCSVファイルが対象

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
