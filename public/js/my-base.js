(function (angular) {
    var m = angular.module("myBase", ["pasvaz.bindonce"]);
    m.filter("gzhWarning", function () {
        return function (item) {
            return item.notFA ? '头条审核严格' : '';
        }
    });
    m.filter("gzhLogoUrl", function () {
        return function (item) {
            if (item.hasLogo) {
                return './logos/' + item.code + '.jpg';
            } else {
                return './logos/_default_.jpg';
            }
        }
    });
    m.filter("or", function () {
        return function (input, or) {
            return input || or;
        }
    });
    m.filter("gzhUrl", function () {
        return function (item) {
            if (item.openID) {
                return encodeURI('http://weixin.sogou.com/gzh?openid=' + item.openID);
            } else {
                return encodeURI('http://weixin.sogou.com/weixin?type=1&query=' + item.title);
            }
        }
    });

    m.factory("Input", [function () {
        function Input(initValue, validator) {
            this.value = this.oldValue = initValue;
            if (angular.isFunction(validator)) {
                this.validate = validator
            }
        }

        Input.prototype = {
            hasError: function () {
                return this.state === "error";
            },
            validate: function () {
            },
            check: function () {
                if (this.msg = this.validate()) {
                    this.state = "error";
                    return false;
                }
                return true;
            },
            resetState: function () {
                this.msg = "";
                this.state = "";
            },
            resetValue: function (value) {
                this.resetState();
                if (value === undefined) {
                    this.value = this.oldValue
                } else {
                    this.value = this.oldValue = value;
                }
            },
            onChanged: function () {
                this.resetState();
            }
        };
        Input.resetAll = function (holder) {
            var input, p;
            for (p in holder) {
                if (holder.hasOwnProperty(p) && ((input = holder[p]) instanceof Input)) {
                    input.resetValue();
                }
            }
        };

        Input.hasError = function () {
            var err = 0;
            angular.forEach(arguments, function checkError(item) {
                if (item instanceof Input) {
                    if (!item.check()) {
                        err++;
                    }
                } else {
                    angular.forEach(item, checkError);
                }
            });
            return err > 0;
        };
        Input.isEmail = function (value) {
            return /^(\w)+(\.\w+)*@(\w)+((\.\w+)+)$/.test(value);
        };

        Input.isPhoneNumber = function (value) {
            return /^\+?(\d{1,3})[ ]?([-]?((\d)|[ ]){1,12})+$/.test(value);
        };

        Input.emailValidator = function (title) {
            var msg = "请填写" + title;
            return function () {
                if (!this.value) {
                    return msg;
                }
                if (!Input.isEmail(this.value)) {
                    return "电子邮箱格式错误";
                }
            }
        };

        Input.phoneValidator = function () {
            if (!this.value) {
                return "请填写电话号码";
            }
            if (!Input.isPhoneNumber(this.value)) {
                return "请填写正确的座机或手机号码";
            }
        };

        Input.requiredValidator = function (title) {
            var msg = "请填写" + title;
            return function () {
                if (this.value === "" || this.value === undefined || this.value === null) {
                    return msg;
                }
            }
        };
        Input.newInput = function (value, validater) {
            return new Input(value, validater);
        };

        Input.newRequiredS = function (value, title) {
            return new Input(value, Input.requiredValidator(title));
        };
        Input.newRequiredN = function (value, title) {
            return new Input(value, Input.requiredValidator(title));
        };
        Input.newRequiredB = function (value, title) {
            return new Input(value, Input.requiredValidator(title));
        };
        Input.i2o = function (holder) {
            var o = {};
            angular.forEach(holder, function (p, n) {
                if (p instanceof Input) {
                    o[n] = p.value;
                }
            });
            return o;
        };
        Input.assignErrors = function (holder, errors) {
            var i;
            angular.forEach(errors, function (e, key) {
                i = holder[key];
                if (i instanceof Input) {
                    i.msg = e;
                    i.state = "error";
                }
            });
        };
        Input.assignValues = function (holder, success) {
            var i;
            angular.forEach(success, function (v, key) {
                i = holder[key];
                if (i instanceof Input) {
                    i.resetValue(v)
                }
            });
        };
        Input.assignResult = function (holder, result) {
            if (result.errors) {
                Input.assignErrors(holder, result.errors);
            } else {
                Input.assignValues(holder, result.success);
            }
        };
        return Input;
    }]);
    m.directive("myInput", function () {
        return {
            restrict: "AE",
            transclude: true,
            scope: {
                myInput: "=",
                myIconClass: "@",
                myInputType: "@"
            },
            template: '<div class="form-group" bindonce ng-class="{\'has-error\' : myInput.hasError()}">\
                    <label ng-transclude></label>\
                    <label class="control-label small" ng-show="myInput.hasError()">&nbsp;&nbsp;\
                        <span class="glyphicon glyphicon-remove-circle"></span>&nbsp;{{myInput.msg}}</label>\
                    <div class="input-group">\
                        <div class="input-group-addon">\
                            <span class="glyphicon" bo-class="myIconClass"></span>\
                        </div>\
                        <input bo-attr bo-attr-type="myInputType | or:\'text\'" class="form-control" ng-model="myInput.value" ng-change="myInput.onChanged()">\
                    </div>\
                </div>'
        };
    });
    m.directive("myCheckBox", function () {
        return {
            restrict: "AE",
            transclude: true,
            replace: true,
            scope: {
                myCheckBox: "="
            },
            template: '<div class="form-group">\
                    <div class="checkbox">\
                        <label>\
                            <input type="checkbox" ng-model="myCheckBox.value" ng-change="myCheckBox.onChanged()">\
                            <span ng-transclude></span>\
                        </label>\
                        <label class="small has-error" ng-show="myCheckBox.hasError()">\
                            <span class="control-label glyphicon glyphicon-remove-circle"></span>\
                            <span class="control-label" ng-bind="myCheckBox.msg"></span>\
                        </label>\
                    </div>\
                </div>'
        };
    });
    m.directive("myBigBtn", function () {
        return {
            restrict: "AE",
            transclude: true,
            replace: true,
            scope: {
                onClick: "&myBigBtn",
                btnClass: "@btnClass"
            },
            template: '<a class="btn btn-block" bindonce bo-class="btnClass | or:\'btn-default\'" href="#" ng-click="onClick()" ng-transclude></a>'
        };
    });
    m.directive("myOkCancelBtn", function () {
        return {
            restrict: "AE",
            replace: true,
            scope: {
                onOk: "&",
                onCancel: "&",
                okTitle: "@",
                cancelTitle: "@"
            },
            template: '<div bindonce class="pull-right">\
                    <button class="btn btn-primary" ng-click="onOk()" bo-bind="okTitle | or:\'确定\'"></button>\
                    <button class="btn btn-default" ng-click="onCancel()" bo-bind="cancelTitle | or:\'取消\'"></button>\
                </div>'
        };
    });
    m.factory("MenuItem", ["$window", function ($window) {
        function MenuItem(init) {
            angular.extend(this, init);
        }

        MenuItem.prototype = {
            title: "",
            url: "",
            isValid: function () {
                return !!this.title;
            },
            click: function () {
                if (this.url) {
                    $window.location.href = this.url;
                }
            },
            isDivider: function () {
                return !this.title || this.title === "-";
            }
        };
        MenuItem.filterValid = function (items) {
            var result = [];
            var allValid = true;
            for (var i = 0, l = items.length; i < l; i++) {
                var item = items[i];
                if (item.isValid()) {
                    result.push(item);
                } else {
                    allValid = false;
                }
            }
            return allValid ? items : result;
        };
        return MenuItem;
    }]);
    m.factory("serverCall", ["$http", function ($http) {
        return function (service, data, success, complete, error) {
            $http({
                method: "POST",
                url: "/api/" + service,
                data: data
            }).success(function (data, status, headers, config) {
                success && success(data);
                complete && complete();
            }).error(function (data, status, headers, config) {
                if (error) {
                    error(data);
                    complete && complete();
                } else {
                    complete && complete();
                    alert("出现错误请稍后重试！");
                }
            });
        }
    }]);
})(window.angular);