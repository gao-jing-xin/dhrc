(function (angular) {
    function nowAddDay(day) {
        var dt = new Date();
        dt.setTime(dt.getTime() + 1000 * 64 * 64 * 24 * day);
        return dt;
    }

    var m = angular.module("myEnquiry", ["myBase", "myUser", "ui.bootstrap.datepicker"]);
    m.controller("EnquiryController", ["$scope", "Input", "serverCall", "$modal", "$window", function ($scope, Input, serverCall, $modal, $window) {
        $scope.d2s = function (d) {
            return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
        };
        $scope.selectDate = function (item) {
            $modal.open({
                templateUrl: 'tpl/select-date.html',
                controller: ["$scope", "item", function ($scope, item) {
                    $scope.item = item;
                    $scope.minDate = new Date();
                }],
                size: "lg",
                scope: $scope,
                resolve: {
                    item: function () {
                        return item;
                    }
                }
            });
        };
        function resetOrder(o) {

            if (o) {
                var defaultDateStart = nowAddDay(7);
                var defaultDateEnd = nowAddDay(14);
                o.totalPrice = 0;
                angular.forEach(o.items, function (item) {
                    if (item.hasLogo) {
                        item.logo = item.code + '.jpg';
                    } else {
                        item.logo = '_default_.jpg';
                    }
                    if (!item.dateStart) {
                        item.dateStart = defaultDateStart;
                    }
                    if (!item.dateEnd) {
                        item.dateEnd = defaultDateEnd;
                    }
                    o.totalPrice += item.price
                });
                $scope.order = o;
                $scope.artTitle.resetValue(o.artTitle);
                $scope.artSubject.resetValue(o.artSubject);
                delete o.artSubject;
                delete o.artTitle;
            } else {

                $scope.order = {
                    items: []
                }
            }
        }

        $scope.artTitle = Input.newRequiredS(undefined, "标题");
        $scope.artSubject = Input.newRequiredS(undefined, "摘要");
        $scope.delItem = function (item) {
            var order = $scope.order;
            serverCall('cartGZHRemove', {
                orderID: order.id,
                orderVersion: order.version,
                gzhID: item.id
            }, function (result) {
                var s, i;
                if (s = result.success) {
                    if (s.items) {
                        resetOrder(s);
                    } else {
                        if ((i = order.items.indexOf(item)) >= 0) {
                            order.totalPrice -= item.price;
                            order.items.splice(i, 1);
                        }
                        order.version = s.version;
                    }
                } else {
                    $scope.errorMsg = result.errors.error;
                }
            });
        };
        $scope.getLogoUrl = function (item) {
            return './logos/' + item.code + '.jpeg';
        };
        $scope.queryCart = function () {
            serverCall("cartGet", {}, function (result) {
                if (result.success) {
                    resetOrder(result.success);
                } else {
                    $scope.errorMsg = result.errors.error;
                    resetOrder();
                }
            });
        };
        $scope.commit = function () {
            if (Input.hasError($scope.artSubject, $scope.artTitle)) {
                return;
            }
            var order = $scope.order;
            var upItems = [];
            angular.forEach(order.items, function (oi) {
                upItems.push({
                    id: oi.id,
                    dateStart: oi.dateStart,
                    dateEnd: oi.dateEnd
                });
            });
            if (upItems.length === 0) {
                this.errorMsg = '没有选择公众号';
                return;
            }
            serverCall("cartCommit", {
                orderID: order.id,
                orderVersion: order.version,
                artTitle: $scope.artTitle.value,
                artSubject: $scope.artSubject.value,
                items: upItems
            }, function (result) {
                if (result.success) {
                    $window.location.href = 'enquiry-end.html';
                } else {
                    $scope.errorMsg = result.errors.error;
                }
            });
        };
        $scope.dpOpen = function (item, $event) {
            $event.preventDefault();
            $event.stopPropagation();
            item._dpOpened = true;
        };
        $scope.$on("userStateChanged", function () {
            if ($scope.user.hasLogin()) {
                $scope.queryCart();
            } else {
                resetOrder();
            }
        });
        resetOrder();
        $scope.user.tryAutoLogin(function (user) {
            if (!user.hasLogin()) {
                user.showLoginDlg();
            }
        });
    }]);
})(window.angular);