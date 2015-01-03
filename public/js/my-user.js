(function (window, angular) {

    //var fone
    var m = angular.module("myUser", ["ngCookies", "ui.bootstrap", "myBase"]);
    m.factory("user", ["serverCall", "$cookies", "Input", function (serverCall, $cookies) {
        var user = {
            state: "",
            userName: "",
            autoLogin: false,
            userType: 0,
            isTeller: function () {
                return this.userType === 11;
            },
            isAdmin: function () {
                return this.userType === 100
            },
            canManageUsers: function () {
                return this.isAdmin();
            },
            setLoginInfo: function (s) {
                this.userName = s.userName;
                this.userType = s.userType;
                this.state = "login";
            },
            tryAutoLogin: function (callBack) {
                var self = this;
                if (self.hasLogin()) {
                    if (callBack) {
                        callBack(self);
                    }
                } else if ($cookies.sessionID) {//尝试自动登录
                    self.state = "tryAutoLogin";
                    serverCall("userAutoLogin", {}, function (result) {
                        if (result.success) {
                            self.setLoginInfo(result.success);
                        } else {
                            delete $cookies.sessionID;
                            self.state = "";
                        }
                    }, function () {//finally
                        if (self.state === "tryAutoLogin") {
                            self.state = ""
                        }
                        if (callBack) {
                            callBack(self);
                        }
                    });
                }
            },
            hasLogin: function () {
                return this.state.indexOf("login") === 0;
            },
            notLogin: function () {
                return !this.state;
            },
            logout: function (caller, callBack) {
                var self = this;
                serverCall("userLogout", {}, function (result) {
                    delete self.userName;
                    delete $cookies.sessionID;
                    self.state = "";
                    if (callBack) {
                        callBack.call(caller, result);
                    }
                });
            }
        };
        return user;
    }]);
    m.factory("userInput", ["Input", function (Input) {

        var userInput = {
            hasError: function () {
                return Input.hasError.apply(Input, arguments);
            },
            resetAll: function (holder) {
                return Input.resetAll(holder);
            },
            phoneValidator: Input.phoneValidator,
            emailValidator: Input.emailValidator,
            requiredValidator: Input.requiredValidator,
            newInput: function ($scope, name, value, validater) {
                $scope[name] = new Input(value, validater);
            },
            newUserName: function ($scope, value) {
                $scope.userName = new Input(value, Input.emailValidator("登录邮箱"));
            },

            newPassword: function ($scope) {
                $scope.password = new Input(undefined, Input.requiredValidator("登录密码"));
            },

            newPassword2: function ($scope) {
                $scope.password2 = new Input(undefined, function () {
                    if ($scope.password.value && $scope.password.value !== this.value) {
                        return "两次密码输入不一致";
                    }
                });
            },

            newSex: function ($scope, value) {
                $scope.sex = new Input(value || "男", function () {
                    if (this.value !== "男" && this.value !== "女") {
                        return "请选择: 男/女";
                    }
                });
            },

            newCompany: function newCompany($scope, value) {
                $scope.company = new Input(value, Input.requiredValidator("公司名称"));
            },

            newPhoneNo: function newPhoneNo($scope, value) {
                $scope.phoneNo = new Input(value, function () {
                    if (!this.value) {
                        return "请填写电话号码";
                    }
                    if (!Input.isPhoneNumber(this.value)) {
                        return "请填写正确的座机或手机号码";
                    }
                });
            },

            newQQ: function ($scope, value) {
                $scope.qq = new Input(value, function () {
                });
            }
        };
        return userInput;
    }]);
    m.directive("myUserLabel", function () {
        return {
            restrict: "AE",
            scope: {},
            replace: true,
            template:
                '<a class="btn-link my-user-label" ng-click="click()" ng-class="{active:hasLogin()}" >\
                    <span class="glyphicon glyphicon-user"></span><span ng-bind="title()"></span>\
                </a>',
            controller: ["$scope", "user", "$modal", "serverCall", function ($scope, user, $modal, serverCall) {
                $scope.click = function () {
                    if (user.hasLogin()) {
                        serverCall("userGetInfo", {}, function (result) {
                            var userInfo;
                            if ((userInfo = result.success) && userInfo.company) {
                                $modal.open({
                                    templateUrl: 'tpl/user-info.html',
                                    controller: 'UserInfoController',
                                    resolve: {
                                        userInfo: function () {
                                            return userInfo;
                                        }
                                    }
                                });
                            }
                        });
                    } else {
                        $modal.open({
                            templateUrl: 'tpl/user-login.html',
                            controller: "UserLoginController",
                            size: "sm",
                            resolve: {
                                userHint: function () {
                                    return undefined;
                                }
                            }
                        });
                    }
                };
                $scope.hasLogin = function () {
                    return user.hasLogin();
                };
                $scope.title = function () {
                    return user.hasLogin() ? user.userName : "未登录";
                };
            }]
        };
    });
    m.controller("UserLoginController", ["$scope", "user", "userInput", "userHint", "Input", "serverCall", function ($scope, user, userInput, userHint, Input, serverCall) {
        userInput.newUserName($scope);
        $scope.userName.value = userHint;
        userInput.newPassword($scope);
        userInput.newInput($scope, "autoLogin");
        $scope.login = function () {
            if (userInput.hasError(this.userName, this.password)) {
                return;
            }
            var self = this;
            serverCall("userLogin", {
                userName: self.userName.value,
                password: self.password.value,
                autoLogin: self.autoLogin.value
            }, function (result) {
                if (result.success) {
                    user.setLoginInfo(result.success);
                    $scope.$broadcast("userStateChanged", user);
                    $scope.$close();
                } else {
                    Input.assignErrors(self, result.errors);
                }
            });
        };
    }]);
    m.controller("UserInfoController", ["$scope", "user", "userInput", "Input", "serverCall", "userInfo", function ($scope, user, userInput, Input, serverCall, userInfo) {
        $scope.userName = user.userName;
        userInput.newCompany($scope, userInfo.company);
        userInput.newSex($scope, userInfo.sex);
        userInput.newInput($scope, 'oldPW');
        userInput.newPassword($scope);
        userInput.newPassword2($scope);
        userInput.newPhoneNo($scope, userInfo.phoneNo);
        userInput.newQQ($scope, userInfo.qq);
        $scope.logout = function () {
            user.logout(this, function () {
                $scope.$broadcast("userStateChanged", user);
                $scope.$close();
            });
        };
        $scope.changePWClick = function () {
            if ($scope.editing === 'pw') {
                $scope.edit()
            } else {
                $scope.edit('pw');
            }
        };
        $scope.changePW = function () {
            if (Input.hasError($scope.oldPW, $scope.password, $scope.password2)) {
                return;
            }
            serverCall("userChangePW", {
                oldPW: $scope.oldPW.value,
                password: $scope.password.value
            }, function (result) {
                Input.assignResult($scope, result);
                if (result.success) {
                    $scope.edit();
                }
            });
        };
        $scope.ifEditing = function (e, whenTrue, whenFalse) {
            return $scope.editing === e ? whenTrue : whenFalse;
        };
        $scope.userInfoClick = function () {
            if ($scope.editing === 'info') {
                $scope.edit()
            } else {
                $scope.edit('info');
            }
        };

        $scope.changeInfo = function () {
            if (Input.hasError($scope.sex, $scope.company, $scope.phoneNo, $scope.qq)) {
                return;
            }
            serverCall("userChangeInfo", {
                company: $scope.company.value,
                sex: $scope.sex.value,
                phoneNo: $scope.phoneNo.value,
                qq: $scope.qq.value
            }, function (result) {
                Input.assignResult($scope, result);
                if (result.success) {
                    $scope.edit();
                }
            });

        };
        $scope.edit = function (what) {
            Input.resetAll($scope);
            $scope.editing = what || "";
        };
        $scope.editing = "";
    }]);
})
(window, window.angular);