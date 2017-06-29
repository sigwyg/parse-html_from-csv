const fs = require('fs');
const csv = require('csv');
const htmlparser = require("htmlparser2");
const cheerio = require('cheerio');
const execSync = require('child_process').execSync;
//const execSync = require('child_process').exec;

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
    if (err) throw err;
    // columns: true でObjectになる。Arrayのままのが速いかも？
    csv.parse(data, {columns: true}, (err, output) => {
        if (err) throw err;
        if(!output[0].hasOwnProperty('post_id') || !output[0].hasOwnProperty('post_type') || !output[0].hasOwnProperty('post_content')) {
            console.warn('ヘッダにpost_id, post_type, post_contentが必要です');
            process.exit(1);
        }

        let tag_cnt = {
            open: 0,
            close: 0,
        };
        const parser_html = new htmlparser.Parser({
            onopentag: (name, attr) => tag_cnt.open++,
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
        const filter_links = {
            siteA: [],
            siteB: [],
            domains: {}
        };
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
             *  - WordPressの改ページコメント<!--nextpage-->の位置をみて編集する
             *  - コメントノードの取得はできるが前後関係を掴むのが難しいので、spanに変換する
             *    -> prev/next/siblingsだと、改行がtext nodeとしてカウントされるため
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
             * linkの検出
             *  - ページ内リンク等もあるので除外
             *  - 短縮URLの展開
             *  - 特定ドメインへのリンクを含む、記事IDを記録
             */
            const links = $('a');
            if (links){
                links.each((i, elem) => {
                    let url = $(elem).attr('href');
                    if(!url) return;

                    // 短縮URLがあれば展開する
                    const regexp = /https?:\/\/goo.gl/;
                    if (regexp.test(url)) {
                        url = execSync(`curl -I -s ${url} | grep -i Location | cut -d ' ' -f 2`).toString();
                    }

                    // (展開後の)domainを取る
                    const regexp_domain = /https?:\/\/[^/]+/;
                    const domain = regexp_domain.exec(url);
                    if (domain == null) return;

                    // domain毎に集計取る
                    domain[0] in filter_links.domains
                        ? filter_links.domains[domain[0]]++
                        : filter_links.domains[domain[0]] = 1
                        ;

                    // 対象ドメインがあれば記事IDを記録
                    switch (domain[0]) {
                        case 'https://example.jp':
                            filter_links.siteA.push(entry.post_id);
                            break;
                        case 'http://example.com':
                            filter_links.siteB.push(entry.post_id);
                            break;
                    }
                });
            }

            // 編集済みデータを出力用に記録
            csv_new.push([entry.post_id, entry.post_type, entry.post_content]);
        });
        parser_html.end();
        console.timeEnd('csv_foreach');

        /**
         * domainをカウント数で並べ換える
         */
        const cnt_domains = Object.keys(filter_links.domains).sort((a,b) => {
            return filter_links.domains[a]-filter_links.domains[b]
        });
        cnt_domains.forEach((url) => console.log(filter_links.domains[url], url));

        /**
         * 記事IDの重複を削除
         */
        console.log(filter_links.siteA.length, "/", filter_links.siteB.length);
        filter_links.siteA = Array.from(new Set(filter_links.siteA));
        filter_links.siteB = Array.from(new Set(filter_links.siteB));
        console.log(filter_links.siteA.length, "/", filter_links.siteB.length);

        /**
         * CSVに書き出す
         *  - csv.stringify()を噛ませてエスケープする
         */
        const columns = {
            id: 'post_id',
            type: 'post_type',
            content: 'post_content'
        };
        csv.stringify(csv_new, {header: true, columns: columns}, (err, output) => {
            if (err) throw err;
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
