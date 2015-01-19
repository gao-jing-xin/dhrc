(function (angular) {
    var m = angular.module("myEnquiry", ["myBase", "myUser"]);
    m.filter("gzhBtnTitle", function () {
        return function (item) {
            return item.isSelected ? '取消选择' : '选择';
        }
    });

    m.controller("EnquiryController", ["$scope", "userInput", "serverCall", "$modal", "$window", function ($scope, userInput, serverCall, $modal, $window) {

        var PR = {
            "all": {},
            "500-1k": {priceMin: 500, priceMax: 1000},
            "1k-3k": {priceMin: 1000, priceMax: 3000},
            "3k-5k": {priceMin: 3000, priceMax: 5000},
            "5k-1w": {priceMin: 5000, priceMax: 10000},
            "1w-2w": {priceMin: 10000, priceMax: 20000},
            "2w+": {priceMin: 20000}
        };

        var orderID, orderVersion, cartItems;

        function setCartItems(cItems) {
            var cartItemCount = 0, totalPrice = 0;
            cartItems = {};
            cItems.forEach(function (item) {
                cartItems[item.gzhID] = item.days;
                totalPrice += item.days * item.price;
                cartItemCount++;
            });
            $scope.totalPrice = totalPrice;
            $scope.cartItemCount = cartItemCount;
        }

        function setTypes(types) {
            angular.forEach(types, function (type) {
                type.selected = true
            });
            $scope.types = types;
            $scope.all_type = true;
        }

        function reset() {
            $scope.priceRange = "all";
            $scope.totalPrice = 0;
            $scope.cartItemCount = 0;
            $scope.gzhs = [];
            setTypes([]);
            $scope.currentPage = 1;
            $scope.totalCount = 0;
            $scope.errorMsg = undefined;
            cartItems = {};
            orderID = undefined;
            orderVersion = undefined;
        }

        function orderSync(response) {
            if (response.order) {
                orderID = response.order.id;
                orderVersion = response.order.version;
            }
            if (response.orderItems) {
                setCartItems(response.orderItems);
            }
            if (response.types) {
                setTypes(response.types);
            }
        }

        $scope.selectGZH = function (item) {
            $scope.errorMsg = undefined;
            serverCall('cartItemUpdate', {
                orderID: orderID,
                orderVersion: orderVersion,
                gzhID: item.id,
                days: item.isSelected ? 0 : 1
            }, function (response) {
                if (response.errors) {
                    $window.alert(result.errors.error);
                } else {
                    orderSync(response);
                    if (response.deleted) {
                        $scope.totalPrice -= item.price * cartItems[item.id];
                        $scope.cartItemCount--;
                        orderVersion = response.deleted.orderVersion;
                        delete cartItems[item.id];
                        item.isSelected = false;
                    } else if (response.updated) {
                        cartItems[item.id] = response.updated.days;
                        $scope.totalPrice += item.price * response.updated.days;
                        $scope.cartItemCount++;
                        orderVersion = response.updated.orderVersion;
                        item.isSelected = true;
                    }
                }
            });
        };
        var COUNT_PER_PAGE = $scope.COUNT_PER_PAGE = 48;
        $scope.all_type_change = function () {
            angular.forEach($scope.types, function (type) {
                type.selected = $scope.all_type;
            });
            $scope.currentPage = 1;
            $scope.queryGZH();
        };
        $scope.typesChange = function () {
            var count = 0;
            angular.forEach($scope.types, function (type) {
                if (type.selected) {
                    count++;
                }
            });
            if (count === 0) {
                type.selected = true;
                return;
            }
            $scope.all_type = (count === $scope.types.length);
            $scope.currentPage = 1;
            $scope.queryGZH();
        };
        $scope.priceRangeChange = function () {
            $scope.currentPage = 1;
            $scope.queryGZH();
        };
        $scope.queryGZH = function () {
            $scope.errorMsg = undefined;
            var qid = ++$scope.queryGZH.queryId;
            var pr = PR[$scope.priceRange];
            serverCall("gzhQuery", {
                orderID: orderID,
                orderVersion: orderVersion,
                offset: ($scope.currentPage - 1) * COUNT_PER_PAGE,
                count: COUNT_PER_PAGE,
                priceMin: pr.priceMin,
                priceMax: pr.priceMax,
                queryTypes: $scope.types
            }, function (response) {
                if (qid != $scope.queryGZH.queryId) {
                    return;
                }
                if (response.errors) {
                    $scope.errorMsg = result.errors.error;
                    $scope.gzhs = [];
                } else {
                    orderSync(response);
                    if (response.gzhs) {
                        $scope.gzhs = response.gzhs;
                        $scope.totalCount = response.totalCount;
                        angular.forEach($scope.gzhs, function (item) {
                            if (cartItems[item.id] !== undefined) {
                                item.isSelected = true;
                            }
                        });
                    }
                }
            });
        };
        $scope.queryGZH.queryId = 0;
        $scope.$on("userStateChanged", function () {
            if ($scope.user.hasLogin()) {
                $scope.queryGZH();
            } else {
                reset();
            }
        });
        reset();
        $scope.user.tryAutoLogin(function (user) {
            if (!user.hasLogin()) {
                user.showLoginDlg();
            }
        });
        $scope.nextStep = function () {
            if (this.cartItemCount === 0) {
                this.errorMsg = '未选择任何公众号！';
                return;
            }
            $scope.goUrl('enquiry-step-2.html');
        };
        $scope.nextEnabled = function(){
            return $scope.user.hasLogin() && $scope.cartItemCount
        };
        $scope.totalPages = function () {
            return Math.floor(($scope.totalCount + COUNT_PER_PAGE - 1) / COUNT_PER_PAGE)
        }
    }]);

})(window.angular);
