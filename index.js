var fs = require('fs');
var csv = require('csv');
var htmlparser = require("htmlparser2");

var input = fs.readFile('./ee37e951f5fca269cefbaf6a21d4c4a8.csv', function(err, data){
    // columns: true でObjectになる。Arrayのままのが速いかも？
    csv.parse(data, {columns: true}, function(err, output) {
        var tag_cnt = {
            open: 0,
            close: 0,
        };
        var parser_html = new htmlparser.Parser({
            onopentag: function(name, att) {
                //console.log(name);
                tag_cnt.open++
            },
            onclosetag: function(name) {
                //console.log("/" + name);
                tag_cnt.close++
            },
            ontext: function(text) {
                //console.log(text);
            },
            onerror: function(err){
                //console.log(err);
            },
            oncomment: function(data) {
                //console.log(data);
            },
            onprocessinginstruction: function(name, data) {
                // <?php とか
                //console.log(data);
            },
        }, {decodeEntities: true});

        // execute
        // id: 23361が入れ子問題の記事

        var csv_new = [];
        output.forEach(function(entry){
            tag_cnt = {
                open: 0,
                close: 0,
            };
            parser_html.write(entry.post_content);
            if(tag_cnt.open !== tag_cnt.close){
                console.log(entry.post_id);
                console.log(tag_cnt);
            }
            if(entry.post_id == 23361) {
                //console.log(entry.post_content);
                //console.log(tag_cnt);
            };

            // push new data
            csv_new.push([entry.post_id, entry.post_type, entry.post_content]);
        });
        parser_html.end();

        // for the "header" option
        var columns = {
            id: 'post_id',
            type: 'post_type',
            content: 'post_content'
        };
        // The stringifier receive an array and return a string inside a user-provided callback.
        csv.stringify(csv_new, {header: true, columns: columns}, function(err, output){
            // save file
            fs.writeFile('./formList.csv', output, 'utf8', function (err) {
                if (err) {
                    console.log('Some error occured - file either not saved or corrupted file saved.');
                } else{
                    console.log('It\'s saved!');
                }
            });
        });
    });
});
