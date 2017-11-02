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

// タグチェック用
class Tags {
  constructor(keys = {}) {
    this.open = 0,
    this.close = 0,
    this.tag_open = {},
    this.tag_close = {}
  }
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

        // ToDo: HTML sanitize
        const regexp_notags = /^[^a-z]/;
        const parser_html = new htmlparser.Parser({
            onopentag: (name, attr) => {
                if (!regexp_notags.test(name)) {
                    name in tag_cnt.tag_open ? tag_cnt.tag_open[name]++
                                             : tag_cnt.tag_open[name] = 1 ;
                    tag_cnt.open++;
                }
            },
            onclosetag: (name) => {
                if (!regexp_notags.test(name)) {
                    name in tag_cnt.tag_close ? tag_cnt.tag_close[name]++
                                              : tag_cnt.tag_close[name] = 1 ;
                    tag_cnt.close++;
                }
            },
            onerror: (err) => console.log(err),
            ontext: (text) => { /*console.log(text);*/ },
            oncomment: (data) => { /*console.log(data);*/ },
            onprocessinginstruction: (name, data) => {
                // <?php とか
                //console.log(name, data);
            },
        }, {decodeEntities: true});

        // execute
        console.log('start!');
        console.time('csv_foreach');
        const filter_links = {
            domains: {}
        };
        const csv_new = [];
        output.forEach(entry => {
            tag_cnt = new Tags();
            parser_html.write(entry.post_content);

            /**
             * 入れ子問題の記事チェック
             *  - 開始タグと終了タグの数が合わなければ、崩れていると見做す
             */
            if(tag_cnt.open !== tag_cnt.close){
                console.log("id:", entry.post_id, "broken! --------------------------------------------------");
                console.log(tag_cnt);
            }

            /**
             * タブをスペースに変換
             */
            entry.post_content = String(entry.post_content).replace(/\t/g, '  ');

            /**
             * - 閉じタグ前の改行・空白を削除
             * - <?php ... ?>を消す
             * - 空のtitleを消す
             * - 偶然入ってしまった？特殊文字を消す
             */
            entry.post_content = String(entry.post_content).replace(/[\s]*?(<\/.*?>)/g, '$1');
            entry.post_content = String(entry.post_content).replace(/<\?php.*?\?>/g, '');
            entry.post_content = String(entry.post_content).replace(/‎/g, '');
            entry.post_content = String(entry.post_content).replace(/title=""/g, '');
            entry.post_content = String(entry.post_content).replace(/\s?class=""/g, '');

            /**
             * <strong>を減らす
             *
             *  <span><strong><a href="">...
             *  -> <a href="">...
             *
             */
            entry.post_content = String(entry.post_content).replace(/<strong>\s*?(<a.*?>)/g, '$1');
            entry.post_content = String(entry.post_content).replace(/<\/a>[\s]*?<\/strong>/g, '</a>');
            entry.post_content = String(entry.post_content).replace(/<strong>\s*?(<span.*?><a.*?>)/g, '$1');
            entry.post_content = String(entry.post_content).replace(/<\/a>\s*?<\/span>\s*?<\/strong>/g, '</a></span>');

            /**
             * 不適切なnextpageの整形
             *
             * <!--nextpage--><!--nextpage-->
             * <h2><!--nextpage--></h2>
             *
             */
            entry.post_content = String(entry.post_content).replace(/<!--nextpage--><!--nextpage-->/g, '<!--nextpage-->');
            entry.post_content = String(entry.post_content).replace(/<h2><!--nextpage--><\/h2>/g, '<!--nextpage-->');

            /**
             *  decodeEntities: trueだと、日本語文字が変換されてしまうためfalseにしている
             */
            const $ = cheerio.load(entry.post_content, { decodeEntities: false });

            /**
             * 見出し直後の改ページの検出と置換
             *  - WordPressの改ページコメント<!--nextpage-->の位置をみて編集する
             *  - <!--nextpage-->はspanに変換されている
             *
             *  <div class="Blue Ttl">
             *    <h2>"今年の目標"の意味とは？</h2>
             *    <div class="TtlBottom"></div>
             *  </div><!--nextpage-->
             *  -> <!--nextpage--><div class="Blue Ttl"> ...
             *
             * コメントノードの取得はできるが前後関係を掴むのが難しいので、spanに変換する
             *  -> prev/next/siblingsだと、改行がtext nodeとしてカウントされるため

            entry.post_content = String(entry.post_content).replace(/<!--nextpage-->/g, '<span class="nextpage"></span>');
            $(".Blue.Ttl + .nextpage").each(function(i, elem) {
                $(elem).insertBefore($(elem).prev());
            })
            entry.post_content = String(entry.post_content).replace(/<span class="nextpage"><\/span>/g, '\n<!--nextpage-->\n');
             */

            /**
             * 見出しブロックの変換
             *
             *  <div class="Blue Ttl">
             *    <h2>"今年の目標"の意味とは？</h2>
             *    <div class="TtlBottom"></div>
             *  </div>
             *
             *  -> <h2>"今年の目標"の意味とは？</h2>
             *
             */
            $(".Blue.Ttl").each(function(i, elem) {
                $(elem).replaceWith( $(elem).find("h2") );
            })

            /**
             * 非推奨タグの置換
             *
             * <font color="#ff0000">
             *  -> <em style="color:#ff0000;">
             *
             * <center>
             *  -> <div class="center">
             *
             */
            $("font").each(function(i, elem) {
                $(elem).replaceWith('<em style="color: ' + $(elem).attr('color') + ';">' + $(elem).html() + '</em>');
            })
            $("center").each(function(i, elem) {
                $(elem).replaceWith('<div class="center">' + $(elem).html() + '</div>');
            })


            /**
             * imgのtitle属性を代替テキストとしている箇所を修正
             *
             * <img alt="" title="xxxの画像">
             *  -> <img alt="xxxの画像">
             *
             */
            $("img").each(function(i, elem) {
                const title = $(elem).attr('title');
                const alt = $(elem).attr('alt');
                if (title && alt == '') {
                    $(elem).attr('alt', title);
                    $(elem).removeAttr('title');
                }
                if (title == alt) {
                    $(elem).removeAttr('title');
                }
            })


            /**
             * 強調目的の見出しタグを削除
             *
             * <div id=""box""><h4> ... </h4></div>
             * <div id=""box""><h4><div class="center"> ... </div></h4></div>
             *  -> ...
             *
             */
            $("#box").each(function(i, elem) {
                if( $(elem).find("h4 > .center").length > 0 ) {
                    $(elem).replaceWith( $(elem).find("h4 > .center").html() );
                }
                else if( $(elem).find("h4").length > 0 ) {
                    $(elem).replaceWith( $(elem).find("h4").html() );
                }
            })

            /**
             * タグの置換
             *
             * <div class=""TxtStyle""><h3> ... </h3></div>
             *  -> <h3 class="u-marker"> ... </h3>
             *
             */
            $(".TxtStyle").each(function(i, elem) {
                $(elem).find('h3').addClass('u-marker');
                $(elem).replaceWith( $(elem).html() );
            })

            /**
             * 過剰な装飾用タグの調整
             *
             * <div class=""Img1Col cf"">
             *     <div class=""PhotoBg""><div class=""Photo div1077"">
             *     <a href=""/wp-content/uploads/1aa3f84abb25d49b8ed243c3170a5eae.jpg""><img src=""/wp-content/uploads/1aa3f84abb25d49b8ed243c3170a5eae.jpg"" alt=""質問"" width=""1024"" height=""683"" class=""alignnone size-full wp-image-19451""></a>
             *     </div></div>
             * </div>
             * ↓
             * <div class=""photoFrame"">
             *     <a href=""/wp-content/uploads/1aa3f84abb25d49b8ed243c3170a5eae.jpg""><img src=""/wp-content/uploads/1aa3f84abb25d49b8ed243c3170a5eae.jpg"" alt=""質問"" width=""1024"" height=""683""></a>
             * </div>
             *
             */
            $(".Img1Col > .PhotoBg").each(function(i, elem) {
                $(elem).parent().toggleClass('Img1Col cf photoFrame');
                $(elem).replaceWith( $(elem).find('a') );
            })

            /**
             * <tr style="background: #cccccc;"><td>
             * ↓
             * <tr><th>
             */
            $("tr[style*='background']").each(function(i, elem) {
                $(elem).find("td").each(function(i, elem){
                    $(elem).replaceWith('<th>' + $(elem).html() + '</th>');
                });
                $(elem).removeAttr("style");
            })

            /**
             * classのないspanの削除
             *
             * <span class="hoge">ssss</span>
             * <span>sss</span>
             * ↓
             * <span class="hoge">ssss</span>
             * sss
             *
             */
            $("span:not([class])").each( function(i, elem){
                $(elem).replaceWith( $(elem).html() );
            });

            /**
             * 無意味なclassを消す
             *
             *  <p class=""p1"">
             *  <span class=""s1"">
             *  <h2 class=""p1"">
             *
             */
            $(".p1").removeClass("p1");
            $(".p3").removeClass("p1");
            $(".s1").removeClass("s1");

            /**
             * style属性の削除
             * - strong style="line-height: 1.5;"
             * - span style="font-weight: 400;"
             * - span style="letter-spacing: 1px;"
             * - span style="color: #000000;"
             * - span style="color: #0000FF;"
             * - img style="font-size: 15px;"
             * - img style="'ヒラギノ角ゴ ProN W3', 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ Pro W3', 'Hiragino Kaku Gothic Pro', メイリオ, Meiryo, 'ＭＳ Ｐゴシック', 'MS PGothic', sans-serif;"
             * - div style="{width:100px;height:20px;float:left;}"
             * - tr style="height: 25px;"
             */
            $("*[style]").each( function(i, elem){
                if(elem.name !== 'table' && elem.name !== 'td') {
                    //if(elem.attribs.style.indexOf('text-align')) {
                        //console.log(elem.name, elem.attribs.style, typeof elem.name);
                        $(this).removeAttr("style");
                    //}
                }
            });

            /**
             * タグ削除
             */
            $(".fb-like").remove();
            $(".fb-comments").remove();
            $(".fb-root").remove();
            $(".iinen").remove();
            $(".twitter-share-button").remove();
            $("script").remove();
            $("span:empty").remove();
            $("div:empty").remove();
            $("p:empty").remove();
            entry.post_content = String(entry.post_content).replace(/<p>\s*?<\/p>/g, '');
            entry.post_content = String(entry.post_content).replace(/<p>&nbsp;<\/p>/g, '');
            entry.post_content = String(entry.post_content).replace(/<span>\s*?<\/span>/g, '');
            entry.post_content = String(entry.post_content).replace(/<div>\s*?<\/div>/g, '');

            /**
             * データの収集
             */
            const heading_count = $('h2').get().length;

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

                    // href がなければタグ削除
                    // アンカーリンクも消す
                    if(!url) {
                        $(elem).replaceWith( $(elem).html() );
                        return;
                    };

                    // titleとリンクテキストが同文ならtitle削除
                    const title = $(elem).attr('title');
                    const text = $(elem).text();
                    if(new RegExp(title).test(text) || title == text) {
                        $(elem).removeAttr('title');
                    };

                    /**
                     *  href="href: http://...
                     */
                    const regexp_hrefhref = /href:\s*?(http.*?)/;
                    if (regexp_hrefhref.test(url)) {
                        url = String(url).replace(regexp_hrefhref, '$1');
                        $(elem).attr('href', url);
                    }

                    /**
                     * location.hrefの変換
                     *  - <a href="javascript:location.href = 'j1/column/naitei-no-6/‎3/';">内定が決まってから現在まで</a>
                     */
                    const regexp_script = /javascript:location.href\s*?=\s*?'(.*?)';/;
                    if (regexp_script.test(url)) {
                        url = String(url).replace(regexp_script, '$1');
                        $(elem).attr('href', url);
                    }

                    // 短縮URLがあれば展開する
                    const regexp = /https?:\/\/goo.gl/;
                    if (regexp.test(url)) {
                        url = execSync(`curl -I -s ${url} | grep -i Location | cut -d ' ' -f 2`).toString();
                        $(elem).attr('href', url);
                    }

                    // (展開後の)domainを取る
                    const regexp_domain = /https?:\/\/[^/]+/;
                    const domain = regexp_domain.exec(url);
                    if (domain == null) return;

                    // domain毎に集計取る
                    domain[0] in filter_links.domains ? filter_links.domains[domain[0]]++
                                                      : filter_links.domains[domain[0]] = 1;
                });
            }

            /**
             *  出力用にデータを戻す
             *  - loadすると<html><body>が補完されているため、出力時にはbody.html()を渡す
             */
            entry.post_content = $("body").eq(0).html();

            // 編集済みデータを出力用に記録
            csv_new.push([entry.post_id, entry.post_type, entry.post_content]);
        });
        parser_html.end();
        console.timeEnd('csv_foreach');

        /**
         * domainをカウント数で並べ換える
        const cnt_domains = Object.keys(filter_links.domains).sort((a,b) => {
            return filter_links.domains[a]-filter_links.domains[b]
        });
        cnt_domains.forEach((url) => console.log(filter_links.domains[url], url));
         */

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
