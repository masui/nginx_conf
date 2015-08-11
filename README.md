# MacでPico用にNginxを動かす設定

* http://hoppie.hatenablog.com/entry/2015/01/06/213518
* ゼロからコンパイル
* `./configure  --with-http_sub_module --with-http_ssl_module --with-ipv6`
* /usr/local/nginx の下に全部入る
* /usr/local/nginx/confの下にconfを入れる
* /usr/local/nginx/htmlの下にproxyを入れる
