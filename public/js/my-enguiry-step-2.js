(function (angular) {
    var msOfDay = 1000 * 60 * 60 * 24;

    function nowAddDay(day) {
        var dt = new Date();
        dt.setHours(0, 0, 0, 0);
        dt.setTime(dt.getTime() + day * msOfDay);
        return dt;
    }

    var m = angular.module("myEnquiry", ["myBase", "myUser", "ui.bootstrap.datepicker", "angularFileUpload"]);
    m.filter("tfDate", function () {
        return function (item) {
            if (item.dateStart) {
                try {
                    return item.dateStart.getFullYear() + ' 年 ' + (item.dateStart.getMonth() + 1) + ' 月 ' + item.dateStart.getDate() + ' 日';
                } catch (e) {
                }
            }
            return '请选择投放时间';
        }
    });
    var K = 1024;
    var M = K * K;

    function fileSizeStr(size) {
        if (size >= M) {
            return (size / M).toFixed(2) + 'M';
        } else if (size >= K) {
            return (size / K).toFixed(2) + 'K';
        } else {
            return (size | 0) + 'B';
        }
    }

    m.controller("EnquiryController", ["$scope", "Input", "serverCall", "$modal", "$window", "$upload",
        function ($scope, Input, serverCall, $modal, $window, $upload) {
            $scope.maxDate = nowAddDay(30);
            $scope.minDate = nowAddDay(1);
            function afterItemUpdate(item, response) {
                if (response.errors) {
                    $window.alert(response.errors.error);
                } else {
                    orderSync(response);
                    var r, dd;
                    if (r = response.updated) {
                        if (r.dateStart) {
                            try {
                                item.dateStart = new Date(r.dateStart);
                            } catch (e) {
                                delete item.dateStart;
                            }
                        } else {
                            delete item.dateStart;
                        }
                        dd = r.days - item.days;
                        item.days = r.days;
                        $scope.orderVersion = r.orderVersion;
                        $scope.totalPrice += item.price * dd;
                    } else if (r = response.deleted) {
                        $scope.orderVersion = r.orderVersion;
                        var i = $scope.orderItems.indexOf(item);
                        if (i >= 0) {
                            $scope.totalPrice -= item.price * item.days;
                            $scope.orderItems.splice(i, 1);
                        }
                    }
                }
            }

            $scope.itemSetDate = function (item) {
                var dateStart;
                if (!item.dateStart || item.dateStart.getTime() < $scope.minDate.getTime()) {
                    dateStart = $scope.minDate;
                } else {
                    dateStart = item.dateStart;
                }
                $modal.open({
                    templateUrl: 'tpl/item-set-date.html',
                    controller: ["$scope", function ($dlgScope) {
                        $dlgScope.item = item;
                        $dlgScope.dateStart = dateStart;
                        $dlgScope.okClick = function () {
                            serverCall('cartItemUpdate', {
                                orderID: $scope.orderID,
                                orderVersion: $scope.orderVersion,
                                gzhID: item.gzhID,
                                dateStart: $dlgScope.dateStart,
                                days: item.days
                            }, function (response) {
                                afterItemUpdate(item, response);
                                $dlgScope.$close();
                            });
                        }
                    }],
                    size: "lg",
                    scope: $scope
                });
            };
            $scope.itemSetDays = function (item, days) {
                serverCall('cartItemUpdate', {
                    orderID: $scope.orderID,
                    orderVersion: $scope.orderVersion,
                    gzhID: item.gzhID,
                    dateStart: item.dateStart,
                    days: days
                }, function (response) {
                    afterItemUpdate(item, response);
                });
            };
            $scope.delItem = function (item) {
                serverCall('cartItemUpdate', {
                    orderID: $scope.orderID,
                    orderVersion: $scope.orderVersion,
                    gzhID: item.gzhID,
                    days: 0
                }, function (response) {
                    afterItemUpdate(item, response);
                });
            };

            function orderSync(response) {
                var r;
                if (r = response.order) {
                    $scope.orderID = r.id;
                    $scope.orderVersion = r.version;
                    $scope.artTitle.resetValue(r.artTitle);
                    $scope.artSubject.resetValue(r.artSubject);

                }
                if (r = response.orderItems) {
                    var totalPrice = 0;
                    angular.forEach(r, function (item) {
                        if (item.dateStart) {
                            try {
                                item.dateStart = new Date(item.dateStart);
                                if (item.dateStart.getTime() < $scope.minDate.getTime()) {
                                    delete item.dateStart;
                                }
                            } catch (e) {
                                delete item.dateStart;
                            }
                        } else {
                            delete item.dateStart;
                        }
                        totalPrice += item.price * item.days;
                    });
                    $scope.orderItems = r;
                    $scope.totalPrice = totalPrice;
                }
                if (r = response.files) {
                    var files = [];
                    angular.forEach(response.files, function (f) {
                        files.push(new UpFile(f.fileName, f.size));
                    });
                    $scope.upFiles = files;
                }
            }

            function orderReset() {
                delete $scope.orderID;
                delete $scope.orderVersion;
                delete $scope.totalPrice;
                $scope.artTitle.resetValue();
                $scope.artSubject.resetValue();
                $scope.upFiles = [];
                $scope.orderItems = [];
            }

            $scope.artTitle = Input.newInput(undefined, function () {
                if (!this.value) {
                    return '必填';
                }
            });

            $scope.artSubject = Input.newInput();
            $scope.queryCart = function () {
                serverCall("cartGet", {}, function (respose) {
                    if (respose.errors) {
                        orderReset();
                        $window.alert(respose.errors.error);
                    } else {
                        orderSync(respose);
                    }
                });
            };

            function orderItemsHasError() {
                var items = $scope.orderItems;
                if (items.length == 0) {
                    $window.alert('未选择任何公众号！');
                    return true;
                }
                var firstError;
                angular.forEach(items, function (item) {
                    if (item.dateStart) {
                        if (item.dateStart.getTime() < $scope.minDate.getTime()) {
                            delete item.dateStart;
                        } else {
                            return;
                        }
                    }
                    if (!firstError) {
                        firstError = item;
                    }
                });
                if (firstError) {
                    $window.alert('请为询价选择有效的投放时间');
                    var e = $window.$("#item-" + firstError.gzhID)[0];
                    if (e && angular.isFunction(e.scrollIntoView)) {
                        e.scrollIntoView();
                    }
                    return true;
                }
            }

            $scope.commitEnabled = function () {
                return $scope.user.hasLogin() && $scope.orderItems.length
            };

            $scope.commit = function () {
                if (Input.hasError($scope.artSubject, $scope.artTitle) || orderItemsHasError()) {
                    return;
                }
                serverCall("cartCommit", {
                    orderID: $scope.orderID,
                    orderVersion: $scope.orderVersion,
                    artTitle: $scope.artTitle.value,
                    artSubject: $scope.artSubject.value
                }, function (response) {
                    if (response.errors) {
                        $window.alert(response.errors.error);
                    } else {
                        orderSync(response);
                        if (response.commited) {
                            $window.location.href = 'enquiry-end.html';
                        }
                    }
                });
            };
            orderReset();
            $scope.$on("userStateChanged", function () {
                if ($scope.user.hasLogin()) {
                    $scope.queryCart();
                } else {
                    orderReset();
                }
            });

            $scope.user.tryAutoLogin(function (user) {
                if (!user.hasLogin()) {
                    user.showLoginDlg();
                }
            });
            function UpFile(file, size) {
                var self = this;
                this.fileName = file;
                this.size = size;
                this.uploaded = 0;
                this.title = function () {
                    if (this.uploader) {
                        return this.fileName + " (" + fileSizeStr(this.uploaded) + " / " + fileSizeStr(this.size)
                            + " - " + Math.min((this.uploaded * 100 / this.size) | 0, 99) + '%) ';
                    } else {
                        return this.fileName + ' (' + fileSizeStr(this.size) + ') ';
                    }
                };
                function delSelf() {
                    var i = $scope.upFiles.indexOf(self);
                    if (i >= 0) {
                        $scope.upFiles.splice(i, 1);
                    }
                };
                this.onUploaded = function (data) {
                    delete this.uploader;
                    orderSync(data);
                    if (data.errors) {
                        $window.alert(data.errors.error);
                        delSelf();
                    } else if (data.inserted) {
                        this.fileName = data.inserted.fileName;
                        $scope.orderVersion = data.inserted.orderVersion;

                    }
                };
                this.delUpload = function (quiet) {
                    if (this.uploader) {
                        this.uploader.abort();
                        delete this.uploader;
                    }
                    serverCall("cartDelFile", {
                        orderID: $scope.orderID,
                        orderVersion: $scope.orderVersion,
                        fileName: this.fileName
                    }, function (response) {
                        if (response.errors) {
                            if (!quiet) {
                                $window.alert(response.errors.error);
                                delSelf();
                            }
                        } else {
                            orderSync(response);
                            if (response.deleted) {
                                $scope.orderVersion = response.deleted.orderVersion;
                                delSelf();
                            }
                        }
                    });
                };
            }

            $scope.uploadFile = function (files) {
                var f;
                if (!files || !files.length || typeof (f = files[0]) !== 'object') {
                    return;
                }
                if ($scope.upFiles.length >= 3) {
                    $window.alert("一次最多上传3个文件");
                    return;
                }
                if (files.length > 1) {
                    $window.alert("请一次选择一个文件");
                    return;
                }
                if (f.size > 5 * M) {
                    $window.alert("请不要上传超过5M的附件，谢谢。");
                    return;
                }
                if (f.size == 0) {
                    $window.alert("文件为空！");
                    return;
                }
                var up = new UpFile(f.name, f.size);
                $scope.upFiles.push(up);
                up.uploader = $upload.upload({
                    url: 'uploads/cart-files',
                    method: 'POST',
                    data: {
                        orderID: $scope.orderID,
                        orderVersion: $scope.orderVersion
                    },
                    file: f
                }).progress(function (evt) {
                    up.uploaded = evt.loaded;
                }).success(function (data, status, headers, config) {
                    up.onUploaded(data);
                }).error(function () {
                    up.delUpload(true);
                });
            };
            $scope.selectDays = [1, 2, 3, 4, 5, 6, 7, 8, 9];

        }]);
})(window.angular);