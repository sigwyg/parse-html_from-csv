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
const file = process.argv[2];
if (!process.argv[2] || process.argv[2] == '-') {
    console.warn("引数にCSVファイル名を指定して下さい。");
    process.exit(1);
}

const input = fs.readFile(file, (err, data) => {
    // columns: true でObjectになる。Arrayのままのが速いかも？
    csv.parse(data, {columns: true}, (err, output) => {
        let tag_cnt = {
            open: 0,
            close: 0,
        };
        const parser_html = new htmlparser.Parser({
            onopentag: (name, att) => {
                //console.log(name);
                tag_cnt.open++
            },
            onclosetag: (name) => {
                //console.log("/" + name);
                tag_cnt.close++
            },
            onerror: (err) => console.log(err),
            ontext: (text) => { /*console.log(text);*/ },
            oncomment: (data) => { /*console.log(data);*/ },
            onprocessinginstruction: (name, data) => {
                // <?php とか
                //console.log(data);
            },
        }, {decodeEntities: true});

        // execute
        const csv_new = [];
        output.forEach(entry => {
            tag_cnt = { open: 0, close: 0 };
            parser_html.write(entry.post_content);

            // 入れ子問題の記事チェック
            if(tag_cnt.open !== tag_cnt.close){
                console.log(entry.post_id + "-------------------------------------------------------");
                console.log(tag_cnt);
            }

            // コメントノードを掴むのが難しいので、spanに変換する
            entry.post_content = String(entry.post_content).replace(/<!--nextpage-->/g, '<span class="nextpage"></span>')
            // decodeEntities: trueだと、日本語文字が変換されてしまうため
            const $ = cheerio.load(entry.post_content, { decodeEntities: false });
            // 見出し直後の改ページの検出
            // prev/next/siblingsだと、改行がtext nodeとしてカウントされるため
            const nextpage = $(".Blue.Ttl + .nextpage");
            if (nextpage.length > 0) {
                nextpage.prev().before('<!--nextpage-->');
                $(".Blue.Ttl + .nextpage").remove();
                // <html><body>が補完されているため
                entry.post_content = $("body").eq(0).html();
            }

            // コメントに戻す
            entry.post_content = String(entry.post_content).replace(/<span class="nextpage"><\/span>/g, '<!--nextpage-->')

            // push new data
            csv_new.push([entry.post_id, entry.post_type, entry.post_content]);
        });
        parser_html.end();

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
