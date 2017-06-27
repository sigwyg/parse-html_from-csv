const fs = require('fs');
const csv = require('csv');
const htmlparser = require("htmlparser2");
const cheerio = require('cheerio');

/**
 * Docs
 *  - CSV: http://csv.adaltas.com/
 *  - fs: https://nodejs.org/api/fs.html
 *  - cheerio: https://github.com/cheeriojs/cheerio
 */

// ファイル名を引数から取得
const file = process.argv[2];
if (!process.argv[2] || process.argv[2] == '-') {
    console.warn("引数にCSVファイル名を指定して下さい。");
    process.exit(1);
}

// CSVファイルを読む
const input = fs.readFile(file, (err, data) => {
    // columns: true でObjectになる。Arrayのままのが速いかも？
    csv.parse(data, {columns: true}, (err, output) => {
        let tag_cnt = {
            open: 0,
            close: 0,
        };
        const parser_html = new htmlparser.Parser({
            onopentag: (name, att) => tag_cnt.open++,
            onclosetag: (name) => tag_cnt.close++,
            onerror: (err) => console.log(err),
            ontext: (text) => { /*console.log(text);*/ },
            oncomment: (data) => { /*console.log(data);*/ },
            onprocessinginstruction: (name, data) => {
                // <?php とか
                //console.log(data);
            },
        }, {decodeEntities: true});

        // execute
        console.time('csv_foreach');
        const csv_new = [];
        output.forEach(entry => {
            // 入れ子問題の記事チェック
            tag_cnt = { open: 0, close: 0 };
            parser_html.write(entry.post_content);
            if(tag_cnt.open !== tag_cnt.close){
                console.log(entry.post_id, "-------------------------------------------------------");
                console.log(tag_cnt);
            }

            /**
             * 見出し直後の改ページの検出
             *  - コメントノードを掴むのが難しいので、spanに変換する
             *  - prev/next/siblingsだと、改行がtext nodeとしてカウントされるため
             *  - decodeEntities: trueだと、日本語文字が変換されてしまうためfalseにしている
             *  - loadsすると<html><body>が補完されているため、出力時にはbody.html()を渡す
             */
            entry.post_content = String(entry.post_content).replace(/<!--nextpage-->/g, '<span class="nextpage"></span>')
            const $ = cheerio.load(entry.post_content, { decodeEntities: false });
            const nextpage = $(".Blue.Ttl + .nextpage");
            if (nextpage.length > 0) {
                nextpage.prev().before('<!--nextpage-->');
                $(".Blue.Ttl + .nextpage").remove();
                entry.post_content = $("body").eq(0).html();
            }
            entry.post_content = String(entry.post_content).replace(/<span class="nextpage"><\/span>/g, '<!--nextpage-->')
            /**
             * for debug
             *  - Objectを色付きで出力
             *  - depth: nullだと超重いので注意
            if (entry.post_id == 23361) {
                console.dir(nextpage, {depth: null, colors: true});
            }
             */

            // push new data
            csv_new.push([entry.post_id, entry.post_type, entry.post_content]);
        });
        parser_html.end();
        console.timeEnd('csv_foreach');

        // for the "header" option
        const columns = {
            id: 'post_id',
            type: 'post_type',
            content: 'post_content'
        };
        // csv用にエスケープする
        csv.stringify(csv_new, {header: true, columns: columns}, (err, output) => {
            // save file
            fs.writeFile('./output.csv', output, 'utf8', err => {
                if (err) {
                    console.log('Some error occured - file either not saved or corrupted file saved.');
                } else{
                    console.log('It\'s saved!');
                }
            });
        });
    });
});
