(function (angular) {
    var m = angular.module("myEnquiry", ["myBase", "myUser"]);
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
            cartItems = cItems;
            $scope.totalPrice = cItems.totalPrice;
            $scope.cartItemCount = cItems.count;
            delete cItems.totalPrice;
            delete cItems.count;
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

        $scope.selectGZH = function (item) {
            $scope.errorMsg = undefined;

            var selectedID = item.isSelected ? -item.id : item.id;

            serverCall('cartGZHSelect', {
                orderID: orderID,
                orderVersion: orderVersion,
                selectedID: selectedID
            }, function (result) {
                var s;
                if (s = result.success) {
                    if (s.cartItems) {
                        setCartItems(s.cartItems);
                    } else if (item.isSelected = (selectedID > 0)) {
                        cartItems[selectedID] = item.price;
                        $scope.totalPrice += item.price;
                        $scope.cartItemCount++;
                    } else {
                        delete cartItems[selectedID];
                        $scope.totalPrice -= item.price;
                        $scope.cartItemCount--;
                    }
                    orderVersion = s.orderVersion;
                }
            });
        };
        $scope.getLogoUrl = function (item) {
            return './logos/' + item.code + '.jpeg';
        };
        $scope.selectBtnTitle = function (item) {
            return item.isSelected ? '取消选择' : '选择';
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
            }, function (result) {
                if (qid != $scope.queryGZH.queryId) {
                    return;
                }
                var s;
                if (s = result.success) {
                    if (s.cartItems) {
                        orderID = s.orderID;
                        orderVersion = s.orderVersion;
                        setCartItems(s.cartItems);
                    }
                    $scope.totalCount = s.totalCount;
                    $scope.gzhs = s.rows;
                    if (s.types && s.types.length) {
                        setTypes(s.types);
                    }
                    angular.forEach($scope.gzhs, function (item) {
                        if (cartItems[item.id] !== undefined) {
                            item.isSelected = true;
                        }
                        if (item.hasLogo) {
                            item.logo = item.code + '.jpg';
                        } else {
                            item.logo = '_default_.jpg';
                        }
                    });
                } else {
                    $scope.errorMsg = result.errors.error;
                    $scope.gzhs = [];
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
    }]);
})(window.angular);
