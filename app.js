function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

var settings = process.dhrcSettings;

if (!settings.mails.mailFromTitle) {
    settings.mails.mailFromTitle = settings.mails.title + '<' + settings.smtp.auth.user + '>';
}
if (!settings.httpURL) {
    settings.httpURL = 'http://' + settings.host + (settings.port == 80 ? '' : ':' + settings.port);
}
var unzip = require('unzip');
var csv = require('csv');
var stream = require('stream');
var util = require('util');
var mysql = require('mysql');
var path = require('path');
var nodemailer = require('nodemailer');
var smtpPool = require('nodemailer-smtp-pool');
var fs = require('fs');
var express = require('express');
var compress = require('compression');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var multiparty = require('multiparty');
var jade = require('jade');
var crypto = require('crypto');
var iconv = require('iconv-lite');

var mysqlPool = mysql.createPool(settings.mysql);

mysqlPool.callSP = function (spName, params, res, next, then, cleanUp) {
    this.query("call " + spName, params, function (err, returns) {
        if (err) {
            if (cleanUp) {
                cleanUp();
            }
            next(err);
            return;
        }
        if (returns.length === 0) {
            if (cleanUp) {
                cleanUp();
            }
            next(new Error("db error!"));
            return;
        }
        var response = {}, i = 0, l = returns.length, rows;
        while (i < l) {
            rows = returns[i];
            if (rows instanceof Array) {
                if (rows.length == 1) {
                    var row = rows[0];
                    if (row._type_ === 'array') {
                        response[row._field_] = returns[++i];
                    } else {
                        response[row._field_] = row;
                        delete row._type_;
                        delete row._field_;
                    }
                } else {
                    //error!
                }
            }
            i++;
        }
        if (then && !response.errors) {
            then(response);
            if (cleanUp) {
                cleanUp();
            }
        } else {
            if (cleanUp) {
                cleanUp();
            }
            res.json(response);
        }
    });
};

mysqlPool.callSql = function (next, sql, params, then) {
    var callback = function (err, returns) {
        if (err) {
            next(err);
        } else {
            then(returns);
        }
    };
    if (typeof params === 'function') {
        then = params;
        params = callback;
        callback = undefined;
    }
    this.query(sql, params, callback);
};

var mailTransport = nodemailer.createTransport(smtpPool(settings.smtp));

var app = express();
app.set("view engine", "jade");
// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(compress());
app.use(logger('[:date[iso]] :remote-addr :method :url :status :response-time ms',{
    skip: function (req, res) { return res.statusCode < 400 }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function extractParams(req) {
    var params = req.body || {};
    if (!params.sessionID) {
        params.sessionID = req.cookies.sessionID || 'x';
    }
    return params;
}

app.post('/api/userAutoLogin', function (req, res, next) {
    mysqlPool.callSP('user_auto_login(?)', extractParams(req).sessionID, res, next);
});

app.post('/api/userLogin', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_login(?,?,?)', [params.userName, params.password, params.autoLogin], res, next, function (response) {
        if (response.loginInfo) {
            res.cookie('sessionID', response.loginInfo.sessionID, {
                maxAge: (365 * 24 * 60 * 60 * 1000)
            });
        }
        res.json(response);
    });
});

app.post('/api/userLogout', function (req, res, next) {
    mysqlPool.callSP('user_logout(?)', extractParams(req).sessionID, res, next);
});


app.post('/api/cartGet', function (req, res, next) {
    mysqlPool.callSP('cart_get(?)', extractParams(req).sessionID, res, next);
});

app.post('/api/cartItemUpdate', function (req, res, next) {
    var params = extractParams(req);
    if (params.dateStart) {
        try {
            params.dateStart = new Date(params.dateStart);
        } catch (e) {
            params.dateStart = null;
        }
    }
    mysqlPool.callSP('cart_item_update(?,?,?,?,?,?)', [
        params.sessionID,
        params.orderID,
        params.orderVersion,
        params.gzhID,
        params.dateStart,
        params.days
    ], res, next);
});

app.post('/api/cartCommit', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('cart_commit(?,?,?,?,?)', [
        params.sessionID, params.orderID, params.orderVersion, params.artTitle, params.artSubject
    ], res, next, function (response) {
        if (response.commited) {
            var commited = response.commited;
            var files = response.files || [];
            commited.orderItems = response.orderItems || [];
            response.commited = {
                orderVersion: commited.orderVersion
            };
            delete response.orderItems;
            delete response.files;
            commited.ftd = function (d) {
                return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
            };
            commited.getGZHUrl = function (gzh) {
                if (gzh.openID) {
                    return encodeURI('http://weixin.sogou.com/gzh?openid=' + gzh.openID);
                } else {
                    return encodeURI('http://weixin.sogou.com/weixin?type=1&query=' + gzh.title);
                }
            };
            files.forEach(function (f) {
                f.filename = f.fileName;
                f.path = filePathOfOrder(commited.orderID, f.fileName);
                delete f.fileName;
                delete f.size;
            });

            commited.totalPrice = 0;
            commited.totalDays = 0;
            commited.orderItems.forEach(function (item) {
                commited.totalDays += item.days;
                commited.totalPrice += item.days * item.price;
            });

            mailTransport.sendMail({
                from: settings.mails.mailFromTitle,
                to: commited.userName,
                subject: "德合睿创 - 询价信息备查",
                html: jade.renderFile(path.join(__dirname, '/mail-tpl/cart-commit.jade'), commited)
            }, function (err, info) {
                if (err) {
                    console.log(err);
                }
                //??
            });
            mailTransport.sendMail({
                from: settings.mails.mailFromTitle,
                to: settings.mails.teller,
                subject: '询价申请 － ' + commited.userName,
                html: jade.renderFile(path.join(__dirname, '/mail-tpl/cart-teller.jade'), commited),
                attachments: files
            }, function (err, info) {
                if (err) {
                    console.log(err);
                }
                //??
            });
        }
        res.json(response);
    });
});


app.post('/api/gzhQuery', function (req, res, next) {
    var params = extractParams(req);
    var hasTypes = params.queryTypes && params.queryTypes.length > 0;
    mysqlPool.callSP('gzh_query_before(?,?,?,?)', [params.sessionID, params.orderID, params.orderVersion, !hasTypes], res, next, function (response) {
        function buildWhere() {
            var where = [];
            if (params.priceMin) {
                where.push(mysql.format('price>=?', params.priceMin));
            }
            if (params.priceMax) {
                where.push(mysql.format('price<?', params.priceMax));
            }
            if (hasTypes) {
                var types = [];
                params.queryTypes.forEach(function (type) {
                    if (type.selected) {
                        types.push(mysql.format('?', type.name));
                    }
                });
                if (types.length == 0) {
                    where.push('1=2');
                } else if (types.length !== params.queryTypes.length) {
                    where.push('type in (' + types.join(',') + ')');
                }
            }
            if (where.length > 0) {
                return ' where ' + where.join(' and ') + ' ';
            } else {
                return '';
            }
        }

        mysqlPool.callSql(next, 'select SQL_CALC_FOUND_ROWS id,code,title,type,fans / 10000 fans,rW,rM,price,notFA,hasLogo,openID from biz_gzh ' + buildWhere()
        + ' order by fans,id limit ?,?;select FOUND_ROWS() totalCount;', [params.offset, params.count], function (results) {
            response.gzhs = results[0];
            response.totalCount = results[1][0].totalCount;
            res.json(response);
        });
    });
});

app.post('/api/gzhSave', function (req, res, next) {
    var p = extractParams(req);
    mysqlPool.callSP('gzh_save(?,?,?,?,?,?,?)', [
        p.sessionID,
        p.id,
        p.notFA,
        p.title,
        p.code,
        p.type,
        p.fans,
        p.price
    ], res, next);
});

function toSqlValue(str, t) {
    var v;
    switch (t) {
        case 'n':
            if (!str) {
                break;
            }
            v = Number(str);
            if (isNaN(v)) {
                break;
            }
            return v;
        case 's':
            if (str === null || str === undefined) {
                break;
            }
            return str.trim();
        case 'sl':
            if (str === null || str === undefined) {
                break;
            }
            return str.trim().toLowerCase();
        case 'b':
            return str ? 1 : 0;
    }
    return null;
}

function importGZH(file, callback) {
    var importCount = 0;
    var importer = {
        dayRStart: 9,
        parseDays: function (r) {
            var start = this.dayRStart, i = 0, cMonth, cYear, m, d, dayStr, dayNum, days;
            while (i < start) {
                if (r[i]) {
                    break;
                }
                i++;
            }
            if (i < start) {
                return;
            }
            days = [];
            d = new Date();
            cYear = d.getFullYear();
            cMonth = d.getMonth() + 1;
            while (dayStr = r[start++]) {
                dayNum = /(\d+)[^0-9]+(\d+)/.exec(dayStr);
                m = dayNum && dayNum[1];
                d = dayNum && dayNum[2];
                if (!m || isNaN(m = Number(m)) || !d || isNaN(d = Number(d))) {
                    return;
                }
                if (m > cMonth) {
                    days.push(new Date(cYear - 1, m - 1, d));
                } else {
                    days.push(new Date(cYear, m - 1, d));
                }
            }
            this.days = days;
        }
    };

    function DBImporter() {
        stream.Writable.call(this, {
            objectMode: true
        });
        this.on('finish', function () {
            callback(undefined, importCount);
        });
        this.on('error', function (err) {
            callback(err, importCount);
        });
    }

    util.inherits(DBImporter, stream.Writable);
    function decodeFID(__biz) {
        if (!__biz) {
            return null;
        }
        try {
            return new Buffer(__biz, 'base64').toString();
        } catch (e) {
            return null;
        }
    }

    DBImporter.prototype._write = function (record, encoding, callback) {
        if (importer.days) {
            if (!record[3]) {
                callback();
                return;
            }
            var rW = 0;
            var i = importer.dayRStart + 7;
            while (i >= importer.dayRStart) {
                var read = record[i];
                if (read === '100000+') {
                    rW += 100000;
                } else if (read) {
                    read = Number(read);
                    if (!isNaN(read)) {
                        rW += read
                    }
                }
                i--;
            }
            mysqlPool.query('call gzh_import(?,?,?,?,?*10000,?,?,?)', [
                toSqlValue(record[1], 'b'),//isFA
                toSqlValue(record[2], 's'),//title
                toSqlValue(record[3], 'sl'),//code
                toSqlValue(record[4], 's'),//type
                toSqlValue(record[5], 'n'),//fans
                toSqlValue(record[6], 'n'),//price
                toSqlValue(record[7], 's'),//openid
                rW//rW
            ], function (err, results) {
                if (err) {
                    callback(err);
                    return;
                }
                importCount++;
                callback();
            });
        } else {
            try {
                importer.parseDays(record);
            } catch (err) {
                callback(err);
                return;
            }
            callback();
        }
    };

    fs.createReadStream(file.path)
        .pipe(iconv.decodeStream('gbk'))
        .pipe(csv.parse({delimiter: ';'}))
        .pipe(new DBImporter());
}
/*
 importGZH(['./12.csv'], 0, function (err,result) {
 console.log(err || result);
 });
 */
app.post('/uploads/gzh', function (req, res, next) {
    var logos = 0;
    var gzhs = 0;

    function responseOK(files) {
        res.json({success: '成功导入' + gzhs + '条公众号信息，' + logos + '个公众号头像'});
        removeTemplate(files)
    }

    var form = new multiparty.Form({
        maxFilesSize: 10 * 1024 * 1024,
        autoFiles: true,
        uploadDir: path.join(__dirname, '/uploads/')
    });
    form.parse(req, function (err, fields, files) {
        if (err) {
            responseOK(files);
            return;
        }
        var file = files.file;
        if (file) {
            file = file[0];
            if (file && !file.path) {
                file = undefined;
            }
        }
        if (file) {
            var ofn = file.originalFilename;
            if (endsWith(ofn, '.csv')) {
                importGZH(file, function (err, count) {
                    gzhs += count || 0;
                    responseOK(files);
                });
            } else if (endsWith(ofn, '.jpg')) {
                renameFile(file.path, filePathOfLogo(ofn));
                logos += 1;
                responseOK(files);
            } else if (endsWith(ofn, '.zip')) {
                var rs = fs.createReadStream(file.path)
                    .pipe(unzip.Parse())
                    .on('entry', function (entry) {
                        var fileName = entry.path;
                        var type = entry.type; // 'Directory' or 'File'
                        var size = entry.size;
                        if (type == 'File' && endsWith(fileName, '.jpg')) {
                            rs.pause();
                            entry.pipe(fs.createWriteStream(filePathOfLogo(fileName))).on("error", function (err) {
                                rs.resume();
                            }).on("finish", function () {
                                rs.resume();
                                logos += 1;
                            });
                        }
                        if (type == 'File' && endsWith(fileName, '.csv')) {
                            rs.pause();
                            importGZH(file, function (err, count) {
                                gzhs += count || 0;
                                rs.resume();
                            });
                        } else {
                            entry.autodrain();
                        }
                    }).on("error", function () {
                        responseOK(files);
                    }).on("finish", function () {
                        responseOK(files);
                    });
            } else {
                responseOK(files);
            }
        } else {
            responseOK(files);
        }
    });
});

function delFileQuiet(file) {
    fs.exists(file, function (exists) {
        if (exists) {
            fs.unlink(file, function () {
            });
        }
    });
}

function removeTemplate(fileUpload) {
    if (fileUpload instanceof Array) {
        fileUpload.forEach(function (f) {
            removeTemplate(f);
        });
    } else if (fileUpload && fileUpload.path) {
        delFileQuiet(fileUpload.path);
    } else if (typeof fileUpload === 'object') {
        for (var f in fileUpload) {
            if (fileUpload.hasOwnProperty(f)) {
                removeTemplate(fileUpload[f]);
            }
        }
    }
}

function filePathOfOrder(orderID, fileName) {
    var sha1 = crypto.createHash('sha1');
    sha1.update(orderID + fileName, 'utf8');
    return path.join(__dirname, '/uploads/order-files/', sha1.digest('hex'));
}
function filePathOfLogo(fileName) {
    var i = fileName.length - 1;
    while (i >= 0) {
        if (fileName.charAt(i) == '/') {
            fileName = fileName.substr(i + 1);
            break
        }
        i--
    }
    return path.join(__dirname, '/public/logos/', fileName.toLowerCase());
}

function renameFile(from, to) {
    try {
        fs.renameSync(from, to);
        return true
    } catch (e) {
        console.log(e);
        return false
    }
}

app.post('/uploads/cart-files', function (req, res, next) {
    var form = new multiparty.Form({
        maxFilesSize: 5 * 1024 * 1024,
        autoFiles: true,
        uploadDir: path.join(__dirname, '/uploads/')
    });
    form.parse(req, function (err, fields, files) {
        if (err) {
            next(err);
            return;
        }
        var file = files.file;
        if (file) {
            file = file[0];
            if (file && !file.path) {
                file = undefined;
            }
        }
        if (file) {
            var orderID = fields.orderID && fields.orderID[0];
            mysqlPool.callSP('cart_upfile(?,?,?,?,?)', [
                req.cookies.sessionID,
                orderID,
                fields.orderVersion && fields.orderVersion[0],
                file.originalFilename,
                file.size
            ], res, next, function (response) {
                if (response.inserted) {
                    renameFile(file.path, filePathOfOrder(orderID, response.inserted.fileName));
                }
                res.json(response);
            }, function () {
                removeTemplate(files);
            })
        } else {
            removeTemplate(files);
            res.json({errors: 'no file'});
        }
    });
});

app.post('/api/cartDelFile', function (req, res, next) {
    var p = extractParams(req);
    mysqlPool.callSP('cart_upfile(?,?,?,?,?)', [p.sessionID, p.orderID, p.orderVersion, p.fileName, 0], res, next, function (response) {
        if (response.deleted) {
            delFileQuiet(filePathOfOrder(p.orderID, response.deleted.fileName));
        }
        res.json(response);
    })
});

app.get('/internal/userResetPW', function (req, res, next) {
    mysqlPool.callSP('user_reset_pw_t(?,?)', [req.query.ticket, req.query.i], res, next, function (response) {
        if (response.success) {
            res.cookie('resetPWTicket', response.success.ticket);
            res.cookie('resetPWUserName', response.success.userName);
        }
        res.redirect('/reset-pw-end.html');
    });
});


app.post('/api/userResetPW', function (req, res, next) {

    var params = extractParams(req);
    mysqlPool.callSP('user_reset_pw(?)', params.userName, res, next, function (response) {
        var r;
        if (r = response.success) {
            mailTransport.sendMail({
                from: settings.mails.mailFromTitle,
                to: params.userName,
                subject: "德合睿创 - 用户密码重置",
                html: jade.renderFile(path.join(__dirname, '/mail-tpl/reset-pw.jade'), {
                    url: settings.httpURL + "/internal/userResetPW?ticket=" + r.ticket + "&i=" + r.userID,
                    userName: params.userName
                })
            }, function (err, info) {
                if (err) {
                    console.log(err);
                }
                //??
            });
        }
        res.json(response);
    });
});


app.post('/api/userResetPWEnd', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_reset_pw_end(?,?)', [params.ticket, params.password], res, next, function (response) {
        var r;
        if (r = response.success) {
            res.cookie('sessionID', r.sessionID);
        }
        res.json(response);
    });
});

app.post('/api/userChangeInfo', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_change_info(?,?,?,?,?)', [params.sessionID, params.company, params.sex, params.phoneNo, params.qq], res, next);
});
app.post('/api/userGetInfo', function (req, res, next) {
    mysqlPool.callSP('user_get_info(?)', extractParams(req).sessionID, res, next);
});

app.post('/api/userChangePW', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_change_pw(?,?,?)', [params.sessionID, params.oldPW, params.password], res, next);
});

app.post('/api/userSignIn', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_sign_in(?,?,?,?,?,?)', [
        params.userName,
        params.password,
        params.company,
        params.sex,
        params.phoneNo,
        params.qq
    ], res, next, function (response) {
        var r;
        if (r = response.success) {
            mailTransport.sendMail({
                from: settings.mails.mailFromTitle,
                to: params.userName,
                subject: "德合睿创 - 用户注册邮件确认",
                html: jade.renderFile(path.join(__dirname, "/mail-tpl/sign-in.jade"), {
                    url: settings.httpURL + "/internal/userVerifyEmail?ticket=" + r.ticket + "&i=" + r.userID,
                    userName: params.userName
                })
            }, function (err, info) {
                if (err) {
                    console.log(err);
                }
            });
            mailTransport.sendMail({
                from: settings.mails.mailFromTitle,
                to: settings.mails.teller,
                subject: "德合睿创 - 用户注册邮件",
                html: jade.renderFile(path.join(__dirname, "/mail-tpl/sign-in-teller.jade"), r)
            }, function (err, info) {
                if (err) {
                    console.log(err);
                }
            });
        }
        res.json(response);
    });
});

app.get('/internal/userVerifyEmail', function (req, res, next) {
    mysqlPool.callSP('user_sign_in_v(?,?)', [req.query.ticket, req.query.i], res, next, function (response) {
        var r;
        if (r = response.result) {
            res.cookie('verifySignInResult', r.result);
            res.cookie('verifySignInUserName', r.userName);
            if (r.sessionID) {
                res.cookie('sessionID', r.sessionID);
            }
        }
        res.redirect('/sign-in-end.html');
    });
});
app.get('/wxtxbxx', function (req, res, next) {
    fs.readdir(path.join(__dirname, 'public/logos'), function (err, files) {
        if (err) {
            next(err);
            return;
        }
        function rn(i) {
            if (i < files.length) {
                var file = files[i];
                fs.rename(path.join(__dirname, 'public/logos', file), path.join(__dirname, 'public/logos', file.toLowerCase()), function (err) {
                    if (err) {
                        next(err);
                        return;
                    }
                    rn(i + 1)
                });
            } else {
                res.end("ok")
            }
        }

        rn(0);
    });
});
// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('没有找到相关网页');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
