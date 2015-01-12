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
var multer = require('multer');
var jade = require('jade');
var crypto = require('crypto');

var mysqlPool = mysql.createPool({
    connectionLimit: 10,
    host: '127.0.0.1',
    user: 'dhrc',
    password: 'dhrc',
    database: "weez_wx",
    multipleStatements: true
});

mysqlPool.callSP = function (spName, params, res, next, then) {
    this.query("call " + spName, params, function (err, returns) {
        if (err) {
            next(err);
            return;
        }
        if (returns.length === 0) {
            next(new Error("db error!"));
            return;
        }
        var firstRows = returns[0], r;
        if (!(firstRows instanceof Array)) {
            if (then) {
                then(undefined, undefined, returns);
            } else {
                res.json({success: {}});
            }
            return;
        }
        r = firstRows[0];
        if (r && r.error) {
            if (then) {
                then(r, undefined, returns)
            } else {
                res.json({errors: r});
            }
        } else if (then) {
            then(undefined, firstRows, returns)
        } else {
            res.json({success: params.$acceptArray ? firstRows : (r || {})});
        }
    });
};

var __mailFrom = 'gao_jing_xin@126.com';
__mailFromTitle = "德合睿创<" + __mailFrom + ">";
var mailTransport = nodemailer.createTransport(smtpPool({
    host: 'smtp.126.com',
    port: 25,
    auth: {
        user: __mailFrom,
        pass: "zhangziyan126"
    },
    maxConnections: 5,
    maxMessages: 100
}));

var app = express();
app.set("view engine", "jade");
// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(compress());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(multer({
    dest: path.join(__dirname, '/uploads/'),
    rename: function (fieldname, filename) {
        return crypto.randomBytes(16).toString('hex');
    }
}));

function extractParams(req) {
    var params = req.body;
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
    mysqlPool.callSP('user_login(?,?,?)', [params.userName, params.password, params.autoLogin], res, next, function (err, rows) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0];
        res.cookie('sessionID', r.sessionID, params.autoLogin && {
            maxAge: (365 * 24 * 60 * 60 * 1000)
        });
        res.json({success: r});
    });
});

app.post('/api/cartGZHSelect', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('cart_gzh_select(?,?,?,?)', [params.sessionID, params.orderID, params.orderVersion, params.selectedID], res, next, function (err, rows, results) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0], cartItems = results[1];
        if (cartItems instanceof Array) {
            r.cartItems = cartItems.map(function (item) {
                return item.gzhID;
            });
        }
        res.json({success: r});
    });
});

app.post('/api/cartGet', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('cart_get(?)', [params.sessionID], res, next, function (err, rows, results) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var order = rows[0];
        order.items = results[1];
        res.json({success: order});
    });
});

app.post('/api/cartGZHRemove', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('cart_gzh_remove(?,?,?,?)', [params.sessionID, params.orderID, params.orderVersion, params.gzhID], res, next, function (err, rows, results) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0], items = results[1];
        if (items instanceof Array) {
            r.items = items;
        }
        res.json({success: r});
    });
});

function sendCommitMail(params, res, next) {
    mysqlPool.query("select g.title,g.code,g.price,i.dateStart,i.dateEnd\
    from biz_gzh g join biz_order_item i on i.gzhID = g.id\
    where i.orderID=?", params.orderID, function (err, results) {
        if (err) {
            next(err);
            return;
        }
        params.ftd = function (d) {
            return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
        };
        params.items = results;
        mailTransport.sendMail({
            from: __mailFromTitle,
            to: params.userName,
            subject: "德合睿创 - 询价信息备查",
            html: jade.renderFile(path.join(__dirname, '/mail-tpl/cart-commit.jade'), params)
        }, function (err, info) {
            if (err) {
                console.log(err);
            }
            //??
        });
        res.json({success: {}});
    });
}
app.post('/api/cartCommit', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('cart_commit(?,?,?,?,?)', [
        params.sessionID, params.orderID, params.orderVersion, params.artTitle, params.artSubject
    ], res, next, function (err, rows, results) {
        if (err) {
            res.json({errors: err});
            return;
        }
        params.userName = rows[0].userName;
        var sql = ['insert into biz_order_item(orderID,gzhID,dateStart,dateEnd)values'];
        params.items.forEach(function (item, index) {
            if (index) {
                sql.push("\r\n,");
            }
            sql.push(mysql.format('(?,?,?,?)', [params.orderID, item.id, new Date(item.dateStart), new Date(item.dateEnd)]));
        });
        delete params.items;
        sql.push('on duplicate key update dateStart = values(dateStart),dateEnd=values(dateEnd)\r\n');
        mysqlPool.query(sql.join(''), function (err) {
            if (err) {
                next(err);
                return;
            }
            sendCommitMail(params, res, next);
        });
    });
});

app.post('/api/gzhQuery', function (req, res, next) {
    var params = extractParams(req);
    var hasTypes = params.queryTypes && params.queryTypes.length > 0;
    mysqlPool.callSP('gzh_query_before(?,?,?,?)', [params.sessionID, params.orderID, params.orderVersion, !hasTypes], res, next, function (err, rows, results) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0], ids = results[1], types;
        if (r.orderVersion && ids instanceof Array && ids.length > 0 && ids[0].gzhID) {
            var cItems = r.cartItems = {
                count: 0,
                totalPrice: 0
            };
            ids.forEach(function (row) {
                var p = row.price;
                cItems[row.gzhID] = p;
                cItems.totalPrice += p;
                cItems.count++;
            });
            types = results[2];
            if (types instanceof Array && types.length > 0) {
                r.types = types;
            }
        }
        if (ids instanceof Array && ids.length > 0 && ids[0].name) {
            r.types = types;
        }

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
        var where = buildWhere();
        mysqlPool.query('select count(*) totalCount from biz_gzh' + where,function(err,returns){
            if (err) {
                next(err);
                return;
            }
            r.totalCount = returns[0].totalCount;
            mysqlPool.query('select id,code,title,type,fans / 10000 fans,rW,rM,price,notFA from biz_gzh ' + where
            + ' order by fans,id limit ?,?', [params.offset, params.count], function (err, returns) {
                if (err) {
                    next(err);
                    return;
                }
                r.rows = returns;
                res.json({success: r});

            });
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
    ], res, next, function (err, rows) {
        if (err) {
            res.json({errors: err});
            return;
        }
        res.json({success: rows[0]});
    });
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

function importGZH(files, index, callback) {
    if (!files.startTime) {
        files.startTime = Date.now();
    }
    var fn = files[index];
    if (!fn) {
        mysqlPool.query('update biz_gzh gzh join (select r.gzhID, sum(r) rM, sum(if((mx.d-interval 7 day) < r.day,r.r,0))rW\
         from biz_gzh_r r join (select gzhID,max(day) d from biz_gzh_r group by gzhID)mx\
         on mx.gzhID = r.gzhID where (mx.d -interval 30 day) < r.day group by r.gzhID)v on v.gzhID = gzh.id\
         set gzh.rw = ifNull(v.rw,0),gzh.rM = ifNull(v.rm,0)', function (err, results) {
            callback(err, files.importCount);
        });
        return;
    }
    var importer = {
        dayRStart: 7,
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
                dayNum = /(\d*)\/(\d*)/.exec(dayStr);
                m = dayNum[1];
                d = dayNum[2];
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
            fs.unlink(fn, function () {
            });
            importGZH(files, index + 1, callback);
        });
        this.on('error', function (err) {
            fs.unlink(fn, function () {
            });
            callback(err);
        });
    }

    util.inherits(DBImporter, stream.Writable);

    DBImporter.prototype._write = function (record, encoding, callback) {
        if (importer.days) {
            if (!record[3]) {
                callback();
                return;
            }
            mysqlPool.query('call gzh_import(?,?,?,?,?*10000,?)', [
                toSqlValue(record[1], 'b'),
                toSqlValue(record[2], 's'),
                toSqlValue(record[3], 'sl'),
                toSqlValue(record[4], 's'),
                toSqlValue(record[5], 'n'),
                toSqlValue(record[6], 'n')
            ], function (err, results) {
                if (err) {
                    callback(err);
                    return;
                }
                var sql = [];
                var gzhID = results[0][0].gzhID;
                sql.push('insert into biz_gzh_r(gzhID,day,r)values\r\n');
                sql.push(importer.days.map(function (day, index) {
                    var read = record[index + importer.dayRStart];
                    if (read === '无') {
                        read = 0;
                    } else if (read === '100000+') {
                        read = 100000;
                    }
                    return mysql.format('(?,?,?)', [
                        gzhID,
                        day,
                        toSqlValue(read, 'n')
                    ]);
                }).join(',\r\n'));
                sql.push('\r\nON DUPLICATE KEY UPDATE r=values(r);\r\n');
                mysqlPool.query(sql.join(''), function (err, results) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    if (!files.importCount) {
                        files.importCount = 1;
                    } else {
                        files.importCount++;
                    }
                    callback();
                });
            });
        } else {
            importer.parseDays(record);
            callback();
        }
    };

    fs.createReadStream(fn, {encoding: 'utf8'})
        .pipe(csv.parse({delimiter: ';'}))
        .pipe(new DBImporter());
}
/*
 importGZH(['./12.csv'], 0, function (err,result) {
 console.log(err || result);
 });
 */
app.post('/uploads/gzh', function (req, res, next) {
    var n, file, uploads = [];
    if (!req.files) {
        next(new Error('no file uploaded!'));
        return;
    }
    for (n in req.files) {
        if (req.files.hasOwnProperty(n) && (file = req.files[n]) && (file.size > 0)) {
            uploads.push(file.path);
        }
    }
    if (!uploads.length) {
        next(new Error('no file uploaded!'));
        return;
    }

    importGZH(uploads, 0, function (err, count) {
        var msg;
        if (err) {
            msg = '导入失败，原因：' + err.message;
        } else {
            msg = '成功导入' + count + '条公众号信息';
        }
        res.end('<script>parent && parent.$$gzhUploaded && parent.$$gzhUploaded("' + msg + '");</script>');
    });

});

app.post('/api/userLogout', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_logout(?)', params.sessionID, res, next);
});

app.get('/internal/userResetPW', function (req, res, next) {
    mysqlPool.callSP('user_reset_pw_t(?,?)', [req.query.ticket, req.query.i], res, next, function (err, rows) {
        if (rows) {
            res.cookie('resetPWTicket', rows[0].ticket);
            res.cookie('resetPWUserName', rows[0].userName);
        }
        res.redirect('/reset-pw-end.html');
    });
});


app.post('/api/userResetPW', function (req, res, next) {

    var params = extractParams(req);
    mysqlPool.callSP('user_reset_pw(?)', params.userName, res, next, function (err, rows) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0];
        mailTransport.sendMail({
            from: __mailFromTitle,
            to: params.userName,
            subject: "德合睿创 - 用户密码重置",
            html: jade.renderFile(path.join(__dirname, '/mail-tpl/reset-pw.jade'), {
                url: app.dhrc_host + "/internal/userResetPW?ticket=" + r.ticket + "&i=" + r.userID,
                userName: params.userName
            })
        }, function (err, info) {
            if (err) {
                console.log(err);
            }
            //??
        });
        res.json({success: {}});
    });
});


app.post('/api/userResetPWEnd', function (req, res, next) {
    var params = extractParams(req);
    mysqlPool.callSP('user_reset_pw_end(?,?)', [params.ticket, params.password], res, next, function (err, rows) {
        if (err) {
            res.json({errors: err});
            return;
        }
        res.cookie('sessionID', rows[0].sessionID);
        res.json({success: {}});
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
    ], res, next, function (err, rows) {
        if (err) {
            res.json({errors: err});
            return;
        }
        var r = rows[0];
        mailTransport.sendMail({
            from: __mailFromTitle,
            to: params.userName,
            subject: "德合睿创 - 用户注册邮件确认",
            html: jade.renderFile(path.join(__dirname, "/mail-tpl/sign-in.jade"), {
                url: app.dhrc_host + "/internal/userVerifyEmail?ticket=" + r.ticket + "&i=" + r.userID,
                userName: params.userName
            })
        }, function (err, info) {
            if (err) {
                console.log(err);
            }
        });
        res.json({success: true});
    });
});

app.get('/internal/userVerifyEmail', function (req, res, next) {
    mysqlPool.callSP('user_sign_in_v(?,?)', [req.query.ticket, req.query.i], res, next, function (err, rows) {
        if (rows) {
            var r = rows[0];
            res.cookie('verifySignInResult', r.result);
            res.cookie('verifySignInUserName', r.userName);
            if (r.sessionID) {
                res.cookie('sessionID', r.sessionID);
            }
        }
        res.redirect('/sign-in-end.html');
    });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
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
